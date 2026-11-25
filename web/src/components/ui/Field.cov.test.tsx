// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Input, Select, Textarea } from "./Field";

describe("Input", () => {
  it("labels the control and wires typing through", async () => {
    const onChange = vi.fn();
    render(<Input label="Email" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Email"), "ab");
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-describedby");
  });

  it("shows a hint, linked with aria-describedby", () => {
    render(<Input label="Title" hint="As on the cover" />);
    const input = screen.getByLabelText("Title");
    expect(screen.getByText("As on the cover")).toHaveAttribute("id", input.getAttribute("aria-describedby"));
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("an error replaces the hint, marks the control invalid and uses the danger border", () => {
    render(<Input label="Title" hint="As on the cover" error="Enter a title." />);
    const input = screen.getByLabelText("Title");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("As on the cover")).not.toBeInTheDocument();
    const err = screen.getByText("Enter a title.");
    expect(err.closest("[data-field-error]")).toHaveAttribute("id", input.getAttribute("aria-describedby"));
    expect(input.className).toContain("border-danger-500");
  });

  it("marks an optional field and shows the label aside", () => {
    render(<Input label="Notes" optional labelAside={<span>0/200</span>} />);
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    expect(screen.getByText("0/200")).toBeInTheDocument();
  });

  it("makes room for leading and trailing content and a compact height", () => {
    render(<Input label="Search" leading={<i data-testid="lead" />} trailing={<b data-testid="trail" />} compact />);
    const input = screen.getByLabelText("Search");
    expect(screen.getByTestId("lead")).toBeInTheDocument();
    expect(screen.getByTestId("trail")).toBeInTheDocument();
    expect(input.className).toContain("pl-9");
    expect(input.className).toContain("pr-16");
    expect(input.className).toContain("h-9");
  });

  it("uses the regular height by default and honours an explicit id and class", () => {
    render(<Input label="Name" id="name-field" className="extra" />);
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("id", "name-field");
    expect(input.className).toContain("h-10");
    expect(input.className).toContain("extra");
  });

  it("hideLabel keeps the label for screen readers only, and no hint or error text", () => {
    render(<Input label="Search books" hideLabel hint="ignored" error="ignored too" />);
    expect(screen.getByText("Search books")).toHaveClass("sr-only");
    expect(screen.queryByText("ignored")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search books")).toBeInTheDocument();
  });

  it("forwards its ref", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input label="Ref" ref={ref} />);
    expect(ref.current).toBe(screen.getByLabelText("Ref"));
  });
});

describe("Textarea", () => {
  it("labels, hints and reports errors like Input", () => {
    const { rerender } = render(<Textarea label="Description" hint="Optional text" />);
    expect(screen.getByLabelText("Description").tagName).toBe("TEXTAREA");
    expect(screen.getByText("Optional text")).toBeInTheDocument();
    rerender(<Textarea label="Description" hint="Optional text" error="Too long." optional />);
    expect(screen.getByLabelText(/Description/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Too long.")).toBeInTheDocument();
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });
});

describe("Select", () => {
  const options = (
    <>
      <option value="">Any</option>
      <option value="ADMIN">Admin</option>
    </>
  );

  it("labels a native select and reports the chosen value", async () => {
    const onChange = vi.fn();
    render(
      <Select label="Role" onChange={onChange} hint="Pick one">
        {options}
      </Select>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Role"), "ADMIN");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("shows an error and marks it invalid", () => {
    render(
      <Select label="Role" error="Choose a role.">
        {options}
      </Select>,
    );
    expect(screen.getByLabelText("Role")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose a role.")).toBeInTheDocument();
  });

  it("hideLabel keeps the label for screen readers only", () => {
    render(
      <Select label="Filter by role" hideLabel>
        {options}
      </Select>,
    );
    expect(screen.getByText("Filter by role")).toHaveClass("sr-only");
    expect(screen.getByLabelText("Filter by role")).toBeInTheDocument();
  });
});
