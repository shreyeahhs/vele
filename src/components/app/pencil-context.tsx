"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Vele's pencil marks on the page: slot options the engine found, drawn onto
 * the calendar as hatched graphite boxes until one is chosen and inked.
 */
export interface Proposal {
  start: string;
  end: string;
  label: string;
  status: string;
  notes: string[];
}

interface PencilState {
  proposals: Proposal[];
  setProposals: (p: Proposal[]) => void;
  /** Event ids that were just created or confirmed: the calendar plays the ink-in once. */
  inked: string[];
  markInked: (id: string) => void;
  /** An event the assistant or search wants the calendar to reveal. */
  focusEventId: string | null;
  setFocusEventId: (id: string | null) => void;
}

const Ctx = createContext<PencilState | null>(null);

export function PencilProvider({ children }: { children: React.ReactNode }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [inked, setInked] = useState<string[]>([]);
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const markInked = useCallback((id: string) => {
    setInked((list) => [...list, id]);
    setTimeout(() => setInked((list) => list.filter((x) => x !== id)), 1500);
  }, []);
  const value = useMemo(() => ({ proposals, setProposals, inked, markInked, focusEventId, setFocusEventId }), [proposals, inked, markInked, focusEventId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePencil(): PencilState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePencil must be used inside PencilProvider");
  return ctx;
}
