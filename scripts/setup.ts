// First-time setup: `npm run setup -- --resume "C:\path\to\resume.pdf"`.
// Creates .env.local with a fresh AUTH_SECRET, stores a copy of the original resume, and checks the seeded profile against it.
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compareResume, parseResumePdf, resumeDir } from "../src/server/profile/resume";
import { loadSeedProfile } from "../src/server/profile/profile";

async function main() {
  if (!existsSync(".env.local")) {
    const template = readFileSync(".env.example", "utf8");
    writeFileSync(".env.local", template.replace("AUTH_SECRET=replace-with-a-long-random-string", `AUTH_SECRET=${randomBytes(48).toString("base64url")}`));
    console.log("Created .env.local with a new AUTH_SECRET.");
  } else {
    console.log(".env.local already exists — left unchanged.");
  }

  const flag = process.argv.indexOf("--resume");
  const source = flag > -1 ? process.argv[flag + 1] : undefined;
  const target = path.join(resumeDir(), "original.pdf");
  if (source) {
    if (!existsSync(source)) throw new Error(`Resume not found: ${source}`);
    if (existsSync(target)) {
      console.log(`An original resume is already stored at ${target} — left unchanged. Upload a newer one from the Profile page.`);
    } else {
      mkdirSync(resumeDir(), { recursive: true });
      copyFileSync(source, target);
      console.log(`Stored a copy of your resume at ${target}.`);
    }
  }
  if (existsSync(target)) {
    const parsed = await parseResumePdf(readFileSync(target));
    const differences = compareResume(parsed, await loadSeedProfile());
    console.log(`Resume read: ${parsed.pages} page(s), ${parsed.skills.length} technologies recognised.`);
    console.log(differences.length ? `Differences between the resume and seed/profile.json:\n- ${differences.join("\n- ")}` : "seed/profile.json agrees with the resume.");
  } else {
    console.log('No resume stored yet. Re-run with: npm run setup -- --resume "C:\\path\\to\\resume.pdf"');
  }

  const env = readFileSync(".env.local", "utf8");
  if (!/^DASHBOARD_PASSWORD_HASH=\S+/m.test(env)) console.log('\nNext: set your dashboard password with  npm run set-password -- "your password"');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
