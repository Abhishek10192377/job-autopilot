import type { Types } from "mongoose";
import { Activity, type IActivity } from "../db/models";
import { logger } from "../lib/logger";

const log = logger("activity");

/** Record something the user should be able to see in "Recent activity" (also the in-app notification feed). */
export async function logActivity(type: string, message: string, opts: { level?: IActivity["level"]; jobId?: Types.ObjectId | string | null } = {}) {
  log.info(`${type}: ${message}`);
  await Activity.create({ type, message, level: opts.level ?? "info", jobId: opts.jobId ?? null, at: new Date() });
}
