import type { Settings, SourceStatus } from "@/types";
import { getState } from "../../models";
import { ashby, greenhouse, lever } from "./sources/ats";
import { arbeitnow, himalayas, jobicy, remoteok, remotive, weworkremotely } from "./sources/boards";
import { adzuna, jsearch } from "./sources/keyed";
import type { JobSource } from "./types";

export const SOURCES: JobSource[] = [remotive, remoteok, jobicy, himalayas, weworkremotely, arbeitnow, greenhouse, lever, ashby, adzuna, jsearch];

/**
 * Platforms with no API or feed an individual job-seeker is permitted to automate.
 * They are deliberately not scraped; listings from them can be added with "Add job manually".
 */
export const UNSUPPORTED_PLATFORMS = [
  { name: "LinkedIn Jobs", reason: "No public jobs API; the User Agreement prohibits scraping and automated activity." },
  { name: "Indeed", reason: "Job search API is closed to individuals; terms prohibit automated access." },
  { name: "Naukri", reason: "No public API; terms prohibit automated access." },
  { name: "Instahyre", reason: "No public API; login required." },
  { name: "Wellfound", reason: "No public API; login and bot protection." },
  { name: "Cutshort", reason: "No public API; login required." },
];

export interface SourceRunState {
  lastRunAt: string;
  lastResult: string;
}

export async function sourceStatuses(settings: Settings): Promise<SourceStatus[]> {
  return Promise.all(
    SOURCES.map(async (s) => {
      const state = await getState<SourceRunState>(`source:${s.id}`);
      return {
        id: s.id,
        name: s.name,
        kind: s.kind,
        enabled: settings.sources.enabled[s.id] !== false,
        available: s.available(),
        requires: s.requires,
        note: s.note,
        lastRunAt: state?.lastRunAt ?? null,
        lastResult: state?.lastResult ?? null,
      };
    }),
  );
}
