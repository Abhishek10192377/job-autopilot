import mongoose, { Schema, type Model } from "mongoose";
import { type Profile } from "@/types";

/** Single document holding the candidate profile. */
export interface IProfileDoc {
  _id: string;
  value: Profile;
  updatedAt: Date;
}
const ProfileSchema = new Schema<IProfileDoc>({ _id: String, value: Schema.Types.Mixed, updatedAt: Date }, { minimize: false });

export const ProfileModel = (mongoose.models.Profile as Model<IProfileDoc>) || mongoose.model<IProfileDoc>("Profile", ProfileSchema);
