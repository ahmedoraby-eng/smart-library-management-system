// @vitest-environment jsdom
import type { BookDto } from "@slm/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient";
import { renderWithProviders } from "../../test/render";
import { BookForm } from "./BookForm";

afterEach(() => vi.unstubAllGlobals());

const existing: BookDto = {
  id: "b1",
  title: "Clean Code",
  author: "Robert C. Martin",
  isbn: null,
  description: "",
  category: "Software",
  publisher: "",
  publicationYear: null,
  coverImageUrl: null,
  totalCopies: 3,
  availableCopies: 1,
  activeLoans: 2,
  nextDueAt: null,
  hasLoanHistory: true,
  archived: false,
  version: 4,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  new ApiError({ type: "about:blank", title: code, status, code, ...extra });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function setup(props: Partial<React.ComponentProps<typeof BookForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const user = userEvent.setup();
  await renderWithProviders(<BookForm categories={[]} onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  await screen.findByTestId("book-form");
  return { user, onSubmit, onCancel };
}
const field = (name: string) => screen.getByTestId(`field-${name}`) as HTMLInputElement;
const fillValid = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(field("title"), "Dune");
  await user.type(field("author"), "Frank Herbert");
  await user.type(field("category"), "Fiction");
};
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByTestId("save-book"));

