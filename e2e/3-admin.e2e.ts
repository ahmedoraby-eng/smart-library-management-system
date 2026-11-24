import { expect, test } from "@playwright/test";
import { bookTitle, signIn } from "./helpers";

test("admin resets the demo data and the librarian's book is gone", async ({ page }) => {
  const title = bookTitle();
  await signIn(page, "ADMIN");

  // The book from the librarian flow exists before the reset
  await page.goto(`/books?q=${encodeURIComponent(title)}`);
  await expect(page.getByTestId("book-row").filter({ hasText: title })).toHaveCount(1);

  await page.goto("/admin/users");
  await page.getByTestId("reset-demo").click();
  await page.getByTestId("reset-dialog").getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Demo data reset." })).toBeVisible();

  await page.goto(`/books?q=${encodeURIComponent(title)}`);
  await expect(page.getByTestId("books-empty-filtered")).toBeVisible();
  await expect(page.getByTestId("book-row")).toHaveCount(0);
});
