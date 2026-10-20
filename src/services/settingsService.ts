import type { Settings } from "@/types";
import { connectDb } from "../config/db";
import { SettingsModel } from "../models";

// Company boards below were each verified to respond on their public job-board API.
export const DEFAULT_SETTINGS: Settings = {
  preferredTitles: [
    "Frontend Developer",
    "React Developer",
    "Next.js Developer",
    "TypeScript Developer",
    "Full Stack Developer",
    "MERN Stack Developer",
    "Software Developer",
  ],
  preferredCities: ["Chandigarh", "Mohali", "Panchkula", "Zirakpur", "Jalandhar", "Ludhiana", "Phagwara", "Amritsar"],
  preferredCountries: ["India"],
  remoteOnly: false,
  minScore: 60,
  minSalary: null,
  maxExperience: 3,
  employmentTypes: ["full-time"],
  dailyDiscoveryLimit: 200,
  discoveryIntervalHours: 8,
  reviewMode: "assisted",
  autoApplyDailyLimit: 5,
  assistedAutofill: true,
  followUpReminders: true,
  followUpDays: 7,
  aiMatchPerRun: 10,
  sources: {
    enabled: {
      remotive: true,
      remoteok: true,
      arbeitnow: true,
      jobicy: true,
      himalayas: true,
      weworkremotely: true,
      greenhouse: true,
      lever: true,
      ashby: true,
      adzuna: true,
      jsearch: true,
    },
    greenhouseBoards: ["gitlab", "razorpaysoftwareprivatelimited", "groww", "druva", "rubrik", "slice", "turing", "remotecom", "canonical", "mongodb", "zscaler", "okta", "twilio", "elastic"],
    leverCompanies: ["paytm", "cred", "meesho", "freshworks", "zeta", "fampay", "nium", "mindtickle"],
    ashbyBoards: ["supabase", "posthog", "linear", "vercel", "zapier", "deel", "sentry", "replit", "railway", "neon", "clerk", "resend", "plane", "atlan", "airbyte", "sanity", "livekit", "mintlify"],
  },
  automation: { paused: false, pausedAt: null },
};

const SETTINGS_ID = "me";

export async function getSettings(): Promise<Settings> {
  await connectDb();
  const doc = await SettingsModel.findById(SETTINGS_ID).lean();
  const stored = (doc?.value ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    sources: {
      ...DEFAULT_SETTINGS.sources,
      ...(stored.sources ?? {}),
      enabled: { ...DEFAULT_SETTINGS.sources.enabled, ...(stored.sources?.enabled ?? {}) },
    },
    automation: { ...DEFAULT_SETTINGS.automation, ...(stored.automation ?? {}) },
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await SettingsModel.updateOne({ _id: SETTINGS_ID }, { $set: { value: next } }, { upsert: true });
  return getSettings();
}

/** The kill switch: stops scheduled discovery and every automatic action until resumed. */
export async function setPaused(paused: boolean): Promise<Settings> {
  return saveSettings({ automation: { paused, pausedAt: paused ? new Date().toISOString() : null } });
}
