import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to know the type scale's names, or it reads `text-small`
 * as a colour and drops whichever of `text-small` / `text-paper` came first.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["micro", "small", "body", "lead", "title", "headline", "display"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** CSS variable for a calendar's fountain-pen ink, by position (or explicit colour). */
export function calendarInk(position: number, color?: string | null): string {
  if (color) return color;
  const inks = ["--ink-0", "--ink-1", "--ink-2c", "--ink-3", "--ink-4", "--ink-5", "--ink-6"];
  return `var(${inks[Math.abs(position) % inks.length]})`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/**
 * The two-letter code a calendar wears on its label tape. Familiar names get
 * the abbreviation people already write ("Work" → WK, "Personal" → PS);
 * several words give initials ("Research Group" → RG); anything else takes
 * its first letter and last consonant.
 */
const KNOWN_CODES: Record<string, string> = {
  work: "WK",
  personal: "PS",
  family: "FM",
  home: "HM",
  teaching: "TC",
  research: "RS",
  study: "ST",
  admin: "AD",
  travel: "TR",
  health: "HL",
  sport: "SP",
  social: "SC",
};

export function calendarCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const known = KNOWN_CODES[words.join(" ").toLowerCase()];
  if (known) return known;
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0].toUpperCase();
  const last = [...w.slice(1)].reverse().find((ch) => /[BCDFGHJKLMNPQRSTVWXZ]/.test(ch));
  return (w[0] + (last ?? w[1] ?? "")).slice(0, 2);
}
