// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination clicks", () => {
  it("Next asks for the following page and Previous for the one before", async () => {
    const onPage = vi.fn();
    render(<Pagination page={2} size={20} total={65} onPage={onPage} />);
    expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 21–40 of 65");
    await userEvent.click(screen.getByTestId("page-next"));
    expect(onPage).toHaveBeenLastCalledWith(3);
    await userEvent.click(screen.getByTestId("page-prev"));
    expect(onPage).toHaveBeenLastCalledWith(1);
  });

  it("clamps the last range to the total and disables Next on the last page", async () => {
    const onPage = vi.fn();
    render(<Pagination page={4} size={20} total={65} onPage={onPage} />);
    expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 61–65 of 65");
    expect(screen.getByTestId("page-next")).toBeDisabled();
    await userEvent.click(screen.getByTestId("page-next"));
    expect(onPage).not.toHaveBeenCalled();
  });

  it("does not call back from a disabled Previous on page 1", async () => {
    const onPage = vi.fn();
    render(<Pagination page={1} size={10} total={25} onPage={onPage} />);
    await userEvent.click(screen.getByTestId("page-prev"));
    expect(onPage).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
  });
});
