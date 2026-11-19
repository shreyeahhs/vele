import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { getSessionUser, type SessionUser } from "@/server/session";
import { env } from "./env";
import { AppError, errors, toPublicError } from "./errors";
import { log } from "./logger";
import { rateLimit, type RateLimitRule } from "./rate-limit";

/**
 * Every JSON API route goes through `route()`, which gives each handler the
 * same guarantees:
 * - authentication (the user comes from the session, never from the body)
 * - CSRF defence for cookie-authenticated mutations (same-origin check)
 * - Zod validation of body and query
 * - rate limiting
 * - errors mapped to safe, human messages; details only go to the log
 */
type Handler<B, Q, P, A extends boolean> = (ctx: {
  req: NextRequest;
  user: A extends true ? SessionUser : SessionUser | null;
  body: B;
  query: Q;
  params: P;
}) => Promise<Response | unknown>;

interface RouteOptions<B, Q, A extends boolean> {
  auth?: A;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  rateLimit?: { rule: RateLimitRule; key: "user" | "ip" };
  /** Skip the same-origin check (webhooks authenticated by signature). */
  skipOriginCheck?: boolean;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  const allowed = new URL(env().NEXT_PUBLIC_APP_URL).origin;
  const requestOrigin = new URL(req.url).origin;
  if (site === "same-origin") return;
  if (origin && (origin === allowed || origin === requestOrigin)) return;
  throw new AppError("forbidden", "This request was blocked for your protection. Please retry from the app.");
}

export function route<B = undefined, Q = undefined, P = Record<string, string>, A extends boolean = true>(options: RouteOptions<B, Q, A>, handler: Handler<B, Q, P, A>) {
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const requireAuth = options.auth ?? true;
      const user = await getSessionUser();
      if (requireAuth && !user) throw errors.unauthorized();
      if (MUTATING.has(req.method) && !options.skipOriginCheck) assertSameOrigin(req);

      if (options.rateLimit) {
        const id = options.rateLimit.key === "user" ? (user?.id ?? clientIp(req) ?? "anon") : (clientIp(req) ?? "unknown");
        const res = await rateLimit(`${new URL(req.url).pathname}:${id}`, options.rateLimit.rule);
        if (!res.ok) throw errors.rateLimited();
      }

      let body = undefined as B;
      if (options.body) {
        const raw = await req.json().catch(() => {
          throw errors.validation("The request body must be valid JSON.");
        });
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) throw errors.validation(firstIssue(parsed.error), { issues: z.treeifyError(parsed.error) });
        body = parsed.data;
      }
      let query = undefined as Q;
      if (options.query) {
        const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
        const parsed = options.query.safeParse(raw);
        if (!parsed.success) throw errors.validation(firstIssue(parsed.error));
        query = parsed.data;
      }
      const params = (await context.params) ?? ({} as P);
      // Ids, handles, slugs and tokens are short printable strings; anything
      // else (NUL bytes, control characters, megabyte paths) cannot match a row.
      for (const value of Object.values(params as Record<string, unknown>)) {
        const parts = Array.isArray(value) ? value : [value];
        if (parts.some((p) => typeof p === "string" && (p.length > 512 || /[\u0000-\u001f\u007f]/.test(p)))) throw errors.notFound();
      }
      const result = await handler({ req, user: user as never, body, query, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The request was not valid.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export function errorResponse(err: unknown, req?: NextRequest): Response {
  const pub = toPublicError(err);
  if (pub.status >= 500) {
    log.error("api.error", {
      path: req ? new URL(req.url).pathname : undefined,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack?.split("\n").slice(0, 6).join("\n") } : String(err),
    });
  }
  return NextResponse.json({ error: { code: pub.code, message: pub.message, details: pub.details } }, { status: pub.status });
}
