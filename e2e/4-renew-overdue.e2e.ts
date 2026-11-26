import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// SLM-18. Runs after the admin spec's reset, so the seeded loans are fresh: four overdue ones (the most
// overdue is Yara Samy's Clean Code) and Mariam Adel's Atomic Habits, borrowed a day ago.
test("librarian sees overdue loans in the bell and renews a loan once", async ({ page }) => {
  await signIn(page, "LIBRARIAN");

  // Overdue bell: count in the badge and the accessible name; the most overdue first; a link scoped to it.
  const bell = page.getByTestId("overdue-bell");
  await expect(bell).toHaveAccessibleName(/^Overdue loans: [1-9]\d*$/);
  await expect(bell.getByTestId("overdue-count")).toBeVisible();
  await bell.click();
  const popover = page.getByRole("dialog", { name: "Overdue loans" });
  const first = popover.getByTestId("overdue-item").first();
  await expect(first).toContainText("Yara Samy");
  await expect(first).toContainText("Clean Code");
  await expect(first).toContainText(/\d+ days? overdue/);
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(bell).toBeFocused();

  await bell.click();
  await first.click();
  await expect(page).toHaveURL(/\/loans\?.*status=OVERDUE/);
  await expect(page).toHaveURL(/memberId=/);
  const overdueRow = page.getByTestId("history-row");
  await expect(overdueRow).toHaveCount(1);
  await expect(overdueRow).toContainText("Yara Samy");
  await expect(overdueRow).toHaveAttribute("data-status", "OVERDUE");
  await expect(overdueRow.getByTestId("renew-button")).toBeDisabled();

  // View all overdue opens the whole overdue list.
  await bell.click();
  await page.getByTestId("overdue-view-all").click();
  await expect(page).toHaveURL(/\/loans\?.*status=OVERDUE/);
  await expect(page).not.toHaveURL(/memberId=/);

  // Renew an eligible loan on the Return list: toast with the new due date, then the Renewed marker and no second renewal.
  await page.getByRole("link", { name: "Circulation" }).click();
  await page.getByTestId("tab-return").click();
  await page.getByTestId("return-search").fill("Atomic Habits");
  const row = page.getByTestId("loan-row").filter({ hasText: "Mariam Adel" });
  await expect(row).toHaveCount(1);
  await row.getByTestId("renew-button").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Renewed: Atomic Habits. New due date:" })).toBeVisible();
  await expect(row.getByTestId("renewed-badge")).toBeVisible();
  await expect(row.getByTestId("renew-button")).toBeDisabled();
  await expect(row.getByTestId("renew-blocked")).toHaveAttribute("title", /Already renewed once/);

  // Loan history shows the marker too.
  await page.getByTestId("nav-loans").click();
  await page.getByTestId("loan-search").fill("Atomic Habits");
  const history = page.getByTestId("history-row").filter({ hasText: "Mariam Adel" });
  await expect(history).toHaveCount(1);
  await expect(history.getByTestId("renewed-badge")).toBeVisible();
});

// D-46-1 and D-46-2 (QA on #46): the bell sits in the top-right corner without moving the page, its popover opens
// under it, and Loan history with Renew buttons doesn't scroll sideways at 1280 px (SLM-7 AC4).
test("SLM-18 layout at 1280 px: bell in the corner, popover under it, no sideways scroll in Loan history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "LIBRARIAN");
  await page.goto("/loans");
  await expect(page.getByTestId("history-row").first()).toBeVisible();
  await expect(page.getByTestId("renew-button").first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const main = document.querySelector("main")!.getBoundingClientRect();
    const h1 = document.querySelector("main h1")!.getBoundingClientRect();
    const bell = document.querySelector('[data-testid="overdue-bell"]')!.getBoundingClientRect();
    const scrolls = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const card = document.querySelector('[data-testid="loans-table"]')!.parentElement!.getBoundingClientRect();
    const clipped = Array.from(document.querySelectorAll('[data-testid="renew-button"]')).filter(
      (b) => b.getBoundingClientRect().right > card.right + 0.5,
    ).length;
    return { mainRight: main.right, mainTop: main.top, h1Top: h1.top, bell, scrolls, clipped };
  });
  expect(layout.scrolls, "the page scrolls sideways").toBe(false);
  expect(layout.clipped, "Renew buttons cut off at the card edge").toBe(0);
  expect(layout.h1Top - layout.mainTop, "the page head moved down").toBeLessThanOrEqual(28);
  expect(layout.mainRight - layout.bell.right, "the bell is not in the top-right corner").toBeLessThan(48);
  expect(layout.bell.top - layout.mainTop).toBeLessThan(12);

  await page.getByTestId("overdue-bell").click();
  const pop = await page.getByTestId("overdue-popover").boundingBox();
  expect(pop).not.toBeNull();
  expect(Math.abs(pop!.x + pop!.width - layout.bell.right), "the popover is not under the bell").toBeLessThan(4);
  expect(pop!.y).toBeGreaterThanOrEqual(layout.bell.bottom);
  expect(pop!.y - layout.bell.bottom).toBeLessThan(12);
});
