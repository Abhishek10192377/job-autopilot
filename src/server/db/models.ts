import mongoose, { Schema, type Model, type Types } from "mongoose";
import { STATUSES, type JobStatus, type MatchResult, type Materials, type Profile, type Salary, type Settings, type WorkMode, type RemoteEligibility } from "@/shared/types";

// ---------------------------------------------------------------- Job
export interface IJob {
  _id: Types.ObjectId;
  source: string;
  sourceId: string;
  sources: { source: string; url: string }[];
  url: string;
  applyUrl: string;
  /** Normalised URL — one listing per stable URL. */
  urlKey: string;
  /** Normalised company|title — catches the same role re-posted on another board. */
  dedupeKey: string;
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
  postedAt?: Date | null;
  deadline?: Date | null;
  discoveredAt: Date;
  lastSeenAt: Date;
  match?: MatchResult | null;
  heuristicMatch?: MatchResult | null;
  status: JobStatus;
  statusHistory: { status: JobStatus; at: Date; note?: string }[];
  attribution?: string;
}

const MatchSchema = new Schema({}, { strict: false, _id: false });

const JobSchema = new Schema<IJob>(
  {
    source: { type: String, required: true, index: true },
    sourceId: { type: String, required: true },
    sources: [{ source: String, url: String, _id: false }],
    url: { type: String, required: true },
    applyUrl: { type: String, required: true },
    urlKey: { type: String, required: true, unique: true },
    dedupeKey: { type: String, required: true, index: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, default: "" },
    workMode: { type: String, default: "unknown" },
    remoteRegions: [String],
    remoteEligibility: { type: String, default: "unknown" },
    employmentType: { type: String, default: "unknown" },
    experienceMin: Number,
    experienceMax: Number,
    seniority: { type: String, default: "unspecified" },
    skillsRequired: [String],
    skillsPreferred: [String],
    salary: { type: Schema.Types.Mixed, default: null },
    workingDays: { type: String, default: "unknown" },
    description: { type: String, default: "" },
    applyEmail: String,
    postedAt: Date,
    deadline: Date,
    discoveredAt: { type: Date, default: () => new Date(), index: true },
    lastSeenAt: { type: Date, default: () => new Date() },
    match: { type: MatchSchema, default: null },
    heuristicMatch: { type: MatchSchema, default: null },
    status: { type: String, enum: STATUSES, default: "discovered", index: true },
    statusHistory: [{ status: String, at: Date, note: String, _id: false }],
    attribution: String,
  },
  { minimize: false },
);
JobSchema.index({ "match.total": -1 });

// ---------------------------------------------------------------- Application
export interface IApplication {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  resumeVersion: number;
  materials: Materials;
  truthWarnings: string[];
  generatedBy: "template" | "ai";
  preparedAt: Date;
  appliedAt?: Date | null;
  appliedVia?: string | null;
  /** Set before an application email goes out, so it can never be sent twice. */
  emailSentAt?: Date | null;
  followUpDate?: Date | null;
  followUpNotifiedAt?: Date | null;
  interviewDate?: Date | null;
  recruiter: { name?: string; email?: string; linkedin?: string };
  notes: string;
  rejectionReason: string;
  resumeFiles: { version: number; pdf: string; docx: string }[];
  automationLog: { at: Date; message: string }[];
}

const ApplicationSchema = new Schema<IApplication>(
  {
    // Unique: at most one application record per job.
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, unique: true },
    resumeVersion: { type: Number, default: 1 },
    // Null when a job was marked as applied without preparing materials here.
    materials: { type: Schema.Types.Mixed, default: null },
    truthWarnings: [String],
    generatedBy: { type: String, default: "template" },
    preparedAt: { type: Date, default: () => new Date() },
    appliedAt: Date,
    appliedVia: String,
    emailSentAt: Date,
    followUpDate: Date,
    followUpNotifiedAt: Date,
    interviewDate: Date,
    recruiter: { name: String, email: String, linkedin: String },
    notes: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    resumeFiles: [{ version: Number, pdf: String, docx: String, _id: false }],
    automationLog: [{ at: Date, message: String, _id: false }],
  },
  { minimize: false },
);

// ---------------------------------------------------------------- Singletons
export interface ISettingsDoc {
  _id: string;
  value: Settings;
}
const SettingsSchema = new Schema<ISettingsDoc>({ _id: String, value: Schema.Types.Mixed }, { minimize: false });

export interface IProfileDoc {
  _id: string;
  value: Profile;
  updatedAt: Date;
}
const ProfileSchema = new Schema<IProfileDoc>({ _id: String, value: Schema.Types.Mixed, updatedAt: Date }, { minimize: false });

// ---------------------------------------------------------------- Queue
export type TaskStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export interface ITask {
  _id: Types.ObjectId;
  type: string;
  payload: Record<string, unknown>;
  status: TaskStatus;
  /** Prevents two pending tasks for the same piece of work. */
  uniqueKey?: string;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockedAt?: Date | null;
  finishedAt?: Date | null;
  lastError?: string | null;
  result?: string | null;
  createdAt: Date;
}
const TaskSchema = new Schema<ITask>({
  type: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, default: "queued", index: true },
  uniqueKey: String,
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  runAt: { type: Date, default: () => new Date() },
  lockedAt: Date,
  finishedAt: Date,
  lastError: String,
  result: String,
  createdAt: { type: Date, default: () => new Date() },
});
TaskSchema.index({ status: 1, runAt: 1 });

// ---------------------------------------------------------------- Activity + runtime state
export interface IActivity {
  _id: Types.ObjectId;
  at: Date;
  type: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  jobId?: Types.ObjectId | null;
}
const ActivitySchema = new Schema<IActivity>({
  at: { type: Date, default: () => new Date(), index: true },
  type: String,
  level: { type: String, default: "info" },
  message: String,
  jobId: { type: Schema.Types.ObjectId, ref: "Job" },
});

/** Small key/value store: worker heartbeat, per-source last run, daily counters. */
export interface IState {
  _id: string;
  value: unknown;
  updatedAt: Date;
}
const StateSchema = new Schema<IState>({ _id: String, value: Schema.Types.Mixed, updatedAt: Date }, { minimize: false });

function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);
}

export const Job = model<IJob>("Job", JobSchema);
export const Application = model<IApplication>("Application", ApplicationSchema);
export const SettingsModel = model<ISettingsDoc>("Settings", SettingsSchema);
export const ProfileModel = model<IProfileDoc>("Profile", ProfileSchema);
export const Task = model<ITask>("Task", TaskSchema);
export const Activity = model<IActivity>("Activity", ActivitySchema);
export const State = model<IState>("State", StateSchema);

export async function getState<T>(key: string): Promise<T | null> {
  const doc = await State.findById(key).lean();
  return doc ? (doc.value as T) : null;
}

export async function setState(key: string, value: unknown) {
  await State.updateOne({ _id: key }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
}
