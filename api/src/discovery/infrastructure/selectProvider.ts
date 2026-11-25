import type { Config } from "../../platform/config";
import type { AiProvider, Embedder } from "../domain/Discovery";
import { FakeEmbedder } from "./FakeEmbedder";
import { WorkersAiEmbedder } from "./WorkersAiEmbedder";
import { FakeAiProvider } from "./FakeAiProvider";
import { WorkersAiProvider, type AiBinding } from "./WorkersAiProvider";

/** Runtime choice (architecture §6): AI_FAKE → fake; Workers AI binding + model → Workers AI; otherwise none (keyword fallback). */
export function selectAiProvider(
  config: Pick<Config, "aiFake" | "aiModel">,
  ai: AiBinding | undefined,
): AiProvider | null {
  if (config.aiFake) return new FakeAiProvider();
  if (ai && typeof ai.run === "function" && config.aiModel) return new WorkersAiProvider(ai, config.aiModel);
  return null;
}

/** SLM-16, same rule for embeddings: AI_FAKE → fake; Workers AI binding + EMBEDDING_MODEL → Workers AI; otherwise none (full-text only). */
export function selectEmbedder(
  config: Pick<Config, "aiFake" | "embeddingModel" | "embeddingMinSimilarity">,
  ai: AiBinding | undefined,
): Embedder | null {
  if (config.aiFake) return new FakeEmbedder();
  if (ai && typeof ai.run === "function" && config.embeddingModel)
    return new WorkersAiEmbedder(ai, config.embeddingModel, config.embeddingMinSimilarity);
  return null;
}
