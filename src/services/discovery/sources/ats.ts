// Company career pages hosted on Greenhouse, Lever and Ashby. All three publish a read-only
// job-board API for exactly this purpose. (Submitting applications through those APIs needs a key
// that only the employer holds, so applying is always done on the hosted form by the candidate.)
import { fetchJson, HttpError } from "../../../utils/http";
import { errorMessage, logger } from "../../../utils/logger";
import { isRelevantTitle } from "../extract";
import type { JobSource, RawJob } from "../types";

const log = logger("ats");

async function eachBoard(kind: string, boards: string[], load: (board: string) => Promise<RawJob[]>): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const board of boards) {
    try {
      out.push(...(await load(board)));
    } catch (e) {
      // One missing or renamed board must not stop the rest.
      const gone = e instanceof HttpError && e.status === 404;
      log.warn(`${kind} board "${board}" ${gone ? "no longer exists — remove it in Settings" : "failed"}`, { error: errorMessage(e) });
    }
  }
  return out;
}

const asDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const greenhouse: JobSource = {
  id: "greenhouse",
  name: "Greenhouse company boards",
  kind: "ats-board",
  note: "Official public Job Board API. Add or remove company board tokens in Settings.",
  minIntervalHours: 6,
  available: () => true,
  fetch: ({ settings }) =>
    eachBoard("greenhouse", settings.sources.greenhouseBoards, async (board) => {
      const data = await fetchJson<{ jobs: Record<string, any>[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`, { timeoutMs: 60_000 });
      return (data.jobs ?? [])
        .filter((j) => isRelevantTitle(String(j.title ?? "")))
        .map((j): RawJob => ({
          source: "greenhouse",
          sourceId: `${board}:${j.id}`,
          title: String(j.title),
          company: String(j.company_name || board),
          url: String(j.absolute_url),
          location: String(j.location?.name ?? ""),
          remote: null,
          descriptionHtml: String(j.content ?? ""),
          postedAt: asDate(j.first_published ?? j.updated_at),
          deadline: asDate(j.application_deadline),
          attribution: "Greenhouse",
        }));
    }),
};

export const lever: JobSource = {
  id: "lever",
  name: "Lever company boards",
  kind: "ats-board",
  note: "Official public Postings API. Add or remove company names in Settings.",
  minIntervalHours: 6,
  available: () => true,
  fetch: ({ settings }) =>
    eachBoard("lever", settings.sources.leverCompanies, async (company) => {
      const data = await fetchJson<Record<string, any>[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`, { timeoutMs: 60_000 });
      return (Array.isArray(data) ? data : [])
        .filter((j) => isRelevantTitle(String(j.text ?? "")))
        .map((j): RawJob => {
          const lists = ((j.lists as { text: string; content: string }[]) ?? []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join("");
          const all: string[] = j.categories?.allLocations ?? [];
          return {
            source: "lever",
            sourceId: `${company}:${j.id}`,
            title: String(j.text),
            company: company.charAt(0).toUpperCase() + company.slice(1),
            url: String(j.hostedUrl),
            applyUrl: String(j.applyUrl ?? j.hostedUrl),
            location: [...new Set([j.categories?.location, ...all].filter(Boolean))].join("; ") + (j.country === "IN" && !/india/i.test(String(j.categories?.location)) ? ", India" : ""),
            remote: j.workplaceType === "remote" ? true : j.workplaceType === "onsite" ? false : null,
            employmentType: String(j.categories?.commitment ?? ""),
            descriptionHtml: `${j.description ?? ""}${lists}${j.additional ?? ""}`,
            tags: j.workplaceType === "hybrid" ? ["hybrid"] : [],
            salary: j.salaryRange?.min ? { min: j.salaryRange.min, max: j.salaryRange.max, currency: j.salaryRange.currency, period: j.salaryRange.interval } : null,
            postedAt: asDate(j.createdAt),
            attribution: "Lever",
          };
        });
    }),
};

export const ashby: JobSource = {
  id: "ashby",
  name: "Ashby company boards",
  kind: "ats-board",
  note: "Official public Job Postings API. Add or remove company board names in Settings.",
  minIntervalHours: 6,
  available: () => true,
  fetch: ({ settings }) =>
    eachBoard("ashby", settings.sources.ashbyBoards, async (board) => {
      const data = await fetchJson<{ jobs: Record<string, any>[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`, { timeoutMs: 60_000 });
      return (data.jobs ?? [])
        .filter((j) => j.isListed !== false && isRelevantTitle(String(j.title ?? "")))
        .map((j): RawJob => {
          const secondary = ((j.secondaryLocations as { location: string }[]) ?? []).map((s) => s.location);
          const comp = j.compensation?.scrapeableCompensationSalarySummary ?? j.compensation?.compensationTierSummary;
          return {
            source: "ashby",
            sourceId: `${board}:${j.id}`,
            title: String(j.title),
            company: board.charAt(0).toUpperCase() + board.slice(1),
            url: String(j.jobUrl),
            applyUrl: String(j.applyUrl ?? j.jobUrl),
            location: [j.location, ...secondary].filter(Boolean).join("; "),
            remote: j.isRemote === true || j.workplaceType === "Remote" ? true : j.workplaceType === "OnSite" ? false : null,
            employmentType: String(j.employmentType ?? "").replace(/([a-z])([A-Z])/g, "$1-$2"),
            descriptionHtml: String(j.descriptionHtml ?? j.descriptionPlain ?? ""),
            tags: j.workplaceType === "Hybrid" ? ["hybrid"] : [],
            salary: comp ? { raw: String(comp) } : null,
            postedAt: asDate(j.publishedAt),
            attribution: "Ashby",
          };
        });
    }),
};
