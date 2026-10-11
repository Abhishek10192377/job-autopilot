// Shared wrapper for API route handlers: database connection, validation and consistent error responses.
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { AiError } from "./ai/client";
import { connectDb } from "./db/connect";
import { errorMessage, logger } from "./lib/logger";
import { PermanentError } from "./queue/queue";
import { TrackingError } from "./tracking/applications";

const log = logger("api");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function toResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  if (e instanceof ZodError) {
    const detail = e.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: `Invalid input — ${detail}` }, { status: 400 });
  }
  if (e instanceof TrackingError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "not_found" ? 404 : 409 });
  if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: 502 });
  if (e instanceof PermanentError) return NextResponse.json({ error: e.message }, { status: 400 });
  if ((e as { name?: string }).name === "CastError") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const message = errorMessage(e);
  if (message.startsWith("Cannot reach MongoDB")) return NextResponse.json({ error: message }, { status: 503 });
  log.error("unhandled error", { error: message, stack: e instanceof Error ? e.stack : undefined });
  return NextResponse.json({ error: "Something went wrong — see the server log for details." }, { status: 500 });
}

export function route<P = Record<string, never>>(handler: (req: NextRequest, params: P) => Promise<unknown>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      await connectDb();
      const out = await handler(req, await ctx.params);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return toResponse(e);
    }
  };
}

export async function readJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  return schema.parse(await req.json().catch(() => ({})));
}

const hits = new Map<string, number[]>();

/** In-memory sliding-window limit; enough for a single-user dashboard. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    throw new ApiError(429, `Too many requests — try again in ${Math.ceil((windowMs - (now - recent[0])) / 1000)} seconds.`);
  }
  recent.push(now);
  hits.set(key, recent);
}
