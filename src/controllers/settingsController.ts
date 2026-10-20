import type { NextRequest } from "next/server";
import { env } from "@/config/env";
import { readJson } from "@/middlewares/apiHandler";
import { sourceStatuses, UNSUPPORTED_PLATFORMS } from "@/services/discovery/registry";
import { rescoreAll } from "@/services/matching/match";
import { getSettings, saveSettings } from "@/services/settingsService";
import type { Settings } from "@/types";
import { SettingsPatch } from "@/validators";

async function payload(settings: Settings) {
  return {
    settings,
    sources: await sourceStatuses(settings),
    unsupported: UNSUPPORTED_PLATFORMS,
    system: { aiConfigured: env.aiConfigured, aiModel: env.ollamaModel, smtpConfigured: env.smtp !== null, browserChannel: env.browserChannel },
  };
}

/** GET /api/settings */
export async function getSettingsData() {
  return payload(await getSettings());
}

const SCORING_KEYS = ["preferredTitles", "preferredCities", "remoteOnly", "minScore", "minSalary", "maxExperience", "employmentTypes"] as const;

/** PUT /api/settings */
export async function updateSettings(req: NextRequest) {
  const patch = await readJson(req, SettingsPatch);
  const before = await getSettings();
  const after = await saveSettings(patch);
  // Preferences feed the score and the Matched threshold, so existing jobs are re-scored when they change.
  const rescored = SCORING_KEYS.some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])) ? await rescoreAll() : 0;
  return { ...(await payload(after)), rescored };
}
