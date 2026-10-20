import { describe, expect, it } from "vitest";
import { enrich } from "@/services/discovery/enrich";
import { extractApplyEmail, extractExperience, extractSalary, extractWorkingDays, isRelevantTitle } from "@/services/discovery/extract";
import { qualifies, scoreJob } from "@/services/matching/heuristic";
import { classifyJobSkills, extractSkills } from "@/services/matching/lexicon";
import { statusAfterScoring } from "@/services/matching/match";
import { experienceSummary, loadSeedProfile, profileSkillSet } from "@/services/profile/profile";
import { DEFAULT_SETTINGS } from "@/services/settingsService";
import { COMPONENT_KEYS, COMPONENT_MAX } from "@/types";
import { NOW, rawJob } from "./helpers";

const profile = await loadSeedProfile();
const ONSITE = { remote: false, remoteRegions: [], descriptionText: rawJob().descriptionText!.replace('on a fully remote team', 'based in our office') };
const score = (overrides: Parameters<typeof rawJob>[0] = {}, settings = DEFAULT_SETTINGS) => {
  const job = enrich(rawJob(overrides));
  return { job, match: scoreJob(job, profile, settings, NOW) };
};

describe("profile facts", () => {
  it("computes experience from the resume's dates without rounding up", () => {
    const exp = experienceSummary(profile, NOW);
    expect(exp.fullTimeMonths).toBe(15); // July 2025 → October 2026
    expect(exp.internshipMonths).toBe(6); // January–June 2025
    expect(exp.label).toBe("1 year 3 months full-time plus a 6-month internship");
  });

  it("only claims skills that are on the resume", () => {
    const skills = profileSkillSet(profile);
    for (const s of ["React", "Next.js", "TypeScript", "Node.js", "MongoDB", "SQL Server", "Material UI", "JWT"]) expect(skills.has(s), s).toBe(true);
    for (const s of ["Python", "AWS", "Docker", "Angular", "GraphQL", ".NET"]) expect(skills.has(s), s).toBe(false);
  });
});

describe("compatibility score", () => {
  it("uses the 35/25/20/10/10 weighting and totals the components", () => {
    const { match } = score();
    expect(COMPONENT_KEYS.map((k) => match.components[k].max)).toEqual([35, 25, 20, 10, 10]);
    expect(Object.values(COMPONENT_MAX).reduce((a, b) => a + b)).toBe(100);
    expect(match.total).toBe(Math.round(COMPONENT_KEYS.reduce((a, k) => a + match.components[k].score, 0)));
  });

  it("scores a remote React/Next.js role open to India as a strong match", () => {
    const { job, match } = score();
    expect(job.workMode).toBe("remote");
    expect(job.remoteEligibility).toBe("eligible");
    expect(job.experienceMin).toBe(2);
    expect(job.workingDays).toBe("Mon–Fri");
    expect(job.skillsPreferred).toEqual(expect.arrayContaining(["GraphQL", "Docker"]));
    expect(match.total).toBeGreaterThanOrEqual(80);
    expect(match.components.location.score).toBe(10);
    expect(qualifies(job, match, DEFAULT_SETTINGS).ok).toBe(true);
  });

  it("explains an experience gap instead of rejecting the job", () => {
    const { job, match } = score({ descriptionText: rawJob().descriptionText!.replace("2+ years", "3+ years") });
    expect(job.experienceMin).toBe(3);
    const exp = match.components.experience;
    expect(exp.score).toBeGreaterThan(0);
    expect(exp.score).toBeLessThan(25);
    expect(exp.notes.join(" ")).toMatch(/Gap of roughly 1\.3 year/);
    expect(match.total).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.minScore);
  });

  it("scores an unrelated senior role low and says why", () => {
    const { match } = score({
      title: "Senior Java Backend Engineer",
      remote: false,
      remoteRegions: [],
      location: "Berlin, Germany",
      descriptionText: "Requirements\n- 8+ years of experience with Java and Spring Boot\n- Kubernetes and AWS in production\n- Fluent in German\nThis is an on-site role in our Berlin office. ".padEnd(400, "."),
    });
    expect(match.total).toBeLessThan(40);
    expect(match.components.location.score).toBe(0);
    expect(match.gaps.join(" ")).toMatch(/Java/);
  });

  it("treats unpublished information as unknown, not as satisfied", () => {
    const { match } = score({ title: "Software Developer", remote: null, remoteRegions: [], employmentType: "", descriptionText: "" });
    for (const key of ["skills", "experience", "location", "other"] as const) {
      expect(match.components[key].unknown, key).toBe(true);
      expect(match.components[key].score, key).toBeLessThanOrEqual(match.components[key].max / 2);
    }
    expect(match.confidence).toBeLessThanOrEqual(20);
    expect(match.summary).toMatch(/does not publish/);
  });

  it("marks a remote role restricted to another country as a location mismatch", () => {
    const { job, match } = score({ remoteRegions: ["USA"] });
    expect(job.remoteEligibility).toBe("restricted");
    expect(match.components.location.score).toBeLessThanOrEqual(1);
  });

  it("prefers the configured cities for on-site roles", () => {
    const local = score({ ...ONSITE, location: "Mohali, Punjab, India" }).match.components.location.score;
    const other = score({ ...ONSITE, location: "Bengaluru, India" }).match.components.location.score;
    expect(local).toBeGreaterThan(other);
  });

  it("applies remote-only mode and the minimum score to eligibility", () => {
    const onsite = score({ ...ONSITE, location: "Mohali, India" });
    expect(qualifies(onsite.job, onsite.match, { ...DEFAULT_SETTINGS, remoteOnly: true }).ok).toBe(false);
    expect(qualifies(onsite.job, onsite.match, { ...DEFAULT_SETTINGS, minScore: 99 }).reasons[0]).toMatch(/below your minimum/);
  });

  it("keeps impractical roles out of the matches while still scoring them", () => {
    const abroad = score({ ...ONSITE, location: "New York City" });
    expect(abroad.match.total).toBeGreaterThan(DEFAULT_SETTINGS.minScore);
    expect(qualifies(abroad.job, abroad.match, DEFAULT_SETTINGS).reasons.join(" ")).toMatch(/outside India/);
    const restricted = score({ remoteRegions: ["USA"] });
    expect(qualifies(restricted.job, restricted.match, DEFAULT_SETTINGS).reasons.join(" ")).toMatch(/only for candidates in USA/);
    const senior = score({ descriptionText: rawJob().descriptionText!.replace("2+ years", "5+ years") });
    expect(qualifies(senior.job, senior.match, DEFAULT_SETTINGS).reasons.join(" ")).toMatch(/above your maximum of 3/);
    // A slightly higher ask is explained, not excluded.
    const stretch = score({ descriptionText: rawJob().descriptionText!.replace("2+ years", "3+ years") });
    expect(qualifies(stretch.job, stretch.match, DEFAULT_SETTINGS).ok).toBe(true);
    const india = score({ ...ONSITE, location: "Bengaluru; London" });
    expect(qualifies(india.job, india.match, DEFAULT_SETTINGS).ok).toBe(true);
  });

  it("only moves jobs between Discovered and Matched when scoring", () => {
    expect(statusAfterScoring("discovered", true)).toBe("matched");
    expect(statusAfterScoring("matched", false)).toBe("discovered");
    expect(statusAfterScoring("applied", false)).toBe("applied");
    expect(statusAfterScoring("saved", true)).toBe("saved");
  });
});

