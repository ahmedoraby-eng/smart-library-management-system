import { type MemberDto, type MemberInput, MemberInputSchema, type MemberStatus } from "@slm/contracts";

/** Form state is all strings; the shared MemberInputSchema validates it, so messages match the server's. */
export interface MemberFormValues {
  fullName: string;
  email: string;
  phone: string;
  status: MemberStatus;
}
export type MemberField = keyof MemberFormValues;
export type MemberFormErrors = Partial<Record<MemberField, string>>;

/** Top-to-bottom, so "focus the first error" matches what the user sees. */
export const FIELD_ORDER: MemberField[] = ["fullName", "email", "phone", "status"];

export const emptyValues: MemberFormValues = { fullName: "", email: "", phone: "", status: "ACTIVE" };

export const valuesFromMember = (m: MemberDto): MemberFormValues => ({ fullName: m.fullName, email: m.email, phone: m.phone ?? "", status: m.status });

export function validateMember(v: MemberFormValues): { data: (MemberInput & { status: MemberStatus }) | null; errors: MemberFormErrors } {
  const r = MemberInputSchema.safeParse({ fullName: v.fullName, email: v.email, phone: v.phone });
  if (r.success) return { data: { ...r.data, status: v.status }, errors: {} };
  const errors: MemberFormErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && FIELD_ORDER.includes(key as MemberField) && !errors[key as MemberField]) errors[key as MemberField] = issue.message;
  }
  return { data: null, errors };
}

export const isDirty = (a: MemberFormValues, b: MemberFormValues) => FIELD_ORDER.some((k) => a[k] !== b[k]);
