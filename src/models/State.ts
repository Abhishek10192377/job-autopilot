import mongoose, { Schema, type Model } from "mongoose";

/** Small key/value store: worker heartbeat, per-source last run, daily counters. */
export interface IState {
  _id: string;
  value: unknown;
  updatedAt: Date;
}
const StateSchema = new Schema<IState>({ _id: String, value: Schema.Types.Mixed, updatedAt: Date }, { minimize: false });

export const State = (mongoose.models.State as Model<IState>) || mongoose.model<IState>("State", StateSchema);

export async function getState<T>(key: string): Promise<T | null> {
  const doc = await State.findById(key).lean();
  return doc ? (doc.value as T) : null;
}

export async function setState(key: string, value: unknown) {
  await State.updateOne({ _id: key }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
}
