// What the background worker runs: scheduled discovery, AI scoring, automatic applications, reminders.
import { AiError } from "../services/aiService";
import { runAutoApply } from "../services/apply/apply";
import { getState, setState, Task, type ITask } from "../models";
import { runDiscovery } from "../services/discovery/discover";
import { logger } from "../utils/logger";
import { aiMatchJob } from "../services/matching/match";
import { runFollowUps } from "../services/notifications/notify";
import { getSettings } from "../services/settingsService";
import { logActivity } from "../services/tracking/activity";
import { claimNext, complete, enqueue, fail, PermanentError } from "./queue";

const log = logger("worker");

export const HANDLERS: Record<string, (payload: Record<string, unknown>) => Promise<string>> = {
  discover: async (p) => {
    const s = await runDiscovery({ manual: p.manual === true });
    return `${s.added} new, ${s.matched} matched`;
  },
  "match-ai": async (p) => `${(await aiMatchJob(String(p.jobId))).total}/100`,
  "auto-apply": () => runAutoApply(),
  "follow-ups": () => runFollowUps(),
};

/** Run one claimed task to completion, retrying only failures that can succeed on a second attempt. */
export async function runTask(task: ITask) {
  const handler = HANDLERS[task.type];
  if (!handler) return void (await fail(task, new Error(`Unknown task type "${task.type}"`), false));
  try {
    const result = await handler(task.payload ?? {});
    await complete(task, result);
    log.info(`${task.type} done: ${result}`);
  } catch (e) {
    const retryable = e instanceof AiError ? e.retryable : !(e instanceof PermanentError);
    const gaveUp = await fail(task, e, retryable);
    // AI scoring failures are not worth surfacing: the rule-based score is already in place.
    if (gaveUp && task.type !== "match-ai") await logActivity("task-failed", `Background task "${task.type}" failed: ${(e as Error).message}`, { level: "error" });
  }
}

async function due(key: string, everyMs: number): Promise<boolean> {
  const last = await getState<{ at: string }>(key);
  if (last && Date.now() - new Date(last.at).getTime() < everyMs) return false;
  await setState(key, { at: new Date().toISOString() });
  return true;
}

/** Queue whatever is due. Does nothing while automation is paused. */
export async function schedulerTick() {
  const settings = await getSettings();
  if (settings.automation.paused) return;
  const lastRun = await getState<{ at: string }>("discovery:lastRun");
  const lastTask = await Task.findOne({ type: "discover" }).sort({ createdAt: -1 }).lean();
  // 0 hours turns scheduled discovery off: jobs are then fetched only when the user presses "Find jobs now".
  const overdue = settings.discoveryIntervalHours > 0 && (!lastRun || Date.now() - new Date(lastRun.at).getTime() >= settings.discoveryIntervalHours * 3_600_000);
  // The second check stops a run that keeps failing from being queued again on every tick.
  if (overdue && (!lastTask || Date.now() - lastTask.createdAt.getTime() > 30 * 60_000)) {
    await enqueue("discover", {}, { uniqueKey: "discover", maxAttempts: 2 });
  }
  if (await due("schedule:follow-ups", 3_600_000)) await enqueue("follow-ups", {}, { uniqueKey: "follow-ups", maxAttempts: 2 });
  if (settings.reviewMode === "auto" && (await due("schedule:auto-apply", 3_600_000))) await enqueue("auto-apply", {}, { uniqueKey: "auto-apply", maxAttempts: 1 });
}

/** One pass of the worker loop. Returns true when a task was run. */
export async function workOnce(): Promise<boolean> {
  if ((await getSettings()).automation.paused) return false;
  const task = await claimNext();
  if (!task) return false;
  await runTask(task);
  return true;
}
