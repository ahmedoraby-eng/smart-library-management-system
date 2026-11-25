# Requirements traceability matrix (RTM)

Every requirement of the assessment, traced to its Jira story, the merged pull request(s) that built it, the tests that prove it, the CI run that ran those tests, and an honest status.

- **Owner:** product owner. **Filled:** 25/11/2026 against `main` at `d6de6ce`; Google sign-in rows updated the same evening after [#43][pr43] went live (`main` at `935735e`).
- **Statuses:** **Done** (built, merged and proven by a test that runs in CI, or checked live where stated) · **Partial** (part of it is missing or not yet verified; the row says what) · **Not done** (not on `main` yet) · **Descoped** (left out on purpose, with the reason). None of the rows is descoped.
- **Terminology.** The assessment says *checked in* = borrowed and *checked out* = returned. The app uses only **Borrow Book** (`POST /api/loans/borrow`) and **Return Book** (`POST /api/loans/{id}/return`).
- **Jira:** project `SLM`. Epics: `SLM-14` (core, the assessment minimum) and `SLM-15` (bonus items). Out of scope on purpose: payments, fees and fines, a member portal, reservations ([ADR-0029](adr/0029-out-scope-payments-fees-member-portal-reservations.md)).

## CI evidence

All tests below run in CI on every pull request and on every push to `main`. Last green runs on `main` (`d6de6ce`):

| Workflow | What it runs | Run on `main` |
|---|---|---|
| `ci` → job **hygiene** | secret scan (gitleaks), forbidden-names check | [ci #45573152599][ci] |
| `ci` → job **ci / Build and test** | `npm run check` (typecheck, dependency rules, lint, format, build); `npm run test:coverage`: API tests on a real PostgreSQL 16 + pgvector, contract tests, web tests (Vitest + Testing Library), 90% coverage gate; production dependency audit | [ci #45573152599][ci] |
| `e2e` | Playwright smoke in Chromium against the app built from the commit: `e2e/1-librarian.e2e.ts`, `e2e/2-supervisor.e2e.ts`, `e2e/3-admin.e2e.ts` | [e2e #45573151913][e2e] |
| `migrations gate` | a PR that changes `migrations/` needs the `migrations-applied` label | runs on PRs only |

Test names below are the `it(...)` titles, shortened. API tests live in `api/test/`, UI tests in `web/src/**`, E2E in `e2e/`.

## Live checks (25/11/2026, 14:33 UTC; Google rows 16:40 UTC)

Public endpoints of https://smart-library.ahmedoraby.workers.dev, checked from the command line:

| Check | Result |
|---|---|
| `GET /` | 200 (the app) |
| `GET /api/health` | `{"status":"ok"}` |
| `GET /api/health?deep=1` | `{"status":"ok","db":"ok","vector":"hnsw"}` (database and vector index reachable) |
| `GET /api/books` without a session | 401 (routes are protected) |
| `GET /api/auth/providers` | `{"google":true,"demo":true}`: Google sign-in and demo sign-in are both on |
| `GET /api/auth/google/start` | 302 to `accounts.google.com` with the production client id, PKCE S256, state and nonce |

Google sign-in was also checked live by QA on 25/11 at about 18:30 Cairo time (Jira SLM-8): start and callback, forged or missing state and tampered cookies refused with no session, rate limits on start and callback, protected routes 401 without a session. The owner then signed in with a real Google account on the live site and was made Admin through Staff users.

The signed-in smoke on the live site (sign in, search, Borrow Book, Return Book; SLM-10 AC3) is **not recorded yet**. The same flows pass in the `e2e` job against the build of every commit.

## Part 1. The assessment, line by line

| O-id | Section | Assessment text (quoted) | Jira | Derived rows | Status |
|---|---|---|---|---|---|
| O-1 | Minimum features | «Book Management: Add, edit, and delete books (title, author + whatever metadata you see fit).» | SLM-1, SLM-7 | R-A1–A12 | **Done** |
| O-2 | Minimum features | «Check-in/Check-out: Mark books as checked in (borrowed) or checked out (returned)» | SLM-4, SLM-5, SLM-3 | R-B1–B13 | **Done** |
| O-3 | Minimum features | «Search: Find books by title, author, or other fields.» | SLM-2 | R-C1–C9 | **Done** |
| O-4 | Requirements | «Complete a working product using any language, framework, or development tool (including AI tools).» | SLM-6, SLM-7 | R-G1, R-G2 | **Done** |
| O-5 | Requirements | «Provide your source code and a brief README explaining how to run it.» | SLM-6 | R-G3, R-G4 | **Done** |
| O-6 | Bonus | «Deploy the app and provide a URL for live testing.» | SLM-10, SLM-11 | R-X1–X3 | **Partial**: deployed and healthy; the README link and the signed-in live smoke are pending |
| O-7 | Bonus | «Use Loom or other video software to record a demo of the app.» | SLM-11, SLM-17 | R-X4, R-X5 | **Not done**: the recording is in progress |
| O-8 | Bonus | «Add an authentication system with SSO, preferably with different user roles and permissions.» | SLM-8 | R-X6–X9 | **Partial**: auth, roles and Google SSO are live and verified; only the public `/privacy` page for the Google consent screen is pending (open PR [#44][pr44]) |
| O-9 | Bonus | «Implement any AI features you can think of.» | SLM-9, SLM-16 | R-X10 | **Done** |
| O-10 | Bonus | «Add extra features as you see fit, to demonstrate your creativity.» | SLM-12, SLM-13 | R-X11 | **Done** |
| O-11 | Evaluation | «Completeness: Does the product work and cover the core features?» | SLM-1–SLM-7 | R-E1 | **Done** |
| O-12 | Evaluation | «Creativity: Are extra features and creative ideas incorporated?» | SLM-9, SLM-12, SLM-13, SLM-16 | R-E2 | **Done** |
| O-13 | Evaluation | «Product Quality: Is the product clean and organized?» | SLM-6, SLM-7, SLM-10, SLM-11 | R-E3 | **Done** |
| O-14 | Evaluation | «Usability: Is the app intuitive» | SLM-7 | R-E4 | **Partial**: no automated accessibility or viewport check |

## Part 2. Derived requirements with evidence

### A. Book management (O-1)

| Req | Requirement | Jira | Merged PR(s) | Tests that prove it | CI | Status |
|---|---|---|---|---|---|---|
| R-A1 | Add books | SLM-1 | [#2][pr2] via [#6][pr6] | `catalog.test.ts` «SLM-1 AC1 create → 201, available = total, timestamps, Location»; `BookForm.test.tsx` «submits normalised data when valid»; `e2e/1-librarian.e2e.ts` «librarian adds a book, borrows it for a member, returns it» | ci, e2e | **Done** |
| R-A2 | Edit books | SLM-1 | [#2][pr2] via [#6][pr6] | `catalog.test.ts` «SLM-1 AC4 total can't drop below copies on loan…», «SLM-1 AC5 outdated version → 409 STALE_VERSION»; `BookForm.test.tsx` «is total minus copies on loan when editing», «shows the edit-conflict notice, disables Save and offers Reload» | ci | **Done** |
| R-A3 | Delete books (Admin only; archive when it has history) | SLM-1 | [#2][pr2] via [#6][pr6] | `catalog.test.ts` «SLM-1 AC6 delete with an open loan → 409», «SLM-1 AC7 past loans only → archived…; never borrowed → deleted», «Supervisor reads but can't create, edit or delete; Librarian can't delete»; `DeleteBookDialog.test.tsx` (3 variants) | ci | **Done** |
| R-A4 | Store title and author | SLM-1 | [#2][pr2] via [#6][pr6] | `catalog.test.ts` «SLM-1 AC1 create…», «SLM-1 AC2 invalid fields → 400…»; `migrations/0001_init.sql` NOT NULL + non-blank checks; `schema.test.ts` | ci | **Done** |
| R-A5 | Other useful metadata | SLM-1 | [#2][pr2] via [#6][pr6] | `contracts/src/books.ts` (isbn, description, category, publisher, publicationYear, coverImageUrl, copies, timestamps); `catalog.test.ts` AC1; `books.cov.test.ts` | ci | **Done** |
| R-A6 | ISBN, description, category, publisher, year, cover URL (+ ISBN lookup) | SLM-1, SLM-13 | [#2][pr2] via [#6][pr6], [#13][pr13] | `catalog.test.ts` «SLM-1 AC2 ISBN hyphens accepted and normalised», «SLM-1 AC3 duplicate ISBN…»; `BookForm.test.tsx` «rejects an ISBN with a bad checksum…», «requires an https cover URL…»; `isbn-lookup.test.ts` «AC2 maps an Open Library record», AC3 not found / timeout / upstream error; `BookFormIsbnLookup.test.tsx` «fills only empty fields and never overwrites typed text» | ci | **Done** |
| R-A7 | Total copies and available copies | SLM-1, SLM-4 | [#2][pr2] via [#6][pr6], [#8][pr8] | `catalog.test.ts` «SLM-1 AC1 … available = total», «derived fields: activeLoans and nextDueAt…»; `BookForm.test.tsx` «equals total when adding» | ci | **Done** |
| R-A8 | Created and modified timestamps | SLM-1 | [#2][pr2] via [#6][pr6] | `catalog.test.ts` «SLM-1 AC1 create → 201, …, timestamps, Location»; `contracts/src/books.ts` `createdAt`, `updatedAt` | ci | **Done** |
| R-A9 | Field validation | SLM-1, SLM-3 | [#2][pr2] via [#6][pr6], [#7][pr7] | `catalog.test.ts` «SLM-1 AC2 invalid fields → 400 VALIDATION_FAILED, one message per field, nothing saved»; `BookForm.test.tsx` «blocks submit and shows the required-field messages», «limits the publication year…», «requires at least 1 total copy»; `members.test.ts` «SLM-3 AC2 invalid input → 400…» | ci | **Done** |
| R-A10 | Meaningful error handling | SLM-1, SLM-7, SLM-6 | [#1][pr1], [#2][pr2] via [#6][pr6], [#11][pr11] | `skeleton.test.ts` «SL-06 AC3 unknown endpoints return Problem Details with a request id»; `catalog.test.ts` «SLM-1 AC8 unknown or malformed id → 404»; `BookForm.test.tsx` «maps 409 DUPLICATE_ISBN to the ISBN field…», «shows a general error for server failures and keeps the input» | ci | **Done** |
| R-A11 | Confirmation before destructive operations | SLM-1, SLM-7 | [#2][pr2] via [#6][pr6], [#7][pr7], [#8][pr8], [#11][pr11] | `DeleteBookDialog.test.tsx` «past loans only → archive wording…, focus on the safe button», «Esc cancels»; `MemberModal.test.tsx` «setting Inactive asks for confirmation first; Cancel saves nothing»; `Circulation.test.tsx` «SLM-4 AC9 … Return → confirm → POST»; `StaffUsersPage.test.tsx` «Disable asks first…», «Reset demo data: confirm dialog…» | ci | **Done** |
| R-A12 | Consistent inventory | SLM-1, SLM-4 | [#2][pr2] via [#6][pr6], [#8][pr8] | `catalog.test.ts` «SLM-1 AC4 total can't drop below copies on loan…»; `circulation.test.ts` «SLM-4 inventory-invariant: holds after a mixed run of borrows, returns, a total edit and parallel bursts»; DB check `books_copies_ck` | ci | **Done** |

### B. Borrow Book / Return Book (O-2)

| Req | Requirement | Jira | Merged PR(s) | Tests that prove it | CI | Status |
|---|---|---|---|---|---|---|
| R-B1 | Explicit labels: check-in → Borrow Book, check-out → Return Book | SLM-4, SLM-6, SLM-7 | [#8][pr8], [#11][pr11], [#16][pr16] | README «Terminology»; routes `POST /api/loans/borrow`, `POST /api/loans/{id}/return` exercised in `circulation.test.ts`; UI text checked 25/11: `web/src` has no «check-in»/«check-out» (SLM-7 AC6) | ci | **Done** |
| R-B2 | Authorised staff register a borrowing | SLM-4, SLM-8 | [#8][pr8] | `circulation.test.ts` «SLM-4 AC1 happy borrow → 201 ACTIVE loan, processedBy = the staff user…», «SLM-4 Supervisor → 403 on borrow and on return; nothing changes», «SLM-4 Admin can borrow…»; `Circulation.test.tsx` «SLM-4 AC1 prefilled member + book → live summary, Confirm posts once…» | ci, e2e | **Done** |
| R-B3 | Borrowing linked to a member | SLM-4, SLM-3 | [#7][pr7], [#8][pr8] | `circulation.test.ts` «SLM-4 AC4 MEMBER_INACTIVE…», «SLM-4 AC4 unknown member / unknown or archived book → 404»; `Circulation.test.tsx` «SLM-4 AC4 member search lists inactive and at-limit members as not selectable…» | ci | **Done** |
| R-B4 | Record the borrowing date | SLM-4 | [#8][pr8] | `circulation.test.ts` «SLM-4 AC1 happy borrow…»; `loan-history.test.ts` «SLM-5 AC1 + AC5 each row has book, member, dates, processed by and status…» | ci | **Done** |
| R-B5 | Record the expected return date | SLM-4 | [#8][pr8] | `circulation.test.ts` «SLM-4 AC2 due date defaults to now + 14 days (injected clock)», «SLM-4 AC2 custom due date: 1 and 60 days accepted; 0 and 61 → 400…»; `Circulation.test.tsx` «SLM-4 AC2 due date defaults to today + 14 days…» | ci | **Done** |
| R-B6 | Authorised staff register a return | SLM-4, SLM-8 | [#8][pr8] | `circulation.test.ts` «SLM-4 AC5 return → 200 RETURNED, returnedAt set, returnedBy = the returning staff user, stock +1»; `Circulation.test.tsx` «SLM-4 AC9 active loans listed before any search; Return → confirm → POST…» | ci, e2e | **Done** |
| R-B7 | Record the actual return date | SLM-4 | [#8][pr8] | `circulation.test.ts` «SLM-4 AC5 return → 200 RETURNED, returnedAt set…» | ci | **Done** |
| R-B8 | Availability updates on borrow and return | SLM-4 | [#8][pr8] | `circulation.test.ts` «SLM-4 AC1 … stock −1 in the same transaction», «SLM-4 AC1 a failure after the stock change rolls the stock back», «SLM-4 AC5 … stock +1» | ci, e2e | **Done** |
| R-B9 | No borrowing of an unavailable book | SLM-4 | [#8][pr8] | `circulation.test.ts` «SLM-4 AC3 BOOK_UNAVAILABLE at 0 copies: 409…», «SLM-4 AC7 concurrency-20-on-3…»; `Circulation.test.tsx` «SLM-4 AC3 race: 409 BOOK_UNAVAILABLE → notice under Book» | ci | **Done** |
| R-B10 | No invalid or duplicate returns | SLM-4 | [#8][pr8] | `circulation.test.ts` «SLM-4 AC6 duplicate return → 409 LOAN_ALREADY_RETURNED…», «SLM-4 AC6 unknown loan id → 404; malformed id → 400», «SLM-4 AC8 2 parallel returns of one loan → one 200 + one 409»; `Circulation.test.tsx` «SLM-4 AC6 409 LOAN_ALREADY_RETURNED → error toast…» | ci | **Done** |
| R-B11 | Transaction history kept | SLM-5, SLM-4 | [#9][pr9] | `loan-history.test.ts` «SLM-5 AC1 + AC5…», «SLM-5 AC2 filters … and sorts»; `catalog.test.ts` «SLM-1 AC7 past loans only → archived: … detail still readable»; `members.test.ts` «SLM-3 AC5 members can't be deleted»; `LoanHistory.test.tsx` SLM-5 AC1, AC2 | ci | **Done** |
| R-B12 | Inventory consistency, 0 ≤ available ≤ total | SLM-4, SLM-1 | [#8][pr8] | `circulation.test.ts` «SLM-4 inventory-invariant…», «SLM-4 concurrency: borrow and return of the last copy at once both settle; invariant holds»; DB check `books_copies_ck` in `migrations/0001_init.sql` | ci | **Done** |
| R-B13 | Safe under concurrent operations | SLM-4 | [#8][pr8] | `circulation.test.ts` (real PostgreSQL, parallel requests) «SLM-4 AC7 concurrency-20-on-3: 20 parallel borrows … → 3 × 201, 17 × 409», «20 parallel borrows, same member, same book → 1 × 201», «loan-limit race … → exactly 5», «member-suspend-race» (both orders) | ci | **Done** |

### C. Search (O-3)

| Req | Requirement | Jira | Merged PR(s) | Tests that prove it | CI | Status |
|---|---|---|---|---|---|---|
| R-C1 | Find by title | SLM-2 | [#2][pr2] via [#6][pr6], [#14][pr14] | `search.test.ts` «SLM-2 AC1 free-text search over every metadata field»; `catalog.test.ts` «searches title/author by prefix and tolerates a typo» | ci | **Done** |
| R-C2 | Find by author | SLM-2 | [#2][pr2] via [#6][pr6], [#14][pr14] | as R-C1 | ci | **Done** |
| R-C3 | Find by other metadata | SLM-2 | [#14][pr14] | `search.test.ts` «SLM-2 AC1 free-text search over every metadata field» (category, description, publisher, ISBN) | ci | **Done** |
| R-C4 | Category filter | SLM-2 | [#14][pr14] | `search.test.ts` «SLM-2 AC2 … query + category»; `catalog.test.ts` «filters by category and availability…» | ci | **Done** |
| R-C5 | Availability filter | SLM-2 | [#14][pr14] | `search.test.ts` «query + available only excludes fully loaned books» | ci | **Done** |
| R-C6 | Sorting | SLM-2 | [#14][pr14] | `search.test.ts` «SLM-2 AC3/AC4 sort and paging», «pages are stable and disjoint when the sort key ties», «size above 100 and unknown sort keys are refused»; `BooksPage.test.tsx` «AC6b filters, sort and page come from the URL…» | ci | **Done** |
| R-C7 | Result counts | SLM-2 | [#14][pr14] | `search.test.ts` «total counts all matches while items hold one page»; `BooksPage.test.tsx` «AC4 shows how many books match the query» | ci | **Done** |
| R-C8 | Empty-result message | SLM-2, SLM-7 | [#14][pr14], [#11][pr11] | `search.test.ts` «SLM-2 AC5 no match → empty items and total 0»; `BooksPage.test.tsx` «AC5 no match → empty state with Clear filters…» | ci | **Done** |
| R-C9 | Usable and responsive search | SLM-2, SLM-7 | [#14][pr14] | `search.test.ts` «each search answers under 500 ms (soft assert at 1 s for shared CI runners)»; injection-safe: «SLM-2 … `' OR 1=1 --`…» cases. Note: CI asserts < 1 s and logs the times; the 500 ms target (scope decision D13) is not a hard assertion | ci | **Done** |

### G. General requirements (O-4, O-5)

| Req | Requirement | Jira | Merged PR(s) | Evidence | CI | Status |
|---|---|---|---|---|---|---|
| R-G1 | A complete working application | SLM-6 | [#1][pr1], [#10][pr10], [#17][pr17], [#35][pr35] | `e2e/1-librarian.e2e.ts`, `e2e/2-supervisor.e2e.ts`, `e2e/3-admin.e2e.ts` in CI on every commit; live site healthy (see Live checks) | e2e | **Done** |
| R-G2 | Any stack and tools allowed; the choice recorded | SLM-6 | [#1][pr1], [#27][pr27] | README «Stack»; [ADR-0002](adr/0002-stack-typescript-hono-workers-postgres.md); [decision register](decisions.md) | ci | **Done** |
| R-G3 | Source code delivered | SLM-6 | [#1][pr1] | this public repository | ci | **Done** |
| R-G4 | A brief README on how to run it | SLM-6 | [#10][pr10], [#16][pr16], [#30][pr30] | README «Quick start» (`npm run demo:local`, one command) and «Step by step»; `scripts/demo-local.ts` | ci | **Done** |

### X. Bonus items (O-6 to O-10)

| Req | Requirement | Jira | Merged PR(s) | Evidence | CI | Status |
|---|---|---|---|---|---|---|
| R-X1 | Deploy the application | SLM-10 | [#24][pr24], [#25][pr25] | every merge to `main` deploys through Cloudflare Workers Builds (`wrangler.toml`); live `GET /api/health?deep=1` → ok (25/11 14:33 UTC) | live | **Done** |
| R-X2 | Provide a public URL | SLM-10 | [#24][pr24] | https://smart-library.ahmedoraby.workers.dev answers 200. **Gap:** the README still shows the `<LIVE_URL>` placeholder; the link is in open PR [#39][pr39] | live | **Partial** |
| R-X3 | Verify the deployed app works | SLM-10, SLM-11 | [#24][pr24] | public live checks above pass. **Gap:** the signed-in smoke on the live URL (sign in, search, Borrow Book, Return Book), with date and result, is not recorded yet (SLM-10 AC3); the same flows pass in the `e2e` job | live, e2e | **Partial** |
| R-X4 | Demo recording | SLM-11, SLM-17 | none merged | the captioned walkthrough is open PR [#38][pr38]; the voice-over is SLM-17 (Refinement) | — | **Not done** |
| R-X5 | Recording URL provided | SLM-11 | none merged | README still shows `<VIDEO_URL>` | — | **Not done** |
| R-X6 | Authentication | SLM-8, SLM-6 | [#1][pr1], [#12][pr12], [#15][pr15] | `skeleton.test.ts` «SL-08 demo accounts» (HttpOnly cookie, same 401 for wrong password and unknown email, 6th attempt → 429, logout), «no header or flag signs anyone in (no bypass)», «writes from another origin are refused (CSRF)»; `rbac-matrix.test.ts` «session-cookie-flags: missing, malformed, tampered, expired, foreign-secret or wrong-alg cookies → 401»; `e2e/*` sign in as each role | ci, e2e | **Done** |
| R-X7 | SSO (Google) | SLM-8 | [#12][pr12], [#15][pr15], [#43][pr43] | `google-auth.test.ts` (OIDC with PKCE S256, state, nonce, ID-token verification with a local key pair, unverified email refused, open-redirect guard, demo emails refused, `sub` binding, rate limits); `SignInPage.test.tsx` «shows Google + divider when configured…». **Live:** production Google client merged in [#43][pr43]; live checks above and QA on the live site passed; a real Google sign-in on the live site worked (25/11). **Gap:** the public `/privacy` page for the Google consent screen is open PR [#44][pr44]; this row moves to Done when it merges. SLM-8 is In Testing until then | ci, live | **Partial** |
| R-X8 | Different roles and permissions | SLM-8 | [#1][pr1], [#12][pr12], [#15][pr15] | Admin, Librarian, Supervisor ([ADR-0172](adr/0172-rbac-matrix-test-covers-every-role-every.md)); `rbac-matrix.test.ts` «every registered route has a row, and every row a route», one case per role × route; `staff-users.test.ts` role change, disable, last Admin, demo rows protected; `e2e/2-supervisor.e2e.ts` «supervisor is read-only» | ci, e2e | **Done** |
| R-X9 | Authorisation enforced by the API (403 on a direct call) | SLM-8 | [#12][pr12], [#15][pr15] | `rbac-matrix.test.ts` role × route cases, «a validly signed cookie that claims role=ADMIN for a Supervisor is still a Supervisor»; `skeleton.test.ts` «role and permissions come from the database on every request», «a disabled staff user gets 403 USER_DISABLED»; 403 cases in `circulation.test.ts`, `members.test.ts`, `catalog.test.ts`, `staff-users.test.ts`, `isbn-lookup.test.ts` | ci | **Done** |
| R-X10 | An AI feature that helps the real library workflow | SLM-9, SLM-16 | [#4][pr4] via [#6][pr6], [#19][pr19], [#20][pr20], [#21][pr21] | `discovery.test.ts` «SLM-9 AC1 up to 5 real catalog books…», «SLM-9 AC2 a book id the model invented … is dropped», «SLM-9 AC3 availability always comes from the database», «SLM-9 AC5 provider error / timeout / invalid JSON → fallback», «prompt injection in the request still returns only catalog books», AC6 limits, AC8 logging; `hybrid-retrieval.test.ts` (chunking, RRF, pgvector, fallbacks); `ai-cost.test.ts` (cache, quota, daily cap, tiers); `DiscoveryPage.test.tsx`; [docs/ai.md](ai.md); live `vector: hnsw` | ci, live | **Done** |
| R-X11 | Meaningful extra features | SLM-12, SLM-13, SLM-8 | [#3][pr3] via [#6][pr6], [#13][pr13], [#12][pr12], [#18][pr18] | dashboard: `dashboard.test.ts` SLM-12 AC1–AC4, `DashboardPage.test.tsx`; due-soon/overdue badges (2 days, `web/src/lib/loanStatus.ts`): `loanStatus.test.ts`; ISBN lookup: `isbn-lookup.test.ts`; staff users screen: `StaffUsersPage.test.tsx`; demo reset: `demo-reset.test.ts`, `e2e/3-admin.e2e.ts`; theme toggle: `ThemeToggle.test.tsx` | ci, e2e | **Done** |

### E. Evaluation criteria

| Req | Requirement | Jira | Merged PR(s) | Evidence | CI | Status |
|---|---|---|---|---|---|---|
| R-E1 | Completeness: works and covers every core feature | SLM-1–SLM-7 | rows A, B, C, G | every A, B, C and G row is Done; the three E2E flows pass on every commit | ci, e2e | **Done** |
| R-E2 | Creativity | SLM-9, SLM-12, SLM-13, SLM-16 | rows R-X10, R-X11 | hybrid AI discovery with cost tiers and fallback, dashboard, badges, ISBN lookup | ci | **Done** |
| R-E3 | Product quality: clean and organised | SLM-6, SLM-7, SLM-10, SLM-11 | [#1][pr1], [#26][pr26], [#27][pr27], [#29][pr29], [#31][pr31], [#33][pr33] | layered modular monolith with enforced dependency rules (`.dependency-cruiser.cjs`, `npm run lint:deps`); 90% coverage gate; lint and format in CI; API tests on real PostgreSQL; [docs/architecture.md](architecture.md); one ADR per decision ([decisions.md](decisions.md)) | ci | **Done** |
| R-E4 | Usability: intuitive | SLM-7 | [#11][pr11], [#18][pr18] | shared states and guards: `RequirePermission.test.tsx`, `Circulation.test.tsx` «SLM-7 S1/S2 the active tab carries aria-current…», «Circulation is hidden for Supervisor», `MembersPages.test.tsx` «arrow keys move between them», `MemberModal.test.tsx` «opens with the first field focused», «…focusing the first error», empty and error states in `BooksPage.test.tsx`, `DashboardPage.test.tsx`. **Gap:** SLM-7 AC4 (no horizontal scroll at 1280 and 1024 px) and AC5 (keyboard and focus across every form and dialog) rely on manual UI reviews; no automated accessibility (axe) or viewport check runs in CI | ci | **Partial** |
| R-E5 | A traceability matrix from every requirement to implementation and test evidence (ours) | SLM-11 | this document | this file; [ADR-0049](adr/0049-requirements-traceability-matrix-evidence-every-row.md). Note: the generated-evidence script of [ADR-0171](adr/0171-tests-tagged-story-ac-requirement-id.md) is not built; tests carry story and AC ids in their titles, and this matrix was filled by hand from them | — | **Done** |

## Summary

| | Done | Partial | Not done | Descoped | Total |
|---|---|---|---|---|---|
| Part 1 (assessment lines) | 10 | 3 (O-6, O-8, O-14) | 1 (O-7) | 0 | 14 |
| Part 2 (derived rows) | 48 | 4 (R-X2, R-X3, R-X7, R-E4) | 2 (R-X4, R-X5) | 0 | 54 |

Every minimum feature (O-1 to O-5) is Done. What is left is in the bonus items and one evaluation row:

1. **Live URL in the README** (R-X2): open PR [#39][pr39].
2. **Signed-in smoke on the live URL** (R-X3, SLM-10 AC3): sign in, search, Borrow Book, Return Book on the live site, then record the date and result here.
3. **Demo recording and its URL** (R-X4, R-X5): open PR [#38][pr38] and SLM-17.
4. **Privacy page for Google sign-in** (R-X7): open PR [#44][pr44]. Google sign-in itself is live and verified.
5. **Accessibility and viewport checks** (R-E4): an automated axe and viewport pass, or a recorded manual pass, for SLM-7 AC4 and AC5.

This file is updated when any of these lands.

[ci]: https://github.com/ahmedoraby-eng/smart-library-management-system/actions/runs/45573152599
[e2e]: https://github.com/ahmedoraby-eng/smart-library-management-system/actions/runs/45573151913
[pr1]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/1
[pr2]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/2
[pr3]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/3
[pr4]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/4
[pr6]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/6
[pr7]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/7
[pr8]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/8
[pr9]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/9
[pr10]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/10
[pr11]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/11
[pr12]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/12
[pr13]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/13
[pr14]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/14
[pr15]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/15
[pr16]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/16
[pr17]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/17
[pr18]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/18
[pr19]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/19
[pr20]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/20
[pr21]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/21
[pr24]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/24
[pr25]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/25
[pr26]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/26
[pr27]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/27
[pr29]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/29
[pr30]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/30
[pr31]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/31
[pr33]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/33
[pr35]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/35
[pr38]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/38
[pr39]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/39
[pr43]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/43
[pr44]: https://github.com/ahmedoraby-eng/smart-library-management-system/pull/44