describe("BookForm server error mapping, edge cases", () => {
  it("an error that isn't an API problem (e.g. network down) shows the general message and keeps the input", async () => {
    const { user } = await setup({ onSubmit: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    await fillValid(user);
    await save(user);
    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Couldn't save the book. Nothing was saved. Try again.",
    );
    expect(field("title")).toHaveValue("Dune");
    expect(screen.getByTestId("save-book")).toBeEnabled();
  });

  it.each([401, 403])("a %i is redirected globally, so the form shows no message of its own", async (status) => {
    const onSubmit = vi.fn().mockRejectedValue(problem(status, "AUTH"));
    const { user } = await setup({ onSubmit });
    await fillValid(user);
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("save-book")).toBeEnabled());
    expect(screen.queryByTestId("form-error")).not.toBeInTheDocument();
  });

  it("another 4xx (e.g. 404, 429) shows the general message", async () => {
    const { user } = await setup({ onSubmit: vi.fn().mockRejectedValue(problem(429, "RATE_LIMITED")) });
    await fillValid(user);
    await save(user);
    expect(await screen.findByTestId("form-error")).toBeInTheDocument();
  });

  it("VALIDATION_FAILED for a field the form doesn't have goes to the general message", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        problem(400, "VALIDATION_FAILED", { errors: [{ field: "shelf", message: "Unknown shelf." }] }),
      );
    const { user } = await setup({ onSubmit });
    await fillValid(user);
    await save(user);
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Unknown shelf.");
  });

  it("VALIDATION_FAILED with a field error and an unmapped one shows both; the first error per field wins", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      problem(400, "VALIDATION_FAILED", {
        errors: [
          { field: "author", message: "First author problem." },
          { field: "author", message: "Second author problem." },
          { field: "shelf", message: "Unknown shelf." },
        ],
      }),
    );
    const { user } = await setup({ onSubmit });
    await fillValid(user);
    await save(user);
    expect(await screen.findByText("First author problem.")).toBeInTheDocument();
    expect(screen.queryByText("Second author problem.")).not.toBeInTheDocument();
    expect(screen.getByTestId("form-error")).toHaveTextContent("Unknown shelf.");
    await waitFor(() => expect(field("author")).toHaveFocus());
  });

  it("VALIDATION_FAILED with no field errors uses the problem's detail, or a default line", async () => {
    const detailed = await setup({
      onSubmit: vi.fn().mockRejectedValue(problem(400, "VALIDATION_FAILED", { detail: "The request was malformed." })),
    });
    await fillValid(detailed.user);
    await save(detailed.user);
    expect(await screen.findByTestId("form-error")).toHaveTextContent("The request was malformed.");
  });

  it("VALIDATION_FAILED with nothing to say falls back to 'Check the highlighted fields'", async () => {
    const { user } = await setup({
      onSubmit: vi.fn().mockRejectedValue(problem(400, "VALIDATION_FAILED", { errors: [] })),
    });
    await fillValid(user);
    await save(user);
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Check the highlighted fields and try again.");
  });

  it("DUPLICATE_ISBN without context still explains, and offers no link", async () => {
    const { user } = await setup({ onSubmit: vi.fn().mockRejectedValue(problem(409, "DUPLICATE_ISBN")) });
    await fillValid(user);
    await save(user);
    expect(await screen.findByText(/Another book already uses this ISBN:/)).toHaveTextContent("another book");
    expect(screen.queryByTestId("open-duplicate")).not.toBeInTheDocument();
    await waitFor(() => expect(field("isbn")).toHaveFocus());
  });

  it("TOTAL_BELOW_LOANED uses the singular for one copy", async () => {
    const onSubmit = vi.fn().mockRejectedValue(problem(409, "TOTAL_BELOW_LOANED", { context: { onLoan: 1 } }));
    const { user } = await setup({ book: existing, onSubmit });
    await save(user);
    expect(await screen.findByText("You can't go below 1 copy — 1 is on loan right now.")).toBeInTheDocument();
  });

  it("TOTAL_BELOW_LOANED without context reads as 0 copies", async () => {
    const onSubmit = vi.fn().mockRejectedValue(problem(409, "TOTAL_BELOW_LOANED"));
    const { user } = await setup({ book: existing, onSubmit });
    await save(user);
    expect(await screen.findByText("You can't go below 0 copies — 0 are on loan right now.")).toBeInTheDocument();
  });

  it("after a conflict the form refuses further submits until Reload", async () => {
    const onSubmit = vi.fn().mockRejectedValue(problem(409, "STALE_VERSION"));
    const { user } = await setup({ book: existing, onSubmit });
    await save(user);
    await screen.findByTestId("stale-notice");
    await user.type(field("publisher"), "x");
    await user.type(field("publisher"), "{Enter}"); // Enter in a field submits the form
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("a second submit while the first is still saving is ignored", async () => {
    let finish!: () => void;
    const onSubmit = vi.fn().mockImplementation(
      () =>
        new Promise<void>((res) => {
          finish = res;
        }),
    );
    const { user } = await setup({ onSubmit });
    await fillValid(user);
    await user.type(field("title"), "{Enter}");
    await user.type(field("title"), "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByTestId("save-book")).toBeEnabled());
  });

  it("clears an earlier general error when the user submits again", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(problem(500, "INTERNAL")).mockResolvedValue(undefined);
    const { user } = await setup({ onSubmit });
    await fillValid(user);
    await save(user);
    await screen.findByTestId("form-error");
    await save(user);
    await waitFor(() => expect(screen.queryByTestId("form-error")).not.toBeInTheDocument());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

describe("BookForm fields and helpers", () => {
  it("reports dirty state to the parent: dirty on typing, clean again when reverted", async () => {
    const onDirtyChange = vi.fn();
    const { user } = await setup({ book: existing, onDirtyChange });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.type(field("publisher"), "A");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.clear(field("publisher"));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("Cancel calls onCancel; the primary button says 'Save changes' when editing", async () => {
    const { user, onCancel } = await setup({ book: existing });
    expect(screen.getByTestId("save-book")).toHaveTextContent("Save changes");
    expect(screen.getByRole("form", { name: "Edit book" })).toBeInTheDocument();
    await user.click(screen.getByTestId("cancel-book"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("offers the known categories as suggestions", async () => {
    await setup({ categories: ["Fiction", "Software"] });
    const list = document.getElementById("book-categories")!;
    expect([...list.querySelectorAll("option")].map((o) => o.getAttribute("value"))).toEqual(["Fiction", "Software"]);
  });

  it("previews a valid https cover with the typed title, and the counter turns red over 2,000 characters", async () => {
    const { user } = await setup();
    await user.type(field("title"), "Dune");
    await user.type(field("coverImageUrl"), "https://img.test/dune.jpg");
    const preview = await screen.findByTestId("cover-preview");
    expect(preview.querySelector("img")).toHaveAttribute("src", "https://img.test/dune.jpg");
    await user.click(field("description"));
    await user.paste("x".repeat(2001));
    const counter = screen.getByTestId("description-counter");
    expect(counter).toHaveTextContent("2,001 / 2,000");
    expect(counter.className).toContain("text-danger-700");
  });

  it("'Available after saving' never goes negative and is a dash for an invalid total", async () => {
    const { user } = await setup({ book: existing });
    await user.clear(field("totalCopies"));
    await user.type(field("totalCopies"), "1"); // fewer than the 2 on loan
    expect(screen.getByTestId("available-after")).toHaveTextContent("Available after saving: 0");
    await user.clear(field("totalCopies"));
    expect(screen.getByTestId("available-after")).toHaveTextContent("Available after saving: —");
    await user.type(field("totalCopies"), "2.5");
    expect(screen.getByTestId("available-after")).toHaveTextContent("Available after saving: —");
  });
});

describe("BookForm ISBN look up, remaining outcomes", () => {
  const typeIsbn = async (user: ReturnType<typeof userEvent.setup>) => user.type(field("isbn"), "978-0-13-235088-4");

  it("'not found' tells the user to fill the fields in by hand and changes nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ found: false })),
    );
    const { user } = await setup();
    await typeIsbn(user);
    await user.click(screen.getByTestId("isbn-lookup"));
    expect(await screen.findByTestId("isbn-lookup-hint")).toHaveTextContent(
      "No details found for this ISBN. Fill the fields in by hand.",
    );
    expect(field("title")).toHaveValue("");
  });

  it("a failed request shows the same hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ type: "about:blank", title: "x", status: 502, code: "UPSTREAM" }, 502)),
    );
    const { user } = await setup();
    await typeIsbn(user);
    await user.click(screen.getByTestId("isbn-lookup"));
    expect(await screen.findByTestId("isbn-lookup-hint")).toHaveTextContent("No details found");
  });

  it("fills every empty field from the result, including year, description and cover; null parts stay empty", async () => {
    const f = vi.fn(async () =>
      json({
        found: true,
        book: {
          title: "Clean Code",
          author: null,
          publisher: "Prentice Hall",
          publicationYear: 2008,
          description: "A handbook.",
          coverImageUrl: "https://img.test/c.jpg",
        },
      }),
    );
    vi.stubGlobal("fetch", f);
    const { user } = await setup();
    await typeIsbn(user);
    await user.click(screen.getByTestId("isbn-lookup"));
    expect(await screen.findByText("Filled from Open Library — check before saving.")).toBeInTheDocument();
    expect(field("title")).toHaveValue("Clean Code");
    expect(field("author")).toHaveValue("");
    expect(field("publisher")).toHaveValue("Prentice Hall");
    expect(field("publicationYear")).toHaveValue("2008");
    expect(field("description")).toHaveValue("A handbook.");
    expect(field("coverImageUrl")).toHaveValue("https://img.test/c.jpg");
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe("/api/books/isbn-lookup?isbn=9780132350884");
  });

  it("a null publication year leaves the field empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          found: true,
          book: {
            title: "T",
            author: "A",
            publisher: null,
            publicationYear: null,
            description: null,
            coverImageUrl: null,
          },
        }),
      ),
    );
    const { user } = await setup();
    await typeIsbn(user);
    await user.click(screen.getByTestId("isbn-lookup"));
    await screen.findByTestId("isbn-lookup-hint");
    expect(field("publicationYear")).toHaveValue("");
    expect(field("author")).toHaveValue("A");
  });

  it("a second click while the first request is running does not send another", async () => {
    let finish!: (r: Response) => void;
    const f = vi.fn(
      () =>
        new Promise<Response>((res) => {
          finish = res;
        }),
    );
    vi.stubGlobal("fetch", f);
    const { user } = await setup();
    await typeIsbn(user);
    await user.click(screen.getByTestId("isbn-lookup"));
    await user.click(screen.getByTestId("isbn-lookup"));
    expect(f).toHaveBeenCalledTimes(1);
    finish(json({ found: false }));
    await screen.findByTestId("isbn-lookup-hint");
  });
});
