import mongoose, { Schema, type Model } from "mongoose";
import { type Settings } from "@/types";

/** Single document holding the user's settings. */
export interface ISettingsDoc {
  _id: string;
  value: Settings;
}
const SettingsSchema = new Schema<ISettingsDoc>({ _id: String, value: Schema.Types.Mixed }, { minimize: false });

export const SettingsModel = (mongoose.models.Settings as Model<ISettingsDoc>) || mongoose.model<ISettingsDoc>("Settings", SettingsSchema);
