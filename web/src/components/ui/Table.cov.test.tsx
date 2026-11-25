// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SortableTh, Table, Td, Th, Thead, Tr } from "./Table";

describe("Table pieces", () => {
  it("renders a real table with column headers scoped to their column", () => {
    render(
      <Table aria-label="Books">
        <Thead>
          <tr>
            <Th>Title</Th>
            <Th align="right" kind="actions">Copies</Th>
          </tr>
        </Thead>
        <tbody>
          <Tr data-testid="row">
            <Td>Dune</Td>
            <Td align="right" kind="num">3</Td>
          </Tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole("table", { name: "Books" })).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0]).toHaveAttribute("scope", "col");
    expect(headers[0]!.className).toContain("text-left");
    expect(headers[1]!.className).toContain("text-right");
    expect(headers[1]!.className).toContain("w-px");
    const cells = screen.getAllByRole("cell");
    expect(cells[1]!.className).toContain("tabular-nums");
    expect(cells[1]!.className).toContain("text-right");
  });

  it.each([
    ["text", ""],
    ["nowrap", "whitespace-nowrap"],
    ["num", "tabular-nums"],
    ["actions", "w-px"],
    ["truncate", "truncate"],
  ] as const)("a %s cell gets its layout class", (kind, cls) => {
    render(<table><tbody><tr><Td kind={kind} className="mine">x</Td></tr></tbody></table>);
    const td = screen.getByRole("cell");
    expect(td).toHaveClass("mine");
    if (cls) expect(td.className).toContain(cls);
  });
});

describe("SortableTh", () => {
  const renderTh = (sort: string | undefined, defaultSort?: string) => {
    const onSort = vi.fn();
    render(<table><thead><tr><SortableTh label="Title" sortKey="title" sort={sort} defaultSort={defaultSort} onSort={onSort} align="right" className="c" /></tr></thead></table>);
    return onSort;
  };

  it("not sorted: aria-sort none, a click sorts ascending", async () => {
    const onSort = renderTh(undefined);
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "none");
    expect(screen.getByRole("columnheader")).toHaveClass("c", "text-right");
    await userEvent.click(screen.getByTestId("sort-title"));
    expect(onSort).toHaveBeenCalledWith("title");
  });

  it("sorted ascending: a click flips to descending", async () => {
    const onSort = renderTh("title");
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByTestId("sort-title"));
    expect(onSort).toHaveBeenCalledWith("-title");
  });

  it("sorted descending: a click goes back to ascending", async () => {
    const onSort = renderTh("-title");
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
    await userEvent.click(screen.getByTestId("sort-title"));
    expect(onSort).toHaveBeenCalledWith("title");
  });

  it("another column sorted: this one is unsorted", () => {
    renderTh("author");
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "none");
  });

  it("the default sort marks the column when sort is empty", () => {
    renderTh("", "-title");
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
  });
});
