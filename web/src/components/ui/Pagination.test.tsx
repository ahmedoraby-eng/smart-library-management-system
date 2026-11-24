// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination (Haya pass 4)", () => {
  it("one page: the summary stays, Previous/Next are hidden", () => {
    render(<Pagination page={1} size={20} total={3} onPage={() => {}} />);
    expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 1–3 of 3");
    expect(screen.queryByTestId("page-prev")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-next")).not.toBeInTheDocument();
  });
  it("several pages: Previous/Next show and disable at the ends", () => {
    render(<Pagination page={1} size={2} total={3} onPage={() => {}} />);
    expect(screen.getByTestId("page-prev")).toBeDisabled();
    expect(screen.getByTestId("page-next")).toBeEnabled();
  });
  it("no rows: nothing", () => {
    const { container } = render(<Pagination page={1} size={20} total={0} onPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
