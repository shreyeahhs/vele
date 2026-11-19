import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

/** A box on a printed form: square, ruled in navy, the caret in red marker. */
const control =
  "w-full rounded-[var(--radius)] border border-rule bg-paper px-3 text-body text-ink transition-[border-color,box-shadow] duration-100 placeholder:text-graphite-soft hover:border-graphite-soft focus:border-ink-2 focus:shadow-[0_0_0_1px_var(--ink-2)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-red-ink aria-[invalid=true]:shadow-[0_0_0_1px_var(--red-ink)]";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(control, "select-chevron h-9 appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-small font-bold text-ink-2", className)} {...props} />;
}

/** Label above, control, then helper or error text below. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={`${id}-error`} className="text-small font-medium text-red-ink-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="max-w-[55ch] text-small text-graphite">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const QUARTER_HOURS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

/**
 * A 24-hour time in quarter hours. Native time inputs follow the browser's
 * locale (AM/PM in some), which clashes with every other time in the app.
 */
export function TimeSelect({
  value,
  onValueChange,
  emptyLabel,
  className,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
  emptyLabel?: string;
}) {
  const options = value && !QUARTER_HOURS.includes(value) ? [...QUARTER_HOURS, value].sort() : QUARTER_HOURS;
  return (
    <Select value={value} onChange={(e) => onValueChange(e.target.value)} className={cn("tnum w-[104px] pr-7", className)} {...props}>
      {emptyLabel != null && <option value="">{emptyLabel}</option>}
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  );
}
