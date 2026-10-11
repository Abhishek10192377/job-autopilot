import { logger } from "./logger";

const log = logger("http");

export const USER_AGENT = "job-autopilot/0.1 (personal job-search assistant; single user)";

/** Minimum gap between two requests to the same host. */
const MIN_HOST_GAP_MS = 1500;
const MAX_RETRIES = 2;
const nextSlot = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(host: string) {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + MIN_HOST_GAP_MS);
  if (at > now) await sleep(at - now);
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} from ${new URL(url).host}`);
  }
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  accept?: string;
}

/**
 * Polite fetch: identifies itself, throttles per host, times out, and retries
 * only transient failures (network errors, 429, 5xx) a bounded number of times.
 */
export async function politeFetch(url: string, opts: FetchOptions = {}): Promise<Response> {
  const host = new URL(url).host;
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle(host);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: opts.accept ?? "application/json", ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        redirect: "follow",
      });
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        lastError = new HttpError(res.status, url);
        if (attempt < MAX_RETRIES) {
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 2000 * 2 ** attempt;
          log.warn(`retrying ${host} after ${res.status}`, { attempt: attempt + 1, waitMs: wait });
          await sleep(wait);
          continue;
        }
      }
      // 4xx (other than 429) are not retried: auth walls and blocks must be respected, not worked around.
      throw new HttpError(res.status, url);
    } catch (e) {
      if (e instanceof HttpError) {
        if (!(e.status === 429 || e.status >= 500) || attempt >= MAX_RETRIES) throw e;
        continue;
      }
      lastError = e;
      if (attempt < MAX_RETRIES) {
        await sleep(1500 * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await politeFetch(url, opts);
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await politeFetch(url, { accept: "*/*", ...opts });
  return res.text();
}
