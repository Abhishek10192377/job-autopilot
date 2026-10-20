// Request schemas for the API routes.
import { z } from "zod";
import { STATUSES } from "@/types";

const text = (max: number) => z.string().trim().max(max);
const list = (max = 60) => z.array(text(120).min(1)).max(max);

export const SettingsPatch = z
  .object({
    preferredTitles: list(),
    preferredCities: list(),
    preferredCountries: list(),
    remoteOnly: z.boolean(),
    minScore: z.number().min(0).max(100),
    minSalary: z.object({ amount: z.number().positive(), currency: text(8).min(1) }).nullable(),
    maxExperience: z.number().min(0).max(30),
    employmentTypes: z.array(z.enum(["full-time", "part-time", "contract", "internship"])).min(1),
    dailyDiscoveryLimit: z.number().int().min(1).max(2000),
    // 0 = never on a schedule, only when the user asks.
    discoveryIntervalHours: z.number().max(168).refine((n) => n === 0 || n >= 6, "Use 0 (only when you click) or at least 6 hours."),
    reviewMode: z.enum(["assisted", "auto"]),
    autoApplyDailyLimit: z.number().int().min(0).max(25),
    assistedAutofill: z.boolean(),
    followUpReminders: z.boolean(),
    followUpDays: z.number().int().min(1).max(60),
    aiMatchPerRun: z.number().int().min(0).max(100),
    sources: z.object({
      enabled: z.record(z.string(), z.boolean()),
      greenhouseBoards: list(200),
      leverCompanies: list(200),
      ashbyBoards: list(200),
    }),
  })
  .partial();

const Bullet = z.object({ id: text(60).min(1), text: text(600).min(1) });

export const ProfileInput = z.object({
  name: text(120).min(1),
  headline: text(160).min(1),
  summary: text(2000),
  contact: z.object({ email: z.email(), phone: text(40), linkedin: text(200), github: text(200) }),
  skills: z.array(z.object({ category: text(80).min(1), items: list() })).max(20),
  additionalSkills: list(),
  softSkills: list(),
  experience: z
    .array(
      z.object({
        id: text(60).min(1),
        company: text(160).min(1),
        title: text(160).min(1),
        type: z.enum(["full-time", "internship"]),
        location: text(160),
        start: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM"),
        end: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM").nullable(),
        bullets: z.array(Bullet).max(20),
      }),
    )
    .max(15),
  projects: z.array(z.object({ id: text(60).min(1), name: text(160).min(1), stack: list(), url: text(300).optional(), bullets: z.array(Bullet).max(20) })).max(20),
  education: z.array(z.object({ institution: text(200), degree: text(200), detail: text(120), location: text(160), years: text(40) })).max(10),
  answers: z.record(z.string(), z.object({ question: text(200), value: text(600), verified: z.boolean(), sensitive: z.boolean().optional() })),
  resumeFile: z.string().optional(),
});

export const ManualJob = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: text(200).min(2),
  company: text(160).min(1),
  location: text(200).optional(),
  workMode: z.enum(["remote", "hybrid", "onsite", "unknown"]).optional(),
  description: text(40_000).optional(),
});

export const StatusPatch = z.object({
  status: z.enum(STATUSES),
  note: text(300).optional(),
  via: text(60).optional(),
});

const Section = z.object({ id: text(60), bulletIds: z.array(text(60)).max(30) });

export const MaterialsInput = z.object({
  resume: z.object({
    headline: text(200),
    summary: text(2000).min(1),
    skills: z.array(z.object({ category: text(80), items: list() })).max(20),
    experience: z.array(Section).max(15),
    projects: z.array(Section).max(20),
  }),
  coverLetter: text(6000),
  answers: z.array(z.object({ key: text(60), question: text(200), answer: text(600), verified: z.boolean(), sensitive: z.boolean().optional() })).max(60),
  recruiterMessage: text(2000),
  linkedinMessage: text(600),
  emailSubject: text(200).min(1),
  emailBody: text(6000).min(1),
});

const date = z.union([z.iso.date(), z.iso.datetime(), z.null()]).transform((v) => (v ? new Date(v) : null));

export const TrackingPatch = z
  .object({
    followUpDate: date,
    interviewDate: date,
    notes: text(5000),
    rejectionReason: text(1000),
    recruiter: z.object({ name: text(120).optional(), email: z.union([z.email(), z.literal("")]).optional(), linkedin: text(200).optional() }),
  })
  .partial();
