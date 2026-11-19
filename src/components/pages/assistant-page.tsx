"use client";

import { useQuery } from "@tanstack/react-query";
import { History, MessageCircle, Send, SquarePen } from "lucide-react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { useAssistantContext } from "@/components/app/assistant-context";
import { useZone } from "@/components/app/zone";
import { Wordmark } from "@/components/brand";
import { Conversation } from "@/components/assistant/conversation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { qk } from "@/hooks/use-api";
import { apiGet, errorMessage } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

interface ConversationRow {
  id: string;
  title: string | null;
  channel: "WEB" | "TELEGRAM" | "WHATSAPP";
  lastMessageAt: string;
}

function useConversations() {
  const a = useAssistantContext();
  // Refresh the list when a turn finishes (new titles, new conversations).
  return useQuery({
    queryKey: [...qk.conversations, a.conversationId, a.busy],
    queryFn: async () => (await apiGet<{ conversations: ConversationRow[] }>("/api/assistant/conversations")).conversations,
    placeholderData: (prev) => prev,
  });
}

export function AssistantPage() {
  const a = useAssistantContext();
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[260px] shrink-0 flex-col border-r-[1.5px] border-ink-2 bg-paper-2 lg:flex" aria-label="Earlier conversations">
        <div className="band m-1.5 mb-0 flex h-12 items-center justify-between gap-2 rounded-[2px] pr-1.5 pl-3">
          <span className="text-body font-extrabold">Conversations</span>
          <Button size="icon-sm" variant="ghost" className="hover:bg-band-hover" onClick={a.newConversation} aria-label="New conversation" title="New conversation">
            <SquarePen />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2">
          <HistoryList />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="band m-1.5 mb-0 flex h-12 shrink-0 items-center gap-2.5 rounded-[2px] pr-1.5 pl-3 md:pl-4">
          <h1 className="flex min-w-0 flex-1 items-center gap-2.5">
            <Wordmark />
            <span className="truncate text-small font-semibold text-band-ink-2">Conversation</span>
          </h1>
          {a.offline && <span className="rounded-[2px] border border-dashed border-pencil px-1.5 py-0.5 text-micro font-bold text-graphite">Basic mode: no AI key set</span>}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="hover:bg-band-hover lg:hidden" aria-label="Earlier conversations">
                <History />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[60vh] w-72 overflow-y-auto p-2">
              <HistoryList />
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="ghost" className="hover:bg-band-hover" onClick={a.newConversation}>
            <SquarePen /> <span className="hidden sm:inline">New</span>
          </Button>
        </header>
        <Conversation variant="page" />
      </div>
    </div>
  );
}

function HistoryList() {
  const a = useAssistantContext();
  const zone = useZone();
  const list = useConversations();
  if (list.isPending) return <p className="px-2 py-3 text-small text-graphite">Loading…</p>;
  if (!list.data?.length) return <p className="px-2 py-3 text-small text-graphite">Your conversations with Vele will be listed here.</p>;
  const now = DateTime.now().setZone(zone);
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
      {list.data.map((c) => {
        const at = DateTime.fromISO(c.lastMessageAt, { zone });
        const when = at.hasSame(now, "day") ? at.toFormat("HH:mm") : at.hasSame(now, "year") ? at.toFormat("d LLL") : at.toFormat("d LLL yyyy");
        const Icon = c.channel === "WEB" ? MessageCircle : Send;
        return (
          <li key={c.id}>
            <button
              onClick={() => a.openConversation(c.id).catch((err) => toast.error(errorMessage(err)))}
              aria-current={a.conversationId === c.id ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-small font-medium text-ink-2 hover:bg-wash",
                a.conversationId === c.id && "bg-sheet font-bold text-ink shadow-[var(--shadow-lift)] hover:bg-sheet",
              )}
            >
              <Icon className="size-3.5 shrink-0 text-graphite" aria-label={c.channel === "WEB" ? undefined : c.channel === "TELEGRAM" ? "Telegram" : "WhatsApp"} />
              <span className="min-w-0 flex-1 truncate">{c.title ?? "Untitled"}</span>
              <span className="tnum shrink-0 text-micro font-semibold text-graphite">{when}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
