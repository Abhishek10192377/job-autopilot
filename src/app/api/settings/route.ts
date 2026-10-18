import { readJson, route } from "@/server/api";
import { env } from "@/server/config/env";
import { sourceStatuses, UNSUPPORTED_PLATFORMS } from "@/server/discovery/registry";
import { rescoreAll } from "@/server/matching/match";
import { getSettings, saveSettings } from "@/server/settings";
import { SettingsPatch } from "@/server/validation";
import type { Settings } from "@/shared/types";

async function payload(settings: Settings) {
  return {
    settings,
    sources: await sourceStatuses(settings),
    unsupported: UNSUPPORTED_PLATFORMS,
    system: { aiConfigured: env.aiConfigured, aiModel: env.ollamaModel, smtpConfigured: env.smtp !== null, browserChannel: env.browserChannel },
  };
}

export const GET = route(async () => payload(await getSettings()));

const SCORING_KEYS = ["preferredTitles", "preferredCities", "remoteOnly", "minScore", "minSalary", "maxExperience", "employmentTypes"] as const;

export const PUT = route(async (req) => {
  const patch = await readJson(req, SettingsPatch);
  const before = await getSettings();
  const after = await saveSettings(patch);
  // Preferences feed the score and the Matched threshold, so existing jobs are re-scored when they change.
  const rescored = SCORING_KEYS.some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])) ? await rescoreAll() : 0;
  return { ...(await payload(after)), rescored };
});
