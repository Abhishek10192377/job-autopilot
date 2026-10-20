// Structured facts pulled out of free-text job postings. Anything not found stays "unknown".
import type { RemoteEligibility, Salary, WorkMode } from "@/types";

// ------------------------------------------------------------------ titles
const DEV_TITLE = /\b(developer|engineer|programmer|sde|swe|software|frontend|front[- ]end|backend|back[- ]end|full[- ]?stack|react|next\.?js|node\.?js|typescript|javascript|mern|web dev)/i;
const NON_DEV_TITLE = /\b(sales|account executive|account manager|recruiter|marketing|customer success|customer support|support specialist|designer|writer|copywriter|accountant|attorney|counsel|nurse|teacher|hr\b|human resources|finance|payroll|bookkeep|seo|content|community manager|business development|virtual assistant|data entry|electrical|mechanical|civil|hardware|firmware|rf engineer|network engineer|sales engineer|solutions? engineer|support engineer|field engineer|process engineer|manufacturing)/i;

/** True for software-development roles; used to avoid storing unrelated listings from general job feeds. */
export function isRelevantTitle(title: string): boolean {
  return DEV_TITLE.test(title) && !NON_DEV_TITLE.test(title);
}

export type Seniority = "intern" | "junior" | "mid" | "senior" | "lead" | "unspecified";

export function detectSeniority(title: string): Seniority {
  const t = title.toLowerCase();
  if (/\b(intern|internship|trainee|apprentice|working student)\b/.test(t)) return "intern";
  if (/\b(principal|staff|lead|architect|head of|director|manager|vp|chief)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?|iii|iv|expert)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|associate|entry[- ]level|graduate|fresher|new grad|early career|sde[- ]?1|sde[- ]?i\b|engineer i\b|developer i\b)\b/.test(t)) return "junior";
  if (/\b(mid[- ]level|intermediate|ii\b|sde[- ]?2)\b/.test(t)) return "mid";
  return "unspecified";
}

// ------------------------------------------------------------------ experience
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const N = "(\\d{1,2}(?:\\.\\d)?|one|two|three|four|five|six|seven|eight|nine|ten)";
const YEARS = "(?:years?|yrs?)";

function num(s: string): number {
  return NUM_WORDS[s.toLowerCase()] ?? Number(s);
}

/**
 * Minimum / maximum years of experience a posting asks for.
 * Returns nulls when no explicit requirement is stated — never guessed.
 */
export function extractExperience(text: string): { min: number | null; max: number | null; evidence: string | null } {
  const candidates: { min: number; max: number | null; evidence: string }[] = [];
  const add = (min: number, max: number | null, evidence: string) => {
    if (min >= 0 && min <= 20 && (max === null || (max >= min && max <= 25))) candidates.push({ min, max, evidence: evidence.trim() });
  };
  const range = new RegExp(`${N}\\s*\\+?\\s*(?:-|–|—|to)\\s*${N}\\s*\\+?\\s*${YEARS}`, "gi");
  const plus = new RegExp(`${N}\\s*\\+\\s*${YEARS}`, "gi");
  const atLeast = new RegExp(`(?:at least|minimum(?: of)?|min\\.?|over|more than)\\s*${N}\\s*${YEARS}`, "gi");
  const plain = new RegExp(`${N}\\s*${YEARS}(?:['’]s?)?(?:\\s+of)?(?:\\s+[\\w/-]+){0,4}?\\s+(?:experience|exp\\b)`, "gi");
  const expFirst = new RegExp(`experience\\s*(?:of|:|-|–)?\\s*${N}\\s*${YEARS}`, "gi");

  let m: RegExpExecArray | null;
  const masked = text.replace(range, (whole, a: string, b: string) => {
    add(num(a), num(b), whole);
    return " ".repeat(whole.length);
  });
  for (const re of [plus, atLeast, plain, expFirst]) {
    while ((m = re.exec(masked))) add(num(m[1]), null, m[0]);
  }
  if (!candidates.length) return { min: null, max: null, evidence: null };
  // Several figures usually mean "N years overall, M years in X"; the overall requirement is the largest minimum.
  const top = candidates.reduce((a, b) => (b.min > a.min ? b : a));
  return { min: top.min, max: top.max, evidence: top.evidence };
}

