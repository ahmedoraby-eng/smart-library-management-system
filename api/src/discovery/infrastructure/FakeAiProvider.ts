import { estimateTokens } from "../domain/Cost";
import type { AiProvider, RankRequest } from "../domain/Discovery";

/** Deterministic stand-in for tests and local runs (AI_FAKE=true; refused in production by config). */
export class FakeAiProvider implements AiProvider {
  readonly name = "fake";

  async rank({ query, candidates, memberRecentTitles, onUsage }: RankRequest): Promise<unknown> {
    const already = new Set(memberRecentTitles.map((t) => t.toLowerCase()));
    const picks = candidates.filter((c) => !already.has(c.title.toLowerCase())).slice(0, 5);
    // Priced like the real ranking model, so the budget behaves the same in tests and local runs.
    onUsage?.({
      model: "@cf/meta/llama-3.2-3b-instruct",
      inputTokens: 800 + estimateTokens(query + JSON.stringify(candidates)),
      outputTokens: 60 * picks.length,
      estimated: true,
    });
    return {
      recommendations: picks.map((c, i) => ({
        bookId: c.id,
        reason: `A good fit for this request: “${c.title}” by ${c.author} covers ${c.category.toLowerCase()}.`,
        fit: 5 - i,
      })),
      note: picks.length ? null : "Nothing in the candidates fits this request.",
    };
  }
}
