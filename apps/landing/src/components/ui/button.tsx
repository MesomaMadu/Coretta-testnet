import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C4DFF]/70 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-white to-slate-100 text-slate-900 shadow-[0_0_28px_rgba(0,229,255,0.35),0_0_56px_rgba(123,97,255,0.2)] hover:scale-[1.03] hover:shadow-[0_0_36px_rgba(0,229,255,0.5)]",
        glass:
          "border border-white/25 bg-white/5 text-white backdrop-blur-md hover:border-white/40 hover:bg-white/10",
        glow:
          "bg-gradient-to-r from-[#7C4DFF] via-[#8F5CFF] to-[#3B82F6] text-white shadow-[0_0_32px_rgba(124,77,255,0.4)] hover:scale-[1.02]",
        ghost: "text-white/70 hover:text-white hover:bg-white/5",
      },
      size: {
        default: "h-11 px-7 py-2.5",
        lg: "h-12 px-9 text-base",
        sm: "h-9 px-5 text-xs",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
