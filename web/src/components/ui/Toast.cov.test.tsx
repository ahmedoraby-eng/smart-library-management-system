// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Buttons() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("Saved")}>ok</button>
      <button onClick={() => toast.info(<b>Heads up</b>)}>info</button>
      <button onClick={() => toast.error("Broke")}>err</button>
    </>
  );
}

const click = (name: string) => act(() => screen.getByRole("button", { name }).click());

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a success toast is a polite status and goes away after 4 s", () => {
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>,
    );
    click("ok");
    const t = screen.getByRole("status");
    expect(t).toHaveTextContent("Saved");
    expect(t).toHaveAttribute("data-kind", "success");
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByTestId("toast")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("an info toast renders rich content as a status", () => {
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>,
    );
    click("info");
    expect(screen.getByRole("status")).toContainHTML("<b>Heads up</b>");
    expect(screen.getByTestId("toast")).toHaveAttribute("data-kind", "info");
  });

  it("an error toast is an alert and stays until it is closed", () => {
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>,
    );
    click("err");
    const t = screen.getByRole("alert");
    expect(t).toHaveAttribute("data-kind", "error");
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("the close button dismisses just that toast", () => {
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>,
    );
    click("err");
    click("ok");
    expect(screen.getAllByTestId("toast")).toHaveLength(2);
    act(() => screen.getAllByRole("button", { name: "Dismiss notification" })[0]!.click());
    expect(screen.getAllByTestId("toast")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("keeps at most 3, dropping the oldest", () => {
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>,
    );
    click("err");
    click("ok");
    click("info");
    click("ok");
    const items = screen.getAllByTestId("toast");
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.getAttribute("data-kind"))).toEqual(["success", "info", "success"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closing with the keyboard works too", () => {
    vi.useRealTimers();
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>,
    );
    return (async () => {
      await userEvent.click(screen.getByRole("button", { name: "err" }));
      await userEvent.tab(); // from "err" button to the toast's close button
      await userEvent.keyboard("{Enter}");
      expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
    })();
  });

  it("useToast outside a provider fails loudly", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Buttons />)).toThrow("useToast must be used inside <ToastProvider>");
    spy.mockRestore();
  });
});

describe("Toast exit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("with motion allowed, a dismissed toast slides out before it is removed", () => {
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>,
    );
    click("err");
    act(() => screen.getByRole("button", { name: "Dismiss notification" }).click());
    const t = screen.getByTestId("toast");
    expect(t).toHaveAttribute("data-leaving", "true");
    expect(t.className).toContain("slm-toast-out");
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });
});
