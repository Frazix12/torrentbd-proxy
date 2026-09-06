// src/flaresolverr.ts
// Thin wrapper around the FlareSolverr v1 API.
// FlareSolverr docs: https://github.com/FlareSolverr/FlareSolverr

import { config } from "./config";

export interface FlareSolverrResult {
  cookies: Array<{ name: string; value: string }>;
  userAgent: string;
  responseBody: string;
  status: number;
}

interface FlareSolverrResponse {
  status: string;
  message: string;
  solution: {
    status: number;
    headers: Record<string, string>;
    response: string;
    cookies: Array<{ name: string; value: string }>;
    userAgent: string;
    url: string;
  };
}

async function callFlare(body: Record<string, unknown>): Promise<FlareSolverrResult> {
  const res = await fetch(`${config.flareSolverrUrl}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`FlareSolverr HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as FlareSolverrResponse;

  if (data.status !== "ok") {
    throw new Error(`FlareSolverr error: ${data.message}`);
  }

  return {
    cookies: data.solution.cookies,
    userAgent: data.solution.userAgent,
    responseBody: data.solution.response,
    status: data.solution.status,
  };
}

export async function flareGet(url: string): Promise<FlareSolverrResult> {
  return callFlare({ cmd: "request.get", url, maxTimeout: 60000 });
}

export async function flarePost(
  url: string,
  postData: string,
  cookies?: Array<{ name: string; value: string }>
): Promise<FlareSolverrResult> {
  return callFlare({
    cmd: "request.post",
    url,
    postData,
    ...(cookies ? { cookies } : {}),
    maxTimeout: 60000,
  });
}