// ------------------------------------------------------------------ work arrangement
export function detectWorkMode(title: string, location: string, text: string, remoteHint?: boolean | null): WorkMode {
  const head = `${title} ${location}`.toLowerCase();
  if (/\bhybrid\b/.test(head)) return "hybrid";
  if (remoteHint === true || /\b(remote|work from home|wfh|anywhere|distributed)\b/.test(head)) return "remote";
  if (/\b(on-?site|in-?office)\b/.test(head)) return "onsite";
  const body = text.toLowerCase().slice(0, 6000);
  if (/\b(hybrid (?:role|position|work|model|working|setup|schedule)|\d days? (?:a|per) week (?:in|from) (?:the |our )?office|days in (?:the |our )?office)\b/.test(body)) return "hybrid";
  if (/\b(fully remote|100% remote|remote[- ]first|remote position|remote role|this is a remote|work remotely|work from home|work from anywhere)\b/.test(body)) return "remote";
  if (/\b(on-?site (?:role|position)|work from (?:the |our )?office|in-office|office-based|relocat(?:e|ion) to)\b/.test(body)) return "onsite";
  if (remoteHint === false && location) return "onsite";
  return "unknown";
}

const OPEN_REGION = /\b(worldwide|world wide|anywhere|global(?:ly)?|international|any country|all countries|india|asia|apac|asia[- ]pacific|south asia)\b/i;
const CLOSED_BODY = /\b(us[- ]only|u\.s\.[- ]only|usa only|united states only|must (?:be|reside|live) (?:located |based )?in (?:the )?(?:us|u\.s\.|usa|united states|uk|united kingdom|canada|eu|europe|european union|australia|germany|latam|latin america)|authorized to work in (?:the )?(?:us|u\.s\.|usa|united states|uk|canada|eu)|(?:us|u\.s\.) (?:citizens?|residents?|work authorization)|based in (?:the )?(?:us|usa|united states|uk|europe|canada|latam)|eligible to work in (?:the )?(?:us|usa|united states|uk|eu|canada|australia))\b/i;
const OPEN_BODY = /\b(work from anywhere|anywhere in the world|hire (?:globally|worldwide|from anywhere)|globally distributed|open to candidates (?:worldwide|globally|in india)|remote \(?(?:india|worldwide|global|anywhere)\)?|india[- ]remote|remote[,-]? india)\b/i;

/** Can a candidate based in India take this remote role? */
export function remoteEligibility(workMode: WorkMode, regions: string[], location: string, text: string): RemoteEligibility {
  if (workMode !== "remote") return "n/a";
  const declared = [...regions, location].map((r) => r.trim()).filter(Boolean);
  const body = text.slice(0, 8000);
  if (declared.some((r) => OPEN_REGION.test(r))) return CLOSED_BODY.test(body) && !/india/i.test(declared.join(" ")) ? "restricted" : "eligible";
  const named = declared.filter((r) => !/^remote$/i.test(r));
  if (named.length) return "restricted";
  if (CLOSED_BODY.test(body)) return "restricted";
  if (OPEN_BODY.test(body)) return "eligible";
  return "unknown";
}

// ------------------------------------------------------------------ India geography
const INDIA_CITIES = [ 
  "chandigarh", "mohali", "panchkula", "zirakpur", "jalandhar", "ludhiana", "amritsar", "phagwara", "patiala",
  "bengaluru", "bangalore", "hyderabad", "pune", "gurugram", "gurgaon", "noida", "delhi", "new delhi", "mumbai", "navi mumbai",
  "thane", "chennai", "kolkata", "ahmedabad", "jaipur", "indore", "kochi", "cochin", "coimbatore", "thiruvananthapuram",
  "trivandrum", "lucknow", "nagpur", "bhubaneswar", "visakhapatnam", "vadodara", "surat", "dehradun", "mysuru", "mysore", "goa",
];

export function detectIndianCity(location: string): string | null {
  const l = location.toLowerCase();
  return INDIA_CITIES.find((c) => new RegExp(`\\b${c}\\b`).test(l)) ?? null;
}

export function isIndiaLocation(location: string): boolean {
  return /\bindia\b/i.test(location) || detectIndianCity(location) !== null;
}

// ------------------------------------------------------------------ employment type, working days
export function detectEmploymentType(hint: string | undefined, title: string, text: string): string {
  const h = `${hint ?? ""} ${title}`.toLowerCase();
  if (/\b(intern|internship)\b/.test(h)) return "internship";
  if (/\b(contract|contractor|freelance|temporary|temp)\b/.test(h)) return "contract";
  if (/part[-_ ]?time/.test(h)) return "part-time";
  if (/full[-_ ]?time|permanent|fulltime/.test(h)) return "full-time";
  const body = text.toLowerCase().slice(0, 6000);
  if (/\b(full[- ]time (?:role|position|employment|job|opportunity)|employment type:? full[- ]time|permanent (?:role|position))\b/.test(body)) return "full-time";
  if (/\b(contract (?:role|position|basis)|\d+[- ]month contract|freelance (?:role|position))\b/.test(body)) return "contract";
  return "unknown";
}

