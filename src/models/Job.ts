import mongoose, { Schema, type Model, type Types } from "mongoose";
import { STATUSES, type JobStatus, type MatchResult, type RemoteEligibility, type Salary, type WorkMode } from "@/types";

export interface IJob {
  _id: Types.ObjectId;
  source: string;
  sourceId: string;
  sources: { source: string; url: string }[];
  url: string;
  applyUrl: string;
  urlKey: string;
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

export const Job = (mongoose.models.Job as Model<IJob>) || mongoose.model<IJob>("Job", JobSchema);
