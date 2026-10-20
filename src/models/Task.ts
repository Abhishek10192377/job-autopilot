import mongoose, { Schema, type Model, type Types } from "mongoose";

/** A background job for the worker queue. */
export type TaskStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export interface ITask {
  _id: Types.ObjectId;
  type: string;
  payload: Record<string, unknown>;
  status: TaskStatus;
  /** Prevents two pending tasks for the same piece of work. */
  uniqueKey?: string;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockedAt?: Date | null;
  finishedAt?: Date | null;
  lastError?: string | null;
  result?: string | null;
  createdAt: Date;
}
const TaskSchema = new Schema<ITask>({
  type: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, default: "queued", index: true },
  uniqueKey: String,
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  runAt: { type: Date, default: () => new Date() },
  lockedAt: Date,
  finishedAt: Date,
  lastError: String,
  result: String,
  createdAt: { type: Date, default: () => new Date() },
});
TaskSchema.index({ status: 1, runAt: 1 });

export const Task = (mongoose.models.Task as Model<ITask>) || mongoose.model<ITask>("Task", TaskSchema);
