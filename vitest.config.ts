import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Reuse a locally installed mongod for the in-memory test database instead of downloading one.
const localMongod = "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe";
if (!process.env.MONGOMS_SYSTEM_BINARY && existsSync(localMongod)) {
  process.env.MONGOMS_SYSTEM_BINARY = localMongod;
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
