import { type Cookie, expect, type Page } from "@playwright/test";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set; run these specs through "npm run e2e".`);
  return v;
}

/** The book the librarian flow adds; the admin flow checks that a reset removes it. One title per run. */
export const bookTitle = (): string => env("E2E_BOOK_TITLE");

/**
 * Sessions already made in this run (workers: 1). The API allows 5 demo sign-ins a minute per address, and the suite
 * has more specs than that, so a spec reuses the session of an earlier one when it is still valid (a demo reset can
 * end it: then it signs in again through the form).
 */
const sessions = new Map<string, Cookie[]>();

export async function signIn(page: Page, kind: "LIBRARIAN" | "ADMIN"): Promise<void> {
  const saved = sessions.get(kind);
  if (saved) {
    await page.context().addCookies(saved);
    if ((await page.request.get("/api/me")).ok()) {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard/);
      return;
    }
    await page.context().clearCookies();
  }
  await page.goto("/signin");
  await page.getByTestId("signin-email").fill(env(`DEMO_${kind}_EMAIL`));
  await page.getByTestId("signin-password").fill(env(`DEMO_${kind}_PASSWORD`));
  await page.getByTestId("signin-submit").click();
  await expect(page).toHaveURL(/\/dashboard/);
  sessions.set(kind, await page.context().cookies());
}
