// @vitest-environment jsdom
import type { MemberDto } from "@slm/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { MemberModal } from "./MemberModal";
import { emptyValues, isDirty, validateMember, valuesFromMember } from "./memberFormModel";

const existing: MemberDto = {
  id: "m1", memberNumber: "M-000042", fullName: "Sara Haddad", email: "sara@example.org", phone: null, status: "ACTIVE",
  registeredAt: "2026-01-01T00:00:00.000Z", activeLoans: 0, overdueLoans: 0, version: 3,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => json(status, { type: "about:blank", title: code, status, code, ...extra });

afterEach(() => vi.unstubAllGlobals());

async function setup(opts: { member?: MemberDto; fetch: ReturnType<typeof vi.fn> }) {
  vi.stubGlobal("fetch", opts.fetch);
  const onClose = vi.fn();
  const user = userEvent.setup();
  await renderWithProviders(<MemberModal member={opts.member} onClose={onClose} />);
  await screen.findByTestId("member-modal");
  return { user, onClose };
}
const field = (name: string) => screen.getByTestId(`field-${name}`);
const fillValid = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(field("fullName"), "Sara");
  await user.type(field("email"), "sara@example.org");
};

describe("MemberModal server error mapping", () => {
  it("VALIDATION_FAILED with a field the form doesn't have shows it as the general error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(400, "VALIDATION_FAILED", { errors: [{ field: "nickname", message: "Nickname is not allowed." }] }));
    const { user } = await setup({ fetch: fetchMock });
    await fillValid(user);
    await user.click(screen.getByTestId("save-member"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Nickname is not allowed.");
  });

  it("VALIDATION_FAILED with several errors on one field keeps the first; a field error and an unknown one both show", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(400, "VALIDATION_FAILED", {
      errors: [
        { field: "email", message: "First email problem." },
        { field: "email", message: "Second email problem." },
        { field: "other", message: "Other problem." },
      ],
    }));
    const { user } = await setup({ fetch: fetchMock });
    await fillValid(user);
    await user.click(screen.getByTestId("save-member"));
    expect(await screen.findByText("First email problem.")).toBeInTheDocument();
    expect(screen.queryByText("Second email problem.")).not.toBeInTheDocument();
    expect(screen.getByTestId("form-error")).toHaveTextContent("Other problem.");
    await waitFor(() => expect(field("email")).toHaveFocus());
  });

  it("VALIDATION_FAILED with no per-field errors falls back to the problem detail, then to a default sentence", async () => {
    const withDetail = vi.fn().mockResolvedValue(problem(400, "VALIDATION_FAILED", { detail: "Something is off." }));
    const first = await setup({ fetch: withDetail });
    await fillValid(first.user);
    await first.user.click(screen.getByTestId("save-member"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Something is off.");
  });

  it("VALIDATION_FAILED with nothing at all says to check the highlighted fields", async () => {
    const bare = vi.fn().mockResolvedValue(json(400, { type: "about:blank", title: "", status: 400, code: "VALIDATION_FAILED", errors: [] }));
    const { user } = await setup({ fetch: bare });
    await fillValid(user);
    await user.click(screen.getByTestId("save-member"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Check the highlighted fields and try again.");
  });

  it("404 NOT_FOUND on save says the member no longer exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(404, "NOT_FOUND"));
    const { user } = await setup({ member: existing, fetch: fetchMock });
    await user.clear(field("fullName"));
    await user.type(field("fullName"), "Changed");
    await user.click(screen.getByTestId("save-member"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent("This member no longer exists. Close this window and refresh the list.");
  });

  it("a 403 shows nothing in the form (handled app-wide)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(403, "FORBIDDEN"));
    const { user, onClose } = await setup({ fetch: fetchMock });
    await fillValid(user);
    await user.click(screen.getByTestId("save-member"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("save-member")).toBeEnabled());
    expect(screen.queryByTestId("form-error")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("another 4xx code shows the general 'nothing was saved' message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(422, "SOMETHING_ELSE"));
    const { user } = await setup({ fetch: fetchMock });
    await fillValid(user);
    await user.click(screen.getByTestId("save-member"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Couldn't save the member. Nothing was saved. Try again.");
  });

  it("a network failure (no response) shows the same general message", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const { user } = await setup({ fetch: fetchMock });
    await fillValid(user);
    await user.click(screen.getByTestId("save-member"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Couldn't save the member. Nothing was saved. Try again.");
  });

  it("the general error clears when the user submits again", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(problem(500, "INTERNAL"))
      .mockResolvedValueOnce(json(201, { ...existing, id: "new" }));
    const { user, onClose } = await setup({ fetch: fetchMock });
    await fillValid(user);
    await user.click(screen.getByTestId("save-member"));
    await screen.findByTestId("form-error");
    await user.click(screen.getByTestId("save-member"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByTestId("form-error")).not.toBeInTheDocument();
  });
});

describe("MemberModal stale edit and reload", () => {
  it("when reloading the latest version fails, the modal says so and stays blocked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(problem(409, "STALE_VERSION"))
      .mockResolvedValueOnce(problem(500, "INTERNAL"));
    const { user } = await setup({ member: existing, fetch: fetchMock });
    await user.clear(field("fullName"));
    await user.type(field("fullName"), "Mine");
    await user.click(screen.getByTestId("save-member"));
    await screen.findByTestId("stale-notice");
    await user.click(screen.getByTestId("reload-member"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Couldn't reload this member. Close this window and try again.");
    expect(screen.getByTestId("stale-notice")).toBeInTheDocument();
    expect(screen.getByTestId("save-member")).toBeDisabled();
    expect(field("fullName")).toHaveValue("Mine");
  });

  it("submitting with Enter while the conflict notice is up does nothing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(problem(409, "STALE_VERSION"));
    const { user } = await setup({ member: existing, fetch: fetchMock });
    await user.clear(field("fullName"));
    await user.type(field("fullName"), "Mine");
    await user.click(screen.getByTestId("save-member"));
    await screen.findByTestId("stale-notice");
    await user.type(field("fullName"), "{Enter}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("MemberModal while saving", () => {
  it("Escape and Cancel do nothing until the save finishes; a second submit posts only once", async () => {
    let finish: (r: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const { user, onClose } = await setup({ fetch: fetchMock });
    await fillValid(user);
    await user.click(screen.getByTestId("save-member"));
    await waitFor(() => expect(screen.getByTestId("cancel-member")).toBeDisabled());
    field("fullName").focus();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await user.type(field("fullName"), "{Enter}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(json(201, { ...existing, id: "new" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Escape closes an idle modal", async () => {
    const { user, onClose } = await setup({ fetch: vi.fn() });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the modal shows the Edit title and button label for an existing member and tracks unsaved changes", async () => {
    const { user } = await setup({ member: existing, fetch: vi.fn() });
    expect(screen.getByRole("heading", { name: "Edit member" })).toBeInTheDocument();
    expect(screen.getByTestId("save-member")).toHaveTextContent("Save changes");
    expect(screen.getByTestId("member-form")).not.toHaveAttribute("data-dirty");
    await user.type(field("phone"), "+20 100 000 0000");
    expect(screen.getByTestId("member-form")).toHaveAttribute("data-dirty", "true");
  });
});

describe("memberFormModel", () => {
  it("valuesFromMember maps a missing phone to an empty string and keeps the status", () => {
    expect(valuesFromMember(existing)).toEqual({ fullName: "Sara Haddad", email: "sara@example.org", phone: "", status: "ACTIVE" });
    expect(valuesFromMember({ ...existing, phone: "+20 1", status: "INACTIVE" })).toMatchObject({ phone: "+20 1", status: "INACTIVE" });
  });

  it("validateMember returns normalised data on success and the first message per field on failure", () => {
    const ok = validateMember({ fullName: "  Sara ", email: "SARA@example.org", phone: "", status: "ACTIVE" });
    expect(ok.errors).toEqual({});
    expect(ok.data).toMatchObject({ fullName: "Sara", email: "sara@example.org", status: "ACTIVE" });
    const bad = validateMember({ ...emptyValues });
    expect(bad.data).toBeNull();
    expect(bad.errors.fullName).toBe("Enter the member's full name.");
    expect(bad.errors.email).toBe("Enter the member's email address.");
  });

  it("isDirty compares every field", () => {
    expect(isDirty(emptyValues, emptyValues)).toBe(false);
    expect(isDirty({ ...emptyValues, status: "INACTIVE" }, emptyValues)).toBe(true);
    expect(isDirty({ ...emptyValues, phone: "1" }, emptyValues)).toBe(true);
  });
});
