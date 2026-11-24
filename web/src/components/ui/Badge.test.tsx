// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvailabilityBadge, availabilityLevel } from "./Badge";

const copies = (availableCopies: number, totalCopies = 5, nextDueAt: string | null = null) => ({ availableCopies, totalCopies, nextDueAt });

describe("availability status mapping (ux.md §2, U9)", () => {
  it("Available ≥ 2, Low = exactly 1, Unavailable = 0", () => {
    expect(availabilityLevel(3)).toBe("available");
    expect(availabilityLevel(2)).toBe("available");
    expect(availabilityLevel(1)).toBe("low");
    expect(availabilityLevel(0)).toBe("unavailable");
  });

  it("shows 'N of M available' with the level on the element", () => {
    render(<AvailabilityBadge book={copies(1, 4)} />);
    const badge = screen.getByTestId("availability-badge");
    expect(badge).toHaveTextContent("1 of 4 available");
    expect(badge).toHaveAttribute("data-level", "low");
  });

  it("drops the word 'available' in compact mode", () => {
    render(<AvailabilityBadge book={copies(3, 5)} compact />);
    expect(screen.getByTestId("availability-badge")).not.toHaveTextContent("available (");
    expect(screen.getByTestId("availability-badge").textContent).toMatch(/^3 of 5/);
  });

  it("shows the next due date only when nothing is available", () => {
    const { rerender } = render(<AvailabilityBadge book={copies(0, 2, "2026-11-28T09:00:00.000Z")} showNextDue />);
    expect(screen.getByTestId("next-due")).toHaveTextContent(/^Next copy due back 28 Nov/);
    rerender(<AvailabilityBadge book={copies(2, 2, "2026-11-28T09:00:00.000Z")} showNextDue />);
    expect(screen.queryByTestId("next-due")).not.toBeInTheDocument();
  });
});
