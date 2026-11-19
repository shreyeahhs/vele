"use client";

import { useEffect } from "react";
import { useStored, writeStored } from "@/hooks/use-client";

export type ThemeChoice = "system" | "light" | "dark";

/** localStorage key (drives the UI) and cookie name (lets the server render the right theme). */
export const THEME_KEY = "vele-theme";

/** The saved choice on this device ("system" when none is saved). */
export function useTheme(): ThemeChoice {
  const v = useStored(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function writeCookie(choice: ThemeChoice) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = choice === "system" ? `${THEME_KEY}=; path=/; max-age=0; samesite=lax${secure}` : `${THEME_KEY}=${choice}; path=/; max-age=31536000; samesite=lax${secure}`;
}

export function applyTheme(choice: ThemeChoice) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  writeStored(THEME_KEY, choice === "system" ? null : choice);
  writeCookie(choice);
}

/**
 * Keeps the cookie in step with a choice saved before the theme moved to a
 * cookie (or saved in another tab), so the next server render matches.
 */
export function useThemeSync() {
  const theme = useTheme();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    const cookie =
      document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${THEME_KEY}=`))
        ?.slice(THEME_KEY.length + 1) ?? "";
    if (cookie !== (theme === "system" ? "" : theme)) writeCookie(theme);
  }, [theme]);
}
