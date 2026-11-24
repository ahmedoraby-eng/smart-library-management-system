import type { BookDto, BookInput } from "@slm/contracts";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button, InlineAlert, Input, Textarea } from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { BookCover } from "./BookCover";
import {
  type BookField, type BookFormValues, emptyValues, FIELD_ORDER, isDirty, isHttpsUrl, valuesFromBook, validateBook,
} from "./bookFormModel";

const DESCRIPTION_MAX = 2000;
const STALE_MESSAGE = "Someone else changed this book while you were editing. Reload to see their version; your changes are not saved.";

interface Props {
  /** Present when editing. The form pins this snapshot (and its version) until it is remounted. */
  book?: BookDto;
  categories: string[];
  /** Resolve on success; reject with the ApiError so the form can map it onto fields. */
  onSubmit: (input: BookInput) => Promise<unknown>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Edit conflict: reload the latest version and remount this form. */
  onReload?: () => void;
}

type ServerErrors = Partial<Record<BookField, ReactNode>>;

/** ux.md §3.4. Client rules come from the shared BookInputSchema, so messages match the server's. */
export function BookForm({ book, categories, onSubmit, onCancel, onDirtyChange, onReload }: Props) {
  const initial = useMemo(() => (book ? valuesFromBook(book) : emptyValues), [book]);
  const [values, setValues] = useState<BookFormValues>(initial);
  const [touched, setTouched] = useState<Partial<Record<BookField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: parsed, errors } = useMemo(() => validateBook(values), [values]);
  const dirty = isDirty(values, initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const set = (field: BookField) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setServerErrors((s) => (s[field] ? { ...s, [field]: undefined } : s));
  };
  const blur = (field: BookField) => () => setTouched((t) => ({ ...t, [field]: true }));
  const errorOf = (field: BookField): ReactNode => serverErrors[field] ?? (touched[field] || submitted ? errors[field] : undefined);
  const props = (field: BookField) => ({
    id: `book-${field}`,
    name: field,
    value: values[field],
    onChange: set(field),
    onBlur: blur(field),
    error: errorOf(field),
    "data-testid": `field-${field}`,
  });

  // Focus after the error text has rendered; cancelled if the form goes away first.
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const focusField = (field: BookField) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => document.getElementById(`book-${field}`)?.focus());
  };

  const mapServerError = (err: unknown) => {
    if (!(err instanceof ApiError)) return setGeneral("Couldn't save the book. Nothing was saved. Try again.");
    const ctx = err.problem.context ?? {};
    switch (err.code) {
      case "VALIDATION_FAILED": {
        const next: ServerErrors = {};
        let rest: string | null = null;
        for (const e of err.problem.errors ?? []) {
          if ((FIELD_ORDER as string[]).includes(e.field)) next[e.field as BookField] ??= e.message;
          else rest ??= e.message;
        }
        setServerErrors(next);
        if (rest || Object.keys(next).length === 0) setGeneral(rest ?? err.problem.detail ?? "Check the highlighted fields and try again.");
        const first = FIELD_ORDER.find((f) => next[f]);
        if (first) focusField(first);
        return;
      }
      case "DUPLICATE_ISBN":
        setServerErrors({
          isbn: (
            <>
              Another book already uses this ISBN: <em>{String(ctx.title ?? "another book")}</em>.{" "}
              {typeof ctx.bookId === "string" && (
                <Link to="/books/$bookId" params={{ bookId: ctx.bookId }} className="font-semibold text-brand-700" data-testid="open-duplicate">
                  Open it
                </Link>
              )}
            </>
          ),
        });
        return focusField("isbn");
      case "TOTAL_BELOW_LOANED": {
        const n = Number(ctx.onLoan ?? 0);
        setServerErrors({ totalCopies: `You can't go below ${n} ${n === 1 ? "copy" : "copies"} — ${n} ${n === 1 ? "is" : "are"} on loan right now.` });
        return focusField("totalCopies");
      }
      case "STALE_VERSION":
        return setStale(true);
      default:
        // 401/403 are redirected globally; everything else is a generic failure.
        if (err.status !== 401 && err.status !== 403) setGeneral("Couldn't save the book. Nothing was saved. Try again.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || stale) return;
    setSubmitted(true);
    setGeneral(null);
    if (!parsed) {
      const first = FIELD_ORDER.find((f) => errors[f]);
      if (first) focusField(first);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(parsed);
    } catch (err) {
      mapServerError(err);
    } finally {
      setSaving(false);
    }
  };

  const total = values.totalCopies.trim() === "" ? NaN : Number(values.totalCopies);
  const availableAfter = Number.isInteger(total) && total >= 1 ? (book ? Math.max(0, total - book.activeLoans) : total) : null;
  const descLen = values.description.length;
  const coverOk = isHttpsUrl(values.coverImageUrl);

  return (
    <form onSubmit={submit} noValidate className="flex max-w-180 flex-col gap-5" data-testid="book-form" aria-label={book ? "Edit book" : "Add book"}>
      <Input label="Title" autoComplete="off" {...props("title")} />
      <Input label="Author" autoComplete="off" {...props("author")} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="ISBN" optional autoComplete="off" hint="ISBN-10 or ISBN-13; hyphens are fine." {...props("isbn")} />
        <div>
          <Input label="Category" list="book-categories" autoComplete="off" {...props("category")} />
          <datalist id="book-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="Publisher" optional autoComplete="off" {...props("publisher")} />
        <Input label="Publication year" optional inputMode="numeric" autoComplete="off" {...props("publicationYear")} />
      </div>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Input label="Cover image URL" optional type="url" autoComplete="off" placeholder="https://" {...props("coverImageUrl")} />
        </div>
        {coverOk && (
          <div className="pt-6" data-testid="cover-preview">
            <BookCover title={values.title || "?"} url={values.coverImageUrl.trim()} size="md" />
          </div>
        )}
      </div>
      <Textarea
        label="Description"
        optional
        rows={5}
        labelAside={
          <span className={descLen > DESCRIPTION_MAX ? "text-sm text-danger-700" : "text-sm text-neutral-600"} data-testid="description-counter">
            {descLen.toLocaleString("en-US")} / {DESCRIPTION_MAX.toLocaleString("en-US")}
          </span>
        }
        {...props("description")}
      />
      <div>
        <Input label="Total copies" inputMode="numeric" autoComplete="off" className="max-w-40" {...props("totalCopies")} />
        <p className="mt-1.5 text-sm text-neutral-600" data-testid="available-after">
          Available after saving: <span className="font-semibold tabular-nums">{availableAfter ?? "—"}</span>
        </p>
      </div>

      {stale && (
        <InlineAlert
          variant="danger"
          testId="stale-notice"
          action={
            <Button size="sm" onClick={onReload} data-testid="reload-book">
              Reload
            </Button>
          }
        >
          {STALE_MESSAGE}
        </InlineAlert>
      )}
      {general && (
        <InlineAlert variant="danger" testId="form-error">
          {general}
        </InlineAlert>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <Button onClick={onCancel} data-testid="cancel-book">
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={stale} data-testid="save-book">
          {book ? "Save changes" : "Add book"}
        </Button>
      </div>
    </form>
  );
}
