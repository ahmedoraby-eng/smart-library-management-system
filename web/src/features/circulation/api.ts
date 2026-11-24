import type { BookDto, BorrowInput, LoanDto, LoanListQuery, MemberDto, Page } from "@slm/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toQuery } from "../../lib/apiClient";
import { booksKey } from "../books/api";

/** Every loans query lives under this key; borrow/return invalidate it with books, members and dashboard. */
export const loansKey = ["loans"] as const;
const membersKey = ["members"] as const;
const dashboardKey = ["dashboard"] as const;

export function useLoans(query: Partial<LoanListQuery>, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...loansKey, "list", query],
    queryFn: () => api<Page<LoanDto>>(`/loans${toQuery(query)}`),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}

/** Member search for the Borrow combobox (GET /api/members, SLM-3 contract). */
export function useMemberSearch(q: string) {
  return useQuery({
    queryKey: [...membersKey, "search", q],
    queryFn: () => api<Page<MemberDto>>(`/members${toQuery({ q, size: 8 })}`),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useMember(id: string | undefined) {
  return useQuery({
    queryKey: [...membersKey, "detail", id],
    queryFn: () => api<MemberDto>(`/members/${encodeURIComponent(id!)}`),
    enabled: Boolean(id),
  });
}

/** Book search for the Borrow combobox (GET /api/books, SLM-1/2). */
export function useBookSearch(q: string) {
  return useQuery({
    queryKey: [...booksKey, "search", q],
    queryFn: () => api<Page<BookDto>>(`/books${toQuery({ q, size: 8 })}`),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
}

function useInvalidateCirculation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([loansKey, booksKey, membersKey, dashboardKey].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useBorrow() {
  const invalidate = useInvalidateCirculation();
  return useMutation({
    mutationFn: (input: BorrowInput) => api<LoanDto>("/loans/borrow", { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useReturn() {
  const invalidate = useInvalidateCirculation();
  return useMutation({
    mutationFn: (loanId: string) => api<LoanDto>(`/loans/${encodeURIComponent(loanId)}/return`, { method: "POST" }),
    onSettled: () => invalidate(),
  });
}
