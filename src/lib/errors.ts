/**
 * Errors that carry a message safe to show a person. Anything else is logged
 * and replaced with a generic message: stack traces never reach users.
 */
export type ErrorCode =
  "unauthorized" | "forbidden" | "not_found" | "validation" | "conflict" | "rate_limited" | "slot_unavailable" | "ai_unavailable" | "not_configured" | "internal";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  conflict: 409,
  rate_limited: 429,
  slot_unavailable: 409,
  ai_unavailable: 503,
  not_configured: 501,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, userMessage: string, options: { cause?: unknown; details?: Record<string, unknown> } = {}) {
    super(userMessage, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.userMessage = userMessage;
    this.details = options.details;
  }
}

export const errors = {
  unauthorized: () => new AppError("unauthorized", "Please sign in to continue."),
  forbidden: () => new AppError("forbidden", "You don't have access to that."),
  notFound: (what = "That item") => new AppError("not_found", `${what} could not be found.`),
  validation: (message: string, details?: Record<string, unknown>) => new AppError("validation", message, { details }),
  rateLimited: () => new AppError("rate_limited", "Too many requests. Please wait a moment and try again."),
  slotUnavailable: () => new AppError("slot_unavailable", "That time is no longer available. Please choose another slot."),
  aiUnavailable: (cause?: unknown) =>
    new AppError("ai_unavailable", "I couldn't reach the assistant service right now. Your calendar is fine; please try again in a moment.", { cause }),
  notConfigured: (what: string) => new AppError("not_configured", `${what} isn't set up on this server yet.`),
};

export function toPublicError(err: unknown): { code: ErrorCode; message: string; status: number; details?: Record<string, unknown> } {
  if (err instanceof AppError) return { code: err.code, message: err.userMessage, status: err.status, details: err.details };
  return { code: "internal", message: "Something went wrong on our side. Please try again.", status: 500 };
}
