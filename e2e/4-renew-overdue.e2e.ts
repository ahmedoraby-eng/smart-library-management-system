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
  await page.getByRole("link", { name: "Loan history" }).click();
  await page.getByTestId("loan-search").fill("Atomic Habits");
  const history = page.getByTestId("history-row").filter({ hasText: "Mariam Adel" });
  await expect(history).toHaveCount(1);
  await expect(history.getByTestId("renewed-badge")).toBeVisible();
});
