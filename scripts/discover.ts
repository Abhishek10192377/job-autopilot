// One discovery run from the command line: `npm run discover` or `npm run discover -- --only=remotive,greenhouse`.
// `--force` fetches sources again even if they were fetched within their minimum refresh interval. Use it sparingly.
import "../src/config/loadEnv";
import { disconnectDb } from "../src/config/db";
import { runDiscovery } from "../src/services/discovery/discover";

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);
const force = process.argv.includes("--force");

runDiscovery({ only, force })
  .then(async (summary) => {
    for (const s of summary.sources) console.log(`${s.status.padEnd(7)} ${s.id.padEnd(15)} ${s.detail}`);
    console.log(`\nTotal: ${summary.fetched} fetched, ${summary.added} new, ${summary.matched} matching your profile, ${summary.duplicates} already known, ${summary.skippedByLimit} held back by the daily limit.`);
    await disconnectDb();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
