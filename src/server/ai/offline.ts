import { parseDuration } from "@/scheduling";
import { isAffirmative } from "./actions";
import type { AIMessage, AIProvider, AIToolCall, AITurnResult, GenerateRequest } from "./types";

/**
 * A small deterministic stand-in for the language model, used when no
 * a Gemini key is configured (and in tests). It recognises common requests
 * and drives the very same tools, so offline answers are just as grounded;
 * it simply understands less phrasing.
 */
const PERSONAL_HINTS =
  /\b(mom|mum|mother|dad|father|family|friend|friends|lunch|dinner|breakfast|brunch|coffee|gym|run|doctor|dentist|gp|birthday|party|date|haircut|kids?|school run|walk)\b/i;

export class OfflineProvider implements AIProvider {
  readonly id = "offline";
  readonly model = "rules";

  async generate(req: GenerateRequest): Promise<AITurnResult> {
    const last = req.messages[req.messages.length - 1];
    const empty = { usage: { input: 0, output: 0, thoughts: 0 }, raw: null };
    if (!last) return { text: "", toolCalls: [], finish: "stop", ...empty };

    if (last.role === "tool") {
      const text = compose(last, findCalls(req.messages));
      req.onText?.(text);
      return { text, toolCalls: [], finish: "stop", ...empty };
    }
    if (last.role !== "user") return { text: "", toolCalls: [], finish: "stop", ...empty };

    const text = stripContext(last.text);
    const call = intent(text);
    if (!call) {
      const help =
        "I'm running in offline mode (no Gemini key is set), so I understand simple requests, for example:\n" +
        "What do I have tomorrow?\nAm I free at 3 tomorrow?\nFind me 45 minutes on Thursday afternoon\nSet a meeting from 1-3 this Saturday for lunch with Mom";
      req.onText?.(help);
      return { text: help, toolCalls: [], finish: "stop", ...empty };
    }
    return { text: "", toolCalls: [{ ...call, id: `${call.name}_0`, providerId: false }], finish: "tool_calls", ...empty };
  }
}

function stripContext(text: string) {
  return (
    text
      .replace(/<context>[\s\S]*?<\/context>/, "")
      .trim()
      .replace(/^(hey |hi |ok |okay )?vele[,:!]?\s*/i, "")
      // "1–3" typed on a phone or copied from the app's own examples: dashes the date parser reads.
      .replace(/[‒-―−]/g, "-")
  );
}

function findCalls(messages: AIMessage[]): AIToolCall[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant") return m.toolCalls;
  }
  return [];
}

