import { type BookDto, type BookInput, type BookInputRaw, BookInputSchema } from "@slm/contracts";

/** Form state is all strings; `toRaw` converts it to what BookInputSchema parses (same rules and messages as the API). */
export interface BookFormValues {
  title: string;
  author: string;
  isbn: string;
  category: string;
  publisher: string;
  publicationYear: string;
  coverImageUrl: string;
  description: string;
  totalCopies: string;
}
export type BookField = keyof BookFormValues;
export type BookFormErrors = Partial<Record<BookField, string>>;

/** Top-to-bottom, so "focus the first error" matches what the user sees. */
export const FIELD_ORDER: BookField[] = [
  "title",
  "author",
  "isbn",
  "category",
  "publisher",
  "publicationYear",
  "coverImageUrl",
  "description",
  "totalCopies",
];

export const emptyValues: BookFormValues = {
  title: "",
  author: "",
  isbn: "",
  category: "",
  publisher: "",
  publicationYear: "",
  coverImageUrl: "",
  description: "",
  totalCopies: "1",
};

export function valuesFromBook(b: BookDto): BookFormValues {
  return {
    title: b.title,
    author: b.author,
    isbn: b.isbn ?? "",
    category: b.category,
    publisher: b.publisher,
    publicationYear: b.publicationYear === null ? "" : String(b.publicationYear),
    coverImageUrl: b.coverImageUrl ?? "",
    description: b.description,
    totalCopies: String(b.totalCopies),
  };
}

function toRaw(v: BookFormValues): BookInputRaw {
  const year = v.publicationYear.trim();
  const total = v.totalCopies.trim();
  return {
    title: v.title,
    author: v.author,
    isbn: v.isbn,
    category: v.category,
    publisher: v.publisher,
    publicationYear: year === "" ? null : Number(year),
    coverImageUrl: v.coverImageUrl,
    description: v.description,
    // Empty stays undefined so the schema's "Enter at least 1 copy." applies.
    totalCopies: total === "" ? (undefined as unknown as number) : Number(total),
  };
}

export function validateBook(v: BookFormValues): { data: BookInput | null; errors: BookFormErrors } {
  const r = BookInputSchema.safeParse(toRaw(v));
  if (r.success) return { data: r.data, errors: {} };
  const errors: BookFormErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && key in emptyValues && !errors[key as BookField])
      errors[key as BookField] = issue.message;
  }
  return { data: null, errors };
}

export const isDirty = (a: BookFormValues, b: BookFormValues) => FIELD_ORDER.some((k) => a[k] !== b[k]);

export const isHttpsUrl = (u: string) => /^https:\/\/[^\s]+$/i.test(u.trim());
