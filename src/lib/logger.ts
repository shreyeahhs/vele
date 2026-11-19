/**
 * Structured logging. Calendar content (titles, descriptions, attendee
 * addresses) and secrets must never be logged; the redactor strips the usual
 * suspects as a safety net, but callers should log identifiers and counts.
 */
type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE = /token|secret|password|authorization|cookie|apikey|api_key|refresh|access|code_verifier|title|description|subject|body|email|attendees|message|text/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) && typeof v !== "number" && typeof v !== "boolean" ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, event: string, fields?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = { ts: new Date().toISOString(), level, event, ...(fields ? (redact(fields) as Record<string, unknown>) : {}) };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
