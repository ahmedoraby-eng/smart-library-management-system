// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";

function setup(items?: ActionMenuItem[]) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onRow = vi.fn();
  const list = items ?? [
    { key: "edit", label: "Edit", icon: <i data-testid="edit-icon" />, onSelect: onEdit },
    { key: "delete", label: "Delete", danger: true, onSelect: onDelete },
    { key: "archive", label: "Archive", onSelect: vi.fn() },
  ];
  render(
    <div onClick={onRow} data-testid="row">
      <ActionMenu label="Row actions" items={list} testId="menu-btn" />
    </div>,
  );
  return { onEdit, onDelete, onRow };
}

describe("ActionMenu", () => {
  it("renders nothing when there are no actions", () => {
    setup([]);
    expect(screen.queryByTestId("menu-btn")).not.toBeInTheDocument();
  });

  it("opens on click, focuses the first item and does not trigger the row click", async () => {
    const { onRow } = setup();
    const button = screen.getByTestId("menu-btn");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "Row actions" })).toBeInTheDocument();
    expect(screen.getByTestId("menu-edit")).toHaveFocus();
    expect(screen.getByTestId("edit-icon")).toBeInTheDocument();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("marks the dangerous item and shows the menu where the button is (fixed position)", async () => {
    setup();
    await userEvent.click(screen.getByTestId("menu-btn"));
    expect(screen.getByTestId("menu-delete").className).toContain("text-danger-700");
    expect(screen.getByTestId("menu-edit").className).toContain("text-neutral-700");
    expect(screen.getByRole("menu")).toHaveStyle({ position: "fixed", visibility: "visible" });
  });

  it("a second click on the button closes the menu", async () => {
    setup();
    const button = screen.getByTestId("menu-btn");
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("selecting an item closes the menu and runs only that action, without a row click", async () => {
    const { onEdit, onDelete, onRow } = setup();
    await userEvent.click(screen.getByTestId("menu-btn"));
    await userEvent.click(screen.getByTestId("menu-delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onRow).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("arrow keys move through the items and wrap around", async () => {
    setup();
    await userEvent.click(screen.getByTestId("menu-btn"));
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByTestId("menu-delete")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByTestId("menu-edit")).toHaveFocus(); // wrapped past Archive
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByTestId("menu-archive")).toHaveFocus(); // wrapped back to the end
  });

  it("Enter on a focused item selects it (native button activation)", async () => {
    const { onEdit } = setup();
    await userEvent.click(screen.getByTestId("menu-btn"));
    await userEvent.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the menu and returns focus to the button", async () => {
    setup();
    const button = screen.getByTestId("menu-btn");
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("Tab closes the menu without selecting anything", async () => {
    const { onEdit, onDelete } = setup();
    await userEvent.click(screen.getByTestId("menu-btn"));
    await userEvent.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("ignores other keys", async () => {
    setup();
    await userEvent.click(screen.getByTestId("menu-btn"));
    await userEvent.keyboard("x");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByTestId("menu-edit")).toHaveFocus();
  });

  it("closes on a mouse press outside, but not inside the menu or on the button", async () => {
    setup();
    await userEvent.click(screen.getByTestId("menu-btn"));
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("menu-btn"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when the page scrolls or the window resizes, so it never floats away from its row", async () => {
    setup();
    const button = screen.getByTestId("menu-btn");
    await userEvent.click(button);
    fireEvent.scroll(window);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(button);
    fireEvent(window, new Event("resize"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
