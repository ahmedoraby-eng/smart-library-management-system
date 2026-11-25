// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, Modal } from "./Modal";

describe("Modal", () => {
  it("is an accessible dialog named by its title, rendered outside the page flow", () => {
    const { container } = render(
      <Modal title="Edit book" footer={<button>Save</button>} onClose={() => {}} testId="dlg">
        <p>Body text</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Edit book" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toBe(screen.getByTestId("dlg"));
    expect(dialog).toHaveTextContent("Body text");
    expect(container).toBeEmptyDOMElement(); // portalled to <body>
  });

  it("focuses the first focusable element, locks page scroll and restores both on close", () => {
    document.body.style.overflow = "auto";
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(
      <Modal title="T" footer={<button>Second</button>} onClose={() => {}}>
        <input aria-label="Name" />
      </Modal>,
    );
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
    expect(opener).toHaveFocus();
    opener.remove();
    document.body.style.overflow = "";
  });

  it("focuses initialFocusRef when given", () => {
    function Host() {
      const [ref] = useState(() => ({ current: null as HTMLElement | null }));
      return (
        <Modal
          title="T"
          onClose={() => {}}
          initialFocusRef={ref}
          footer={
            <button
              ref={(el) => {
                ref.current = el;
              }}
            >
              Safe
            </button>
          }
        >
          <input aria-label="Name" />
        </Modal>
      );
    }
    render(<Host />);
    expect(screen.getByRole("button", { name: "Safe" })).toHaveFocus();
  });

  it("Escape asks to close, and does not leak to listeners above the dialog", async () => {
    const onClose = vi.fn();
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Modal title="T" footer={<button>Ok</button>} onClose={onClose}>
          <input aria-label="Name" />
        </Modal>
      </div>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("always calls the latest onClose, not the one from first render", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Modal title="T" footer={<button>Ok</button>} onClose={first}>
        x
      </Modal>,
    );
    rerender(
      <Modal title="T" footer={<button>Ok</button>} onClose={second}>
        x
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("clicking the scrim does not close it", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="T" footer={<button>Ok</button>} onClose={onClose}>
        x
      </Modal>,
    );
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("traps Tab: from the last control to the first, and Shift+Tab from the first to the last", async () => {
    render(
      <Modal title="T" footer={<button>Last</button>} onClose={() => {}}>
        <input aria-label="First" />
      </Modal>,
    );
    const first = screen.getByLabelText("First");
    const last = screen.getByRole("button", { name: "Last" });
    expect(first).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
    await userEvent.tab();
    expect(last).toHaveFocus();
  });

  it("ignores other keys, and a dialog with nothing focusable does not crash on Tab", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="T" footer={<span>no buttons</span>} onClose={onClose}>
        text only
      </Modal>,
    );
    await userEvent.keyboard("a");
    await userEvent.tab();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("non-destructive: focuses the action; Cancel and the action call their handlers", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="Borrow?" confirmLabel="Borrow" onConfirm={onConfirm} onCancel={onCancel}>
        Sure?
      </ConfirmDialog>,
    );
    const confirm = screen.getByTestId("dialog-confirm");
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveTextContent("Borrow");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId("dialog-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("destructive: focuses Cancel first (a stray Enter must not delete) and uses the danger style", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Delete?"
        confirmLabel="Delete"
        destructive
        cancelLabel="Keep it"
        onConfirm={onConfirm}
        onCancel={() => {}}
        testId="del"
      >
        Gone for good.
      </ConfirmDialog>,
    );
    expect(screen.getByTestId("dialog-cancel")).toHaveFocus();
    expect(screen.getByTestId("dialog-cancel")).toHaveTextContent("Keep it");
    expect(screen.getByTestId("dialog-confirm").className).toContain("bg-danger-600");
    await userEvent.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId("del")).toBeInTheDocument();
  });

  it("Escape cancels", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="T" confirmLabel="Ok" onConfirm={() => {}} onCancel={onCancel}>
        x
      </ConfirmDialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("while loading: Escape does nothing, Cancel is disabled and the action shows it is busy", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="T" confirmLabel="Save" loading onConfirm={onConfirm} onCancel={onCancel}>
        x
      </ConfirmDialog>,
    );
    // Both buttons are disabled, so no control has focus: send Escape to the dialog itself.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-cancel")).toBeDisabled();
    expect(screen.getByTestId("dialog-confirm")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("dialog-confirm")).toBeDisabled();
  });
});
