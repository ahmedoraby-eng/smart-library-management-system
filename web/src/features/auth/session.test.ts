import { describe, expect, it } from "vitest";
import { safeNext } from "./session";

describe("safeNext (post sign-in redirect)", () => {
  it("keeps same-origin paths with query strings", () => {
    expect(safeNext("/books?q=clean&page=2")).toBe("/books?q=clean&page=2");
    expect(safeNext("/books/abc/edit")).toBe("/books/abc/edit");
  });
  it("rejects anything that could leave the origin or loop", () => {
    for (const bad of [
      undefined,
      "",
      "books",
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/signin",
      "/signin?next=/books",
    ]) {
      expect(safeNext(bad)).toBeUndefined();
    }
  });
});
