"use server";
import { cookies } from "next/headers";
import axios from "axios";
import { SESSION_COOKIE } from "@/server/auth/session";
import type { JobList, JobQuery } from "@/shared/types";

const API_URL = process.env.API_URL || "http://localhost:3100";

export type GetJobResult = { success: true; data: JobList } | { success: false; data: null; error: string };

export async function getJob(query: JobQuery = {}): Promise<GetJobResult> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) {
      console.log("No token found");
      return { success: false, data: null, error: "No token found" };
    }

    // Send only the filters that are set; the API expects salary as "1".
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(query)) {
      if (key === "salary") {
        if (value) params.salary = "1";
      } else if (value !== "" && value !== undefined && value !== null) {
        params[key] = value as string | number;
      }
    }

    const response = await axios.get<JobList>(`${API_URL}/api/jobs`, {
      params,
      headers: {
        Cookie: `${SESSION_COOKIE}=${token}`,
      },
    });

    return { success: true, data: response.data };
  } catch (error) {
    // Prefer the API's own message ({ error: "..." }) when it sent one.
    const apiMessage = axios.isAxiosError(error) ? (error.response?.data as { error?: string } | undefined)?.error : undefined;
    const reason = apiMessage ?? (axios.isAxiosError(error) ? `${error.response?.status ?? error.code} ${error.message}` : String(error));
    console.error(`getJob failed: ${reason}`);
    return { success: false, data: null, error: reason };
  }
}
