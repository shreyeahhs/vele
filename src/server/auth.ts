import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin, magicLink } from "better-auth/plugins";
import { brand } from "@/config/brand";
import { env, isAdminEmail } from "@/lib/env";
import { log } from "@/lib/logger";
import { db } from "./db";
import { sendEmail } from "./email";
import { magicLinkEmail } from "./email/templates";
import { provisionUser } from "./services/provisioning";

/**
 * Identity lives in our own PostgreSQL tables: email + password (hashed) or a
 * one-time magic link. Sessions are database-backed, cookie-referenced.
 */
function createAuth() {
  const e = env();
  return betterAuth({
    appName: brand.name,
    baseURL: e.NEXT_PUBLIC_APP_URL,
    secret: e.AUTH_SECRET ?? "dev-only-insecure-secret-change-me-please-0000",
    trustedOrigins: [e.NEXT_PUBLIC_APP_URL],
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    user: {
      additionalFields: {
        timezone: { type: "string", required: false, defaultValue: "Europe/London", input: true },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const role = isAdminEmail(String(user.email)) ? "admin" : "user";
            return { data: { ...user, role } };
          },
          after: async (user) => {
            try {
              await provisionUser(user.id);
            } catch (err) {
              log.error("user.provision_failed", { userId: user.id, err });
            }
          },
        },
      },
    },
    plugins: [
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      magicLink({
        expiresIn: 60 * 15,
        sendMagicLink: async ({ email, url }) => {
          const message = magicLinkEmail({ url });
          await sendEmail({ to: email, subject: message.subject, html: message.html, text: message.text }, { type: "magic_link" });
        },
      }),
      nextCookies(),
    ],
    advanced: {
      useSecureCookies: e.NEXT_PUBLIC_APP_URL.startsWith("https://"),
      database: { generateId: () => crypto.randomUUID() },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __veleAuth?: Auth };

export const auth: Auth = globalForAuth.__veleAuth ?? createAuth();
if (process.env.NODE_ENV !== "production") globalForAuth.__veleAuth = auth;
