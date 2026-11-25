import type {
  BookDeleteResult,
  BookDto,
  BookInput,
  BookListQuery,
  IsbnLookupResult,
  Page,
  SimilarBooksResponse,
} from "@slm/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toQuery } from "../../lib/apiClient";

/** Every books query lives under this key, so circulation (SLM-4) can invalidate them all at once. */
export const booksKey = ["books"] as const;

export function useBooks(query: BookListQuery) {
  return useQuery({
    queryKey: [...booksKey, "list", query],
    queryFn: () => api<Page<BookDto>>(`/books${toQuery(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: [...booksKey, "categories"],
    queryFn: async () => (await api<{ items: string[] }>("/books/categories")).items,
    staleTime: 60_000,
  });
}

export function useBook(id: string) {
  return useQuery({
    queryKey: [...booksKey, "detail", id],
    queryFn: () => api<BookDto>(`/books/${encodeURIComponent(id)}`),
  });
}

/**
 * SLM-19 "More like this": up to 4 books closest in meaning (stored vectors, no model call). Under booksKey, so a
 * borrow or return refreshes their availability with everything else.
 */
export function useSimilarBooks(id: string) {
  return useQuery({
    queryKey: [...booksKey, "similar", id],
    queryFn: () => api<SimilarBooksResponse>(`/books/${encodeURIComponent(id)}/similar`),
    staleTime: 60_000,
  });
}

/** Create (no id) or update (id + the version the form was loaded with). */
export function useSaveBook(id?: string, version?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BookInput) =>
      id
        ? api<BookDto>(`/books/${encodeURIComponent(id)}`, { method: "PUT", body: { ...input, version } })
        : api<BookDto>("/books", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: booksKey }),
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<BookDeleteResult>(`/books/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: booksKey }),
  });
}

/** SLM-13: suggestions from Open Library for the book form. Not cached: each click asks again. */
export function lookupIsbn(isbn: string) {
  return api<IsbnLookupResult>(`/books/isbn-lookup${toQuery({ isbn })}`);
}
