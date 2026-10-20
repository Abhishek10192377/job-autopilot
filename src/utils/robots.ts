import { USER_AGENT } from "./http";
import { logger } from "./logger";

const log = logger("robots");
const cache = new Map<string, { at: number; rules: Rule[] }>();
const TTL_MS = 12 * 60 * 60 * 1000;

interface Rule {
  allow: boolean;
  path: string;
}

/** Parse the rule group that applies to us ("*" unless the file names our agent). */
export function parseRobots(txt: string, agent = "job-autopilot"): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  return (specific ?? groups.find((g) => g.agents.includes("*")))?.rules ?? [];
}

function ruleMatches(rulePath: string, path: string): boolean {
  const pattern = rulePath
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
    .replace(/\\\$$/, "$");
  return new RegExp("^" + pattern).test(path);
}

export function isAllowedByRules(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (ruleMatches(r.path, path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) {
      best = r;
    }
  }
  return best ? best.allow : true;
}

/** Check robots.txt before fetching a page or feed. A missing robots.txt (404) means no restrictions. */
export async function robotsAllowed(url: string): Promise<boolean> {
  const u = new URL(url);
  let entry = cache.get(u.origin);
  if (!entry || Date.now() - entry.at > TTL_MS) {
    let rules: Rule[] = [];
    try {
      const res = await fetch(`${u.origin}/robots.txt`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) rules = parseRobots(await res.text());
      else if (res.status === 401 || res.status === 403) rules = [{ allow: false, path: "/" }];
    } catch (e) {
      log.warn(`could not read robots.txt for ${u.host}; treating as disallowed`, { error: String(e) });
      rules = [{ allow: false, path: "/" }];
    }
    entry = { at: Date.now(), rules };
    cache.set(u.origin, entry);
  }
  return isAllowedByRules(entry.rules, u.pathname + u.search);
}
