import type { MemberDto } from "@slm/contracts";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button, InlineAlert, Input, Modal, Select, useToast } from "../../components/ui";
import { ApiError, api } from "../../lib/apiClient";
import { useSaveMember } from "./api";
import { DeactivateDialog } from "./DeactivateDialog";
import {
  emptyValues, FIELD_ORDER, isDirty, type MemberField, type MemberFormValues, valuesFromMember, validateMember,
} from "./memberFormModel";

const STALE_MESSAGE = "Someone else changed this member while you were editing. Reload to see their version; your changes are not saved.";
const FORM_ID = "member-form";

type ServerErrors = Partial<Record<MemberField, ReactNode>>;

/**
 * Add / edit member (ux.md §3.5, U7: member form = modal). Client rules come from the shared
 * MemberInputSchema; server errors map onto the same fields (DUPLICATE_EMAIL → Email).
 * Edit pins the snapshot (and its version) it was opened with until the user reloads after a conflict.
 */
export function MemberModal({ member, onClose, onSaved }: { member?: MemberDto; onClose: () => void; onSaved?: (m: MemberDto) => void }) {
  const toast = useToast();
  const [snapshot, setSnapshot] = useState(member);
  const initial = useMemo(() => (snapshot ? valuesFromMember(snapshot) : emptyValues), [snapshot]);
  const [values, setValues] = useState<MemberFormValues>(initial);
  const [touched, setTouched] = useState<Partial<Record<MemberField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reloading, setReloading] = useState(false);
  const save = useSaveMember(snapshot?.id, snapshot?.version);

  const { data: parsed, errors } = useMemo(() => validateMember(values), [values]);
  const dirty = isDirty(values, initial);

  const set = (field: MemberField) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setServerErrors((s) => (s[field] ? { ...s, [field]: undefined } : s));
  };
  const blur = (field: MemberField) => () => setTouched((t) => ({ ...t, [field]: true }));
  const errorOf = (field: MemberField): ReactNode => serverErrors[field] ?? (touched[field] || submitted ? errors[field] : undefined);
  const props = (field: Exclude<MemberField, "status">) => ({
    id: `member-${field}`,
    name: field,
    value: values[field],
    onChange: set(field),
    onBlur: blur(field),
    error: errorOf(field),
    "data-testid": `field-${field}`,
  });

  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const focusField = (field: MemberField) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => document.getElementById(`member-${field}`)?.focus());
  };

  const mapServerError = (err: unknown) => {
    if (!(err instanceof ApiError)) return setGeneral("Couldn't save the member. Nothing was saved. Try again.");
    switch (err.code) {
      case "VALIDATION_FAILED": {
        const next: ServerErrors = {};
        let rest: string | null = null;
        for (const e of err.problem.errors ?? []) {
          if ((FIELD_ORDER as string[]).includes(e.field)) next[e.field as MemberField] ??= e.message;
          else rest ??= e.message;
        }
        setServerErrors(next);
        if (rest || Object.keys(next).length === 0) setGeneral(rest ?? err.problem.detail ?? "Check the highlighted fields and try again.");
        const first = FIELD_ORDER.find((f) => next[f]);
        if (first) focusField(first);
        return;
      }
      case "DUPLICATE_EMAIL":
        setServerErrors({ email: "Another member already uses this email." });
        return focusField("email");
      case "STALE_VERSION":
        return setStale(true);
      case "NOT_FOUND":
        return setGeneral("This member no longer exists. Close this window and refresh the list.");
      default:
        if (err.status !== 401 && err.status !== 403) setGeneral("Couldn't save the member. Nothing was saved. Try again.");
    }
  };

  const doSave = async () => {
    if (!parsed) return;
    try {
      const saved = await save.mutateAsync(parsed);
      toast.success(snapshot ? "Changes saved." : "Member added.");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setConfirming(false);
      mapServerError(err);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (save.isPending || stale) return;
    setSubmitted(true);
    setGeneral(null);
    if (!parsed) {
      const first = FIELD_ORDER.find((f) => errors[f]);
      if (first) focusField(first);
      return;
    }
    // Deactivating from here asks first, like everywhere else (AC5).
    if (snapshot && snapshot.status === "ACTIVE" && parsed.status === "INACTIVE") return setConfirming(true);
    await doSave();
  };

  const reload = async () => {
    if (!snapshot) return;
    setReloading(true);
    try {
      const latest = await api<MemberDto>(`/members/${encodeURIComponent(snapshot.id)}`);
      setSnapshot(latest);
      setValues(valuesFromMember(latest));
      setTouched({});
      setSubmitted(false);
      setServerErrors({});
      setGeneral(null);
      setStale(false);
    } catch {
      setGeneral("Couldn't reload this member. Close this window and try again.");
    } finally {
      setReloading(false);
    }
  };

  return (
    <>
      <Modal
        title={snapshot ? "Edit member" : "Add member"}
        onClose={save.isPending ? () => undefined : onClose}
        testId="member-modal"
        footer={
          <>
            <Button onClick={onClose} disabled={save.isPending} data-testid="cancel-member">
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" loading={save.isPending && !confirming} disabled={stale} data-testid="save-member">
              {snapshot ? "Save changes" : "Add member"}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={snapshot ? "Edit member" : "Add member"} data-testid="member-form" data-dirty={dirty || undefined}>
          {snapshot && (
            <p className="text-sm text-neutral-600" data-testid="member-number">
              Member no. <span className="font-semibold tabular-nums text-neutral-800">{snapshot.memberNumber}</span>
            </p>
          )}
          <Input label="Full name" autoComplete="off" {...props("fullName")} />
          <Input label="Email" type="email" autoComplete="off" {...props("email")} />
          <Input label="Phone" optional type="tel" autoComplete="off" {...props("phone")} />
          {snapshot && (
            <Select
              label="Status"
              id="member-status"
              value={values.status}
              onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as MemberFormValues["status"] }))}
              data-testid="field-status"
              className="h-10!"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          )}
          {stale && (
            <InlineAlert variant="danger" testId="stale-notice" action={<Button size="sm" loading={reloading} onClick={() => void reload()} data-testid="reload-member">Reload</Button>}>
              {STALE_MESSAGE}
            </InlineAlert>
          )}
          {general && (
            <InlineAlert variant="danger" testId="form-error">
              {general}
            </InlineAlert>
          )}
        </form>
      </Modal>
      {confirming && snapshot && (
        <DeactivateDialog name={snapshot.fullName} loading={save.isPending} onCancel={() => setConfirming(false)} onConfirm={() => void doSave()} />
      )}
    </>
  );
}
