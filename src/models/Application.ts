import mongoose, { Schema, type Model, type Types } from "mongoose";
import { type Materials } from "@/types";

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
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, unique: true },
    resumeVersion: { type: Number, default: 1 },
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

export const Application = (mongoose.models.Application as Model<IApplication>) || mongoose.model<IApplication>("Application", ApplicationSchema);