describe("extraction from posting text", () => {
  it("reads experience requirements and leaves them null when absent", () => {
    expect(extractExperience("We need 3-5 years of experience.")).toMatchObject({ min: 3, max: 5 });
    expect(extractExperience("At least two years working with React.")).toMatchObject({ min: 2, max: null });
    expect(extractExperience("5+ years overall, including 2 years of React experience")).toMatchObject({ min: 5 });
    expect(extractExperience("Join our friendly team.")).toEqual({ min: null, max: null, evidence: null });
  });

  it("distinguishes look-alike technologies", () => {
    expect(extractSkills("Java and JavaScript")).toEqual(["Java", "JavaScript"]);
    expect(extractSkills("Node.js with MySQL")).toEqual(["Node.js", "MySQL"]);
    expect(extractSkills("React Native apps")).toEqual(["React Native"]);
  });

  it("separates required from preferred skills", () => {
    const { required, preferred } = classifyJobSkills("Requirements\n- React and TypeScript\nNice to have\n- AWS");
    expect(required).toEqual(["React", "TypeScript"]);
    expect(preferred).toEqual(["AWS"]);
  });

  it("reads salary, working days and apply-by-email instructions only when explicit", () => {
    expect(extractSalary("CTC: 6-9 LPA")).toMatchObject({ min: 600000, max: 900000, currency: "INR" });
    expect(extractSalary("Competitive salary")).toBeNull();
    expect(extractWorkingDays("5 days working, weekends off")).toBe("Mon–Fri");
    expect(extractWorkingDays("Monday to Saturday")).toBe("6-day or Saturday working");
    expect(extractWorkingDays("Great culture")).toBe("unknown");
    expect(extractApplyEmail("To apply, send your resume to careers@acme.dev.")).toBe("careers@acme.dev");
    expect(extractApplyEmail("Questions about accessibility? Contact help@acme.dev.")).toBeNull();
  });

  it("keeps only software-development titles", () => {
    expect(isRelevantTitle("React Developer")).toBe(true);
    expect(isRelevantTitle("Sales Engineer")).toBe(false);
    expect(isRelevantTitle("Account Executive")).toBe(false);
  });
});
