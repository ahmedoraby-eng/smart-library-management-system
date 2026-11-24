import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "../../lib/cn";
import { AlertIcon } from "./icons";

interface FieldChrome {
  label: string;
  hint?: ReactNode;
  /** Replaces the hint; also sets aria-invalid. */
  error?: ReactNode;
  optional?: boolean;
  /** Extra content right of the label (e.g. a counter). */
  labelAside?: ReactNode;
}

const control =
  "block w-full rounded-md border bg-surface px-3 text-base text-neutral-900 placeholder:text-neutral-500 " +
  "disabled:bg-neutral-100 disabled:text-neutral-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 focus:border-brand-500";
const border = (invalid: boolean) => (invalid ? "border-danger-500" : "border-border-strong");

function useFieldIds(id: string | undefined, hasHelp: boolean, hasError: boolean) {
  const auto = useId();
  const fieldId = id ?? auto;
  const helpId = hasHelp ? `${fieldId}-help` : undefined;
  return {
    fieldId,
    helpId,
    aria: { "aria-invalid": hasError || undefined, "aria-describedby": helpId },
  };
}

function Shell({ label, hint, error, optional, labelAside, fieldId, helpId, children }: FieldChrome & { fieldId: string; helpId?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={fieldId} className="text-base font-medium text-neutral-700">
          {label}
          {optional && <span className="ml-1 font-normal text-neutral-500">(optional)</span>}
        </label>
        {labelAside}
      </div>
      {children}
      {error ? (
        <p id={helpId} className="flex items-start gap-1.5 text-sm text-danger-700" data-field-error>
          <AlertIcon size={16} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={helpId} className="text-sm text-neutral-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldChrome {
  ref?: Ref<HTMLInputElement>;
  /** Content inside the right edge of the input (e.g. a show/hide button). */
  trailing?: ReactNode;
  /** Icon inside the left edge (e.g. search). */
  leading?: ReactNode;
  /** 36 px height for toolbars (default 40). */
  compact?: boolean;
  /** Keep the label for screen readers only (toolbars). */
  hideLabel?: boolean;
}

export function Input({ label, hint, error, optional, labelAside, id, className, trailing, leading, compact, hideLabel, ...rest }: InputProps) {
  const { fieldId, helpId, aria } = useFieldIds(id, Boolean(error || hint), Boolean(error));
  const field = (
    <div className="relative">
      {leading && <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-500">{leading}</div>}
      <input
        id={fieldId}
        className={cn(control, compact ? "h-9" : "h-10", border(Boolean(error)), trailing ? "pr-16" : false, leading ? "pl-9" : false, className)}
        {...aria}
        {...rest}
      />
      {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
    </div>
  );
  if (hideLabel) {
    return (
      <div>
        <label htmlFor={fieldId} className="sr-only">
          {label}
        </label>
        {field}
      </div>
    );
  }
  return <Shell {...{ label, hint, error, optional, labelAside, fieldId, helpId }}>{field}</Shell>;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldChrome {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ label, hint, error, optional, labelAside, id, className, ...rest }: TextareaProps) {
  const { fieldId, helpId, aria } = useFieldIds(id, Boolean(error || hint), Boolean(error));
  return (
    <Shell {...{ label, hint, error, optional, labelAside, fieldId, helpId }}>
      <textarea id={fieldId} className={cn(control, "min-h-24 py-2.5", border(Boolean(error)), className)} {...aria} {...rest} />
    </Shell>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, Omit<FieldChrome, "label"> {
  label: string;
  /** Visually hide the label (toolbars) while keeping it for screen readers. */
  hideLabel?: boolean;
  ref?: Ref<HTMLSelectElement>;
}

/** Native <select> styled like Input: cheap and accessible (ux.md §2). */
export function Select({ label, hideLabel, hint, error, optional, id, className, children, ...rest }: SelectProps) {
  const { fieldId, helpId, aria } = useFieldIds(id, Boolean(error || hint), Boolean(error));
  const select = (
    <select id={fieldId} className={cn(control, "h-9 pr-8", border(Boolean(error)), className)} {...aria} {...rest}>
      {children}
    </select>
  );
  if (hideLabel) {
    return (
      <div>
        <label htmlFor={fieldId} className="sr-only">
          {label}
        </label>
        {select}
      </div>
    );
  }
  return (
    <Shell {...{ label, hint, error, optional, fieldId, helpId }}>{select}</Shell>
  );
}
