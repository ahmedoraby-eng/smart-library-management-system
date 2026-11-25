import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// SLM-20: the desk from the keyboard. Reads only (no borrow is confirmed), so it does not depend on the other specs.
test("librarian: ⌘K → member → Borrow for → Borrow page pre-filled; ⌘K → overdue → Loan history filtered", async ({
  page,
}) => {
  await signIn(page, "LIBRARIAN");

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByTestId("command-palette");
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("combobox")).toBeFocused();
  await palette.getByRole("combobox").fill("nour");
  // Search is fuzzy, so other names may be listed too: pick the one we want (Enter is covered by the unit tests).
  await palette.getByRole("option", { name: /Borrow for Nour Hassan/ }).click();
  await expect(page).toHaveURL(/\/circulation\/borrow\?member=[0-9a-f-]{36}$/);
  await expect(page.getByTestId("picked-member")).toContainText("Nour Hassan");
  await expect(palette).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");
  await palette.getByRole("combobox").fill("overdue");
  await palette.getByRole("option", { name: /Loan history · Overdue/ }).click();
  await expect(page).toHaveURL(/\/loans\?status=OVERDUE$/);
  await expect(page.getByTestId("filter-status")).toHaveValue("OVERDUE");

  // Esc closes it.
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
});
