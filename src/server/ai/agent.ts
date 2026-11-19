import "server-only";
import type { Channel, Prisma } from "@/generated/prisma/client";
import { env, geminiKeys } from "@/lib/env";
import { AppError, errors } from "@/lib/errors";
import { log } from "@/lib/logger";
import { db } from "../db";
import { listCalendars } from "../services/events";
import { getRules } from "../services/preferences";
import { latestPendingAction } from "./actions";
import { fmtWhen } from "./format";
import { GeminiProvider } from "./gemini";
import { OfflineProvider } from "./offline";
import { SYSTEM_PROMPT, turnContext } from "./prompt";
import { TOOL_SPECS, runTool, type ToolContext, type TurnUI } from "./tools";
import type { AIMessage, AIProvider, AIToolResult } from "./types";

/**
 * One scheduling brain for every channel (web chat, Telegram, WhatsApp):
 * the model interprets, tools act, the engine calculates, the database is the
 * source of truth.
 */
export function getAIProvider(): AIProvider {
  const keys = geminiKeys();
  return keys.length ? new GeminiProvider(keys, env().GEMINI_MODEL) : new OfflineProvider();
}

export type AgentEvent =
  | { type: "start"; conversationId: string; offline: boolean }
  | { type: "status"; message: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; summary: string; ok: boolean }
  | { type: "ui"; ui: TurnUI }
  | { type: "done"; messageId: string; text: string; ui: TurnUI }
  | { type: "error"; message: string };

export interface AgentInput {
  userId: string;
  text: string;
  channel: Channel;
  conversationId?: string | null;
  onEvent?: (e: AgentEvent) => void;
  signal?: AbortSignal;
  now?: Date;
  provider?: AIProvider;
}

export interface AgentOutput {
  conversationId: string;
  messageId: string;
  text: string;
  ui: TurnUI;
  offline: boolean;
}

const MAX_ITERATIONS = 8;
const HISTORY_TURNS = 12;

async function resolveConversation(userId: string, channel: Channel, conversationId: string | null | undefined, text: string) {
  if (conversationId) {
    const c = await db.conversation.findFirst({ where: { id: conversationId, userId } });
    if (!c) throw errors.notFound("That conversation");
    return c;
  }
  if (channel !== "WEB") {
    // Messaging threads continue for a few hours, then start fresh.
    const recent = await db.conversation.findFirst({
      where: { userId, channel, lastMessageAt: { gt: new Date(Date.now() - 6 * 3600_000) } },
      orderBy: { lastMessageAt: "desc" },
    });
    if (recent) return recent;
  }
  return db.conversation.create({ data: { userId, channel, title: text.slice(0, 80) } });
}

