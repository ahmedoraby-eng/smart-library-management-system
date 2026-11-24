// @vitest-environment jsdom
import type { MemberDto } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { MemberModal } from "./MemberModal";

const existing: MemberDto = {
  id: "m1", memberNumber: "M-000042", fullName: "Sara Haddad", email: "sara@example.org", phone: "+20 100 123 4567", status: "ACTIVE",
  registeredAt: "2026-01-01T00:00:00.000Z", activeLoans: 1, overdueLoans: 0, version: 3,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json(status, { type: "about:blank", title: code, status, code, ...extra });

afterEach(() => vi.unstubAllGlobals());

async function setup(opts: { member?: MemberDto; fetch?: ReturnType<typeof vi.fn> } = {}) {
  const fetchMock = opts.fetch ?? vi.fn().mockResolvedValue(json(201, { ...existing, id: "new" }));
  vi.stubGlobal("fetch", fetchMock);
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const user = userEvent.setup();
  await renderWithProviders(<MemberModal member={opts.member} onClose={onClose} onSaved={onSaved} />);
  await screen.findByTestId("member-modal");
  return { user, fetchMock, onClose, onSaved };
}

const field = (name: string) => screen.getByTestId(`field-${name}`);
const save = () => screen.getByTestId("save-member");
const sentBody = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(fetchMock.mock.calls[0]![1].body as string);

describe("MemberModal validation (ux.md §3.5)", () => {
  it("opens with the first field focused", async () => {
    await setup();
    expect(field("fullName")).toHaveFocus();
  });

  it("blocks submit and shows the required-field messages, focusing the first error", async () => {
    const { user, fetchMock } = await setup();
    await user.click(save());
    expect(await screen.findByText("Enter the member's full name.")).toBeInTheDocument();
    expect(screen.getByText("Enter the member's email address.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(field("fullName")).toHaveFocus());
    expect(field("fullName")).toHaveAttribute("aria-invalid", "true");
  });

  it("validates on blur, not while untouched", async () => {
    const { user } = await setup();
    expect(screen.queryByText("Enter the member's full name.")).not.toBeInTheDocument();
    await user.click(field("fullName"));
    await user.tab();
    expect(await screen.findByText("Enter the member's full name.")).toBeInTheDocument();
    expect(screen.queryByText("Enter a valid email address.")).not.toBeInTheDocument();
  });

  it("rejects a malformed email and a non-phone phone; phone stays optional", async () => {
    const { user } = await setup();
    await user.type(field("email"), "sara@");
    await user.tab();
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    await user.type(field("phone"), "call me");
    await user.tab();
    expect(await screen.findByText("Enter a valid phone number.")).toBeInTheDocument();
    await user.clear(field("phone"));
    await user.tab();
    await waitFor(() => expect(screen.queryByText("Enter a valid phone number.")).not.toBeInTheDocument());
    await user.clear(field("email"));
    await user.type(field("email"), "sara@example.org");
    await user.tab();
    await waitFor(() => expect(screen.queryByText("Enter a valid email address.")).not.toBeInTheDocument());
  });

  it("creates with normalised data (trimmed name, lower-case email, no status) and reports success", async () => {
    const { user, fetchMock, onClose, onSaved } = await setup();
    await user.type(field("fullName"), "  Sara Haddad ");
    await user.type(field("email"), "Sara@Example.ORG");
    await user.click(save());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/members");
    expect(fetchMock.mock.calls[0]![1].method).toBe("POST");
    expect(sentBody(fetchMock)).toEqual({ fullName: "Sara Haddad", email: "sara@example.org", phone: null });
    expect(await screen.findByTestId("toast")).toHaveTextContent("Member added.");
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("the Add dialog has no Status field (new members are Active)", async () => {
    await setup();
    expect(screen.queryByTestId("field-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-number")).not.toBeInTheDocument();
  });
});

describe("MemberModal server errors", () => {
  it("maps 409 DUPLICATE_EMAIL onto the Email field and keeps the dialog open", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(409, "DUPLICATE_EMAIL"));
    const { user, onClose } = await setup({ fetch: fetchMock });
    await user.type(field("fullName"), "Sara Haddad");
    await user.type(field("email"), "sara@example.org");
    await user.click(save());
    expect(await screen.findByText("Another member already uses this email.")).toBeInTheDocument();
    expect(field("email")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(field("email")).toHaveFocus());
    expect(onClose).not.toHaveBeenCalled();
    // editing the field clears the server message
    await user.type(field("email"), "x");
    expect(screen.queryByText("Another member already uses this email.")).not.toBeInTheDocument();
  });

  it("maps 400 VALIDATION_FAILED errors to their fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(400, "VALIDATION_FAILED", { errors: [{ field: "fullName", message: "Keep the name under 200 characters." }] }));
    const { user } = await setup({ fetch: fetchMock });
    await user.type(field("fullName"), "Sara");
    await user.type(field("email"), "sara@example.org");
    await user.click(save());
    expect(await screen.findByText("Keep the name under 200 characters.")).toBeInTheDocument();
    await waitFor(() => expect(field("fullName")).toHaveFocus());
  });

  it("shows a general error for a failure it can't map", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(500, "INTERNAL"));
    const { user } = await setup({ fetch: fetchMock });
    await user.type(field("fullName"), "Sara");
    await user.type(field("email"), "sara@example.org");
    await user.click(save());
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Couldn't save the member. Nothing was saved. Try again.");
  });
});

