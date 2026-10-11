// Public remote-job APIs and feeds. Each one publishes an API or RSS feed intended for reuse;
// their terms ask for attribution and a link back to the original listing, which the dashboard always shows.
import { XMLParser } from "fast-xml-parser";
import { fetchJson, fetchText } from "../../lib/http";
import { robotsAllowed } from "../../lib/robots";
import type { JobSource, RawJob } from "../types";

const asDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

export const remotive: JobSource = {
  id: "remotive",
  name: "Remotive",
  kind: "public-api",
  note: "Public API. Terms: credit Remotive, link back to the listing, fetch at most ~4 times a day.",
  minIntervalHours: 6,
  strictInterval: true,
  available: () => true,
  async fetch() {
    const data = await fetchJson<{ jobs: Record<string, unknown>[] }>("https://remotive.com/api/remote-jobs?category=software-dev");
    return (data.jobs ?? []).map((j): RawJob => ({
      source: "remotive",
      sourceId: String(j.id),
      title: String(j.title ?? ""),
      company: String(j.company_name ?? ""),
      url: String(j.url ?? ""),
      remote: true,
      remoteRegions: String(j.candidate_required_location ?? "").split(/[,;/]| or /).map((s) => s.trim()).filter(Boolean),
      employmentType: String(j.job_type ?? ""),
      descriptionHtml: String(j.description ?? ""),
      tags: (j.tags as string[]) ?? [],
      salary: j.salary ? { raw: String(j.salary) } : null,
      postedAt: asDate(j.publication_date),
      attribution: "Remotive",
    }));
  },
};

export const remoteok: JobSource = {
  id: "remoteok",
  name: "Remote OK",
  kind: "public-api",
  note: "Public API. Terms: mention Remote OK and link back to the listing URL.",
  minIntervalHours: 6,
  available: () => true,
  async fetch() {
    const data = await fetchJson<Record<string, unknown>[]>("https://remoteok.com/api");
    return data
      .filter((j) => j.id && j.position)
      .map((j): RawJob => {
        const min = Number(j.salary_min) || undefined;
        const max = Number(j.salary_max) || undefined;
        return {
          source: "remoteok",
          sourceId: String(j.id),
          title: String(j.position),
          company: String(j.company ?? ""),
          url: String(j.url ?? j.apply_url ?? ""),
          remote: true,
          remoteRegions: String(j.location ?? "").split(/[,;/]| or /).map((s) => s.trim()).filter(Boolean),
          descriptionHtml: String(j.description ?? ""),
          tags: (j.tags as string[]) ?? [],
          salary: min || max ? { min, max, currency: "USD", period: "year" } : null,
          postedAt: asDate(j.date),
          attribution: "Remote OK",
        };
      });
  },
};

