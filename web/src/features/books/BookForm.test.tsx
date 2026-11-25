// @vitest-environment jsdom
import type { BookDto } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient";
import { renderWithProviders } from "../../test/render";
import { BookForm } from "./BookForm";

const YEAR = new Date().getUTCFullYear();

const existing: BookDto = {
  id: "b1",
  title: "Clean Code",
  author: "Robert C. Martin",
  isbn: "9780132350884",
  description: "",
  category: "Software",
  publisher: "Prentice Hall",
  publicationYear: 2008,
  coverImageUrl: null,
  totalCopies: 5,
  availableCopies: 3,
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

async function setup(props: Partial<React.ComponentProps<typeof BookForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const user = userEvent.setup();
  await renderWithProviders(
    <BookForm categories={["Fiction", "Software"]} onSubmit={onSubmit} onCancel={onCancel} {...props} />,
  );
  await screen.findByTestId("book-form");
  return { user, onSubmit, onCancel };
}

const field = (name: string) => screen.getByTestId(`field-${name}`);
const fillValid = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(field("title"), "Dune");
  await user.type(field("author"), "Frank Herbert");
  await user.type(field("category"), "Fiction");
};

describe("BookForm validation (ux.md §3.4)", () => {
  it("blocks submit and shows the required-field messages", async () => {
    const { user, onSubmit } = await setup();
    await user.click(screen.getByTestId("save-book"));
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
    expect(screen.getByText("Enter an author.")).toBeInTheDocument();
    expect(screen.getByText("Choose or type a category.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    // focus goes to the first invalid field
    await waitFor(() => expect(field("title")).toHaveFocus());
    expect(field("title")).toHaveAttribute("aria-invalid", "true");
  });

  it("validates a field on blur, not while the form is untouched", async () => {
    const { user } = await setup();
    expect(screen.queryByText("Enter a title.")).not.toBeInTheDocument();
    await user.click(field("title"));
    await user.tab();
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
    expect(screen.queryByText("Enter an author.")).not.toBeInTheDocument();
  });

  it("rejects an ISBN with a bad checksum and accepts hyphenated valid ones", async () => {
    const { user } = await setup();
    await user.type(field("isbn"), "9780306406158"); // last digit should be 7
    await user.tab();
    expect(await screen.findByText("Enter a valid ISBN-10 or ISBN-13.")).toBeInTheDocument();
    await user.clear(field("isbn"));
    await user.type(field("isbn"), "978-0-306-40615-7");
    await user.tab();
    await waitFor(() => expect(screen.queryByText("Enter a valid ISBN-10 or ISBN-13.")).not.toBeInTheDocument());
  });

  it("limits the publication year to 1450 – current year", async () => {
    const { user } = await setup();
    const msg = `Enter a year between 1450 and ${YEAR}.`;
    await user.type(field("publicationYear"), "1449");
    await user.tab();
    expect(await screen.findByText(msg)).toBeInTheDocument();
    await user.clear(field("publicationYear"));
    await user.type(field("publicationYear"), String(YEAR + 1));
    await user.tab();
    expect(await screen.findByText(msg)).toBeInTheDocument();
    await user.clear(field("publicationYear"));
    await user.type(field("publicationYear"), "1450");
    await user.tab();
    await waitFor(() => expect(screen.queryByText(msg)).not.toBeInTheDocument());
  });

  it("requires at least 1 total copy", async () => {
    const { user } = await setup();
    await user.clear(field("totalCopies"));
    await user.type(field("totalCopies"), "0");
    await user.tab();
    expect(await screen.findByText("Enter at least 1 copy.")).toBeInTheDocument();
    await user.clear(field("totalCopies"));
    await user.tab();
    expect(screen.getByText("Enter at least 1 copy.")).toBeInTheDocument();
  });

  it("requires an https cover URL and counts the description", async () => {
    const { user } = await setup();
    await user.type(field("coverImageUrl"), "http://example.com/a.jpg");
    await user.tab();
    expect(await screen.findByText("Enter a full image URL starting with https://.")).toBeInTheDocument();
    expect(screen.queryByTestId("cover-preview")).not.toBeInTheDocument();

    await user.type(field("description"), "abc");
    expect(screen.getByTestId("description-counter")).toHaveTextContent("3 / 2,000");
  });

  it("submits normalised data when valid", async () => {
    const { user, onSubmit } = await setup();
    await fillValid(user);
    await user.type(field("isbn"), "978-0-306-40615-7");
    await user.type(field("publicationYear"), "1965");
    await user.clear(field("totalCopies"));
    await user.type(field("totalCopies"), "3");
    await user.click(screen.getByTestId("save-book"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      title: "Dune",
      author: "Frank Herbert",
      category: "Fiction",
      isbn: "9780306406157",
      publicationYear: 1965,
      totalCopies: 3,
      publisher: "",
      description: "",
      coverImageUrl: null,
    });
  });
});

describe("BookForm available copies line", () => {
  it("equals total when adding", async () => {
    const { user } = await setup();
    await user.clear(field("totalCopies"));
    await user.type(field("totalCopies"), "7");
    expect(screen.getByTestId("available-after")).toHaveTextContent("Available after saving: 7");
  });

  it("is total minus copies on loan when editing", async () => {
    const { user } = await setup({ book: existing });
    expect(screen.getByTestId("available-after")).toHaveTextContent("Available after saving: 3");
    await user.clear(field("totalCopies"));
    await user.type(field("totalCopies"), "10");
    expect(screen.getByTestId("available-after")).toHaveTextContent("Available after saving: 8");
  });
});

describe("BookForm server errors", () => {
  it("maps 409 TOTAL_BELOW_LOANED onto Total copies", async () => {
    const onSubmit = vi.fn().mockRejectedValue(problem(409, "TOTAL_BELOW_LOANED", { context: { onLoan: 2 } }));
    const { user } = await setup({ book: existing, onSubmit });
    await user.click(screen.getByTestId("save-book"));
    expect(await screen.findByText("You can't go below 2 copies — 2 are on loan right now.")).toBeInTheDocument();
    expect(field("totalCopies")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(field("totalCopies")).toHaveFocus());
    // editing the field clears the server message
    await user.type(field("totalCopies"), "0");
    expect(screen.queryByText(/You can't go below/)).not.toBeInTheDocument();
  });

  it("maps 409 DUPLICATE_ISBN to the ISBN field with an Open it link", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(problem(409, "DUPLICATE_ISBN", { context: { bookId: "b9", title: "Clean Code" } }));
    const { user } = await setup({ onSubmit });
    await fillValid(user);
    await user.click(screen.getByTestId("save-book"));
    const link = await screen.findByTestId("open-duplicate");
    expect(link).toHaveAttribute("href", "/books/b9");
    expect(link.closest("p")).toHaveTextContent("Another book already uses this ISBN: Clean Code.");
    await waitFor(() => expect(field("isbn")).toHaveFocus());
  });

  it("maps 400 VALIDATION_FAILED errors to their fields", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      problem(400, "VALIDATION_FAILED", {
        errors: [{ field: "title", message: "Keep the title under 200 characters." }],
      }),
    );
    const { user } = await setup({ onSubmit });
    await fillValid(user);
    await user.click(screen.getByTestId("save-book"));
    expect(await screen.findByText("Keep the title under 200 characters.")).toBeInTheDocument();
    await waitFor(() => expect(field("title")).toHaveFocus());
  });

  it("shows the edit-conflict notice, disables Save and offers Reload", async () => {
    const onSubmit = vi.fn().mockRejectedValue(problem(409, "STALE_VERSION"));
    const onReload = vi.fn();
    const { user } = await setup({ book: existing, onSubmit, onReload });
    await user.click(screen.getByTestId("save-book"));
    const notice = await screen.findByTestId("stale-notice");
    expect(notice).toHaveTextContent("Someone else changed this book while you were editing.");
    expect(screen.getByTestId("save-book")).toBeDisabled();
    await user.click(within(notice).getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("shows a general error for server failures and keeps the input", async () => {
    const onSubmit = vi.fn().mockRejectedValue(problem(500, "INTERNAL"));
    const { user } = await setup({ onSubmit });
    await fillValid(user);
    await user.click(screen.getByTestId("save-book"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Couldn't save the book. Nothing was saved. Try again.",
    );
    expect(field("title")).toHaveValue("Dune");
  });
});
