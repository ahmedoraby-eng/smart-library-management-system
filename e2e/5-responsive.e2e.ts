import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// SLM-15 responsive fixes (Salma's live E2E, areas 08 and 10): the page never scrolls sideways at phone and tablet
// widths, book page included (wide tables scroll inside their own card), and at 1280 px the Books table fits its card.
const pages = ["/dashboard", "/books", "/loans", "/members"];

test("no sideways page scroll at 375 and 768 px; the Books table fits at 1280 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/signin");
  await expect(page.getByTestId("signin-privacy")).toBeVisible();
  const scrolls = () =>
    page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(await scrolls(), "375 px /signin scrolls sideways").toBe(false);

  await signIn(page, "LIBRARIAN");
  // A book page with a Borrow button, active loans and "More like this" (Salma's live re-run: Clean Code at 375 px).
  const found = await (await page.request.get("/api/books?q=Clean%20Code")).json();
  const cleanCode = (found.items as { id: string; title: string }[]).find((b) => b.title === "Clean Code")!;
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator(".slm-table").first()).toBeVisible();
      expect(await scrolls(), `${width} px ${path} scrolls sideways`).toBe(false);
    }
    await page.goto(`/books/${cleanCode.id}`);
    await expect(page.getByTestId("copies-card")).toBeVisible();
    expect(await scrolls(), `${width} px book page scrolls sideways`).toBe(false);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/books");
  await expect(page.getByTestId("books-table")).toBeVisible();
  const inner = await page.getByTestId("books-table").evaluate((t) => {
    const box = t.parentElement!;
    return { scroll: box.scrollWidth, client: box.clientWidth };
  });
  expect(inner.scroll, "the Books table scrolls inside its card at 1280 px").toBeLessThanOrEqual(inner.client);
});
