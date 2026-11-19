"use client";

import { PanelRightClose, SquarePen } from "lucide-react";
import { useAssistantContext } from "@/components/app/assistant-context";
import { Wordmark } from "@/components/brand";
import { Tip } from "@/components/ui/primitives";
import { Conversation } from "./conversation";

/** Vele's memo sheet, pinned beside the page. */
export function VeleMargin() {
  const a = useAssistantContext();
  return (
    <>
      <div className="band m-2 mb-0 flex h-12 shrink-0 items-center gap-3 rounded-[2px] pr-1.5 pl-3">
        <Wordmark />
        <span className="text-small font-semibold text-band-ink-2">Memo</span>
        <span className="flex-1" />
        <Tip label="Start a new memo">
          <button onClick={a.newConversation} className="rounded-[2px] p-1.5 text-band-ink hover:bg-band-hover" aria-label="New conversation">
            <SquarePen className="size-4" />
          </button>
        </Tip>
        <Tip label="Unpin Vele">
          <button onClick={() => a.setPanelOpen(false)} className="rounded-[2px] p-1.5 text-band-ink hover:bg-band-hover" aria-label="Unpin Vele">
            <PanelRightClose className="size-4" />
          </button>
        </Tip>
      </div>
      <Conversation variant="margin" />
    </>
  );
}
