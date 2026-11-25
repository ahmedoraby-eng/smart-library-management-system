import { describe, expect, it } from "vitest";
import { deletionOutcome, totalBelowLoaned } from "../src/catalog/domain/Book";
import { accessViolation } from "../src/staff/domain/accessRules";
import type { StaffUser } from "../src/staff/domain/StaffUser";
import { alreadyBorrowed, bookUnavailable, checkBorrow, loanAlreadyReturned, loanStatus, resolveDueAt } from "../src/circulation/domain/Loan";
import { fallbackRank } from "../src/discovery/domain/FallbackRanker";
import type { Candidate } from "../src/discovery/domain/Discovery";
import { ConflictError, ValidationError } from "../src/platform/errors";

const user = (over: Partial<StaffUser> = {}): StaffUser => ({
  id: "u-target", email: "t@x.test", fullName: "Target", role: "LIBRARIAN", status: "ACTIVE", isDemo: false, createdAt: new Date(0), ...over,
});

describe("staff access rules", () => {
  it("refuses an actor who is no longer an active Admin, before anything else", () => {
    // even a no-op change is refused when the actor isn't among the locked active admins
    expect(accessViolation(user(), { role: "LIBRARIAN", status: "ACTIVE" }, "u-actor", ["someone-else"])).toBe("actor_not_admin");
  });

  it("allows a change that changes nothing (idempotent PUT), even on a demo account or oneself", () => {
    const demo = user({ isDemo: true, role: "ADMIN" });
    expect(accessViolation(demo, { role: "ADMIN", status: "ACTIVE" }, "u-actor", ["u-actor", "u-target"])).toBeNull();
    const self = user({ id: "u-actor", role: "ADMIN" });
    expect(accessViolation(self, { role: "ADMIN", status: "ACTIVE" }, "u-actor", ["u-actor"])).toBeNull();
  });

  it("protects demo accounts, and an Admin's own role and status", () => {
    expect(accessViolation(user({ isDemo: true }), { role: "SUPERVISOR", status: "ACTIVE" }, "a", ["a"])).toBe("protected_demo");
    expect(accessViolation(user({ id: "a", role: "ADMIN" }), { role: "LIBRARIAN", status: "ACTIVE" }, "a", ["a", "b"])).toBe("self");
  });

  it("demoting or disabling an Admin is allowed while the acting Admin stays active", () => {
    const admin = user({ role: "ADMIN" });
    expect(accessViolation(admin, { role: "LIBRARIAN", status: "ACTIVE" }, "a", ["a", "u-target"])).toBeNull();
    expect(accessViolation(admin, { role: "ADMIN", status: "DISABLED" }, "a", ["a", "u-target"])).toBeNull();
  });

  it("the actor-must-be-an-active-admin guard runs first, so a list holding only the target refuses the (other) actor", () => {
    // The `last_admin` branch needs an acting Admin who is in the list, differs from the target, and leaves the list
    // empty once the target is removed: impossible. The guarantee holds through actor_not_admin / self instead.
    const target = user({ role: "ADMIN" });
    expect(accessViolation(target, { role: "LIBRARIAN", status: "ACTIVE" }, "a", ["u-target"])).toBe("actor_not_admin");
    expect(accessViolation(user({ id: "t", role: "ADMIN" }), { role: "SUPERVISOR", status: "ACTIVE" }, "t", ["t"])).toBe("self");
  });

  it("promoting a non-admin or changing an ACTIVE admin to ACTIVE admin is allowed", () => {
    expect(accessViolation(user(), { role: "ADMIN", status: "ACTIVE" }, "a", ["a"])).toBeNull();
    expect(accessViolation(user({ status: "DISABLED" }), { role: "LIBRARIAN", status: "ACTIVE" }, "a", ["a"])).toBeNull();
  });
});

