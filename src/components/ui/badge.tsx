import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-accent text-phosphor-hot",
        muted: "border-border bg-secondary text-muted-foreground",
        warn: "border-warn/40 bg-warn/15 text-warn",
        error: "border-destructive/40 bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
