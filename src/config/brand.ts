/**
 * Product identity lives here and only here. Renaming the product means
 * editing this file (and NEXT_PUBLIC_APP_NAME), nothing else.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Vele",
  /** How the assistant refers to itself in conversation. */
  assistantName: process.env.NEXT_PUBLIC_APP_NAME || "Vele",
  tagline: "Your calendar, with an assistant that understands it.",
  description:
    "A calendar with an assistant that understands it: ask about your time in plain words, let a deterministic engine find the openings, and share booking links that only offer real free time.",
  supportEmail: "support@example.com",
} as const;

export type Brand = typeof brand;
