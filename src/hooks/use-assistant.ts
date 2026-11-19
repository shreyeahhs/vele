"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend, errorMessage } from "@/lib/fetcher";
import type { PendingActionDTO } from "@/server/ai/actions";
import type { TurnUI } from "@/server/ai/tools";
import { usePencil } from "@/components/app/pencil-context";

export type { TurnUI };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  ui: TurnUI | null;
  pending?: boolean;
  error?: boolean;
}

interface StreamEvent {
  type: "start" | "status" | "text" | "tool" | "ui" | "done" | "error";
  conversationId?: string;
  offline?: boolean;
  message?: string;
  delta?: string;
  name?: string;
  summary?: string;
  ok?: boolean;
  ui?: TurnUI;
  messageId?: string;
  text?: string;
}

const STORAGE_KEY = "vele-conversation";

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode): the conversation simply isn't resumed
  }
}

/**
 * The assistant conversation, streamed. Proposals from the engine are handed
 * to the calendar (pencil context) so options appear on the page itself.
 */
export function useAssistant() {
  const qc = useQueryClient();
  const pencil = usePencil();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [steps, setSteps] = useState<Array<{ name: string; summary: string; ok: boolean }>>([]);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshData = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["events"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
    void qc.invalidateQueries({ queryKey: ["bookings"] });
    void qc.invalidateQueries({ queryKey: ["preferences"] });
    void qc.invalidateQueries({ queryKey: ["memory"] });
  }, [qc]);

  // Resume the last conversation on this device.
  useEffect(() => {
    const id = readStored();
    if (!id) {
      setLoaded(true);
      return;
    }
    apiGet<{ id: string; messages: ChatMessage[] }>(`/api/assistant/conversations/${id}`)
      .then((c) => {
        setConversationId(c.id);
        setMessages(c.messages.slice(-40));
      })
      .catch(() => store(null))
      .finally(() => setLoaded(true));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: message, ui: null };
      const draftId = `a-${Date.now()}`;
      setMessages((m) => [...m, userMsg, { id: draftId, role: "assistant", text: "", ui: null, pending: true }]);
      setBusy(true);
      setSteps([]);
      setStatus(null);
      pencil.setProposals([]);
      const controller = new AbortController();
      abortRef.current = controller;
      const patchDraft = (fn: (m: ChatMessage) => ChatMessage) => setMessages((all) => all.map((m) => (m.id === draftId ? fn(m) : m)));

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ message, conversationId }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? "I couldn't reach the assistant. Please try again.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const data = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!data) continue;
            const e = JSON.parse(data.slice(6)) as StreamEvent;
            if (e.type === "start") {
              if (e.conversationId) {
                setConversationId(e.conversationId);
                store(e.conversationId);
              }
              setOffline(Boolean(e.offline));
            } else if (e.type === "status") setStatus(e.message ?? null);
            else if (e.type === "text") patchDraft((m) => ({ ...m, text: m.text + (e.delta ?? "") }));
            else if (e.type === "tool") setSteps((s) => [...s, { name: e.name ?? "", summary: e.summary ?? "", ok: Boolean(e.ok) }]);
            else if (e.type === "ui" && e.ui) {
              pencil.setProposals(e.ui.proposals);
              if (e.ui.changed) refreshData();
            } else if (e.type === "done") {
              patchDraft((m) => ({ ...m, id: e.messageId ?? m.id, text: e.text ?? m.text, ui: e.ui ?? null, pending: false }));
              if (e.ui) {
                pencil.setProposals(e.ui.proposals);
                for (const c of e.ui.created) pencil.markInked(c.id);
                if (e.ui.changed || e.ui.actions.length) refreshData();
              }
              void qc.invalidateQueries({ queryKey: ["conversations"] });
            } else if (e.type === "error") {
              patchDraft((m) => ({ ...m, error: true }));
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          patchDraft((m) => ({ ...m, text: m.text || errorMessage(err), pending: false, error: true }));
        }
      } finally {
        patchDraft((m) => ({ ...m, pending: false }));
        setBusy(false);
        setStatus(null);
        abortRef.current = null;
      }
    },
    [busy, conversationId, pencil, qc, refreshData],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    setConversationId(null);
    store(null);
    setMessages([]);
    setSteps([]);
    pencil.setProposals([]);
  }, [pencil]);

  /** Reopen an earlier conversation from the history list. */
  const openConversation = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      const c = await apiGet<{ id: string; messages: ChatMessage[] }>(`/api/assistant/conversations/${id}`);
      setConversationId(c.id);
      store(c.id);
      setMessages(c.messages.slice(-60));
      setSteps([]);
      pencil.setProposals([]);
    },
    [pencil],
  );

  /** Confirm / discard buttons on a pencilled card. */
  const resolveAction = useCallback(
    async (action: PendingActionDTO, decision: "confirm" | "decline") => {
      const res = await apiSend<{ action: PendingActionDTO; eventId?: string | null; message?: string; invitations?: Array<{ email: string; status: string }> }>(
        `/api/actions/${action.id}`,
        "POST",
        { decision },
      );
      const updated = res.action;
      setMessages((all) =>
        all.map((m) =>
          m.ui?.actions.some((a) => a.id === action.id)
            ? { ...m, ui: { ...m.ui, actions: m.ui.actions.map((a) => (a.id === action.id ? { ...a, status: updated.status } : a)) } }
            : m,
        ),
      );
      if (decision === "confirm") {
        const logged = res.invitations?.some((i) => i.status === "logged");
        const sent = res.invitations?.filter((i) => i.status === "sent").map((i) => i.email) ?? [];
        const note = [
          res.message ? `${res.message}.` : "Done.",
          sent.length ? `Invitation sent to ${sent.join(", ")}.` : "",
          logged ? "Invitations were logged in development mode, not actually sent." : "",
        ]
          .filter(Boolean)
          .join(" ");
        setMessages((all) => [...all, { id: `c-${Date.now()}`, role: "assistant", text: note, ui: null }]);
        pencil.setProposals([]);
        if (res.eventId) pencil.markInked(res.eventId);
      }
      refreshData();
      return res;
    },
    [pencil, refreshData],
  );

  return { conversationId, messages, busy, status, steps, offline, loaded, send, stop, newConversation, openConversation, resolveAction };
}
