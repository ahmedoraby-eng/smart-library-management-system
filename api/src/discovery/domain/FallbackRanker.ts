import { MAX_ITEMS, type Candidate } from "./Discovery";
import { templateReason, type ValidRecommendation } from "./RecommendationValidator";

/** Deterministic ranking when no model is available: best retrieval score first, ties by title. */
export function fallbackRank(candidates: Candidate[], limit: number = MAX_ITEMS): ValidRecommendation[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((candidate) => ({ candidate, reason: templateReason(candidate) }));
}
