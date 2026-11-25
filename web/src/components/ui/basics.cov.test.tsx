// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonClasses } from "./Button";
import { Card, CardBody, CardHeader } from "./Card";
import { EmptyState } from "./EmptyState";
import { InlineAlert } from "./InlineAlert";
import { Skeleton } from "./Skeleton";

describe("Button", () => {
  it("is a type=button by default, so it never submits a form by accident", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={onSubmit}><Button>Plain</Button><Button type="submit">Send</Button></form>);
    expect(screen.getByRole("button", { name: "Plain" })).toHaveAttribute("type", "button");
    await userEvent.click(screen.getByRole("button", { name: "Plain" }));
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("loading keeps the label, shows a spinner instead of the icon, disables the button and sets aria-busy", async () => {
    const onClick = vi.fn();
    render(<Button loading icon={<i data-testid="icon" />} onClick={onClick}>Save</Button>);
    const b = screen.getByRole("button", { name: "Save" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("icon")).not.toBeInTheDocument();
    expect(b.querySelector("svg.animate-spin")).not.toBeNull();
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows its icon when idle and is not busy", () => {
    render(<Button icon={<i data-testid="icon" />}>Go</Button>);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("disabled blocks clicks", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>No</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies variant, size, block and a custom class; forwards its ref", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref} variant="danger" size="lg" block className="mine">Delete</Button>);
    const b = screen.getByRole("button");
    expect(ref.current).toBe(b);
    expect(b.className).toContain("bg-danger-600");
    expect(b.className).toContain("h-11");
    expect(b.className).toContain("w-full");
    expect(b).toHaveClass("mine");
  });

  it("buttonClasses gives each variant and size its own look, with secondary/md as the default", () => {
    expect(buttonClasses()).toContain("bg-surface");
    expect(buttonClasses()).toContain("h-9");
    expect(buttonClasses()).not.toContain("w-full");
    expect(buttonClasses({ variant: "primary", size: "sm" })).toContain("bg-brand-600");
    expect(buttonClasses({ variant: "primary", size: "sm" })).toContain("h-8");
    expect(buttonClasses({ variant: "ghost" })).toContain("bg-transparent");
    expect(buttonClasses({ block: true })).toContain("w-full");
  });
});

describe("Card", () => {
  it("composes a header with a title and action, and a body", () => {
    render(
      <Card data-testid="card" className="extra">
        <CardHeader title="Recent" action={<a href="/x">All</a>} className="head" />
        <CardBody className="body">Content</CardBody>
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveClass("extra");
    expect(screen.getByRole("heading", { level: 2, name: "Recent" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All" })).toBeInTheDocument();
    expect(screen.getByText("Content")).toHaveClass("body", "p-5");
  });

  it("a header without an action renders just the title", () => {
    render(<CardHeader title="Only title" />);
    expect(screen.getByRole("heading", { name: "Only title" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("shows title, text, icon and action when all are given", () => {
    render(<EmptyState testId="empty" icon={<i data-testid="ic" />} title="No books" text="Add the first one." action={<button>Add</button>} />);
    expect(screen.getByTestId("empty")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No books" })).toBeInTheDocument();
    expect(screen.getByText("Add the first one.")).toBeInTheDocument();
    expect(screen.getByTestId("ic")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
  it("shows only the title when nothing else is given", () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(container.querySelectorAll("p, button, svg, i")).toHaveLength(0);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});

describe("InlineAlert", () => {
  it.each([
    ["danger", "alert"],
    ["warning", "alert"],
    ["info", "status"],
    ["success", "status"],
  ] as const)("%s uses role %s", (variant, role) => {
    render(<InlineAlert variant={variant} testId="a">Message</InlineAlert>);
    expect(screen.getByRole(role)).toHaveTextContent("Message");
    expect(screen.getByTestId("a")).toBeInTheDocument();
  });

  it("defaults to info, and shows an action and extra class", () => {
    render(<InlineAlert className="mb-3" action={<button>Retry</button>}>Hello</InlineAlert>);
    const a = screen.getByRole("status");
    expect(a).toHaveClass("mb-3");
    expect(a.className).toContain("bg-info-50");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("has no action slot without an action", () => {
    render(<InlineAlert variant="success">Done</InlineAlert>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech and takes the caller's size", () => {
    const { container } = render(<Skeleton className="h-7 w-48" />);
    const s = container.firstElementChild!;
    expect(s).toHaveAttribute("aria-hidden", "true");
    expect(s).toHaveClass("h-7", "w-48");
  });
});
