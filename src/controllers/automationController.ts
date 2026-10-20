import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, rateLimit, readJson } from "@/middlewares/apiHandler";
import { triggerDiscovery } from "@/services/discovery/discover";
import { getSettings, setPaused } from "@/services/settingsService";
import { logActivity } from "@/services/tracking/activity";
import { cancelQueued } from "@/worker/queue";

/** POST /api/automation: the kill switch. Pausing also cancels everything still waiting in the queue. */
export async function setAutomationPaused(req: NextRequest) {
  const { paused } = await readJson(req, z.object({ paused: z.boolean() }));
  const settings = await setPaused(paused);
  const cancelled = paused ? await cancelQueued() : 0;
  await logActivity("automation", paused ? `Automation paused${cancelled ? ` — ${cancelled} queued task${cancelled === 1 ? "" : "s"} cancelled` : ""}.` : "Automation resumed.", { level: paused ? "warning" : "success" });
  return { paused: settings.automation.paused, cancelled };
}

/** POST /api/discovery: "Find jobs now". */
export async function runDiscovery() {
  if ((await getSettings()).automation.paused) throw new ApiError(409, "Automation is paused. Resume it to run discovery.");
  rateLimit("discovery", 3, 60_000);
  const state = await triggerDiscovery();
  return { state, message: state === "already-running" ? "A discovery run is already in progress." : "Discovery started — new jobs will appear as each source finishes." };
}
