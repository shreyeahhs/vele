"use client";

import { ArrowUp, ChevronRight, Square, Undo2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAssistantContext } from "@/components/app/assistant-context";
import { useZone } from "@/components/app/zone";
import { ActionCard } from "./action-card";
import { MessageText } from "./message-text";
import type { ChatMessage, TurnUI } from "@/hooks/use-assistant";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { dt, timeRange } from "@/lib/time-client";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const EXAMPLES = ["What do I have tomorrow?", "Can I fit 30 minutes with Sarah after 2 today?", "Find me an hour for deep work this week", "Lunch with Mom from 1–3 this Saturday"];

/**
 * The conversation as a message log on a memo sheet: who wrote each entry
 * down the left, the words on the right, ruled between turns. No bubbles.
 */
export function Conversation({ variant = "margin" }: { variant?: "margin" | "page" }) {
  const a = useAssistantContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const seenCount = useRef(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A newly sent message always brings the conversation to its end; streaming
    // text only follows along while the reader hasn't scrolled back up.
    const grew = a.messages.length > seenCount.current;
    seenCount.current = a.messages.length;
    if (grew || stick) el.scrollTop = el.scrollHeight;
  }, [a.messages, a.steps, stick]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const empty = a.loaded && a.messages.length === 0;
  const lastAssistant = [...a.messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto", variant === "page" ? "px-4 py-4 md:px-8" : "px-4 py-3")}
        aria-live="polite"
      >
        {empty ? (
          <EmptyState variant={variant} />
        ) : (
          <ol className={cn("mx-auto grid grid-cols-[minmax(0,1fr)]", variant === "page" && "max-w-2xl")}>
            {a.messages.map((m) => (
              <Message key={m.id} message={m} live={a.busy && m === lastAssistant} />
            ))}
          </ol>
        )}
      </div>
      <Composer variant={variant} />
    </div>
  );
}

