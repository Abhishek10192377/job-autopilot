import path from "node:path";

export const env = {
  get mongoUri() {
    return process.env.MONGODB_URI || "";
  },
  get authSecret() {
    return process.env.AUTH_SECRET || "";
  },
  get passwordHash() {
    return process.env.DASHBOARD_PASSWORD_HASH || "";
  },
  get ollamaUrl() {
    return (process.env.OLLAMA_URL || "").replace(/\/+$/, "");
  },

  get ollamaApiKey() {
    return process.env.OLLAMA_API_KEY || "";
  },
 get ollamaModel() {
    return process.env.OLLAMA_MODEL || "";
  },
  get aiConfigured() {
    return Boolean(this.ollamaUrl && this.ollamaModel);
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
      port: Number(process.env.SMTP_PORT),
      user,
      pass,
      from: process.env.SMTP_FROM || user,
    };
  },
  get browserChannel() {
    return process.env.BROWSER_CHANNEL || "";
  },
  get dataDir() {
    return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data", "private"));
  },
};
