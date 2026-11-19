/**
 * Online meeting detection for links the user pastes (Vele does not create
 * Teams or Meet meetings itself). A recognised link gets a badge and a
 * "Join" button. Pure; safe on client and server.
 */
export type MeetingProviderKind = "NONE" | "TEAMS" | "GOOGLE_MEET" | "ZOOM" | "OTHER";

const PATTERNS: Array<{ provider: MeetingProviderKind; re: RegExp }> = [
  { provider: "TEAMS", re: /https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet|dl\/launcher)\/[^\s<>"')\]]+/i },
  { provider: "GOOGLE_MEET", re: /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}[^\s<>"')\]]*/i },
  { provider: "ZOOM", re: /https:\/\/(?:[\w-]+\.)?zoom\.us\/(?:j|my|w)\/[^\s<>"')\]]+/i },
  { provider: "OTHER", re: /https:\/\/(?:[\w-]+\.)?(?:webex\.com|whereby\.com|meet\.jit\.si)\/[^\s<>"')\]]+/i },
];

/** Finds a join link in the given texts (location first, then description). */
export function detectMeetingLink(texts: Array<string | null | undefined>): { url: string | null; provider: MeetingProviderKind } {
  for (const text of texts) {
    if (!text) continue;
    for (const p of PATTERNS) {
      const m = p.re.exec(text);
      if (m) return { url: m[0], provider: p.provider };
    }
  }
  return { url: null, provider: "NONE" };
}

/** Classifies a URL the user supplied as a meeting link. */
export function classifyMeetingUrl(url: string | null | undefined): MeetingProviderKind {
  if (!url) return "NONE";
  for (const p of PATTERNS) if (p.re.test(url)) return p.provider;
  return /^https?:\/\//i.test(url) ? "OTHER" : "NONE";
}

export const MEETING_PROVIDER_LABEL: Record<MeetingProviderKind, string> = {
  NONE: "",
  TEAMS: "Microsoft Teams",
  GOOGLE_MEET: "Google Meet",
  ZOOM: "Zoom",
  OTHER: "Video call",
};