describe("MemberModal edit", () => {
  it("shows the member number read-only and the current values", async () => {
    await setup({ member: existing });
    expect(screen.getByTestId("member-number")).toHaveTextContent("M-000042");
    expect(field("fullName")).toHaveValue("Sara Haddad");
    expect(field("email")).toHaveValue("sara@example.org");
    expect(field("phone")).toHaveValue("+20 100 123 4567");
    expect(field("status")).toHaveValue("ACTIVE");
  });

  it("saves with the loaded version and the changed fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ...existing, fullName: "Sara H." }));
    const { user } = await setup({ member: existing, fetch: fetchMock });
    await user.clear(field("fullName"));
    await user.type(field("fullName"), "Sara H.");
    await user.click(save());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/members/m1");
    expect(fetchMock.mock.calls[0]![1].method).toBe("PUT");
    expect(sentBody(fetchMock)).toEqual({ fullName: "Sara H.", email: "sara@example.org", phone: "+20 100 123 4567", status: "ACTIVE", version: 3 });
    expect(await screen.findByTestId("toast")).toHaveTextContent("Changes saved.");
  });

  it("setting Inactive asks for confirmation first; Cancel saves nothing", async () => {
    const { user, fetchMock } = await setup({ member: existing });
    await user.selectOptions(field("status"), "INACTIVE");
    await user.click(save());
    const dialog = await screen.findByTestId("deactivate-dialog");
    expect(dialog).toHaveTextContent("Deactivate Sara Haddad?");
    expect(dialog).toHaveTextContent("Their current loans stay open.");
    await user.click(within(dialog).getByTestId("dialog-cancel"));
    expect(screen.queryByTestId("deactivate-dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirming the deactivation sends status INACTIVE", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ...existing, status: "INACTIVE", version: 4 }));
    const { user } = await setup({ member: existing, fetch: fetchMock });
    await user.selectOptions(field("status"), "INACTIVE");
    await user.click(save());
    await user.click(await screen.findByTestId("dialog-confirm"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody(fetchMock)).toMatchObject({ status: "INACTIVE", version: 3 });
  });

  it("reactivating needs no confirmation", async () => {
    const inactive = { ...existing, status: "INACTIVE" as const };
    const fetchMock = vi.fn().mockResolvedValue(json(200, existing));
    const { user } = await setup({ member: inactive, fetch: fetchMock });
    await user.selectOptions(field("status"), "ACTIVE");
    await user.click(save());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("deactivate-dialog")).not.toBeInTheDocument();
    expect(sentBody(fetchMock)).toMatchObject({ status: "ACTIVE" });
  });

  it("an edit conflict shows the notice, disables Save, and Reload loads the latest version", async () => {
    const latest = { ...existing, fullName: "Sara Haddad-Nasser", version: 4 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(problem(409, "STALE_VERSION"))
      .mockResolvedValueOnce(json(200, latest));
    const { user } = await setup({ member: existing, fetch: fetchMock });
    await user.clear(field("fullName"));
    await user.type(field("fullName"), "Mine");
    await user.click(save());
    expect(await screen.findByTestId("stale-notice")).toHaveTextContent("Someone else changed this member while you were editing.");
    expect(save()).toBeDisabled();
    await user.click(screen.getByTestId("reload-member"));
    await waitFor(() => expect(field("fullName")).toHaveValue("Sara Haddad-Nasser"));
    expect(screen.queryByTestId("stale-notice")).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });
});
