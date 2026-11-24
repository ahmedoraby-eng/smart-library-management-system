import type { DiscoveryRequest, DiscoveryResponse } from "@slm/contracts";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";

/** A search is a POST that changes nothing, so it is a mutation (no cache, no refetch on focus). */
export function useDiscover() {
  return useMutation({
    mutationFn: (input: DiscoveryRequest) => api<DiscoveryResponse>("/ai/book-discovery", { method: "POST", body: input }),
  });
}
