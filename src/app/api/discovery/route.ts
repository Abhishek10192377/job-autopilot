import { ApiError, rateLimit, route } from "@/server/api";
import { triggerDiscovery } from "@/server/discovery/discover";
import { getSettings } from "@/server/settings";

export const POST = route(async () => {
  if ((await getSettings()).automation.paused) throw new ApiError(409, "Automation is paused. Resume it to run discovery.");
  rateLimit("discovery", 3, 60_000);
  const state = await triggerDiscovery();
  return { state, message: state === "already-running" ? "A discovery run is already in progress." : "Discovery started — new jobs will appear as each source finishes." };
});
