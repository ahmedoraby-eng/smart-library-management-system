// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberNumber } from "./MemberNumber";

describe("MemberNumber", () => {
  it("keeps the prefix and shows the digits tabular after a normal hyphen", () => {
    const { container } = render(<MemberNumber value="M-000008" />);
    expect(container.textContent).toBe("M-000008");
    expect(container.querySelector(".tabular-nums")).toHaveTextContent("000008");
  });

  it("normalises a typographic hyphen or dash to a plain hyphen", () => {
    for (const dash of ["‐", "‑", "–", "—", "―"]) {
      const { container, unmount } = render(<MemberNumber value={`M${dash}000042`} />);
      expect(container.textContent).toBe("M-000042");
      unmount();
    }
  });

  it("accepts a number with no letter prefix", () => {
    const { container } = render(<MemberNumber value="-123" />);
    expect(container.textContent).toBe("-123");
    expect(container.querySelector(".tabular-nums")).toHaveTextContent("123");
  });

  it("shows anything that is not a member number as it is", () => {
    for (const odd of ["", "000008", "M-12a", "M 000008", "M-"]) {
      const { container, unmount } = render(<MemberNumber value={odd} />);
      expect(container.textContent).toBe(odd);
      expect(container.querySelector(".tabular-nums")).toBeNull();
      unmount();
    }
  });
});
