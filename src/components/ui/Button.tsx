"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:   "btn btn-primary",
  secondary: "btn btn-secondary",
  ghost:     "btn btn-ghost",
  danger:    "btn btn-danger",
  outline:   "btn bg-transparent border border-border text-text-light hover:bg-bg-hover",
};

const sizeClasses: Record<Size, string> = {
  sm:   "btn-sm",
  md:   "",
  lg:   "btn-lg",
  icon: "!p-2 aspect-square",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, leftIcon, rightIcon, children, className, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : leftIcon ? (
        leftIcon
      ) : null}
      {children && <span>{children}</span>}
      {!loading && rightIcon}
    </button>
  );
});
