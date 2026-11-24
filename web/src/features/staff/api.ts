import type { Page, StaffUserDto, StaffUserListQuery, StaffUserUpdate } from "@slm/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toQuery } from "../../lib/apiClient";

export const staffUsersKey = ["staff-users"] as const;

export function useStaffUsers(query: StaffUserListQuery) {
  return useQuery({
    queryKey: [...staffUsersKey, "list", query],
    queryFn: () => api<Page<StaffUserDto>>(`/staff-users${toQuery(query)}`),
    placeholderData: keepPreviousData,
  });
}

/** Role and status change together (the API takes both). The change applies on the user's next request. */
export function useUpdateStaffUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: StaffUserUpdate }) =>
      api<StaffUserDto>(`/staff-users/${encodeURIComponent(id)}`, { method: "PUT", body: change }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: staffUsersKey }),
  });
}

/** `POST /api/admin/reset-demo` (the nightly job, on demand). Every cached list is stale afterwards. */
export function useResetDemoData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ result: string }>("/admin/reset-demo", { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
