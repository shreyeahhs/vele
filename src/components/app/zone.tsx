"use client";

import { createContext, useContext } from "react";

/** The user's configured IANA time zone; every date on screen renders in it. */
const ZoneContext = createContext<string>("Europe/London");

export function ZoneProvider({ zone, children }: { zone: string; children: React.ReactNode }) {
  return <ZoneContext.Provider value={zone}>{children}</ZoneContext.Provider>;
}

export function useZone(): string {
  return useContext(ZoneContext);
}
