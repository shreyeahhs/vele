import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The mark: a strip of Dymo label tape with an embossed V, the way every
 * seminar-room door gets its name, in blue-black ink on paper and inverted
 * at night.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-6", className)}>
      <rect x="0.5" y="4.5" width="23" height="15" rx="2" fill="var(--tape)" />
      <path d="M1.5 6 H22.5" stroke="var(--tape-text)" strokeOpacity="0.16" strokeWidth="1" />
      <path d="M7.4 8.2 L10.9 16 H13.1 L16.6 8.2 H14.4 L12 13.9 L9.6 8.2 Z" fill="var(--tape-text)" />
      <path d="M9.6 8.2 L12 13.9 L14.4 8.2" fill="none" stroke="var(--tape)" strokeOpacity="0.5" strokeWidth="0.6" transform="translate(0 0.6)" />
    </svg>
  );
}

/** The name, punched out on label tape: blue-black tape, or paper tape where the ground is dark. */
export function Wordmark({ className, compact, light }: { className?: string; compact?: boolean; light?: boolean }) {
  if (compact) return <Mark className={className} />;
  return (
    <span
      className={cn("dymo h-7 px-2.5 text-[0.8125rem] tracking-[0.3em]", className)}
      style={light ? ({ ["--tape-color" as string]: "var(--paper)", color: "var(--ink)", textShadow: "none" } as React.CSSProperties) : undefined}
      aria-label={brand.name}
    >
      {brand.name}
    </span>
  );
}
