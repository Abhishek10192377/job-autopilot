import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDb, disconnectDb } from "@/server/db/connect";
import type { RawJob } from "@/server/discovery/types";

let server: MongoMemoryServer | undefined;
let dataDir: string | undefined;

/** A throwaway MongoDB and data directory, so tests never touch real jobs or generated documents. */
export async function startDb() {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("job_autopilot_test");
  dataDir = mkdtempSync(path.join(os.tmpdir(), "job-autopilot-test-"));
  process.env.DATA_DIR = dataDir;
  await connectDb();
}

export async function stopDb() {
  await disconnectDb();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
}

export const NOW = new Date("2026-10-11T09:00:00Z");

export const REACT_JOB_DESCRIPTION = `About the role
We are a product company hiring a frontend developer to build our customer dashboard. This is a full-time position on a fully remote team, working Monday to Friday.

Requirements
- 2+ years of experience building web applications
- Strong React and Next.js skills with TypeScript
- Experience with REST APIs and Tailwind CSS
- Comfortable with Git and code reviews

Nice to have
- Experience with GraphQL
- Exposure to Docker`;

export function rawJob(overrides: Partial<RawJob> = {}): RawJob {
  return {
    source: "test",
    sourceId: "1",
    title: "Frontend Developer (React / Next.js)",
    company: "Acme Labs",
    url: "https://jobs.example.com/acme/frontend-developer",
    remote: true,
    remoteRegions: ["India"],
    employmentType: "full_time",
    descriptionText: REACT_JOB_DESCRIPTION,
    ...overrides,
  };
}