/** Earlier turns as plain text: enough context, without resending old calendar data. */
async function history(conversationId: string): Promise<{ messages: AIMessage[]; userTexts: string[] }> {
  const rows = await db.conversationMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: HISTORY_TURNS * 2 });
  rows.reverse();
  while (rows.length && rows[0].role !== "USER") rows.shift();
  const messages: AIMessage[] = rows.map((r) => (r.role === "USER" ? { role: "user", text: r.text } : { role: "assistant", text: r.text || "(no reply)", toolCalls: [] }));
  return { messages, userTexts: rows.filter((r) => r.role === "USER").map((r) => r.text) };
}

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const text = input.text.trim().slice(0, 2000);
  if (!text) throw errors.validation("Type a message first.");
  const provider = input.provider ?? getAIProvider();
  const offline = provider.id === "offline";
  const started = Date.now();
  const now = input.now ?? new Date();
  const emit = (e: AgentEvent) => input.onEvent?.(e);

  const conversation = await resolveConversation(input.userId, input.channel, input.conversationId, text);
  emit({ type: "start", conversationId: conversation.id, offline });

  const [{ rules, timezone, prefs }, calendars, pending, past] = await Promise.all([
    getRules(input.userId),
    listCalendars(input.userId),
    latestPendingAction(input.userId, conversation.id),
    history(conversation.id),
  ]);

  const userMessage = await db.conversationMessage.create({
    data: { conversationId: conversation.id, userId: input.userId, role: "USER", text, blocks: [] as Prisma.InputJsonValue },
  });

  const ui: TurnUI = { trace: [], proposals: [], actions: [], created: [], changed: false };
  const ctx: ToolContext = {
    userId: input.userId,
    conversationId: conversation.id,
    channel: input.channel,
    timezone,
    now,
    latestUserText: text,
    latestUserAt: userMessage.createdAt,
    recentUserTexts: [...past.userTexts.slice(-10), text],
    prefs,
    ui,
  };

  const turn: AIMessage[] = [{ role: "user", text: `${turnContext({ now, timezone, calendars, rules, pending, channel: input.channel })}\n\n${text}` }];
  const texts: string[] = [];
  const usage = { input: 0, output: 0, thoughts: 0 };
  const toolStats: Array<{ name: string; ok: boolean; ms: number }> = [];
  let status = offline ? "offline" : "ok";
  let iterations = 0;
  let malformedRetries = 0;
  let errorMessage: string | null = null;
  let modelUsed = provider.model;

  try {
    for (; iterations < MAX_ITERATIONS; iterations++) {
      let streamed = false;
      const result = await provider.generate({
        system: SYSTEM_PROMPT,
        messages: [...past.messages, ...turn],
        tools: TOOL_SPECS,
        signal: input.signal,
        onText: (delta) => {
          if (!streamed && texts.length) emit({ type: "text", delta: "\n\n" });
          streamed = true;
          emit({ type: "text", delta });
        },
        onStatus: (message) => emit({ type: "status", message }),
      });
      if (result.model) modelUsed = result.model;
      usage.input += result.usage.input;
      usage.output += result.usage.output;
      usage.thoughts += result.usage.thoughts;
      if (result.text.trim()) texts.push(result.text.trim());

      if (result.finish === "malformed" && malformedRetries++ < 1) continue;
      if (result.finish === "blocked") {
        status = "blocked";
        if (!result.text.trim()) texts.push("I can't help with that request.");
        break;
      }
      if (result.toolCalls.length === 0) {
        if (result.finish === "max_tokens") status = "max_tokens";
        break;
      }

      turn.push({ role: "assistant", text: result.text, toolCalls: result.toolCalls, raw: result.raw, provider: provider.id });
      const results: AIToolResult[] = [];
      for (const call of result.toolCalls) {
        const t0 = Date.now();
        const outcome = await runTool(call.name, call.args, ctx);
        toolStats.push({ name: call.name, ok: outcome.ok, ms: Date.now() - t0 });
        const trace = ui.trace[ui.trace.length - 1];
        emit({ type: "tool", name: call.name, summary: trace?.summary ?? call.name, ok: outcome.ok });
        results.push({ callId: call.id, name: call.name, result: outcome.result, isError: !outcome.ok, providerId: call.providerId });
      }
      turn.push({ role: "tool", results });
      emit({ type: "ui", ui });
    }
    if (iterations >= MAX_ITERATIONS) {
      texts.push("I couldn't finish that in one go. Could you ask again, a little more specifically?");
      status = "max_iterations";
    }
  } catch (err) {
    status = "error";
    errorMessage = err instanceof AppError ? err.userMessage : "I couldn't check your calendar right now. Please try again in a moment.";
    log.error("agent.failed", { userId: input.userId, err });
    // If tools already changed something this turn, say exactly what, so the
    // failure of the final reply never reads as "nothing happened".
    const done = describeTurnSoFar(ui, timezone);
    if (done) {
      const note = `${done}\n\nI couldn't finish my reply: ${errorMessage}`;
      texts.push(note);
      emit({ type: "text", delta: `${texts.length > 1 ? "\n\n" : ""}${note}` });
    } else {
      texts.push(errorMessage);
      emit({ type: "error", message: errorMessage });
    }
  }

  const finalText = texts.join("\n\n") || "Done.";
  const [assistantMessage] = await Promise.all([
    db.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        userId: input.userId,
        role: "ASSISTANT",
        text: finalText,
        blocks: { tools: toolStats.map((t) => t.name) } as Prisma.InputJsonValue,
        ui: ui as unknown as Prisma.InputJsonValue,
      },
    }),
    db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } }),
    db.aiRun.create({
      data: {
        userId: input.userId,
        conversationId: conversation.id,
        channel: input.channel,
        provider: provider.id,
        model: modelUsed,
        status,
        iterations: iterations + 1,
        inputTokens: usage.input,
        outputTokens: usage.output,
        thoughtTokens: usage.thoughts,
        toolCalls: toolStats as unknown as Prisma.InputJsonValue,
        latencyMs: Date.now() - started,
        error: errorMessage,
      },
    }),
  ]);
  emit({ type: "done", messageId: assistantMessage.id, text: finalText, ui });
  return { conversationId: conversation.id, messageId: assistantMessage.id, text: finalText, ui, offline };
}

export async function listConversations(userId: string, limit = 30) {
  const rows = await db.conversation.findMany({
    where: { userId, archivedAt: null },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: { id: true, title: true, channel: true, lastMessageAt: true },
  });
  return rows.map((r) => ({ ...r, lastMessageAt: r.lastMessageAt.toISOString() }));
}

export async function getConversation(userId: string, conversationId: string) {
  const c = await db.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!c) throw errors.notFound("That conversation");
  const messages = await db.conversationMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: 200 });
  const actionIds = messages.flatMap((m) => ((m.ui as unknown as TurnUI | null)?.actions ?? []).map((a) => a.id));
  const actions = actionIds.length ? await db.pendingAction.findMany({ where: { id: { in: actionIds }, userId } }) : [];
  const status = new Map(actions.map((a) => [a.id, a.status]));
  return {
    id: c.id,
    title: c.title,
    channel: c.channel,
    messages: messages.map((m) => {
      const turnUi = m.ui as unknown as TurnUI | null;
      return {
        id: m.id,
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        text: m.text,
        createdAt: m.createdAt.toISOString(),
        ui: turnUi ? { ...turnUi, actions: turnUi.actions.map((a) => ({ ...a, status: status.get(a.id) ?? a.status })) } : null,
      };
    }),
  };
}

/** A plain account of what this turn's tools did, for when the model stops before replying. */
function describeTurnSoFar(ui: TurnUI, zone: string): string | null {
  const lines: string[] = [];
  for (const c of ui.created) lines.push(`Added “${c.title}”, ${fmtWhen(c.start, c.end, zone)}.`);
  for (const a of ui.actions) if (a.status === "PENDING") lines.push(`Pencilled in “${a.summary.title}” (${a.summary.when}). It waits for your confirmation.`);
  if (ui.proposals.length) lines.push(`Found ${ui.proposals.length === 1 ? "one option" : `${ui.proposals.length} options`}; they’re pencilled onto your calendar.`);
  if (!lines.length && ui.changed) {
    const last = [...ui.trace].reverse().find((t) => t.ok);
    lines.push(last ? `Done: ${last.summary.charAt(0).toLowerCase()}${last.summary.slice(1)}.` : "Your calendar was updated.");
  }
  return lines.length ? lines.join("\n") : null;
}
