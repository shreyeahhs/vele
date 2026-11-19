"use client";

import { X } from "lucide-react";
import { Dialog as D, DropdownMenu as DM, Popover as P, Switch as S, ToggleGroup as TG, Tooltip as T } from "radix-ui";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/* ── Tooltip ─────────────────────────────────────────────────────────────── */

export function Tip({ label, children, side = "bottom", shortcut }: { label: string; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; shortcut?: string }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="data-[state=delayed-open]:animate-pencil-in z-50 flex items-center gap-2 rounded-[var(--radius)] bg-ink px-2 py-1 text-micro font-bold text-paper"
        >
          {label}
          {shortcut ? <Kbd className="border-paper/30 bg-transparent text-paper">{shortcut}</Kbd> : null}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[2px] border border-rule bg-paper-2 px-1 font-mono text-micro font-semibold text-ink-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ── Dialog: a sheet laid over the wall, headed by its own printed band ───── */

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  wide,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-[color-mix(in_oklab,var(--wall)_72%,transparent)] data-[state=open]:animate-[pencil-in_160ms_ease-out]" />
      <D.Content
        className={cn(
          "sheet data-[state=open]:animate-pencil-in fixed top-[10vh] left-1/2 z-50 flex max-h-[84vh] w-[calc(100vw-20px)] -translate-x-1/2 flex-col overflow-hidden outline-none",
          wide ? "max-w-2xl" : "max-w-md",
          className,
        )}
      >
        <div className="band m-2 mb-0 flex items-start justify-between gap-4 rounded-[2px] px-4 py-3">
          <div className="grid gap-0.5">
            <D.Title className="text-lead font-extrabold">{title}</D.Title>
            {description ? <D.Description className="text-small text-band-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-mt-0.5 -mr-1.5 rounded-[2px] p-1.5 text-band-ink hover:bg-band-hover" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="grid gap-4 overflow-y-auto p-5">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

/* ── Popover ─────────────────────────────────────────────────────────────── */

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;

export function PopoverContent({ className, children, align = "start", side, sideOffset = 6, ...props }: P.PopoverContentProps) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn("sheet data-[state=open]:animate-pencil-in z-50 w-80 border-[1.5px] border-ink-2 p-4 outline-none", className)}
        {...props}
      >
        {children}
      </P.Content>
    </P.Portal>
  );
}

/* ── Dropdown menu ───────────────────────────────────────────────────────── */

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ className, children, align = "end" }: { className?: string; children: React.ReactNode; align?: "start" | "end" | "center" }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} collisionPadding={12} className={cn("sheet data-[state=open]:animate-pencil-in z-50 min-w-52 p-1", className)}>
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export const MenuItem = forwardRef<HTMLDivElement, DM.DropdownMenuItemProps & { danger?: boolean }>(function MenuItem({ className, danger, ...props }, ref) {
  return (
    <DM.Item
      ref={ref}
      className={cn(
        "flex h-9 cursor-default items-center gap-2.5 rounded-[2px] px-2.5 text-small font-medium text-ink outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-ink-2 data-[highlighted]:text-paper [&_svg]:size-4",
        danger && "text-red-ink-text data-[highlighted]:bg-red-ink data-[highlighted]:text-white",
        className,
      )}
      {...props}
    />
  );
});

export function MenuSeparator() {
  return <DM.Separator className="-mx-1 my-1 h-px bg-rule" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DM.Label className="px-2.5 pt-2 pb-1 text-micro font-bold text-ink-2">{children}</DM.Label>;
}

/* ── Switch: a square toggle, filled navy when on ────────────────────────── */

export function Switch({ className, ...props }: S.SwitchProps) {
  return (
    <S.Root
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[2px] border-[1.5px] border-ink-2 bg-paper p-[2px] transition-colors disabled:opacity-40 data-[state=checked]:bg-ink-2",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-3 rounded-[1px] bg-ink-2 transition-transform duration-150 ease-[var(--ease-out-expo)] data-[state=checked]:translate-x-4 data-[state=checked]:bg-paper" />
    </S.Root>
  );
}

/* ── Segmented control: printed tabs, the chosen one filled ──────────────── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; shortcut?: string }>;
  label: string;
  className?: string;
}) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn("inline-flex h-8 items-stretch overflow-hidden rounded-[2px] border-[1.5px] border-ink-2", className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          title={o.shortcut ? `${o.label} (${o.shortcut})` : o.label}
          className="border-l-[1.5px] border-ink-2 px-3 text-small font-bold text-ink-2 transition-colors first:border-l-0 hover:bg-wash data-[state=on]:bg-ink-2 data-[state=on]:text-paper"
        >
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  );
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[2px] bg-paper-2", className)} />;
}

/** Status stamps: square, bold, uppercase, like a rubber stamp on the sheet. */
export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "ink" | "red" | "amber" | "green" | "pencil";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-ink-2 text-ink-2",
    ink: "border-ink-2 bg-ink-2 text-paper",
    red: "border-red-ink bg-red-ink text-white",
    amber: "border-amber text-amber",
    green: "border-green-ok text-green-ok",
    pencil: "border-dashed border-pencil text-hand",
  } as const;
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-[2px] border-[1.5px] px-1.5 text-micro font-extrabold tracking-[0.08em] uppercase", tones[tone], className)}>
      {children}
    </span>
  );
}

/** A calendar's code, punched on tape in its own colour. */
export function Tape({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("dymo", className)} style={{ ["--tape-color" as string]: color }}>
      {children}
    </span>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px bg-rule", className)} />;
}

/**
 * A section on a printed form: a heavy ink rule, the heading set bold
 * beneath it, and an optional action at the right. Sections are ruled, never
 * boxed.
 */
export function SectionHead({ title, action, id, className }: { title: React.ReactNode; action?: React.ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("mb-1 flex items-end justify-between gap-3 border-t-2 border-ink-2 pt-2 pb-1", className)}>
      <h2 id={id} className="text-lead font-extrabold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {action ? <div className="shrink-0 pb-0.5 text-small font-bold whitespace-nowrap">{action}</div> : null}
    </div>
  );
}
