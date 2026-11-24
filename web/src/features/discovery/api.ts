import type { AiQuota, DiscoveryRequest, DiscoveryResponse } from "@slm/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";

/** SLM-16: the caller's AI searches left today ("49 of 50 AI searches left today"). */
export const aiQuotaKey = ["ai-quota"] as const;

export function useAiQuota() {
  return useQuery({ queryKey: aiQuotaKey, queryFn: () => api<AiQuota>("/ai/quota"), staleTime: 60_000 });
}

/** A search is a POST that changes nothing, so it is a mutation (no cache, no refetch on focus). */
export function useDiscover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DiscoveryRequest) => api<DiscoveryResponse>("/ai/book-discovery", { method: "POST", body: input }),
    // Each answer carries the searches left after it, so the counter updates without another request.
    onSuccess: (data) => {
      if (data.aiSearches) queryClient.setQueryData(aiQuotaKey, data.aiSearches);
    },
  });
}
