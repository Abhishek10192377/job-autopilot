// Background worker: `npm run worker`. Runs scheduled discovery, AI scoring, reminders and (in automatic mode) email applications.
import "../config/loadEnv";
import { connectDb, disconnectDb } from "../config/db";
import { setState } from "../models";
import { errorMessage, logger } from "../utils/logger";
import { schedulerTick, workOnce } from "./handlers";

const log = logger("worker");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopping = false;

async function main() {
  await connectDb();
  log.info("worker started — press Ctrl+C to stop");
  let lastTick = 0;
  while (!stopping) {
    try {
      await setState("worker:heartbeat", { at: new Date().toISOString() });
      if (Date.now() - lastTick > 60_000) {
        lastTick = Date.now();
        await schedulerTick();
      }
      // Drain the queue, then idle.
      if (await workOnce()) continue;
    } catch (e) {
      log.error("worker loop error", { error: errorMessage(e) });
    }
    await sleep(5000);
  }
  await disconnectDb();
  log.info("worker stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    log.info("stopping after the current task…");
  });
}

main().catch((e) => {
  log.error(errorMessage(e));
  process.exit(1);
});
