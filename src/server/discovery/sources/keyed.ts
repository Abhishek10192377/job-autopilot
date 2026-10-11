// Sources that need your own API key. They stay disabled (and say so in Settings) until the key is set.
import { env } from "../../config/env";
import { fetchJson } from "../../lib/http";
import { errorMessage, logger } from "../../lib/logger";
import type { JobSource, RawJob } from "../types";

const log = logger("keyed-sources");

const QUERY_TITLES = ["react developer", "frontend developer", "full stack developer", "next.js developer", "mern stack developer"];

/** A bounded set of title × place searches, so one run never exceeds a handful of requests. */
function searches(cities: string[], max: number): { what: string; where: string }[] {
  const out: { what: string; where: string }[] = [];
  const places = [...cities.slice(0, 4), "India"];
  for (const what of QUERY_TITLES) for (const where of places) out.push({ what, where });
  // Interleave so every place gets at least one query before any gets two.
  out.sort((a, b) => QUERY_TITLES.indexOf(a.what) - QUERY_TITLES.indexOf(b.what));
  return out.slice(0, max);
}

export const adzuna: JobSource = {
  id: "adzuna",
  name: "Adzuna (India)",
  kind: "keyed-api",
  requires: "ADZUNA_APP_ID and ADZUNA_APP_KEY (free at developer.adzuna.com)",
  note: "Official search API covering Indian cities. Descriptions are excerpts; the full posting is on the linked page.",
  minIntervalHours: 8,
  strictInterval: true,
  available: () => env.adzuna !== null,
  async fetch({ settings }) {
    const creds = env.adzuna;
    if (!creds) return [];
    const out: RawJob[] = [];
    for (const q of searches(settings.preferredCities, 10)) {
      const params = new URLSearchParams({
        app_id: creds.id,
        app_key: creds.key,
        results_per_page: "30",
        what: q.what,
        where: q.where,
        max_days_old: "14",
        sort_by: "date",
        "content-type": "application/json",
      });
      try {
        const data = await fetchJson<{ results?: Record<string, any>[] }>(`https://api.adzuna.com/v1/api/jobs/in/search/1?${params}`);
        for (const j of data.results ?? []) {
          out.push({
            source: "adzuna",
            sourceId: String(j.id),
            title: String(j.title ?? "").replace(/<[^>]+>/g, ""),
            company: String(j.company?.display_name ?? ""),
            url: String(j.redirect_url ?? ""),
            location: `${j.location?.display_name ?? q.where}, India`,
            remote: null,
            employmentType: `${j.contract_time ?? ""} ${j.contract_type ?? ""}`.replace(/_/g, "-"),
            descriptionText: String(j.description ?? ""),
            salary: j.salary_min && !Number(j.salary_is_predicted) ? { min: j.salary_min, max: j.salary_max, currency: "INR", period: "year" } : null,
            postedAt: j.created ? new Date(j.created) : null,
            attribution: "Adzuna",
          });
        }
      } catch (e) {
        log.warn(`adzuna search "${q.what}" in ${q.where} failed`, { error: errorMessage(e) });
      }
    }
    return out;
  },
};

export const jsearch: JobSource = {
  id: "jsearch",
  name: "JSearch (RapidAPI)",
  kind: "keyed-api",
  requires: "RAPIDAPI_KEY (subscribe to JSearch on RapidAPI; free tier available)",
  note: "Licensed aggregator of public job postings (including roles also listed on LinkedIn, Indeed and Naukri). Applying still happens on the original site.",
  minIntervalHours: 12,
  strictInterval: true,
  available: () => Boolean(env.rapidApiKey),
  async fetch({ settings }) {
    if (!env.rapidApiKey) return [];
    const out: RawJob[] = [];
    // Free tiers are small, so keep to a few requests per run.
    for (const q of searches(settings.preferredCities, 4)) {
      const params = new URLSearchParams({ query: `${q.what} in ${q.where}${q.where === "India" ? "" : ", India"}`, page: "1", num_pages: "1", date_posted: "week", country: "in" });
      try {
        const data = await fetchJson<{ data?: Record<string, any>[] }>(`https://jsearch.p.rapidapi.com/search?${params}`, {
          headers: { "X-RapidAPI-Key": env.rapidApiKey, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
        });
        for (const j of data.data ?? []) {
          out.push({
            source: "jsearch",
            sourceId: String(j.job_id),
            title: String(j.job_title ?? ""),
            company: String(j.employer_name ?? ""),
            url: String(j.job_apply_link ?? j.job_google_link ?? ""),
            location: [j.job_city, j.job_state, j.job_country === "IN" ? "India" : j.job_country].filter(Boolean).join(", "),
            remote: j.job_is_remote === true ? true : null,
            employmentType: String(j.job_employment_type ?? "").toLowerCase(),
            descriptionText: String(j.job_description ?? ""),
            salary: j.job_min_salary ? { min: j.job_min_salary, max: j.job_max_salary, currency: j.job_salary_currency, period: String(j.job_salary_period ?? "").toLowerCase() } : null,
            postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : null,
            deadline: j.job_offer_expiration_datetime_utc ? new Date(j.job_offer_expiration_datetime_utc) : null,
            attribution: `JSearch${j.job_publisher ? ` · ${j.job_publisher}` : ""}`,
          });
        }
      } catch (e) {
        log.warn(`jsearch query "${q.what}" in ${q.where} failed`, { error: errorMessage(e) });
      }
    }
    return out;
  },
};
