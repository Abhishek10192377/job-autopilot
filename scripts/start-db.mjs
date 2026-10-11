// Starts a local MongoDB for this project: `npm run db`. Data lives in ./.mongo-data (git-ignored).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

function findMongod() {
  if (process.env.MONGOD_PATH && existsSync(process.env.MONGOD_PATH)) return process.env.MONGOD_PATH;
  const root = "C:\\Program Files\\MongoDB\\Server";
  if (existsSync(root)) {
    for (const version of readdirSync(root).sort().reverse()) {
      const exe = path.join(root, version, "bin", "mongod.exe");
      if (existsSync(exe)) return exe;
    }
  }
  const onPath = spawnSync(process.platform === "win32" ? "where" : "which", ["mongod"], { encoding: "utf8" });
  return onPath.status === 0 ? onPath.stdout.split(/\r?\n/)[0].trim() : null;
}

const mongod = findMongod();
if (!mongod) {
  console.error(
    "mongod was not found. Either install MongoDB Community Server (https://www.mongodb.com/try/download/community),\n" +
      "set MONGOD_PATH to mongod's location, or point MONGODB_URI in .env.local at a MongoDB Atlas cluster and skip this command.",
  );
  process.exit(1);
}

const dbPath = path.resolve(".mongo-data");
mkdirSync(dbPath, { recursive: true });
console.log(`Starting ${mongod}\n  data: ${dbPath}\n  listening on mongodb://127.0.0.1:27017 (Ctrl+C to stop)`);
const child = spawn(mongod, ["--dbpath", dbPath, "--bind_ip", "127.0.0.1", "--port", "27017", "--quiet"], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
