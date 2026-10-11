// Stable keys used to prevent duplicate listings and duplicate applications.

const TRACKING_PARAMS = /^(utm_.*|ref|refs?|referr?er|source|src|gh_src|lever-source.*|lever-origin|trk|trackingid|refid|fbclid|gclid|mc_.*|sid|campaign|medium|via|origin|jr_id)$/i;

/** Canonical form of a job URL: no fragment, no tracking params, stable host and path. */
export function normalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return input.trim().toLowerCase();
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
  let path = u.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  // ATS apply pages are the same listing as the posting page.
  if (/(lever\.co|ashbyhq\.com)$/.test(host)) path = path.replace(/\/(apply|application)$/, "");
  return `${host}${path.toLowerCase()}${query}`;
}

const LEGAL_SUFFIX = /\b(incorporated|inc|llc|llp|ltd|limited|pvt|private|plc|gmbh|ag|bv|sa|sas|srl|corp|corporation|co|company|holdings?)\b/g;

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\bsr\.?(?=\s)/g, "senior")
    .replace(/\bjr\.?(?=\s)/g, "junior")
    .replace(/front[- ]end/g, "frontend")
    .replace(/back[- ]end/g, "backend")
    .replace(/full[- ]stack/g, "fullstack")
    .replace(/react\.?js/g, "react")
    .replace(/next\.?js/g, "nextjs")
    .replace(/node\.?js/g, "node")
    .replace(/\b(software )?development engineer\b/g, "software engineer")
    .replace(/\b(remote|hybrid|onsite|on-site|wfh|work from home|india|m\/f\/d|f\/m\/d|m\/w\/d|f\/m\/x|all genders)\b/g, " ")
    .replace(/[^a-z0-9+# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeKey(company: string, title: string): string {
  return `${normalizeCompany(company)}|${normalizeTitle(title)}`;
}
