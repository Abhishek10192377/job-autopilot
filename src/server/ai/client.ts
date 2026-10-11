// Server-side only. The API key is read from the environment by the SDK and never reaches the browser.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import  { z } from "zod";
import { env } from "../config/env";
import { logger } from "../lib/logger";

const log = logger("ai");
let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return client;
}

export class AiError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

// Models that support server-side refusal fallbacks.
const SUPPORTS_FALLBACK = /^claude-(opus-5|fable-5|sonnet-5-5)/;

export interface StructuredRequest<S extends z.ZodType> {
  model?: string;
  /** Stable instructions + profile. Sent first and cached, so repeated calls only pay for the job text. */
  system: string;
  user: string;
  schema: S;
  effort?: "low" | "medium" | "high";
}

/** One structured-output call: returns data validated against the schema, or throws AiError. */
export async function structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  if (!env.aiConfigured) throw new AiError("No AI key configured (set ANTHROPIC_API_KEY).", false);
  if (env.aiProvider === "ollama") return ollamaStructured(req);
  const model = req.model ?? env.aiModel;
  const fallback = SUPPORTS_FALLBACK.test(model);
  try {
    const res = await getClient().beta.messages.parse({
      model,
      max_tokens: 16000,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
      output_config: { effort: req.effort ?? "medium", format: betaZodOutputFormat(req.schema) },
      // If a safety classifier declines the request, let the API re-run it on its default fallback model.
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (res.stop_reason === "refusal") throw new AiError("The model declined this request.", false);
    if (res.stop_reason === "max_tokens") throw new AiError("The model's answer was cut off.", true);
    if (!res.parsed_output) throw new AiError("The model returned output that did not match the expected format.", true);
    log.debug("usage", { model: res.model, in: res.usage.input_tokens, cached: res.usage.cache_read_input_tokens, out: res.usage.output_tokens });
    return res.parsed_output as z.infer<S>;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The AI API key was rejected — check ANTHROPIC_API_KEY.", false);
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError("The AI API key lacks permission for this model.", false);
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`AI request rejected: ${e.message}`, false);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("AI rate limit reached — try again shortly.", true);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("Could not reach the AI service.", true);
    if (e instanceof Anthropic.APIError) throw new AiError(`AI service error (${e.status ?? "unknown"}).`, (e.status ?? 500) >= 500);
    throw e;
  }
}

/** Same contract as structured(), but served by a local Ollama model. */
async function ollamaStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${env.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.ollamaModel,
        stream: false,
        keep_alive :"30m",
        // Forces the reply to be JSON matching the schema (no ```json fences, no extra text).
        format: z.toJSONSchema(req.schema),
        options: { temperature: 0.2, num_ctx: 8192 },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
      // A local model on CPU can take a minute or more.
      signal: AbortSignal.timeout(300_000),
    });
  } catch {
    throw new AiError(`Could not reach Ollama at ${env.ollamaUrl} — is it running?`, true);
  }
  if (!res.ok) {
    throw new AiError(`Ollama error (${res.status}): ${(await res.text()).slice(0, 200)}`, res.status >= 500);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  let json: unknown;
  try {
    json = JSON.parse(data.message?.content ?? "");
  } catch {
    throw new AiError("The local model did not return valid JSON.", true);
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) throw new AiError("The local model returned output that did not match the expected format.", true);
  return parsed.data;
}