export function extractWorkingDays(text: string): string {
  const t = text.toLowerCase();
  if (/\b(6[- ]day(?:s)? (?:work(?:ing)? )?week|six[- ]day(?:s)? (?:work(?:ing)? )?week|monday (?:to|-|–) saturday|mon(?:day)? ?(?:to|-|–) ?sat\b|6 days (?:a|per) week|6 days working|alternate saturdays?|saturdays? working)/.test(t)) return "6-day or Saturday working";
  if (/\b(5[- ]day(?:s)? (?:work(?:ing)? )?week|five[- ]day(?:s)? (?:work(?:ing)? )?week|monday (?:to|-|–) friday|mon(?:day)? ?(?:to|-|–) ?fri\b|5 days (?:a|per) week|5 days working|weekends? off|saturday(?:s)? (?:and|&) sunday(?:s)? off|sat(?:urday)?[- /]sun(?:day)? off|4[- ]day (?:work )?week)/.test(t)) return "Mon–Fri";
  return "unknown";
}

// ------------------------------------------------------------------ salary
function money(s: string): number {
  const k = /k$/i.test(s);
  const n = Number(s.replace(/[,k\s]/gi, ""));
  return k ? n * 1000 : n;
}

/** Salary stated in the posting text. Only explicit, unambiguous formats are parsed. */
export function extractSalary(text: string): Salary | null {
  const lpa = /(?:₹|inr|rs\.?)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:-|–|to)\s*(\d{1,3}(?:\.\d+)?)\s*(?:lpa|lakhs?(?: per annum)?|lacs?(?: per annum)?)\b/i.exec(text);
  if (lpa) return { min: Number(lpa[1]) * 100000, max: Number(lpa[2]) * 100000, currency: "INR", period: "year", raw: lpa[0].trim() };
  const cur = /(\$|€|£|usd|eur|gbp)\s?(\d{2,3}(?:,\d{3})|\d{2,3}\s?k)\s*(?:-|–|—|to)\s*(?:\$|€|£|usd|eur|gbp)?\s?(\d{2,3}(?:,\d{3})|\d{2,3}\s?k)/i.exec(text);
  if (cur) {
    const map: Record<string, string> = { $: "USD", usd: "USD", "€": "EUR", eur: "EUR", "£": "GBP", gbp: "GBP" };
    const min = money(cur[2]);
    const max = money(cur[3]);
    if (min >= 10000 && max >= min) return { min, max, currency: map[cur[1].toLowerCase()], period: "year", raw: cur[0].trim() };
  }
  return null;
}

// ------------------------------------------------------------------ apply-by-email
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const APPLY_CUE = /\b(apply|application|applications|send|share|email|mail|forward|submit)\b[^.\n]{0,80}\b(resume|cv|profile|application|portfolio)\b|\b(resume|cv)\b[^.\n]{0,60}\b(to|at)\b/i;

/** An address the posting explicitly asks applicants to email. Null unless the instruction is explicit. */
export function extractApplyEmail(text: string): string | null {
  for (const line of text.split(/\n|(?<=\.)\s/)) {
    const emails = line.match(EMAIL);
    if (!emails) continue;
    if (!APPLY_CUE.test(line)) continue;
    const addr = emails.find((e) => !/^(privacy|legal|dpo|accommodations?|accessibility|press|support|noreply|no-reply|abuse|security)@/i.test(e));
    if (addr) return addr.toLowerCase().replace(/\.$/, "");
  }
  return null;
}

// ------------------------------------------------------------------ blockers
const BLOCKERS: [RegExp, string][] = [
  [/\b(security clearance|ts\/sci|secret clearance)\b/i, "Requires a security clearance"],
  [/\b(us|u\.s\.) citizen(?:ship)?\b/i, "Requires US citizenship"],
  [/\b(?:fluent|fluency|native|proficien\w+|business[- ]level)\s+(?:in\s+)?(german|french|spanish|japanese|dutch|portuguese|italian|mandarin|korean|polish|arabic)\b/i, "Requires fluency in another language"],
  [/\b(night shifts?|rotational shifts?|graveyard shift|us shift|uk shift|est (?:work(?:ing)? )?hours|pst (?:work(?:ing)? )?hours|24\s?[x/]\s?7)\b/i, "Mentions night, rotational or overseas-timezone shifts"],
  [/\b(ph\.?d|master(?:'|’)?s degree)\s+(?:is\s+)?required\b/i, "Requires a postgraduate degree"],
  [/\b(bond|service agreement) of \d/i, "Mentions a service bond"],
];

export function detectBlockers(text: string): string[] {
  return BLOCKERS.filter(([re]) => re.test(text)).map(([, label]) => label);
}
