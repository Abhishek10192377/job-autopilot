import { route } from "@/server/api";
import { env } from "@/server/config/env";
import { Activity, Application, getState, Job } from "@/server/db/models";
import { getSettings } from "@/server/settings";
import { getStats } from "@/server/tracking/stats";

const LIST_FIELDS = { description: 0, statusHistory: 0, heuristicMatch: 0 } as const;

export const GET = route(async () => {
  const settings = await getSettings();
  const now = new Date();
  const [stats, recommended, activity, beat, running, lastRun, dueApps] = await Promise.all([
    getStats(),
    Job.find({ status: { $in: ["matched", "saved"] }, "match.total": { $gte: settings.minScore } }, LIST_FIELDS).sort({ "match.total": -1, discoveredAt: -1 }).limit(8).lean(),
    Activity.find().sort({ at: -1 }).limit(25).lean(),
    getState<{ at: string }>("worker:heartbeat"),
    getState<{ at: string } | null>("discovery:running"),
    getState<{ at: string; summary: unknown }>("discovery:lastRun"),
    Application.find({ appliedAt: { $ne: null }, followUpDate: { $lte: now } }, { jobId: 1, followUpDate: 1, appliedAt: 1 }).sort({ followUpDate: 1 }).limit(30).lean(),
  ]);
  const waiting = await Job.find({ _id: { $in: dueApps.map((a) => a.jobId) }, status: "applied" }, { title: 1, company: 1 }).lean();
  const followUps = dueApps.flatMap((a) => {
    const job = waiting.find((j) => String(j._id) === String(a.jobId));
    return job ? [{ jobId: String(job._id), title: job.title, company: job.company, followUpDate: a.followUpDate, appliedAt: a.appliedAt }] : [];
  });
  return {
    stats,
    recommended,
    activity,
    followUps,
    system: {
      paused: settings.automation.paused,
      pausedAt: settings.automation.pausedAt ?? null,
      reviewMode: settings.reviewMode,
      minScore: settings.minScore,
      workerAlive: Boolean(beat && now.getTime() - new Date(beat.at).getTime() < 30_000),
      // A run flag older than 15 minutes is left over from a crashed run.
      discoveryRunning: Boolean(running && now.getTime() - new Date(running.at).getTime() < 15 * 60_000),
      lastDiscovery: lastRun,
      aiConfigured: env.aiConfigured,
      smtpConfigured: env.smtp !== null,
    },
  };
});