describe("loan rules", () => {
  const now = new Date("2026-11-25T10:00:00.000Z");
  const day = 86_400_000;

  it("loanStatus: returned wins, then overdue by dueAt, else active (a due date equal to now is still active)", () => {
    expect(loanStatus({ returnedAt: new Date(now.getTime() - 1), dueAt: new Date(now.getTime() - day) }, now)).toBe("RETURNED");
    expect(loanStatus({ returnedAt: null, dueAt: new Date(now.getTime() - 1) }, now)).toBe("OVERDUE");
    expect(loanStatus({ returnedAt: null, dueAt: new Date(now.getTime()) }, now)).toBe("ACTIVE");
    expect(loanStatus({ returnedAt: null, dueAt: new Date(now.getTime() + day) }, now)).toBe("ACTIVE");
  });

  it("resolveDueAt: default is now + loanDays", () => {
    expect(resolveDueAt(now, undefined, { loanDays: 14 })).toEqual(new Date(now.getTime() + 14 * day));
  });

  it("resolveDueAt: a custom date from 1 to 60 days ahead is kept; one hour of client skew is tolerated at both ends", () => {
    const ok = new Date(now.getTime() + 30 * day);
    expect(resolveDueAt(now, ok, { loanDays: 14 })).toBe(ok);
    const nearMin = new Date(now.getTime() + day - 59 * 60_000);
    expect(resolveDueAt(now, nearMin, { loanDays: 14 })).toBe(nearMin);
    const nearMax = new Date(now.getTime() + 60 * day + 59 * 60_000);
    expect(resolveDueAt(now, nearMax, { loanDays: 14 })).toBe(nearMax);
  });

  it("resolveDueAt: outside the window is a field error that names the last allowed day", () => {
    for (const bad of [new Date(now.getTime() + 60_000), new Date(now.getTime() - day), new Date(now.getTime() + 61 * day + 61 * 60_000)]) {
      try {
        resolveDueAt(now, bad, { loanDays: 14 });
        expect.unreachable("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).fieldErrors).toEqual([{ field: "dueAt", message: "Choose a due date between tomorrow and 24 Jan 2027." }]);
      }
    }
  });

  const member = { id: "m1", fullName: "Mona Member", status: "ACTIVE" as const };
  const policy = { maxActiveLoans: 5 };

  it("checkBorrow: an active member under the limit with no copy of the title passes", () => {
    expect(() => checkBorrow({ member, openLoans: 4, sameTitle: null, policy })).not.toThrow();
  });

  it("checkBorrow: inactive member → MEMBER_INACTIVE with the member id", () => {
    try {
      checkBorrow({ member: { ...member, status: "INACTIVE" }, openLoans: 0, sameTitle: null, policy });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError);
      expect((e as ConflictError).code).toBe("MEMBER_INACTIVE");
      expect((e as ConflictError).context).toEqual({ memberId: "m1" });
      expect((e as ConflictError).message).toContain("Mona Member is inactive");
    }
  });

  it("checkBorrow: the same title already on loan is refused before the limit is looked at", () => {
    const sameTitle = { loanId: "l1", title: "Dune", dueAt: new Date("2026-12-01T00:00:00Z") };
    try {
      checkBorrow({ member, openLoans: 99, sameTitle, policy });
      expect.unreachable();
    } catch (e) {
      expect((e as ConflictError).code).toBe("ALREADY_BORROWED");
      expect((e as ConflictError).message).toBe("Mona Member already has 'Dune' on loan (due 1 Dec 2026).");
      expect((e as ConflictError).context).toEqual({ loanId: "l1", dueAt: "2026-12-01T00:00:00.000Z" });
    }
  });

  it("checkBorrow: at the limit → LOAN_LIMIT_REACHED with the numbers", () => {
    try {
      checkBorrow({ member, openLoans: 5, sameTitle: null, policy });
      expect.unreachable();
    } catch (e) {
      expect((e as ConflictError).code).toBe("LOAN_LIMIT_REACHED");
      expect((e as ConflictError).context).toEqual({ activeLoans: 5, limit: 5 });
    }
  });

  it("alreadyBorrowed: without the open loan it is a generic message; without a name it says «This member»", () => {
    const generic = alreadyBorrowed(null, null);
    expect(generic.message).toBe("This member already has this book on loan.");
    expect(generic.context).toBeUndefined();
    const anon = alreadyBorrowed(null, { loanId: "l", title: "T", dueAt: new Date("2026-01-02T00:00:00Z") });
    expect(anon.message).toBe("This member already has 'T' on loan (due 2 Jan 2026).");
  });

  it("bookUnavailable: with or without a title and a next due date", () => {
    expect(bookUnavailable(null).message).toBe("No copies of this book are available.");
    expect(bookUnavailable(null).context).toBeUndefined();
    const withDue = bookUnavailable("Dune", new Date("2026-12-01T00:00:00Z"));
    expect(withDue.message).toBe("No copies of 'Dune' are available.");
    expect(withDue.context).toEqual({ nextDueAt: "2026-12-01T00:00:00.000Z" });
  });

  it("loanAlreadyReturned: names who returned it when known", () => {
    const at = new Date("2026-11-20T08:00:00Z");
    expect(loanAlreadyReturned({ returnedAt: at, returnedByName: "Layla" }).message).toBe("This loan was already returned by Layla.");
    const anon = loanAlreadyReturned({ returnedAt: at, returnedByName: null });
    expect(anon.message).toBe("This loan was already returned.");
    expect(anon.context).toEqual({ returnedAt: "2026-11-20T08:00:00.000Z", returnedBy: null });
  });
});

