import path from "node:path";

// Server-side configuration. Secrets are read from the environment only and never sent to the client.
export const env = {
  get mongoUri() {
    return process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/job_autopilot";
  },
  get authSecret() {
    return process.env.AUTH_SECRET || "";
  },
  get passwordHash() {
    return process.env.DASHBOARD_PASSWORD_HASH || "";
  },
  get aiProvider() {
    return process.env.AI_PROVIDER === "ollama" ? "ollama" : "anthropic";
  },

  get ollamaUrl() {
    return (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
  },

 get ollamaModel() {
    return process.env.OLLAMA_MODEL || "qwen2.5:7b";
  },
    get aiModel() {
    if (this.aiProvider === "ollama") return this.ollamaModel;
    return process.env.AI_MODEL || "claude-opus-5-5";
  },

  get aiMatchModel() {
    if (this.aiProvider === "ollama") return this.ollamaModel;
    return process.env.AI_MATCH_MODEL || this.aiModel;
  },
  get aiConfigured() {
    if (this.aiProvider === "ollama") return true;
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  },
  get adzuna() {
    const id = process.env.ADZUNA_APP_ID;
    const key = process.env.ADZUNA_APP_KEY;
    return id && key ? { id, key } : null;
  },
  get rapidApiKey() {
    return process.env.RAPIDAPI_KEY || "";
  },
  get smtp() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    return {
      host,
      port: Number(process.env.SMTP_PORT || 587),
      user,
      pass,
      from: process.env.SMTP_FROM || user,
    };
  },
  get browserChannel() {
    return process.env.BROWSER_CHANNEL || "msedge";
  },
  get dataDir() {
    return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data", "private"));
  },
};
