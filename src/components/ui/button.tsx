import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Buttons as the booking office prints them: square, solid navy for the one
 * action that commits, a navy outline for everything else, red only when
 * something is removed. Nothing floats; a press sinks one pixel.
 */
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-bold whitespace-nowrap transition-[background-color,border-color,color] duration-100 ease-out select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink-2",
        secondary: "border-[1.5px] border-ink-2 bg-paper text-ink-2 hover:bg-wash",
        ghost: "text-ink-2 hover:bg-wash",
        pencil: "border-[1.5px] border-dashed border-pencil bg-transparent text-ink-2 hover:border-ink-2 hover:bg-wash",
        danger: "border-[1.5px] border-red-ink bg-paper text-red-ink-text hover:bg-red-wash",
        link: "h-auto px-0 text-ink-2 underline decoration-[1.5px] underline-offset-4 hover:decoration-red-ink",
        /** On a printed band: a paper slip, and an outline for the rest. */
        band: "bg-ink text-paper hover:bg-ink-2",
        "band-ghost": "border-[1.5px] border-band-line bg-paper text-band-ink hover:border-band-ink hover:bg-band-hover",
      },
      size: {
        sm: "h-8 px-3 text-small",
        md: "h-9 px-4 text-small",
        lg: "h-12 px-6 text-body",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? (
        <>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
          </span>
          <span className="invisible contents">{children}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

export { buttonVariants };
