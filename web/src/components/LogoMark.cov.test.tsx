// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LogoMark } from "./LogoMark";

describe("LogoMark", () => {
  it("renders both looks (the theme CSS shows one), all decorative", () => {
    const { container } = render(<LogoMark />);
    const marks = container.querySelectorAll("span[aria-hidden='true']");
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent("S");
    expect(marks[0]!.className).toContain("h-7.5");
    expect(marks[1]!.querySelector("svg")).toHaveAttribute("width", "17");
  });

  it("large is a bigger mark in both looks", () => {
    const { container } = render(<LogoMark large />);
    const marks = container.querySelectorAll("span[aria-hidden='true']");
    expect(marks[0]!.className).toContain("h-10");
    expect(marks[1]!.className).toContain("h-10");
    expect(marks[1]!.querySelector("svg")).toHaveAttribute("width", "22");
  });
});
