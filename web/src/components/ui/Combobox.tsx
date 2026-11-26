import { type ReactNode, type Ref, useId, useState, useEffect } from "react";
import { cn } from "../../lib/cn";
import { SearchIcon, Spinner } from "./icons";

/**
 * Search-select (ux.md §2 "Combobox"): ARIA combobox pattern, max 8 options, ↑↓ to move, Enter to pick,
 * Esc to clear/close. Options the data forbids stay listed but are not selectable (`aria-disabled`)
 * and show the reason. The caller owns the text and the query (debounce it, min 1 char).
 */
export function Combobox<T>({
  label,
  placeholder,
  value,
  onValueChange,
  options,
  loading = false,
  getKey,
  renderOption,
  disabledReason,
  onSelect,
  inputRef,
  testId,
  emptyText = "No matches",
  hint,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onValueChange: (text: string) => void;
  /** undefined = nothing searched yet. */
  options: T[] | undefined;
  loading?: boolean;
  getKey: (o: T) => string;
  renderOption: (o: T, state: { disabledReason: string | null }) => ReactNode;
  disabledReason?: (o: T) => string | null;
  onSelect: (o: T) => void;
  inputRef?: Ref<HTMLInputElement>;
  testId?: string;
  emptyText?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const shown = (options ?? []).slice(0, 8);
  const reasonOf = (o: T) => disabledReason?.(o) ?? null;
  const expanded = open && value.trim().length > 0 && (options !== undefined || loading);
  // New results: highlight the first option that can be picked, so Enter selects it (Haya pass 2).
  const firstPickable = shown.findIndex((o) => !reasonOf(o));
  useEffect(() => {
    setActive(Math.max(firstPickable, 0));
  }, [options, firstPickable]);

  const pick = (o: T | undefined) => {
    if (!o || reasonOf(o)) return;
    onSelect(o);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (expanded && shown[active]) {
        e.preventDefault();
        pick(shown[active]);
      }
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      } else if (value) {
        e.preventDefault();
        onValueChange("");
      }
    }
  };

  return (
    <div className="relative" data-testid={testId}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-500">
          {loading ? <Spinner /> : <SearchIcon size={16} />}
        </div>
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && shown[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          data-testid={testId ? `${testId}-input` : undefined}
          className={cn(
            "block h-10 w-full rounded-md border border-border-strong bg-surface pr-3 pl-9 text-base text-neutral-900 placeholder:text-neutral-500",
            "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 focus:outline-none",
          )}
        />
      </div>
      {hint && !expanded && <p className="mt-1.5 text-sm text-neutral-600">{hint}</p>}
      {expanded && (
        <div className="absolute z-30 mt-1 w-full origin-top overflow-hidden rounded-lg border border-border bg-surface shadow-pop motion-safe:animate-pop-in">
          <ul id={listId} role="listbox" aria-label={label} className="max-h-96 overflow-y-auto p-1">
            {shown.map((o, i) => {
              const reason = reasonOf(o);
              return (
                <li
                  key={getKey(o)}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={reason ? true : undefined}
                  data-testid={testId ? `${testId}-option` : undefined}
                  // mousedown, not click: the input's blur would close the list first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "rounded-md px-2.5 py-2",
                    i === active && "bg-brand-50",
                    reason ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                  )}
                >
                  {renderOption(o, { disabledReason: reason })}
                </li>
              );
            })}
            {!loading && options !== undefined && shown.length === 0 && (
              <li className="px-2.5 py-3 text-sm text-neutral-600" role="presentation">
                {emptyText}
              </li>
            )}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-neutral-500">
            <span>↑↓ move · Enter select · Esc close</span>
            {options !== undefined && (
              <span className="tabular-nums">
                {Math.min(options.length, 8)} of {options.length} matches
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
