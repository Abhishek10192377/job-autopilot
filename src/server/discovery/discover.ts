import type { MatchResult, Settings } from "@/shared/types";
import { env } from "../config/env";
import { connectDb } from "../db/connect";
import { getState, Job, setState } from "../db/models";
import { errorMessage, logger } from "../lib/logger";
import { qualifies, scoreJob } from "../matching/heuristic";
import { getProfile } from "../profile/profile";
import { enqueue } from "../queue/queue";
import { getSettings } from "../settings";
import { logActivity } from "../tracking/activity";
import { enrich, type EnrichedJob } from "./enrich";
import { isRelevantTitle } from "./extract";
import { SOURCES, type SourceRunState } from "./registry";
import type { RawJob } from "./types";

const log = logger("discovery");

export interface DiscoverySummary {
  fetched: number;
  relevant: number;
  added: number;
  matched: number;
  duplicates: number;
  skippedByLimit: number;
  sources: { id: string; status: "ok" | "skipped" | "error"; detail: string }[];
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface IngestResult extends Omit<DiscoverySummary, "sources" | "fetched"> {
  bySource: Record<string, { relevant: number; added: number; matched: number }>;
}

/**
 * Store new listings, skipping anything already known by URL or by company + title.
 * Returns what was added. Exported separately so it can be tested without the network.
 */
export async function ingest(raws: RawJob[], opts: { limit?: number } = {}): Promise<IngestResult> {
  const settings = await getSettings();
  const profile = await getProfile();
  const now = new Date();

  // De-duplicate within the batch first, then against the database.
  const byUrl = new Map<string, EnrichedJob>();
  for (const raw of raws) {
    if (!raw.title || !raw.company || !/^https?:\/\//.test(raw.url)) continue;
    if (!isRelevantTitle(raw.title)) continue;
    const job = enrich(raw);
    if (!byUrl.has(job.urlKey)) byUrl.set(job.urlKey, job);
  }
  const candidates = [...byUrl.values()];
  const bySource: IngestResult["bySource"] = {};
  const tally = (source: string) => (bySource[source] ??= { relevant: 0, added: 0, matched: 0 });
  for (const c of candidates) tally(c.source).relevant++;
  const existing = await Job.find(
    { $or: [{ urlKey: { $in: candidates.map((c) => c.urlKey) } }, { dedupeKey: { $in: candidates.map((c) => c.dedupeKey) } }] },
    { urlKey: 1, dedupeKey: 1, sources: 1 },
  ).lean();
  const knownUrl = new Map(existing.map((e) => [e.urlKey, e]));
  const knownKey = new Map(existing.map((e) => [e.dedupeKey, e]));

  let duplicates = 0;
  const best = new Map<string, { job: EnrichedJob; match: MatchResult; ok: boolean }>();
  for (const job of candidates) {
    const sameUrl = knownUrl.get(job.urlKey);
    const sameRole = knownKey.get(job.dedupeKey);
    if (sameUrl) {
      await Job.updateOne({ _id: sameUrl._id }, { $set: { lastSeenAt: now } });
      duplicates++;
    } else if (sameRole) {
      // Same role seen on another board: remember the extra link instead of creating a second listing.
      await Job.updateOne({ _id: sameRole._id }, { $set: { lastSeenAt: now }, $addToSet: { sources: { source: job.source, url: job.url } } });
      duplicates++;
    } else {
      // The same role is often listed once per office; keep the listing that fits best (e.g. the India one).
      const match = scoreJob(job, profile, settings, now);
      const prior = best.get(job.dedupeKey);
      if (prior) duplicates++;
      if (!prior || match.total > prior.match.total) best.set(job.dedupeKey, { job, match, ok: qualifies(job, match, settings).ok });
    }
  }
  const fresh = [...best.values()];

  // When the daily limit bites, keep the best-scoring listings.
  fresh.sort((a, b) => Number(b.ok) - Number(a.ok) || b.match.total - a.match.total);
  const addedToday = await Job.countDocuments({ discoveredAt: { $gte: startOfToday() }, source: { $ne: "manual" } });
  const room = Math.max(0, (opts.limit ?? settings.dailyDiscoveryLimit) - addedToday);
  const toInsert = fresh.slice(0, room);

  let added = 0;
  let matched = 0;
  const aiQueue: string[] = [];
  for (const { job, match, ok } of toInsert) {
    const status = ok ? "matched" : "discovered";
    try {
      const doc = await Job.create({
        ...job,
        sources: [{ source: job.source, url: job.url }],
        discoveredAt: now,
        lastSeenAt: now,
        match,
        heuristicMatch: match,
        status,
        statusHistory: [{ status, at: now, note: `Scored ${match.total}/100 (heuristic)` }],
      });
      added++;
      tally(job.source).added++;
      if (ok) {
        matched++;
        tally(job.source).matched++;
      }
      if (match.total >= settings.minScore - 10 && aiQueue.length < settings.aiMatchPerRun) aiQueue.push(String(doc._id));
    } catch (e) {
      // Unique-index race (another run stored it first) is a duplicate, not a failure.
      if ((e as { code?: number }).code === 11000) duplicates++;
      else throw e;
    }
  }
  if (env.aiConfigured) {
    for (const jobId of aiQueue) await enqueue("match-ai", { jobId }, { uniqueKey: `match-ai:${jobId}`, maxAttempts: 2 });
  }
  return { relevant: candidates.length, added, matched, duplicates, skippedByLimit: fresh.length - toInsert.length, bySource };
}

/** Run every enabled, available source (respecting each one's minimum refresh interval) and store what is new. */
export async function runDiscovery(opts: { force?: boolean; manual?: boolean; only?: string[] } = {}): Promise<DiscoverySummary> {
  await connectDb();
  const settings = await getSettings();
  const summary: DiscoverySummary = { fetched: 0, relevant: 0, added: 0, matched: 0, duplicates: 0, skippedByLimit: 0, sources: [] };
  await setState("discovery:running", { at: new Date().toISOString() });
  try {
    await runSources(settings, opts, summary);
  } finally {
    await setState("discovery:running", null);
  }
  const ran = summary.sources.filter((s) => s.status !== "skipped");
  if (ran.length) {
    const failed = ran.filter((s) => s.status === "error").length;
    await logActivity(
      "discovery",
      `Discovery checked ${ran.length} source${ran.length === 1 ? "" : "s"}: ${summary.added} new job${summary.added === 1 ? "" : "s"}, ${summary.matched} matching your profile${failed ? `; ${failed} source${failed === 1 ? "" : "s"} failed` : ""}.`,
      { level: failed ? "warning" : "info" },
    );
  }
  await setState("discovery:lastRun", { at: new Date().toISOString(), summary });
  return summary;
}

/**
 * Shortest gap between two fetches of one source when the user presses "Find jobs now".
 * Sources whose terms set a frequency keep their own, longer interval.
 */
const MANUAL_MIN_HOURS = 2;

async function runSources(settings: Settings, opts: { force?: boolean; manual?: boolean; only?: string[] }, summary: DiscoverySummary) {
  const fetched: { id: string; raws: RawJob[] }[] = [];
  for (const source of SOURCES) {
    if (opts.only && !opts.only.includes(source.id)) continue;
    // The kill switch stops a run between sources.
    if ((await getSettings()).automation.paused) {
      summary.sources.push({ id: source.id, status: "skipped", detail: "Automation was paused." });
      continue;
    }
    if (settings.sources.enabled[source.id] === false) {
      summary.sources.push({ id: source.id, status: "skipped", detail: "Turned off in Settings." });
      continue;
    }
    if (!source.available()) {
      summary.sources.push({ id: source.id, status: "skipped", detail: `Needs ${source.requires ?? "configuration"}.` });
      continue;
    }
    const state = await getState<SourceRunState>(`source:${source.id}`);
    const sinceHours = state ? (Date.now() - new Date(state.lastRunAt).getTime()) / 3_600_000 : Infinity;
    // A run the user asked for may refresh sooner, except where the interval is the source's own rule.
    const minHours = opts.manual && !source.strictInterval ? Math.min(source.minIntervalHours, MANUAL_MIN_HOURS) : source.minIntervalHours;
    if (!opts.force && sinceHours < minHours) {
      summary.sources.push({ id: source.id, status: "skipped", detail: `Fetched ${sinceHours.toFixed(1)}h ago; this source is refreshed at most every ${minHours}h.` });
      continue;
    }
    try {
      const raws = await source.fetch({ settings });
      fetched.push({ id: source.id, raws });
      log.info(`${source.id}: fetched ${raws.length} listings`);
    } catch (e) {
      const detail = `Failed: ${errorMessage(e)}`;
      summary.sources.push({ id: source.id, status: "error", detail });
      await setState(`source:${source.id}`, { lastRunAt: new Date().toISOString(), lastResult: detail } satisfies SourceRunState);
      log.error(`${source.id}: ${detail}`);
    }
  }
  if (!fetched.length) return;

  // Everything is ranked together, so the daily limit keeps the best jobs overall rather than whichever source ran first.
  const result = await ingest(fetched.flatMap((f) => f.raws));
  summary.fetched = fetched.reduce((a, f) => a + f.raws.length, 0);
  Object.assign(summary, { relevant: result.relevant, added: result.added, matched: result.matched, duplicates: result.duplicates, skippedByLimit: result.skippedByLimit });
  for (const { id, raws } of fetched) {
    const t = result.bySource[id] ?? { relevant: 0, added: 0, matched: 0 };
    const detail = `${raws.length} listings, ${t.relevant} relevant, ${t.added} new (${t.matched} matched).`;
    summary.sources.push({ id, status: "ok", detail });
    await setState(`source:${id}`, { lastRunAt: new Date().toISOString(), lastResult: detail } satisfies SourceRunState);
  }
  log.info(`stored ${result.added} new (${result.matched} matched); ${result.duplicates} already known; ${result.skippedByLimit} held back by the daily limit`);
}

const g = globalThis as unknown as { __discovery?: Promise<unknown> };

/**
 * Start a discovery run from the dashboard. Uses the worker when it is alive, otherwise runs in this process.
 * A manual run refreshes a source after MANUAL_MIN_HOURS instead of its usual interval.
 */
export async function triggerDiscovery(): Promise<"queued" | "started" | "already-running"> {
  const beat = await getState<{ at: string }>("worker:heartbeat");
  if (beat && Date.now() - new Date(beat.at).getTime() < 30_000) {
    return (await enqueue("discover", { manual: true }, { uniqueKey: "discover", maxAttempts: 2 })) ? "queued" : "already-running";
  }
  if (g.__discovery) return "already-running";
  g.__discovery = runDiscovery({ manual: true })
    .catch((e) => log.error("discovery run failed", { error: errorMessage(e) }))
    .finally(() => {
      g.__discovery = undefined;
    });
  return "started";
}
