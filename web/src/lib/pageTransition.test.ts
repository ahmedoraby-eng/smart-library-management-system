// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageTransitionTypes } from "./pageTransition";

const go = (from: string | undefined, to: string, pathChanged = true) =>
  pageTransitionTypes({
    fromLocation: from === undefined ? undefined : { pathname: from },
    toLocation: { pathname: to },
    pathChanged,
  });

beforeEach(() => vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q })));
afterEach(() => vi.unstubAllGlobals());

describe("page transition types", () => {
  it("down the sidebar is forward, up is backward", () => {
    expect(go("/dashboard", "/books")).toEqual(["forward"]);
    expect(go("/loans", "/members")).toEqual(["backward"]);
    expect(go("/discover", "/admin/users")).toEqual(["forward"]);
  });

  it("into a record is deeper, back to the list is shallower", () => {
    expect(go("/books", "/books/42")).toEqual(["deeper"]);
    expect(go("/books/42", "/books/42/edit")).toEqual(["deeper"]);
    expect(go("/members/7", "/members")).toEqual(["shallower"]);
  });

  it("Circulation's Borrow and Return are tabs", () => {
    expect(go("/circulation/borrow", "/circulation/return")).toEqual(["tab"]);
  });

  it("pages outside the sidebar order still move forward (sign-in → dashboard, 403)", () => {
    expect(go("/signin", "/dashboard")).toEqual(["forward"]);
    expect(go("/books", "/403")).toEqual(["backward"]);
  });

  it("no transition on first load, for query-only changes, or under reduced motion", () => {
    expect(go(undefined, "/books")).toBe(false);
    expect(go("/books", "/books", false)).toBe(false);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q }));
    expect(go("/dashboard", "/books")).toBe(false);
  });
});
