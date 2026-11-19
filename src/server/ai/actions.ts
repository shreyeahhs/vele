import "server-only";
import type { PendingAction, Prisma } from "@/generated/prisma/client";
import { errors } from "@/lib/errors";
import { db } from "../db";
import { audit } from "../services/audit";
import { cancelEvent, createEvent, updateEvent, type EventChanges, type EventFields } from "../services/events";
import type { InvitationResult } from "../services/invitations";

/**
 * Changes that need the user's explicit OK. The assistant pencils them in;
 * the user confirms with the button on the card or by replying "yes". The
 * model cannot execute one on its own: execution checks the confirmation.
 */
export type ActionKind = "create_event" | "update_event" | "cancel_event";

export interface ActionSummary {
  heading: string;
  title: string;
  when: string;
  calendar?: string | null;
  attendees?: string[];
  notes: string[];
  warnings: string[];
}

export interface PendingActionDTO {
  id: string;
  kind: ActionKind;
  status: PendingAction["status"];
  summary: ActionSummary;
  result: unknown;
  error: string | null;
  createdAt: string;
  expiresAt: string;
}

type Serialized<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | undefined ? string | undefined : T[K] };

export type ActionPayload =
  | { kind: "create_event"; fields: Serialized<EventFields> & { sendInvitations: boolean } }
  | { kind: "update_event"; id: string; changes: Serialized<EventChanges>; scope: "occurrence" | "series"; notify: boolean }
  | { kind: "cancel_event"; id: string; scope: "occurrence" | "series"; notify: boolean; reason: string | null };

const TTL_MS = 30 * 60_000;

export function toActionDTO(a: PendingAction): PendingActionDTO {
  return {
    id: a.id,
    kind: a.kind as ActionKind,
    status: a.status,
    summary: a.summary as unknown as ActionSummary,
    result: a.result,
    error: a.error,
    createdAt: a.createdAt.toISOString(),
    expiresAt: a.expiresAt.toISOString(),
  };
}

export async function createPendingAction(userId: string, conversationId: string | null, payload: ActionPayload, summary: ActionSummary): Promise<PendingActionDTO> {
  // A new proposal supersedes older unconfirmed ones in the same conversation.
  if (conversationId) {
    await db.pendingAction.updateMany({ where: { userId, conversationId, status: "PENDING" }, data: { status: "EXPIRED", resolvedAt: new Date() } });
  }
  // The same change asked for again (another conversation, Telegram, a retry) replaces
  // the earlier hold instead of leaving two identical ones waiting for a yes.
  await db.pendingAction.updateMany({
    where: { userId, status: "PENDING", payload: { equals: payload as unknown as Prisma.InputJsonValue } },
    data: { status: "EXPIRED", resolvedAt: new Date() },
  });
  const action = await db.pendingAction.create({
    data: {
      userId,
      conversationId,
      kind: payload.kind,
      payload: payload as unknown as Prisma.InputJsonValue,
      summary: summary as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return toActionDTO(action);
}

export async function latestPendingAction(userId: string, conversationId: string | null) {
  const a = await db.pendingAction.findFirst({
    where: { userId, status: "PENDING", expiresAt: { gt: new Date() }, ...(conversationId ? { conversationId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return a ? toActionDTO(a) : null;
}

const date = (s: string | undefined) => (s ? new Date(s) : undefined);

export interface ExecutionResult {
  action: PendingActionDTO;
  eventId: string | null;
  invitations: InvitationResult[];
  message: string;
}

export async function executePendingAction(userId: string, actionId: string, via: "ui" | "assistant"): Promise<ExecutionResult> {
  // Claim atomically so a double click or a "yes" racing the button runs it once.
  const claimed = await db.pendingAction.updateMany({
    where: { id: actionId, userId, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "EXECUTED", resolvedAt: new Date() },
  });
  const action = await db.pendingAction.findFirst({ where: { id: actionId, userId } });
  if (!action) throw errors.notFound("That proposal");
  if (claimed.count === 0) {
    if (action.status === "PENDING") {
      await db.pendingAction.update({ where: { id: action.id }, data: { status: "EXPIRED" } });
      throw errors.validation("That proposal expired. Ask me again and I'll check the time is still free.");
    }
    throw errors.validation(action.status === "EXECUTED" ? "That's already done." : "That proposal is no longer active.");
  }
  const payload = action.payload as unknown as ActionPayload;
  const actor = "assistant" as const;
  try {
    let eventId: string | null = null;
    let invitations: InvitationResult[] = [];
    let message: string;
    if (payload.kind === "create_event") {
      const f = payload.fields;
      const res = await createEvent(userId, { ...f, start: new Date(f.start), end: new Date(f.end), source: "ASSISTANT" }, actor);
      eventId = res.event.id;
      invitations = res.invitations;
      message = "Created";
    } else if (payload.kind === "update_event") {
      const c = payload.changes;
      const res = await updateEvent(userId, payload.id, { ...c, start: date(c.start), end: date(c.end) }, actor, { scope: payload.scope, notify: payload.notify });
      eventId = res.event.id;
      invitations = res.invitations;
      message = "Updated";
    } else {
      const res = await cancelEvent(userId, payload.id, actor, { scope: payload.scope, notify: payload.notify, reason: payload.reason });
      invitations = res.invitations;
      message = res.bookingNotified ? "Cancelled; the person who booked was told" : "Cancelled";
    }
    const updated = await db.pendingAction.update({
      where: { id: action.id },
      data: { result: { eventId, invitations } as unknown as Prisma.InputJsonValue },
    });
    await audit({
      userId,
      actorType: via === "ui" ? "user" : "assistant",
      action: "assistant.action_confirmed",
      targetType: "pending_action",
      targetId: action.id,
      metadata: { kind: payload.kind, via },
    });
    return { action: toActionDTO(updated), eventId, invitations, message };
  } catch (err) {
    await db.pendingAction.update({ where: { id: action.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "Failed" } });
    throw err;
  }
}

export async function declinePendingAction(userId: string, actionId: string): Promise<PendingActionDTO> {
  const res = await db.pendingAction.updateMany({ where: { id: actionId, userId, status: "PENDING" }, data: { status: "DECLINED", resolvedAt: new Date() } });
  const action = await db.pendingAction.findFirst({ where: { id: actionId, userId } });
  if (!action) throw errors.notFound("That proposal");
  if (res.count === 0 && action.status !== "DECLINED") throw errors.validation("That proposal is no longer active.");
  return toActionDTO(action);
}

/** Replies that count as an explicit yes. Anything hedged ("yes but…", "wait") does not. */
export function isAffirmative(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/\b(no|not|don'?t|wait|hold on|stop|change|instead|but)\b/.test(t)) return false;
  return /^(y|yes|yep|yeah|yup|sure|ok|okay|confirm|confirmed|do it|go ahead|go for it|please do|book it|send it|cancel it|move it|that'?s (right|fine|good|correct)|sounds good|correct|perfect|great|lovely|please)\b/.test(
    t,
  );
}
