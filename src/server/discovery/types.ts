import type { Salary, Settings, SourceStatus } from "@/shared/types";

/** A listing as returned by a source, before normalisation and enrichment. */
export interface RawJob {
  source: string;
  sourceId: string;
  title: string;
  company: string;
  url: string;
  applyUrl?: string;
  location?: string;
  /** true/false when the source states it; null when it does not say. */
  remote?: boolean | null;
  remoteRegions?: string[];
  employmentType?: string;
  descriptionHtml?: string;
  descriptionText?: string;
  tags?: string[];
  salary?: Salary | null;
  postedAt?: Date | null;
  deadline?: Date | null;
  attribution?: string;
}

export interface SourceContext {
  settings: Settings;
}

export interface JobSource {
  id: string;
  name: string;
  kind: SourceStatus["kind"];
  /** What the source needs before it can run (shown in Settings). */
  requires?: string;
  /** How this integration is permitted and what its terms ask for. */
  note: string;
  /** Minimum hours between two fetches, per the source's own guidance. */
  minIntervalHours: number;
  /** The interval comes from the source's terms or a request quota, so a manual run must keep to it too. */
  strictInterval?: boolean;
  available(): boolean;
  fetch(ctx: SourceContext): Promise<RawJob[]>;
}