export const arbeitnow: JobSource = {
  id: "arbeitnow",
  name: "Arbeitnow",
  kind: "public-api",
  note: "Free public job-board API (mostly Europe). Terms: do not abuse; link back.",
  minIntervalHours: 6,
  available: () => true,
  async fetch() {
    const out: RawJob[] = [];
    for (let page = 1; page <= 2; page++) {
      const data = await fetchJson<{ data: Record<string, unknown>[]; links?: { next?: string | null } }>(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      for (const j of data.data ?? []) {
        out.push({
          source: "arbeitnow",
          sourceId: String(j.slug),
          title: String(j.title ?? ""),
          company: String(j.company_name ?? ""),
          url: String(j.url ?? ""),
          location: String(j.location ?? ""),
          remote: j.remote === true ? true : null,
          employmentType: ((j.job_types as string[]) ?? []).join(" "),
          descriptionHtml: String(j.description ?? ""),
          tags: (j.tags as string[]) ?? [],
          postedAt: asDate(j.created_at),
          attribution: "Arbeitnow",
        });
      }
      if (!data.links?.next) break;
    }
    return out;
  },
};

export const jobicy: JobSource = {
  id: "jobicy",
  name: "Jobicy",
  kind: "public-api",
  note: "Public API. Terms: credit Jobicy with a link and send applicants to the original job URL.",
  minIntervalHours: 6,
  available: () => true,
  async fetch() {
    const data = await fetchJson<{ jobs?: Record<string, unknown>[] }>("https://jobicy.com/api/v2/remote-jobs?count=100&industry=dev");
    return (data.jobs ?? []).map((j): RawJob => {
      const min = Number(j.salaryMin) || undefined;
      const max = Number(j.salaryMax) || undefined;
      return {
        source: "jobicy",
        sourceId: String(j.id),
        title: String(j.jobTitle ?? ""),
        company: String(j.companyName ?? ""),
        url: String(j.url ?? ""),
        remote: true,
        remoteRegions: String(j.jobGeo ?? "").split(/[,;/]| or /).map((s) => s.trim()).filter(Boolean),
        employmentType: ((j.jobType as string[]) ?? []).join(" "),
        descriptionHtml: String(j.jobDescription ?? j.jobExcerpt ?? ""),
        salary: min || max ? { min, max, currency: String(j.salaryCurrency ?? ""), period: String(j.salaryPeriod ?? "") } : null,
        postedAt: asDate(j.pubDate),
        attribution: "Jobicy",
      };
    });
  },
};

export const himalayas: JobSource = {
  id: "himalayas",
  name: "Himalayas",
  kind: "public-api",
  note: "Public remote-jobs API (newest listings, cursor-paginated).",
  minIntervalHours: 6,
  available: () => true,
  async fetch() {
    const out: RawJob[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 6; page++) {
      const url: string = `https://himalayas.app/jobs/api?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const data = await fetchJson<{ jobs?: Record<string, unknown>[]; nextCursor?: string | null }>(url);
      for (const j of data.jobs ?? []) {
        const min = Number(j.minSalary) || undefined;
        const max = Number(j.maxSalary) || undefined;
        out.push({
          source: "himalayas",
          sourceId: String(j.guid ?? j.applicationLink),
          title: String(j.title ?? ""),
          company: String(j.companyName ?? ""),
          url: String(j.applicationLink ?? j.guid ?? ""),
          remote: true,
          remoteRegions: (j.locationRestrictions as string[]) ?? [],
          employmentType: String(j.employmentType ?? ""),
          descriptionHtml: String(j.description ?? j.excerpt ?? ""),
          tags: (j.categories as string[]) ?? [],
          salary: min || max ? { min, max, currency: String(j.currency ?? ""), period: String(j.salaryPeriod ?? "") } : null,
          postedAt: asDate(j.pubDate),
          deadline: asDate(j.expiryDate),
          attribution: "Himalayas",
        });
      }
      cursor = data.nextCursor ?? null;
      if (!cursor) break;
    }
    return out;
  },
};

const WWR_FEEDS = [
  "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
];

export const weworkremotely: JobSource = {
  id: "weworkremotely",
  name: "We Work Remotely",
  kind: "rss",
  note: "Public RSS feeds (front-end and full-stack categories). robots.txt is checked before each fetch.",
  minIntervalHours: 6,
  available: () => true,
  async fetch() {
    const parser = new XMLParser({ ignoreAttributes: true });
    const out: RawJob[] = [];
    for (const feed of WWR_FEEDS) {
      if (!(await robotsAllowed(feed))) continue;
      const xml = await fetchText(feed);
      const items = parser.parse(xml)?.rss?.channel?.item ?? [];
      for (const it of Array.isArray(items) ? items : [items]) {
        const rawTitle = String(it.title ?? "");
        const split = rawTitle.indexOf(": ");
        const region = String(it.region ?? "").trim();
        out.push({
          source: "weworkremotely",
          sourceId: String(it.guid ?? it.link),
          title: split > 0 ? rawTitle.slice(split + 2) : rawTitle,
          company: split > 0 ? rawTitle.slice(0, split) : "",
          url: String(it.link ?? it.guid ?? ""),
          remote: true,
          remoteRegions: region ? [region] : [],
          employmentType: String(it.type ?? ""),
          descriptionHtml: String(it.description ?? ""),
          postedAt: asDate(it.pubDate),
          attribution: "We Work Remotely",
        });
      }
    }
    return out;
  },
};