function intent(text: string): Omit<AIToolCall, "id" | "providerId"> | null {
  const t = text.toLowerCase();
  if (isAffirmative(t)) return { name: "confirm_pending_action", args: {} };
  if (/^(no|nope|cancel that|forget it|don'?t|never mind|nevermind)\b/.test(t)) return { name: "discard_pending_action", args: {} };
  if (/\b(booking|scheduling) link\b|\blink (to|so .*) book\b/.test(t)) {
    const d = parseDuration(t);
    return { name: "generate_booking_link", args: d ? { duration_minutes: d } : {} };
  }
  if (/\b(set|book|schedule|add|put|create|block|pencil)\b/.test(t) && !/\bfind\b/.test(t)) {
    const duration = parseDuration(t);
    const emails = [...new Set(text.match(/[^\s@<>(),;]+@[^\s@<>(),;]+\.[a-z]{2,}/gi) ?? [])];
    const withoutEmails = emails.reduce((s, e) => s.replace(e, ""), text).replace(/\bwith\s+(?=for\b|$)/i, "");
    return {
      name: "create_event",
      args: {
        title: extractTitle(withoutEmails),
        when: withoutEmails,
        ...(duration ? { duration_minutes: duration } : {}),
        ...(emails.length ? { attendees: emails.map((email) => ({ email })) } : {}),
        ...(PERSONAL_HINTS.test(t) && !emails.length ? { calendar: "Personal" } : {}),
      },
    };
  }
  if (/\b(am i|are you|is it) (free|busy|available)\b|\bfree (at|between|from)\b/.test(t)) {
    const duration = parseDuration(t);
    return { name: "check_availability", args: { when: text, ...(duration ? { duration_minutes: duration } : {}), ...(PERSONAL_HINTS.test(t) ? { purpose: "personal" } : {}) } };
  }
  if (/\b(find|any|slot|fit|squeeze|when am i free|when can i|earliest|time for|free time|an hour|minutes)\b/.test(t)) {
    return { name: "find_available_slots", args: { when: text, duration_minutes: parseDuration(t) ?? 30, ...(PERSONAL_HINTS.test(t) ? { purpose: "personal" } : {}) } };
  }
  if (/\b(what|what's|whats|show|how|anything)\b.*\b(have|on|look|looks|schedule|agenda|day|week|busy|planned)\b|\bmy (day|week|schedule|agenda|afternoon|morning)\b/.test(t)) {
    return { name: "get_schedule", args: { when: /\b(today|tomorrow|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|this|\d)/.test(t) ? text : "today" } };
  }
  // A plain statement with an explicit time, no verb: "Lunch with Mom from 1-3 this Saturday".
  if (!t.trim().endsWith("?") && STATED_TIME.test(t)) {
    const lead = /^(.+?)\s+(?:from|at|on|this|next|tomorrow|today|between)\b/i.exec(text)?.[1]?.trim();
    const duration = parseDuration(t);
    return {
      name: "create_event",
      args: {
        title: lead ? lead.charAt(0).toUpperCase() + lead.slice(1) : extractTitle(text),
        when: text,
        ...(duration ? { duration_minutes: duration } : {}),
        ...(PERSONAL_HINTS.test(t) ? { calendar: "Personal" } : {}),
      },
    };
  }
  return null;
}

/** "from 1-3", "1pm to 2:30", "at 9": a time someone states rather than asks about. */
const STATED_TIME = /\b\d{1,2}([:.]\d{2})?\s*(am|pm)?\s*(-|to|until|till)\s*\d{1,2}([:.]\d{2})?\s*(am|pm)?\b|\bat\s+\d{1,2}([:.]\d{2})?\s*(am|pm)?\b/;

const TIME_NOISE =
  /\b(today|tonight|tomorrow|this|next|coming|on|at|from|between|and|to|until|till|am|pm|morning|afternoon|evening|weekend|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b|\b\d{1,2}([:.]\d{2})?\s*(am|pm)?\b|-/gi;

export function extractTitle(text: string): string {
  const forMatch = /\bfor\s+(.+)$/i.exec(text);
  const withMatch = /\bwith\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)?)/.exec(text);
  let title: string;
  if (forMatch) title = forMatch[1];
  else if (withMatch) title = `Meeting with ${withMatch[1]}`;
  else {
    const what = /\b(?:set|book|schedule|add|put|create|block|pencil)\s+(?:in\s+|up\s+)?(?:a|an|my)?\s*(.+?)(?:\s+(?:from|at|on|for|this|next|tomorrow|today)\b|$)/i.exec(text);
    title = what?.[1] ?? "Meeting";
  }
  title = title
    .replace(TIME_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,!?]+$/, "");
  if (!title) title = "Meeting";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

type Res = Record<string, unknown> & { error?: string; message?: string; what_to_do?: string };

function compose(msg: Extract<AIMessage, { role: "tool" }>, calls: AIToolCall[]): string {
  const out: string[] = [];
  for (const r of msg.results) {
    const res = (r.result ?? {}) as Res;
    if (r.isError || res.error) {
      out.push(
        `${res.message ?? "That didn't work."}${
          res.what_to_do
            ? ` ${String(res.what_to_do)
                .replace(/^Ask the user/, "Could you tell me")
                .replace(/\.$/, "")}?`
            : ""
        }`,
      );
      continue;
    }
    const call = calls.find((c) => c.id === r.callId);
    switch (r.name) {
      case "get_schedule":
        out.push(composeSchedule(res));
        break;
      case "check_availability":
        out.push(composeCheck(res));
        break;
      case "find_available_slots":
        out.push(composeSlots(res));
        break;
      case "create_event":
      case "update_event":
      case "cancel_event":
        out.push(composeWrite(res, call?.name ?? r.name));
        break;
      case "confirm_pending_action": {
        const inv = (res.invitations as Array<{ email: string; delivery: string }>) ?? [];
        const logged = inv.some((i) => i.delivery === "logged");
        out.push(
          `Done. ${String(res.result ?? "")}.${inv.length ? (logged ? " Invitations were logged in development mode, not actually sent." : ` Invitation sent to ${inv.map((i) => i.email).join(", ")}.`) : ""}`.replace(
            /\.\./g,
            ".",
          ),
        );
        break;
      }
      case "discard_pending_action":
        out.push("Okay, I've dropped that.");
        break;
      case "generate_booking_link":
        out.push(`Here's the link: ${String(res.link)}`);
        break;
      default:
        out.push("Done.");
    }
  }
  return out.join("\n\n");
}

function composeSchedule(res: Res): string {
  const days = (res.days as Array<{ date: string; events: Array<{ time: string; title: string }>; open_time_in_working_hours: string[]; working_day: boolean }>) ?? [];
  if (days.length === 1) {
    const d = days[0];
    if (!d.events.length) return `Nothing is scheduled for ${d.date}.${d.working_day ? " Your working hours are completely free." : ""}`;
    const lines = d.events.map((e) => `${e.time} ${e.title}`);
    const open = d.open_time_in_working_hours;
    return `${d.date}, you have ${d.events.length} event${d.events.length === 1 ? "" : "s"}:\n${lines.join("\n")}${open.length ? `\n\nYou're free ${joinList(open)}.` : ""}`;
  }
  return days.map((d) => `${d.date}: ${d.events.length ? d.events.map((e) => `${e.time} ${e.title}`).join("; ") : "nothing scheduled"}`).join("\n");
}

function composeCheck(res: Res): string {
  const clashes = (res.clashes as Array<{ title: string; time: string }>) ?? [];
  const flags = (res.rule_flags as string[]) ?? [];
  const free = (res.free_parts_of_window as string[]) ?? [];
  const assumptions = (res.assumptions as string[]) ?? [];
  if (res.free) {
    return `Yes, ${String(res.window)} is free.${flags.length ? ` Note: ${flags.join("; ").toLowerCase()}.` : ""}${assumptions.length ? ` (${assumptions.join("; ")}.)` : ""}`;
  }
  if (clashes.length) {
    return `No. ${String(res.window)} clashes with ${clashes.map((c) => `${c.title} (${c.time})`).join(" and ")}.${free.length ? ` Free within that window: ${joinList(free)}.` : ""}`;
  }
  const buffers = (res.buffer_issues as string[]) ?? [];
  return `Not quite: ${[...buffers, ...flags].join("; ").toLowerCase() || "it overlaps blocked time"}.${free.length ? ` Free within that window: ${joinList(free)}.` : ""}`;
}

function composeSlots(res: Res): string {
  const options = (res.options as Array<{ option: string; date: string; time: string; notes: string[]; status: string }>) ?? [];
  if (!options.length) {
    const notShown = (res.not_shown as string[]) ?? [];
    return `I couldn't find ${res.duration_minutes} minutes free in ${String(res.searched)}.${notShown.length ? ` ${notShown.join(". ")}.` : ""}`;
  }
  const lines = options.map((o) => `${o.option}. ${o.date} ${o.time}${o.notes.length ? ` (${o.notes.slice(0, 2).join("; ").toLowerCase()})` : ""}`);
  return `I found ${options.length} option${options.length === 1 ? "" : "s"} for ${res.duration_minutes} minutes:\n${lines.join("\n")}\n\nWhich one should I use?`;
}

function composeWrite(res: Res, name: string): string {
  if (res.status === "created") {
    const e = res.event as { title: string; when: string; calendar: string };
    const assumptions = (res.assumptions as string[]) ?? [];
    return `Added “${e.title}” to ${e.calendar}: ${e.when}.${assumptions.length ? ` (${assumptions.join("; ")}.)` : ""}`;
  }
  if (res.status === "updated") return "Updated.";
  if (res.status === "needs_confirmation") {
    const rb = res.readback as { heading: string; title: string; when: string; attendees?: string[]; notes: string[]; warnings: string[] };
    const verb = name === "cancel_event" ? "cancel" : name === "update_event" ? "change" : "add";
    return [
      `I'll ${verb} “${rb.title}”, ${rb.when}.`,
      ...(rb.attendees?.length ? [`With ${rb.attendees.join(", ")}.`] : []),
      ...rb.notes.map((n) => `${n}.`),
      ...rb.warnings.map((w) => `Heads up: ${w}.`),
      "Confirm?",
    ].join(" ");
  }
  return "Done.";
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