describe("book deletion rules", () => {
  it("open loans block the delete; the message counts copies (1 copy is / n copies are)", () => {
    for (const [n, text] of [[1, "1 copy is on loan"], [3, "3 copies are on loan"]] as const) {
      try {
        deletionOutcome({ title: "Dune", activeLoans: n, hasLoanHistory: true });
        expect.unreachable();
      } catch (e) {
        expect((e as ConflictError).code).toBe("BOOK_HAS_ACTIVE_LOANS");
        expect((e as ConflictError).message).toContain(text);
        expect((e as ConflictError).context).toEqual({ activeLoans: n });
      }
    }
  });

  it("past loans mean archive; a never-borrowed book is deleted", () => {
    expect(deletionOutcome({ title: "T", activeLoans: 0, hasLoanHistory: true })).toBe("archive");
    expect(deletionOutcome({ title: "T", activeLoans: 0, hasLoanHistory: false })).toBe("delete");
  });

  it("totalBelowLoaned: singular and plural wording with the context", () => {
    expect(totalBelowLoaned(1).message).toBe("You can't go below 1 copy: 1 is on loan right now.");
    expect(totalBelowLoaned(4).message).toBe("You can't go below 4 copies: 4 are on loan right now.");
    expect(totalBelowLoaned(4).context).toEqual({ onLoan: 4 });
  });
});

describe("fallback ranking", () => {
  const cand = (id: string, title: string, score: number, over: Partial<Candidate> = {}): Candidate => ({
    id, title, author: "A", category: "Cat", publicationYear: null, description: "", score, matchedTerms: [], related: false, ...over,
  });

  it("orders by score, then title, then id; reasons come from the template", () => {
    const out = fallbackRank([
      cand("3", "Beta", 1, { matchedTerms: ["beta"] }),
      cand("2", "Alpha", 1),
      cand("1", "Alpha", 1, { foundBy: "semantic" }),
      cand("4", "Zed", 2),
    ]);
    expect(out.map((r) => r.candidate.id)).toEqual(["4", "1", "2", "3"]);
    expect(out[1]!.reason).toBe("Close in meaning to the request (Cat)");
    expect(out[2]!.reason).toBe("Related to “Cat”");
    expect(out[3]!.reason).toBe("Matches: beta");
  });

  it("honours the limit, does not mutate its input, and handles an empty list", () => {
    const input = [cand("a", "A", 1), cand("b", "B", 2), cand("c", "C", 3)];
    expect(fallbackRank(input, 2).map((r) => r.candidate.id)).toEqual(["c", "b"]);
    expect(input.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(fallbackRank([])).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => cand(String(i), `T${i}`, i));
    expect(fallbackRank(many)).toHaveLength(5); // default MAX_ITEMS
  });
});
