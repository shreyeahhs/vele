"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface EventDraft {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  calendarId?: string | null;
  isAllDay?: boolean;
}

interface UIState {
  eventDialog: { open: boolean; draft: EventDraft | null };
  openEventDialog: (draft?: EventDraft) => void;
  closeEventDialog: () => void;
  palette: { open: boolean; mode: "all" | "search" };
  openPalette: (mode?: "all" | "search") => void;
  setPaletteOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  findTimeOpen: boolean;
  setFindTimeOpen: (open: boolean) => void;
}

const Ctx = createContext<UIState | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [eventDialog, setEventDialog] = useState<UIState["eventDialog"]>({ open: false, draft: null });
  const [palette, setPalette] = useState<UIState["palette"]>({ open: false, mode: "all" });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [findTimeOpen, setFindTimeOpen] = useState(false);
  const openEventDialog = useCallback((draft?: EventDraft) => setEventDialog({ open: true, draft: draft ?? null }), []);
  const closeEventDialog = useCallback(() => setEventDialog({ open: false, draft: null }), []);
  const openPalette = useCallback((mode: "all" | "search" = "all") => setPalette({ open: true, mode }), []);
  const setPaletteOpen = useCallback((open: boolean) => setPalette((p) => ({ ...p, open })), []);
  const value = useMemo(
    () => ({ eventDialog, openEventDialog, closeEventDialog, palette, openPalette, setPaletteOpen, shortcutsOpen, setShortcutsOpen, findTimeOpen, setFindTimeOpen }),
    [eventDialog, openEventDialog, closeEventDialog, palette, openPalette, setPaletteOpen, shortcutsOpen, findTimeOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI(): UIState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUI must be used inside UIProvider");
  return ctx;
}
