// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookCover } from "./BookCover";

describe("BookCover", () => {
  it("shows the image when there is a URL (decorative, lazy, no referrer)", () => {
    const { container } = render(<BookCover title="Dune" url="https://img.test/dune.jpg" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://img.test/dune.jpg");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByTestId("book-cover")).not.toHaveTextContent("D");
  });

  it("shows the initials spine when there is no URL", () => {
    const { container } = render(<BookCover title="Dune Messiah" url={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("book-cover")).toHaveTextContent("DM");
  });

  it("falls back to the initials when the image fails to load", () => {
    const { container } = render(<BookCover title="Dune Messiah" url="https://img.test/broken.jpg" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("book-cover")).toHaveTextContent("DM");
  });

  it("tries again when the URL changes after a failure", () => {
    const { container, rerender } = render(<BookCover title="Dune" url="https://img.test/broken.jpg" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    rerender(<BookCover title="Dune" url="https://img.test/fixed.jpg" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://img.test/fixed.jpg");
  });

  it("applies the requested size and the same tint for the same title", () => {
    const sm = render(<BookCover title="Dune" url={null} />);
    const lg = render(<BookCover title="Dune" url={null} size="lg" />);
    const [a, b] = screen.getAllByTestId("book-cover");
    expect(a!.className).toContain("w-8");
    expect(b!.className).toContain("w-24");
    const tint = (el: Element) => el.className.split(" ").find((c) => c.startsWith("bg-[#"));
    expect(tint(a!)).toBeDefined();
    expect(tint(a!)).toBe(tint(b!));
    sm.unmount();
    lg.unmount();
    render(<BookCover title="Dune" url={null} size="md" />);
    expect(screen.getByTestId("book-cover").className).toContain("w-12");
  });
});
