import type { Salary, Settings, SourceStatus } from "@/shared/types";

export interface RawJob {
  source: string;
  sourceId: string;
  title: string;
  company: string;
  url: string;
  applyUrl?: string;
  location?: string;
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
  requires?: string;
  note: string;
  minIntervalHours: number;
  strictInterval?: boolean;
  available(): boolean;
  fetch(ctx: SourceContext): Promise<RawJob[]>;
}
