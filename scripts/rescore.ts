// Re-score every stored job against the current profile and settings: `npm run rescore`.
import "../src/server/config/loadEnv";
import { connectDb, disconnectDb } from "../src/server/db/connect";
import { Job } from "../src/server/db/models";
import { rescoreAll } from "../src/server/matching/match";

connectDb()
  .then(async () => {
    const count = await rescoreAll();
    console.log(`Re-scored ${count} jobs; ${await Job.countDocuments({ status: "matched" })} are currently matched.`);
    await disconnectDb();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
