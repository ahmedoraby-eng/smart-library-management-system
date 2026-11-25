import { expect, test } from "@playwright/test";
import { SignJWT } from "jose";
import pg from "pg";
import { bookTitle, env } from "./helpers";

// Test-only fixture. Supervisors only come from Google sign-in, so there is no password path to test.
// We insert a Supervisor row into this run's throwaway database and sign a session cookie with this
// run's random SESSION_SECRET, the same way api/test/support.ts `cookieFor` does. The app has no bypass:
// the cookie is an ordinary session that only works because we know the throwaway secret.
const SESSION_COOKIE = "slm_session"; // api/src/platform/security/session.ts

async function supervisorCookie(): Promise<string> {
  const client = new pg.Client({ connectionString: env("E2E_DATABASE_URL") });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO staff_users (email, full_name, role) VALUES ('supervisor@e2e.test', 'E2E Supervisor', 'SUPERVISOR')
       ON CONFLICT (lower(email)) DO UPDATE SET role = 'SUPERVISOR', status = 'ACTIVE' RETURNING id`,
    );
    return await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(rows[0]!.id)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(env("E2E_SESSION_SECRET")));
  } finally {
    await client.end();
  }
}

test("supervisor is read-only", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: SESSION_COOKIE, value: await supervisorCookie(), url: baseURL! }]);
  const title = bookTitle();

  // Books: no add, no borrow shortcut
  await page.goto("/books");
  await expect(page.getByTestId("books-table")).toBeVisible();
  await expect(page.getByTestId("add-book")).toHaveCount(0);
  await expect(page.getByTestId("row-borrow")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Circulation" })).toHaveCount(0);

  // Book detail: no edit, no delete, no borrow
  await page.getByTestId("book-title").first().click();
  await expect(page.getByTestId("book-detail-title")).toBeVisible();
  await expect(page.getByTestId("edit-book")).toHaveCount(0);
  await expect(page.getByTestId("detail-actions")).toHaveCount(0);
  await expect(page.getByTestId("detail-borrow")).toHaveCount(0);

  // Circulation by URL ends on /403
  await page.goto("/circulation/borrow");
  await expect(page).toHaveURL(/\/403/);
  await page.goto("/circulation/return");
  await expect(page).toHaveURL(/\/403/);

  // The API refuses writes
  const res = await page.request.post("/api/books", {
    headers: { origin: baseURL! },
    data: { title, author: "x", category: "x", totalCopies: 1 },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe("FORBIDDEN");
});
