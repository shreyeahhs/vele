"use client";

import { Dialog, DialogContent, Kbd } from "@/components/ui/primitives";
import { useUI } from "./ui-context";

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "Anywhere",
    items: [
      ["⌘ K", "Command palette"],
      ["/", "Search"],
      ["C", "Create event"],
      ["A", "Ask Vele"],
      ["G", "Go to Today"],
      ["?", "This list"],
    ],
  },
  {
    title: "Calendar",
    items: [
      ["T", "Jump to today"],
      ["D", "Day view"],
      ["X", "Three days"],
      ["W", "Week view"],
      ["M", "Month view"],
      ["L", "List view"],
      ["J / K", "Next / previous period"],
      ["← / →", "Next / previous period"],
    ],
  },
];

export function ShortcutsDialog() {
  const ui = useUI();
  return (
    <Dialog open={ui.shortcutsOpen} onOpenChange={ui.setShortcutsOpen}>
      <DialogContent title="Keyboard shortcuts" description="Single keys work whenever you're not typing.">
        <div className="grid gap-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h2 className="border-b-2 border-ink-2 pb-1 text-small font-extrabold">{g.title}</h2>
              <ul className="banded">
                {g.items.map(([k, label]) => (
                  <li key={label} className="flex items-center justify-between gap-3 px-1.5 py-1.5 text-small font-semibold">
                    {label}
                    <span className="flex gap-1">
                      {k.split(" / ").map((part) => (
                        <Kbd key={part}>{part}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
