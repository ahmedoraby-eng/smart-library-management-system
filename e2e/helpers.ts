import { expect, type Page } from "@playwright/test";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set; run these specs through "npm run e2e".`);
  return v;
}

/** The book the librarian flow adds; the admin flow checks that a reset removes it. One title per run. */
export const bookTitle = (): string => env("E2E_BOOK_TITLE");

export async function signIn(page: Page, kind: "LIBRARIAN" | "ADMIN"): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("signin-email").fill(env(`DEMO_${kind}_EMAIL`));
  await page.getByTestId("signin-password").fill(env(`DEMO_${kind}_PASSWORD`));
  await page.getByTestId("signin-submit").click();
  await expect(page).toHaveURL(/\/dashboard/);
}
