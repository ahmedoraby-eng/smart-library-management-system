// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as icons from "./icons";

const names = Object.keys(icons).filter((k) => k.endsWith("Icon"));

describe("icon set", () => {
  it("has the icons the app uses", () => {
    expect(names.length).toBeGreaterThanOrEqual(22);
  });

  it.each(names)("%s renders a decorative 18 px svg by default", (name) => {
    const Cmp = (icons as unknown as Record<string, (p: { size?: number }) => React.ReactElement>)[name]!;
    const { container } = render(<Cmp />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveClass("slm-icon");
    expect(svg.querySelector("path, circle, rect, line, polyline")).not.toBeNull();
  });

  it("an icon takes a size and passes other svg props through", () => {
    const { container } = render(<icons.BookIcon size={32} className="extra" data-x="1" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
    expect(svg).toHaveAttribute("data-x", "1");
  });

  it("GoogleMark and Spinner are sized and decorative", () => {
    const g = render(<icons.GoogleMark />);
    expect(g.container.querySelector("svg")).toHaveAttribute("width", "18");
    g.unmount();
    const g2 = render(<icons.GoogleMark size={24} />);
    expect(g2.container.querySelector("svg")).toHaveAttribute("width", "24");
    g2.unmount();
    const s = render(<icons.Spinner />);
    expect(s.container.querySelector("svg")).toHaveAttribute("width", "16");
    expect(s.container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    s.unmount();
    const s2 = render(<icons.Spinner size={30} />);
    expect(s2.container.querySelector("svg")).toHaveAttribute("width", "30");
  });
});
