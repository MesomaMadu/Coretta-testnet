import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-black text-white shadow-sm hover:bg-gray-800",
        glass:
          "border border-black/15 bg-white text-black hover:border-black/25 hover:bg-[#F5F5F5]",
        glow:
          "bg-black text-white shadow-[0_0_20px_rgba(10,10,10,0.2)] hover:bg-gray-800 hover:scale-[1.02]",
        ghost: "text-black/65 hover:text-black hover:bg-black/5",
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
