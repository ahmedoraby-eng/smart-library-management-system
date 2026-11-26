import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 border-brand-600 text-white hover:bg-brand-700 hover:border-brand-700 hover:shadow-[0_6px_14px_-8px_rgb(22_63_47/.7)]",
  secondary: "bg-surface border-border-strong text-neutral-700 shadow-card hover:bg-neutral-50",
  ghost: "bg-transparent border-transparent text-neutral-600 hover:bg-neutral-100",
  danger: "bg-danger-600 border-danger-600 text-white hover:bg-danger-700 hover:border-danger-700",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-3.5 text-base",
  lg: "h-11 px-4.5 text-md",
};

/** Class string so links (`<Link>`) can look like buttons. */
export function buttonClasses({
  variant = "secondary",
  size = "md",
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md border font-semibold whitespace-nowrap select-none no-underline",
    // Press feedback: colours ease, the button gives slightly under the pointer (not when disabled).
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out motion-safe:enabled:active:scale-[0.97] motion-safe:[&:is(a)]:active:scale-[0.97]",
    "disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:shadow-none",
    variants[variant],
    sizes[size],
    block && "w-full",
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/** Loading keeps the label, shows a spinner, sets aria-busy and disables the button (ux.md §2). */
export function Button({
  variant,
  size,
  loading,
  block,
  icon,
  children,
  className,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClasses({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
