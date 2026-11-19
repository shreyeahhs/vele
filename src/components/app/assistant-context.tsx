"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { useAssistant } from "@/hooks/use-assistant";
import { useStored, writeStored } from "@/hooks/use-client";

type AssistantState = ReturnType<typeof useAssistant> & {
  /** Desktop margin panel visibility. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Focus the ask line, optionally with text ready to send. */
  focusComposer: (prefill?: string) => void;
  registerComposer: (el: HTMLTextAreaElement | null, setText: (t: string) => void) => void;
};

const Ctx = createContext<AssistantState | null>(null);

const PANEL_KEY = "vele-panel-open";

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const assistant = useAssistant();
  const panelOpen = useStored(PANEL_KEY) !== "false";
  const composer = useRef<{ el: HTMLTextAreaElement | null; setText: (t: string) => void } | null>(null);

  const setPanelOpen = useCallback((open: boolean) => writeStored(PANEL_KEY, open ? null : "false"), []);

  const pendingPrefill = useRef<string | null>(null);

  const registerComposer = useCallback((el: HTMLTextAreaElement | null, setText: (t: string) => void) => {
    composer.current = el ? { el, setText } : null;
    // A prefill requested before this composer existed (e.g. navigating to /assistant on mobile).
    if (el && pendingPrefill.current != null) {
      const text = pendingPrefill.current;
      pendingPrefill.current = null;
      setText(text);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(text.length, text.length);
      });
    }
  }, []);

  const focusComposer = useCallback(
    (prefill?: string) => {
      setPanelOpen(true);
      if (!composer.current && prefill != null) pendingPrefill.current = prefill;
      requestAnimationFrame(() => {
        const c = composer.current;
        if (!c) {
          if (prefill != null) pendingPrefill.current = prefill;
          return;
        }
        if (prefill != null) {
          c.setText(prefill);
          pendingPrefill.current = null;
        }
        c.el?.focus();
      });
    },
    [setPanelOpen],
  );

  const value = useMemo(() => ({ ...assistant, panelOpen, setPanelOpen, focusComposer, registerComposer }), [assistant, panelOpen, setPanelOpen, focusComposer, registerComposer]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistantContext(): AssistantState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistantContext must be used inside AssistantProvider");
  return ctx;
}
