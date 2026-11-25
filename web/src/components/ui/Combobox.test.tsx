// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "./Combobox";

type Opt = { id: string; name: string; blocked?: boolean };
const opts: Opt[] = [
  { id: "a", name: "Clean Code", blocked: true },
  { id: "b", name: "Refactoring" },
];

describe("Combobox (Haya pass 2 nit)", () => {
  it("highlights the first selectable option, so Enter picks it", async () => {
    const onSelect = vi.fn();
    render(
      <Combobox<Opt>
        label="Book"
        value="c"
        onValueChange={() => {}}
        options={opts}
        getKey={(o) => o.id}
        renderOption={(o) => o.name}
        disabledReason={(o) => (o.blocked ? "Already has this book" : null)}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByLabelText("Book"));
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(opts[1]);
  });
});
