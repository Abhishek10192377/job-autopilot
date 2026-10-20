// Server-side only. All AI calls go to a local Ollama model.
import { z } from "zod";
import { env } from "../config/env";

export class AiError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  user: string;
  schema: S;
}

/** One structured-output call to Ollama: returns data validated against the schema, or throws AiError. */
export async function structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  const schema = z.toJSONSchema(req.schema);
  // Ollama Cloud ignores `format`, so the schema is also spelled out in the prompt.
  const system = `${req.system}

Reply with only a JSON object that matches this JSON Schema. No markdown, no other text.
${JSON.stringify(schema)}`;
  let res: Response;
  try {
    res = await fetch(`${env.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Only sent when the Ollama server sits behind a proxy or service that requires a key.
        ...(env.ollamaApiKey ? { Authorization: `Bearer ${env.ollamaApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: env.ollamaModel,
        stream: false,
        keep_alive :"30m",
        // Forces the reply to be JSON matching the schema (no ```json fences, no extra text).
        format: schema,
        options: { temperature: 0.2, num_ctx: 8192 },
        messages: [
          { role: "system", content: system },
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
    json = JSON.parse(extractJson(data.message?.content ?? ""));
  } catch {
    throw new AiError("The AI model did not return valid JSON.", true);
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) throw new AiError("The AI model returned output that did not match the expected format.", true);
  return parsed.data;
}

/** The JSON object in a reply, without any ```json fence or text around it. */
function extractJson(content: string): string {
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
