// Types shared by the server and the dashboard UI.

export const STATUSES = [
  "discovered",
  "matched",
  "saved",
  "prepared",
  "awaiting_approval",
  "applied",
  "interview",
  "offer",
  "rejected",
  "skipped",
] as const;
export type JobStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<JobStatus, string> = {
  discovered: "Discovered",
  matched: "Matched",
  saved: "Saved",
  prepared: "Prepared",
  awaiting_approval: "Awaiting approval",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  skipped: "Skipped",
};

export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";
export type RemoteEligibility = "eligible" | "restricted" | "unknown" | "n/a";

export interface MatchComponent {
  score: number;
  max: number;
  /** True when the job did not publish enough information to judge this component. */
  unknown: boolean;
  notes: string[];
}

export const COMPONENT_KEYS = ["skills", "experience", "role", "location", "other"] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  skills: "Technical skills",
  experience: "Relevant experience",
  role: "Role and responsibilities",
  location: "Location and work arrangement",
  other: "Other requirements",
};

export const COMPONENT_MAX: Record<ComponentKey, number> = {
  skills: 35,
  experience: 25,
  role: 20,
  location: 10,
  other: 10,
};

export interface MatchResult {
  total: number;
  /** Share (0–100) of the score that rests on published information rather than unknowns. */
  confidence: number;
  components: Record<ComponentKey, MatchComponent>;
  strengths: string[];
  gaps: string[];
  summary: string;
  engine: "heuristic" | "ai";
  model?: string;
  scoredAt: string | Date;
}

export interface Salary {
  min?: number;
  max?: number;
  currency?: string;
  period?: string;
  raw?: string;
}

export interface JobDTO {
  _id: string;
  source: string;
  sources: { source: string; url: string }[];
  url: string;
  applyUrl: string;
  title: string;
  company: string;
  location: string;
  workMode: WorkMode;
  remoteRegions: string[];
  remoteEligibility: RemoteEligibility;
  employmentType: string;
  experienceMin?: number | null;
  experienceMax?: number | null;
  seniority: string;
  skillsRequired: string[];
  skillsPreferred: string[];
  salary?: Salary | null;
  workingDays: string;
  description: string;
  applyEmail?: string | null;
  postedAt?: string | null;
  deadline?: string | null;
  discoveredAt: string;
  match?: MatchResult | null;
  heuristicMatch?: MatchResult | null;
  status: JobStatus;
  statusHistory: { status: JobStatus; at: string; note?: string }[];
  attribution?: string;
}

/** Filters accepted by the job list (GET /api/jobs and the getJobs action). */
export interface JobQuery {
  title?: string;
  company?: string;
  location?: string;
  source?: string;
  workMode?: string;
  /** "open", "all", or one or more statuses separated by commas. */
  status?: string;
  minScore?: number | string;
  maxExp?: number | string;
  salary?: boolean;
  sort?: string;
  page?: number | string;
  pageSize?: number | string;
}

export interface JobList {
  items: JobDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ResumeSection {
  id: string;
  bulletIds: string[];
}

export interface TailoredResume {
  headline: string;
  summary: string;
  skills: { category: string; items: string[] }[];
  experience: ResumeSection[];
  projects: ResumeSection[];
}

export interface AnswerItem {
  key: string;
  question: string;
  answer: string;
  verified: boolean;
  sensitive?: boolean;
}

export interface Materials {
  resume: TailoredResume;
  coverLetter: string;
  answers: AnswerItem[];
  recruiterMessage: string;
  linkedinMessage: string;
  emailSubject: string;
  emailBody: string;
}

export interface ApplicationDTO {
  _id: string;
  jobId: string;
  resumeVersion: number;
  materials: Materials;
  truthWarnings: string[];
  generatedBy: "template" | "ai";
  preparedAt?: string;
  appliedAt?: string | null;
  appliedVia?: string | null;
  followUpDate?: string | null;
  interviewDate?: string | null;
  recruiter: { name?: string; email?: string; linkedin?: string };
  notes: string;
  rejectionReason: string;
  automationLog: { at: string; message: string }[];
}

export interface ProfileBullet {
  id: string;
  text: string;
}

export interface Profile {
  name: string;
  headline: string;
  summary: string;
  contact: { email: string; phone: string; linkedin: string; github: string };
  skills: { category: string; items: string[] }[];
  /** Skills evidenced in the resume body but not listed in the skills section. */
  additionalSkills: string[];
  softSkills: string[];
  experience: {
    id: string;
    company: string;
    title: string;
    type: "full-time" | "internship";
    location: string;
    /** YYYY-MM */
    start: string;
    /** YYYY-MM, or null when current. */
    end: string | null;
    bullets: ProfileBullet[];
  }[];
  projects: { id: string; name: string; stack: string[]; url?: string; bullets: ProfileBullet[] }[];
  education: { institution: string; degree: string; detail: string; location: string; years: string }[];
  /** Standard application answers. Only verified answers are ever filled in or sent automatically. */
  answers: Record<string, { question: string; value: string; verified: boolean; sensitive?: boolean }>;
  resumeFile?: string;
}

export interface Settings {
  preferredTitles: string[];
  preferredCities: string[];
  preferredCountries: string[];
  remoteOnly: boolean;
  minScore: number;
  minSalary: { amount: number; currency: string } | null;
  maxExperience: number;
  employmentTypes: string[];
  dailyDiscoveryLimit: number;
  discoveryIntervalHours: number;
  /** assisted = always wait for my approval; auto = may send eligible email applications. */
  reviewMode: "assisted" | "auto";
  autoApplyDailyLimit: number;
  assistedAutofill: boolean;
  followUpReminders: boolean;
  followUpDays: number;
  aiMatchPerRun: number;
  sources: {
    enabled: Record<string, boolean>;
    greenhouseBoards: string[];
    leverCompanies: string[];
    ashbyBoards: string[];
  };
  automation: { paused: boolean; pausedAt?: string | null };
}

export interface SourceStatus {
  id: string;
  name: string;
  kind: "public-api" | "rss" | "ats-board" | "keyed-api";
  enabled: boolean;
  available: boolean;
  requires?: string;
  note: string;
  lastRunAt?: string | null;
  lastResult?: string | null;
}

export interface Stats {
  discovered: number;
  matching: number;
  prepared: number;
  submitted: number;
  interviews: number;
  rejected: number;
  saved: number;
  offers: number;
  awaitingApproval: number;
  successRate: number | null;
}
