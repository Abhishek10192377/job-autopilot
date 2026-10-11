// Sets the dashboard password: `npm run set-password -- "your password"`. Only the hash is stored, in .env.local.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hashPassword } from "../src/server/auth/password";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage: npm run set-password -- "a password of at least 10 characters"');
  process.exit(1);
}
if (!existsSync(".env.local")) {
  console.error("Run `npm run setup` first to create .env.local.");
  process.exit(1);
}
const line = `DASHBOARD_PASSWORD_HASH=${hashPassword(password)}`;
const env = readFileSync(".env.local", "utf8");
writeFileSync(".env.local", /^DASHBOARD_PASSWORD_HASH=.*$/m.test(env) ? env.replace(/^DASHBOARD_PASSWORD_HASH=.*$/m, line) : `${env.trimEnd()}\n${line}\n`);
console.log("Dashboard password saved to .env.local. Restart `npm run dev` if it is running.");
