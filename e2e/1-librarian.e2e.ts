import { expect, test } from "@playwright/test";
import { bookTitle, signIn } from "./helpers";

test("librarian adds a book, borrows it for a member, returns it", async ({ page }) => {
  const title = bookTitle();
  await signIn(page, "LIBRARIAN");

  // Add book
  await page.getByRole("link", { name: "Books" }).first().click();
  await page.getByTestId("add-book").click();
  await page.getByTestId("field-title").fill(title);
  await page.getByTestId("field-author").fill("E2E Author");
  await page.getByTestId("field-category").fill("E2E Testing");
  await page.getByTestId("field-totalCopies").fill("1");
  await page.getByTestId("save-book").click();
  await expect(page.getByTestId("book-detail-title")).toContainText(title);
  await expect(page.getByTestId("copies-available")).toHaveText("1");

  // Borrow for a seeded member
  await page.getByRole("link", { name: "Circulation" }).click();
  await page.getByTestId("tab-borrow").click();
  await page.getByTestId("member-combobox").getByRole("combobox").fill("Nour Hassan");
  await page
    .getByRole("option", { name: /Nour Hassan/ })
    .first()
    .click();
  await page.getByTestId("book-combobox").getByRole("combobox").fill(title);
  await page
    .getByRole("option", { name: new RegExp(title) })
    .first()
    .click();
  await page.getByTestId("confirm-borrow").click();
  await expect(page.getByTestId("borrow-success")).toBeVisible();

  // Return it
  await page.getByTestId("tab-return").click();
  await page.getByTestId("return-search").fill(title);
  const loan = page.getByTestId("loan-row").filter({ hasText: title });
  await expect(loan).toHaveCount(1);
  await loan.getByTestId("return-button").click();
  await page.getByTestId("return-dialog").getByRole("button", { name: "Confirm return" }).click();
  await expect(loan).toHaveCount(0);

  // Loan history shows it as Returned (the sidebar link: the emptied Return list also offers "Open Loan history")
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Loan history" }).click();
  await page.getByTestId("loan-search").fill(title);
  const row = page.getByTestId("history-row").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-status", "RETURNED");
  await expect(row).toContainText("Returned");
});

test("librarian sees «More like this» on a book page and opens a suggestion (SLM-19)", async ({ page }) => {
  await signIn(page, "LIBRARIAN");
  // The seed is indexed with the fake embedder by run.ts; the strip reads those stored vectors.
  const found = await page.request.get(`/api/books?q=${encodeURIComponent("H Is for Hawk")}`);
  const hawk = ((await found.json()) as { items: Array<{ id: string; title: string }> }).items.find(
    (b) => b.title === "H Is for Hawk",
  )!;
  await page.goto(`/books/${hawk.id}`);
  await expect(page.getByTestId("book-detail-title")).toContainText("H Is for Hawk");

  const strip = page.getByTestId("similar-books");
  await expect(strip.getByRole("heading", { name: "More like this" })).toBeVisible();
  const links = strip.getByTestId("similar-book-link");
  await expect(links).toHaveCount(4);
  await expect(links.nth(0)).toBeVisible();
  const firstTwo = [await links.nth(0).innerText(), await links.nth(1).innerText()].sort();
  expect(firstTwo).toEqual(["A Grief Observed", "Crying in H Mart"]);
  await expect(strip.getByTestId("similar-borrow").first()).toBeVisible(); // seed copies are on the shelf

  await strip.getByRole("link", { name: "Crying in H Mart" }).click();
  await expect(page.getByTestId("book-detail-title")).toContainText("Crying in H Mart");
  await expect(page.getByTestId("similar-book-link").first()).toBeVisible();
  await expect(page.getByTestId("similar-book-link").filter({ hasText: /^Crying in H Mart$/ })).toHaveCount(0);
});
