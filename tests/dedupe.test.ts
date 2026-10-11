import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Job } from "@/server/db/models";
import { ingest } from "@/server/discovery/discover";
import { addManualJob } from "@/server/discovery/manual";
import { dedupeKey, normalizeUrl } from "@/server/discovery/normalize";
import { markApplied, TrackingError } from "@/server/tracking/applications";
import { rawJob, startDb, stopDb } from "./helpers";

beforeAll(startDb);
afterAll(stopDb);

describe("stable keys", () => {
  it("normalises job URLs", () => {
    expect(normalizeUrl("https://WWW.Example.com/Jobs/123/?utm_source=x&gh_src=abc#apply")).toBe("example.com/jobs/123");
    expect(normalizeUrl("https://example.com/jobs?id=7&ref=feed")).toBe("example.com/jobs?id=7");
    expect(normalizeUrl("https://jobs.lever.co/acme/abc-123/apply")).toBe(normalizeUrl("https://jobs.lever.co/acme/abc-123"));
  });

  it("normalises company and title into one key", () => {
    expect(dedupeKey("Acme Labs Pvt. Ltd.", "Sr. Front-End Developer (Remote)")).toBe(dedupeKey("ACME LABS", "Senior Frontend Developer"));
    expect(dedupeKey("Acme Labs", "React.js Developer")).toBe(dedupeKey("Acme Labs Inc", "ReactJS Developer - India"));
    expect(dedupeKey("Acme Labs", "Frontend Developer")).not.toBe(dedupeKey("Acme Labs", "Backend Developer"));
  });
});

describe("duplicate listings", () => {
  it("stores one listing per URL and per company + title", async () => {
    const result = await ingest([
      rawJob(),
      rawJob({ sourceId: "2", url: "https://jobs.example.com/acme/frontend-developer/?utm_source=newsletter" }),
      rawJob({ source: "otherboard", sourceId: "3", url: "https://otherboard.example.org/listing/991", company: "Acme Labs Inc." }),
      rawJob({ sourceId: "4", title: "Enterprise Sales Manager", url: "https://jobs.example.com/acme/sales" }),
    ]);
    expect(result.added).toBe(1);
    expect(result.matched).toBe(1);
    expect(await Job.countDocuments()).toBe(1);
  });

  it("recognises the same role on a second run and records the extra source link", async () => {
    const again = await ingest([rawJob(), rawJob({ source: "otherboard", sourceId: "3", url: "https://otherboard.example.org/listing/991" })]);
    expect(again.added).toBe(0);
    expect(again.duplicates).toBe(2);
    const job = await Job.findOne().lean();
    expect(job!.sources.map((s) => s.source).sort()).toEqual(["otherboard", "test"]);
  });

  it("keeps the best-scoring listings when the daily limit is reached", async () => {
    const result = await ingest(
      [
        rawJob({ sourceId: "10", company: "Weak Fit Co", title: "Senior Java Developer", url: "https://jobs.example.com/weak", descriptionText: "8+ years of Java and Spring Boot." }),
        rawJob({ sourceId: "11", company: "Good Fit Co", url: "https://jobs.example.com/good" }),
      ],
      { limit: 2 }, // one slot is already used by the listing stored above
    );
    expect(result.added).toBe(1);
    expect(result.skippedByLimit).toBe(1);
    expect(await Job.exists({ company: "Good Fit Co" })).toBeTruthy();
    expect(await Job.exists({ company: "Weak Fit Co" })).toBeNull();
  });

  it("refuses to add a manual job that is already tracked", async () => {
    const dup = await addManualJob({ url: "https://www.linkedin.com/jobs/view/123", title: "Front-end Developer (React/Next.js)", company: "Acme Labs" });
    expect(dup.created).toBe(false);
    const fresh = await addManualJob({ url: "https://www.naukri.com/job-listings-react-developer-456", title: "React Developer", company: "Globex", location: "Mohali", description: "React, 1-2 years of experience." });
    expect(fresh.created).toBe(true);
    expect(fresh.job.source).toBe("manual");
    expect(fresh.job.experienceMin).toBe(1);
  });
});

describe("duplicate applications", () => {
  it("blocks applying twice to the same job", async () => {
    const job = await Job.findOne({ company: "Acme Labs" });
    await markApplied(job!._id, "manual");
    await expect(markApplied(job!._id, "manual")).rejects.toMatchObject({ code: "duplicate" });
  });

  it("blocks applying to the same role through a different listing", async () => {
    const original = (await Job.findOne({ company: "Acme Labs" }).lean())!;
    // A second listing can exist when a role was stored before its twin was recognised.
    const { _id, ...rest } = original;
    const twin = await Job.create({ ...rest, source: "elsewhere", url: "https://elsewhere.example.net/a", urlKey: "elsewhere.example.net/a", status: "matched", statusHistory: [] });
    const error = await markApplied(twin._id, "manual").catch((e) => e);
    expect(error).toBeInstanceOf(TrackingError);
    expect(error.message).toMatch(/already applied/);
    expect((await Job.findById(twin._id).lean())!.status).toBe("matched");
  });
});
