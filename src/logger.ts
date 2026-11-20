// src/logger.ts
// Minimal structured logger with level filtering and secret redaction.
// Replaces raw console.log calls so API keys never reach Docker logs.

import { config } from "./config";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/([?&](?:apikey|api_key|key)=)[^&\s"']+/gi, "$1<redacted>"],
  [/(x-dashboard-key:\s*)[^\s]+/gi, "$1<redacted>"],
  [/(authorization:\s*bearer\s+)[^\s]+/gi, "$1<redacted>"],
  [/(password=)[^&\s"']+/gi, "$1<redacted>"],
];

/** Remove secrets from any string before it is logged. */
export function redact(input: string): string {
  let out = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function currentLevel(): number {
  return LEVEL_ORDER[config.logLevel as LogLevel] ?? LEVEL_ORDER.info;
}

function emit(level: LogLevel, tag: string, message: string, data?: unknown): void {
  if (LEVEL_ORDER[level] < currentLevel()) return;
  const prefix = `${new Date().toISOString()} [${level.toUpperCase()}] [${tag}]`;
  const safeMessage = redact(message);
  const args: unknown[] = data === undefined ? [] : [data];
  if (level === "error") console.error(prefix, safeMessage, ...args);
  else if (level === "warn") console.warn(prefix, safeMessage, ...args);
  else if (level === "debug") console.debug(prefix, safeMessage, ...args);
  else console.log(prefix, safeMessage, ...args);
}

export const logger = {
  debug: (tag: string, message: string, data?: unknown) =>
    emit("debug", tag, message, data),
  info: (tag: string, message: string, data?: unknown) =>
    emit("info", tag, message, data),
  warn: (tag: string, message: string, data?: unknown) =>
    emit("warn", tag, message, data),
  error: (tag: string, message: string, data?: unknown) =>
    emit("error", tag, message, data),
};
