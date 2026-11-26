// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookShelf, SHELF } from "./BookShelf";
import { LoadingScreen } from "./LoadingScreen";

describe("LoadingScreen", () => {
  it("is one polite status for screen readers; the mark, shelf and line are decoration", () => {
    render(<LoadingScreen />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading Smart Library…");
    expect(status).toHaveAttribute("data-testid", "loading-screen");
    // Everything visible sits under aria-hidden, so it is read once, as the status text.
    const art = status.querySelector(':scope > [aria-hidden="true"]');
    expect(art).toContainElement(within(status).getByTestId("loading-progress"));
    expect(art).toHaveTextContent("Smart Library");
  });

  it("takes the test id the shell gives it", () => {
    render(<LoadingScreen testId="shell-loading" />);
    expect(screen.getByTestId("shell-loading")).toHaveRole("status");
  });

  it("animates only when motion is allowed (motion-safe classes)", () => {
    render(<LoadingScreen />);
    expect(screen.getByTestId("loading-screen").className).toMatch(/motion-safe:animate-/);
    expect(screen.getByTestId("loading-progress").className).toMatch(/motion-safe:animate-\[slm-progress/);
  });
});

describe("BookShelf", () => {
  it("draws every spine at full size by default, rising one after another", () => {
    render(<BookShelf />);
    const spines = Array.from(screen.getByTestId("book-shelf").children) as HTMLElement[];
    expect(spines).toHaveLength(SHELF.length);
    expect(spines[0]).toHaveStyle({ width: "26px", height: "150px" });
    expect(spines[0]!.style.animationDelay).toBe("0ms");
    expect(spines[3]!.style.animationDelay).toBe("135ms");
  });

  it("scales the shelf and keeps the first n spines", () => {
    render(<BookShelf scale={0.5} count={3} />);
    const shelf = screen.getByTestId("book-shelf");
    expect(shelf).toHaveAttribute("aria-hidden", "true");
    expect(shelf.children).toHaveLength(3);
    expect(shelf.children[1]).toHaveStyle({ width: "17px", height: "91px" });
  });
});
