type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level) || "info"] ?? 20;

function emit(level: Level, scope: string, message: string, meta?: Record<string, unknown>) {
  if (ORDER[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line + extra);
}

export function logger(scope: string) {
  return {
    debug: (m: string, meta?: Record<string, unknown>) => emit("debug", scope, m, meta),
    info: (m: string, meta?: Record<string, unknown>) => emit("info", scope, m, meta),
    warn: (m: string, meta?: Record<string, unknown>) => emit("warn", scope, m, meta),
    error: (m: string, meta?: Record<string, unknown>) => emit("error", scope, m, meta),
  };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
