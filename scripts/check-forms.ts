// Dry run of assisted autofill: `npm run check-forms`.
// Opens one stored Greenhouse, Lever and Ashby application page in a hidden browser, reads the form and prints
// what WOULD be filled. Nothing is typed, uploaded or submitted.
import "../src/server/config/loadEnv";
import { chromium } from "playwright-core";
import { fillableAnswers, planFill, readForm } from "../src/server/apply/autofill";
import { policyFor } from "../src/server/apply/policy";
import { env } from "../src/server/config/env";
import { connectDb, disconnectDb } from "../src/server/db/connect";
import { Job } from "../src/server/db/models";
import { getProfile } from "../src/server/profile/profile";

async function main() {
  await connectDb();
  const answers = fillableAnswers(await getProfile());
  const browser = await chromium.launch({ channel: env.browserChannel, headless: true });
  for (const source of ["greenhouse", "lever", "ashby"]) {
    const job = (await Job.find({ source }).sort({ discoveredAt: -1 }).limit(40).lean()).find((j) => policyFor(j).assistedAutofill);
    if (!job) {
      console.log(`\n${source}: no stored job with a supported form`);
      continue;
    }
    const page = await browser.newPage();
    try {
      await page.goto(job.applyUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const { fields, captcha } = await readForm(page);
      const plan = planFill(fields, answers);
      console.log(`\n${source}: ${job.title} at ${job.company}\n  ${job.applyUrl}`);
      console.log(`  ${fields.length} fields found${captcha ? " (CAPTCHA present — left to you)" : ""}`);
      console.log(`  would fill: ${plan.fill.map((f) => f.label).join(", ") || "nothing"}`);
      console.log(`  resume upload field: ${plan.resumeFieldIdx === null ? "not found" : "found"}`);
      for (const n of plan.needsYou) console.log(`  left for you: ${n.replace(/\s+/g, " ").slice(0, 110)}`);
    } catch (e) {
      console.log(`\n${source}: could not read ${job.applyUrl} — ${(e as Error).message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
  await disconnectDb();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
