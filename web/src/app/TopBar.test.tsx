// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { booksKey } from "../features/books/api";
import { membersKey } from "../features/members/api";
import { useBreadcrumb } from "./TopBar";

function setup(seed: (qc: QueryClient) => void = () => undefined) {
  const qc = new QueryClient();
  seed(qc);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return (path: string) => renderHook(() => useBreadcrumb(path), { wrapper }).result.current;
}

describe("breadcrumb", () => {
  it("a section alone; sub-pages under it with their own names", () => {
    const crumbs = setup();
    expect(crumbs("/dashboard")).toEqual([{ label: "Dashboard", to: "/dashboard" }]);
    expect(crumbs("/books/new")).toEqual([{ label: "Books", to: "/books" }, { label: "New book" }]);
    expect(crumbs("/circulation/return")).toEqual([
      { label: "Circulation", to: "/circulation" },
      { label: "Return book" },
    ]);
    expect(crumbs("/admin/users")).toEqual([{ label: "Staff users" }]);
    expect(crumbs("/404")).toEqual([{ label: "Page not found" }]);
    expect(crumbs("/")).toEqual([{ label: "Smart Library" }]);
  });

  it("names the book or member the page has loaded, with a placeholder until then", () => {
    const empty = setup();
    expect(empty("/books/b1")[1]).toEqual({ label: "Book" });
    expect(empty("/members/m1")[1]).toEqual({ label: "Member" });

    const loaded = setup((qc) => {
      qc.setQueryData([...booksKey, "detail", "b1"], { title: "Dune" });
      qc.setQueryData([...membersKey, "detail", "m1"], { fullName: "Nour Hassan" });
    });
    expect(loaded("/books/b1/edit")).toEqual([{ label: "Books", to: "/books" }, { label: "Dune" }, { label: "Edit" }]);
    expect(loaded("/members/m1")[1]).toEqual({ label: "Nour Hassan" });
  });
});
