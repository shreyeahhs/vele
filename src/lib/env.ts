import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once. Optional features are optional here
 * too: `features()` tells the rest of the app what is configured so the UI can
 * say so honestly instead of failing late.
 */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = () => z.preprocess(blankToUndefined, z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.preprocess(blankToUndefined, z.url().default("http://localhost:3000")),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.preprocess(blankToUndefined, z.string().min(32, "AUTH_SECRET must be at least 32 characters").optional()),
  CRON_SECRET: optional(),
  ADMIN_EMAILS: optional(),

  GEMINI_API_KEY: optional(),
  GEMINI_API_KEYS: optional(),
  GEMINI_MODEL: z.preprocess(blankToUndefined, z.string().default("gemini-3.8-flash")),

  EMAIL_PROVIDER: z.preprocess(blankToUndefined, z.enum(["brevo", "resend", "console"]).default("console")),
  EMAIL_API_KEY: optional(),
  EMAIL_FROM: z.preprocess(blankToUndefined, z.string().default("Vele <onboarding@resend.dev>")),

  TELEGRAM_BOT_TOKEN: optional(),
  TELEGRAM_BOT_USERNAME: optional(),
  TELEGRAM_WEBHOOK_SECRET: optional(),
  WHATSAPP_API_KEY: optional(),
  WHATSAPP_PHONE_NUMBER_ID: optional(),
  WHATSAPP_APP_SECRET: optional(),
  WHATSAPP_VERIFY_TOKEN: optional(),
  WHATSAPP_API_VERSION: z.preprocess(blankToUndefined, z.string().default("v23.0")),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is required in production");
  }
  cached = parsed.data;
  return cached;
}

export function appUrl(path = ""): string {
  return new URL(path, env().NEXT_PUBLIC_APP_URL).toString();
}

/** Every Gemini key configured, in order. Rotated one per request. */
export function geminiKeys(): string[] {
  const e = env();
  // Tolerates labelled lists ("key1=AQ…,key2=AQ…"): Gemini keys never contain "=".
  return [...(e.GEMINI_API_KEYS ?? "").split(","), e.GEMINI_API_KEY ?? ""].map((k) => k.trim().replace(/^[A-Za-z0-9_-]+=/, "")).filter(Boolean);
}

export function features() {
  const e = env();
  return {
    ai: geminiKeys().length > 0,
    email: e.EMAIL_PROVIDER !== "console" && Boolean(e.EMAIL_API_KEY),
    telegram: Boolean(e.TELEGRAM_BOT_TOKEN),
    whatsapp: Boolean(e.WHATSAPP_API_KEY && e.WHATSAPP_PHONE_NUMBER_ID),
  };
}

export type Features = ReturnType<typeof features>;

export function isAdminEmail(email: string): boolean {
  const list = (env().ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
