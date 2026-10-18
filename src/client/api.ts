"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Call the dashboard API. Throws an Error carrying the server's message on failure. */
export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body || init.form ? "POST" : "GET"),
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
    cache: "no-store",
  });
  if (res.status === 401 && !url.includes("/auth/")) {
    window.location.href = "/login";
    throw new Error("Signed out.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  return data as T;
}

export function useData<T>(url: string | null, refreshMs?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!url) return;
    const call = ++latest.current;
    try {
      const next = await api<T>(url);
      if (call !== latest.current) return;
      setData(next);
      setError(undefined);
    } catch (e) {
      if (call === latest.current) setError((e as Error).message);
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setLoading(true);
    void reload();
    if (!refreshMs) return;
    const timer = setInterval(() => void reload(), refreshMs);
    return () => clearInterval(timer);
  }, [reload, refreshMs]);

  return { data, error, loading, reload };
}
