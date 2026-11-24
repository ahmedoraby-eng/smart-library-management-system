import type { LoanDto, MemberDto, MemberInput, MemberListQuery, MemberStatus, Page } from "@slm/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toQuery } from "../../lib/apiClient";

/** Every members query lives under this key, so circulation (SLM-4) can invalidate them all after a borrow or return. */
export const membersKey = ["members"] as const;

export function useMembers(query: MemberListQuery) {
  return useQuery({
    queryKey: [...membersKey, "list", query],
    queryFn: () => api<Page<MemberDto>>(`/members${toQuery(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useMember(id: string) {
  return useQuery({
    queryKey: [...membersKey, "detail", id],
    queryFn: () => api<MemberDto>(`/members/${encodeURIComponent(id)}`),
  });
}

/** Open and overdue first (the API orders them), then returned. Under the members key: a borrow refreshes it too. */
export function useMemberLoans(id: string, enabled = true) {
  return useQuery({
    queryKey: [...membersKey, "loans", id],
    queryFn: () => api<LoanDto[]>(`/members/${encodeURIComponent(id)}/loans`),
    enabled,
  });
}

export type MemberSaveInput = MemberInput & { status: MemberStatus };

/** Create (no id: always ACTIVE) or update (id + the version the form was loaded with). */
export function useSaveMember(id?: string, version?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MemberSaveInput) =>
      id
        ? api<MemberDto>(`/members/${encodeURIComponent(id)}`, { method: "PUT", body: { ...input, version } })
        : api<MemberDto>("/members", { method: "POST", body: { fullName: input.fullName, email: input.email, phone: input.phone } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey }),
  });
}

/** Deactivate / reactivate: the same guarded PUT with the member's other fields unchanged. */
export function useSetMemberStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ member, status }: { member: MemberDto; status: MemberStatus }) =>
      api<MemberDto>(`/members/${encodeURIComponent(member.id)}`, {
        method: "PUT",
        body: { fullName: member.fullName, email: member.email, phone: member.phone, status, version: member.version },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey }),
  });
}
