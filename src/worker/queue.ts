// A small MongoDB-backed task queue: atomic claims, bounded retries with backoff, stale-lock recovery.
import { Task, type ITask } from "../models";
import { errorMessage, logger } from "../utils/logger";

const log = logger("queue");
const STALE_LOCK_MS = 20 * 60 * 1000;

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  /** When set, a second task with the same key is not queued while the first is pending. */
  uniqueKey?: string;
}

export async function enqueue(type: string, payload: Record<string, unknown> = {}, opts: EnqueueOptions = {}): Promise<ITask | null> {
  if (opts.uniqueKey) {
    const pending = await Task.findOne({ uniqueKey: opts.uniqueKey, status: { $in: ["queued", "running"] } }).lean();
    if (pending) return null;
  }
  const task = await Task.create({ type, payload, uniqueKey: opts.uniqueKey, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 3 });
  return task.toObject();
}

/** Atomically take the next due task, so two workers can never run the same one. */
export async function claimNext(): Promise<ITask | null> {
  const now = new Date();
  // Tasks whose worker died mid-run go back on the queue.
  await Task.updateMany({ status: "running", lockedAt: { $lt: new Date(now.getTime() - STALE_LOCK_MS) } }, { $set: { status: "queued", lockedAt: null } });
  return Task.findOneAndUpdate(
    { status: "queued", runAt: { $lte: now } },
    { $set: { status: "running", lockedAt: now }, $inc: { attempts: 1 } },
    { sort: { runAt: 1 }, new: true },
  ).lean();
}

export async function complete(task: ITask, result?: string) {
  await Task.updateOne({ _id: task._id }, { $set: { status: "done", finishedAt: new Date(), result: result ?? null, lockedAt: null } });
}

/** Retry with exponential backoff until maxAttempts, then mark failed for good. */
export async function fail(task: ITask, error: unknown, retryable = true) {
  const message = errorMessage(error);
  const giveUp = !retryable || task.attempts >= task.maxAttempts;
  if (giveUp) {
    log.error(`task ${task.type} failed permanently after ${task.attempts} attempt(s)`, { error: message });
    await Task.updateOne({ _id: task._id }, { $set: { status: "failed", finishedAt: new Date(), lastError: message, lockedAt: null } });
  } else {
    const delayMs = Math.min(30, 2 ** task.attempts) * 60_000;
    log.warn(`task ${task.type} failed (attempt ${task.attempts}/${task.maxAttempts}); retrying in ${delayMs / 60_000} min`, { error: message });
    await Task.updateOne({ _id: task._id }, { $set: { status: "queued", runAt: new Date(Date.now() + delayMs), lastError: message, lockedAt: null } });
  }
  return giveUp;
}

/** Cancel everything still waiting (used by the kill switch). */
export async function cancelQueued(types?: string[]): Promise<number> {
  const res = await Task.updateMany({ status: "queued", ...(types ? { type: { $in: types } } : {}) }, { $set: { status: "cancelled", finishedAt: new Date() } });
  return res.modifiedCount;
}

/** An error that should not be retried (bad input, policy refusal, missing configuration). */
export class PermanentError extends Error {}
