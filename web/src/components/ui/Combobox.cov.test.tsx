// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "./Combobox";

type Opt = { id: string; name: string; blocked?: boolean };
const many: Opt[] = Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, name: `Book ${i}` }));

function Harness({
  options,
  initial = "",
  onSelect = () => {},
  loading = false,
  hint,
  emptyText,
  testId = "bk",
  reason,
}: {
  options: Opt[] | undefined;
  initial?: string;
  onSelect?: (o: Opt) => void;
  loading?: boolean;
  hint?: string;
  emptyText?: string;
  testId?: string;
  reason?: (o: Opt) => string | null;
}) {
  const [text, setText] = useState(initial);
  return (
    <Combobox<Opt>
      label="Book"
      placeholder="Search"
      value={text}
      onValueChange={setText}
      options={options}
      loading={loading}
      getKey={(o) => o.id}
      renderOption={(o, s) => (
        <span>
          {o.name}
          {s.disabledReason ? ` (${s.disabledReason})` : ""}
        </span>
      )}
      disabledReason={reason}
      onSelect={onSelect}
      hint={hint}
      emptyText={emptyText}
      testId={testId}
    />
  );
}

describe("Combobox", () => {
  it("stays closed with no text, even when options exist; shows the hint while closed", async () => {
    render(<Harness options={many} hint="Type a title" />);
    await userEvent.click(screen.getByLabelText("Book"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText("Type a title")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
  });

  it("typing opens the list, caps it at 8 and reports the total, and hides the hint", async () => {
    render(<Harness options={many} hint="Type a title" />);
    await userEvent.type(screen.getByLabelText("Book"), "b");
    expect(screen.getAllByRole("option")).toHaveLength(8);
    expect(screen.getByText("8 of 12 matches")).toBeInTheDocument();
    expect(screen.queryByText("Type a title")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
  });

  it("does not open while options are undefined and nothing is loading", async () => {
    render(<Harness options={undefined} initial="cl" />);
    await userEvent.click(screen.getByLabelText("Book"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens while loading (spinner in place of the search icon) with no 'no matches' text yet", async () => {
    const { container } = render(<Harness options={undefined} initial="cl" loading />);
    await userEvent.click(screen.getByLabelText("Book"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.queryByText("No matches")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows the empty text when a finished search found nothing, and a custom one when given", async () => {
    const { unmount } = render(<Harness options={[]} initial="zz" />);
    await userEvent.click(screen.getByLabelText("Book"));
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.getByText("0 of 0 matches")).toBeInTheDocument();
    unmount();
    render(<Harness options={[]} initial="zz" emptyText="Nothing found" />);
    await userEvent.click(screen.getByLabelText("Book"));
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
  });

  it("ArrowDown opens a closed list and moves the highlight, stopping at the last option", async () => {
    render(<Harness options={many.slice(0, 3)} initial="b" />);
    const input = screen.getByLabelText("Book");
    await userEvent.click(input);
    await userEvent.keyboard("{Escape}"); // close, text stays
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    const opts = screen.getAllByRole("option");
    expect(opts[2]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", opts[2]!.id);
  });

  it("ArrowUp moves back and stops at the first option", async () => {
    render(<Harness options={many.slice(0, 3)} initial="b" />);
    await userEvent.click(screen.getByLabelText("Book"));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("Enter picks the highlighted option and closes the list", async () => {
    const onSelect = vi.fn();
    render(<Harness options={many.slice(0, 3)} initial="b" onSelect={onSelect} />);
    await userEvent.click(screen.getByLabelText("Book"));
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(many[1]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Enter with the list closed does nothing (a surrounding form can submit)", async () => {
    const onSelect = vi.fn();
    render(<Harness options={many.slice(0, 3)} initial="" onSelect={onSelect} />);
    const input = screen.getByLabelText("Book");
    await userEvent.click(input);
    const notPrevented = fireEvent.keyDown(input, { key: "Enter" });
    expect(notPrevented).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking (mousedown on) an option selects it", async () => {
    const onSelect = vi.fn();
    render(<Harness options={many.slice(0, 3)} initial="b" onSelect={onSelect} />);
    await userEvent.click(screen.getByLabelText("Book"));
    await userEvent.click(screen.getAllByRole("option")[2]!);
    expect(onSelect).toHaveBeenCalledWith(many[2]);
  });

  it("hovering an option highlights it", async () => {
    render(<Harness options={many.slice(0, 3)} initial="b" />);
    await userEvent.click(screen.getByLabelText("Book"));
    await userEvent.hover(screen.getAllByRole("option")[2]!);
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
  });

  it("an option the data forbids is listed with its reason, cannot be picked by click or Enter", async () => {
    const onSelect = vi.fn();
    const opts: Opt[] = [{ id: "a", name: "Clean Code", blocked: true }];
    render(
      <Harness
        options={opts}
        initial="c"
        onSelect={onSelect}
        reason={(o) => (o.blocked ? "Already borrowed" : null)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Book"));
    const opt = screen.getByRole("option");
    expect(opt).toHaveAttribute("aria-disabled", "true");
    expect(opt).toHaveTextContent("Clean Code (Already borrowed)");
    await userEvent.click(opt);
    await userEvent.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Escape with the list open closes it and keeps the text; a second Escape clears the text", async () => {
    render(<Harness options={many.slice(0, 3)} initial="boo" />);
    const input = screen.getByLabelText("Book");
    await userEvent.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("boo");
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("Escape on an empty, closed combobox does nothing", async () => {
    render(<Harness options={undefined} />);
    const input = screen.getByLabelText("Book");
    await userEvent.click(input);
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("blur closes the list; focus opens it again", async () => {
    render(<Harness options={many.slice(0, 3)} initial="b" />);
    const input = screen.getByLabelText("Book");
    await userEvent.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    input.focus();
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("forwards the input ref and names test ids from testId", async () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Combobox<Opt>
        label="Member"
        value=""
        onValueChange={() => {}}
        options={undefined}
        getKey={(o) => o.id}
        renderOption={(o) => o.name}
        onSelect={() => {}}
        inputRef={ref}
        testId="mem"
      />,
    );
    expect(ref.current).toBe(screen.getByTestId("mem-input"));
  });

  it("omits test ids when none is given", () => {
    render(
      <Combobox<Opt>
        label="Member"
        value=""
        onValueChange={() => {}}
        options={undefined}
        getKey={(o) => o.id}
        renderOption={(o) => o.name}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).not.toHaveAttribute("data-testid");
  });
});
