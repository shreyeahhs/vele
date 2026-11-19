"use client";

import { useEffect, useEffectEvent } from "react";

type Handler = (e: KeyboardEvent) => void;

/** True while the user is typing somewhere (shortcuts must never fire there). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(type);
  }
  return Boolean(el.closest("[role='dialog'] [cmdk-input], [data-no-shortcuts]"));
}

/**
 * Single-key shortcuts (T, W, M, D, C, /) plus modifier chords (mod+K).
 * Keys: "t", "/", "mod+k". Ignored while typing and when a dialog is open,
 * except chords, which work everywhere.
 */
export function useShortcuts(map: Record<string, Handler>, enabled = true) {
  // Always sees the latest handlers without re-subscribing on every render.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const chord = mod ? `mod+${key}` : null;
    if (chord && map[chord]) {
      e.preventDefault();
      map[chord](e);
      return;
    }
    if (mod || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    if (document.querySelector("[role='dialog'][data-state='open']")) return;
    const handler = map[key];
    if (handler) {
      e.preventDefault();
      handler(e);
    }
  });
  useEffect(() => {
    if (!enabled) return;
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled]);
}
