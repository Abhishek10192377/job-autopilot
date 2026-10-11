import { z } from "zod";
import { readJson, route } from "@/server/api";
import { cancelQueued } from "@/server/queue/queue";
import { setPaused } from "@/server/settings";
import { logActivity } from "@/server/tracking/activity";

// The kill switch. Pausing also cancels everything still waiting in the queue.
export const POST = route(async (req) => {
  const { paused } = await readJson(req, z.object({ paused: z.boolean() }));
  const settings = await setPaused(paused);
  const cancelled = paused ? await cancelQueued() : 0;
  await logActivity("automation", paused ? `Automation paused${cancelled ? ` — ${cancelled} queued task${cancelled === 1 ? "" : "s"} cancelled` : ""}.` : "Automation resumed.", { level: paused ? "warning" : "success" });
  return { paused: settings.automation.paused, cancelled };
});