function EmptyState({ variant }: { variant: "margin" | "page" }) {
  const a = useAssistantContext();
  return (
    <div className={cn("flex h-full flex-col justify-end gap-4 pb-1", variant === "page" && "mx-auto max-w-2xl justify-center")}>
      <div className="grid gap-2">
        <h2 className="text-lead font-extrabold tracking-[-0.01em]">Write to Vele</h2>
        <p className="max-w-[46ch] text-small text-ink-2">
          Ask about your time, or say what to book. Anything with other people, a clash or a repeat is written in marker first and waits for your yes.
        </p>
      </div>
      <div>
        <p className="mb-1 text-micro font-bold text-graphite">For example</p>
        <ul className="border-t border-rule">
          {EXAMPLES.map((s) => (
            <li key={s} className="border-b border-rule">
              <button
                onClick={() => a.send(s)}
                disabled={a.busy}
                className="w-full py-2 text-left text-small font-semibold text-ink transition-colors hover:bg-wash hover:text-ink-2"
              >
                “{s}”
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Message({ message, live }: { message: ChatMessage; live: boolean }) {
  const a = useAssistantContext();
  const from = message.role === "user" ? "You" : "Vele";
  const ui = message.role === "assistant" ? message.ui : null;
  const steps = live ? a.steps : (ui?.trace ?? []).map((t) => ({ name: t.tool, summary: t.summary, ok: t.ok }));
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-3 border-b border-rule-faint py-3 last:border-b-0">
      <span className={cn("pt-0.5 text-micro font-extrabold tracking-[0.06em] uppercase", message.role === "user" ? "text-graphite" : "text-ink-2")}>{from}</span>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {message.role === "user" ? (
          <p className="text-body font-semibold break-words whitespace-pre-wrap text-ink">{message.text}</p>
        ) : (
          <div className={cn("min-w-0 text-body text-ink", message.error && "text-red-ink-text")}>
            {message.text ? <MessageText text={message.text} /> : live ? <Thinking steps={a.steps} status={a.status} /> : <p className="text-graphite">No reply.</p>}
            {live && message.text && a.status ? <p className="mt-1 text-small text-graphite">{a.status}</p> : null}
          </div>
        )}
        {ui && ui.proposals.length > 0 && <Proposals ui={ui} />}
        {ui?.actions.map((action) => (
          <ActionCard key={action.id} action={action} onResolve={(d) => a.resolveAction(action, d)} />
        ))}
        {ui?.created.map((c) => (
          <CreatedReceipt key={c.id} item={c} />
        ))}
        {steps.length > 0 && !live && <Working steps={steps} />}
      </div>
    </li>
  );
}

function Thinking({ steps, status }: { steps: Array<{ summary: string }>; status: string | null }) {
  const last = steps[steps.length - 1];
  return (
    <p className="flex items-center gap-2.5 text-small font-semibold text-ink-2">
      <span className="flex gap-1" aria-hidden>
        <span className="size-1.5 animate-pulse bg-ink-2" />
        <span className="size-1.5 animate-pulse bg-ink-2 [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse bg-ink-2 [animation-delay:300ms]" />
      </span>
      {status ?? (last ? `${last.summary}…` : "Reading your calendar…")}
    </p>
  );
}

/** "Show working": the exact steps behind an answer. */
function Working({ steps }: { steps: Array<{ name: string; summary: string; ok: boolean }> }) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-micro font-bold text-graphite hover:text-ink-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
        Show working ({steps.length} step{steps.length === 1 ? "" : "s"})
      </summary>
      <ol className="mt-1.5 grid gap-1 border-l-[1.5px] border-rule pl-3 font-mono text-micro text-graphite">
        {steps.map((s, i) => (
          <li key={i} className={cn(!s.ok && "text-red-ink-text")}>
            {s.summary}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Options Vele found, written on the sheet in marker; each carries its reasons beneath. */
function Proposals({ ui }: { ui: TurnUI }) {
  const a = useAssistantContext();
  const zone = useZone();
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {ui.proposals.map((p) => (
        <li key={p.label}>
          <button
            disabled={a.busy}
            onClick={() => a.send(`Let's go with option ${p.label} (${dt(p.start, zone).toFormat("ccc d LLL")} ${timeRange(p.start, p.end, zone)}).`)}
            className={cn(
              "pencil-hatch group grid w-full grid-cols-[28px_minmax(0,1fr)] items-start gap-2.5 rounded-[2px] border-[1.5px] border-dashed border-pencil px-2.5 py-2 text-left transition-colors hover:border-ink-2",
              p.status === "flagged" && "border-amber",
            )}
          >
            <span className="flex size-7 items-center justify-center rounded-[2px] border-[1.5px] border-pencil font-hand text-lead font-bold text-hand group-hover:border-ink-2 group-hover:bg-ink-2 group-hover:text-paper">
              {p.label}
            </span>
            <span className="min-w-0">
              <span className="tnum block font-hand text-lead leading-tight font-bold text-hand">
                {dt(p.start, zone).toFormat("ccc d LLL")}, {timeRange(p.start, p.end, zone)}
              </span>
              {p.notes.length > 0 && (
                <span className="mt-0.5 block border-l-[1.5px] border-pencil pl-2 text-micro font-semibold text-graphite">{p.notes.slice(0, 2).join(" · ")}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CreatedReceipt({ item }: { item: TurnUI["created"][number] }) {
  const zone = useZone();
  const qc = useQueryClient();
  const [undone, setUndone] = useState(false);
  const undo = async () => {
    try {
      await apiSend(`/api/events/${encodeURIComponent(item.id)}?notify=false&scope=series`, "DELETE");
      setUndone(true);
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      toast("Removed from your calendar.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className={cn("animate-ink-in flex items-center justify-between gap-3 rounded-[2px] border-[1.5px] border-ink-2 px-3 py-2", undone && "border-dashed border-rule")}>
      <span className={cn("min-w-0 text-small", undone && "line-through decoration-red-ink decoration-2")}>
        <span className="font-extrabold text-ink">{item.title}</span>{" "}
        <span className="tnum font-semibold text-ink-2">
          {dt(item.start, zone).toFormat("ccc d LLL")}, {timeRange(item.start, item.end, zone)}
        </span>
      </span>
      {item.undoable && !undone && (
        <button
          onClick={undo}
          className="inline-flex shrink-0 items-center gap-1 text-small font-bold text-ink-2 underline decoration-rule underline-offset-2 hover:decoration-ink-2"
        >
          <Undo2 className="size-3.5" /> Undo
        </button>
      )}
    </div>
  );
}

function Composer({ variant }: { variant: "margin" | "page" }) {
  const a = useAssistantContext();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    a.registerComposer(ref.current, setText);
    return () => a.registerComposer(null, () => undefined);
  }, [a]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || a.busy) return;
    void a.send(text);
    setText("");
  };

  return (
    <div className={cn("border-t-[1.5px] border-ink-2 bg-paper-2 p-3", variant === "page" && "md:px-8")}>
      <div className={cn("mx-auto", variant === "page" && "max-w-2xl")}>
        {a.offline && <p className="mb-2 text-micro font-semibold text-graphite">Basic mode: no Gemini key is set, so Vele understands simple requests only.</p>}
        <div className="flex items-end gap-2 rounded-[2px] border-[1.5px] border-ink-2 bg-paper p-1 pl-3 focus-within:shadow-[0_0_0_1px_var(--ink-2)]">
          <label htmlFor={`composer-${variant}`} className="sr-only">
            Write to Vele
          </label>
          <textarea
            id={`composer-${variant}`}
            ref={ref}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
            }}
            placeholder="Ask about your time, or say what to book"
            className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-body text-ink outline-none placeholder:text-graphite-soft"
            maxLength={2000}
          />
          {a.busy ? (
            <button
              onClick={a.stop}
              className="flex size-9 shrink-0 items-center justify-center rounded-[2px] border-[1.5px] border-ink-2 text-ink-2 hover:bg-wash"
              aria-label="Stop"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="flex size-9 shrink-0 items-center justify-center rounded-[2px] bg-ink-2 text-paper transition-colors disabled:bg-rule-faint disabled:text-graphite-soft"
              aria-label="Send"
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
