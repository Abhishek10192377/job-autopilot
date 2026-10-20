import mongoose, { Schema, type Model, type Types } from "mongoose";

/** One entry in the dashboard's activity log. */
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

export const Activity = (mongoose.models.Activity as Model<IActivity>) || mongoose.model<IActivity>("Activity", ActivitySchema);
