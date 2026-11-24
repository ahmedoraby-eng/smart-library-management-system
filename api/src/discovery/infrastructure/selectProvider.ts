import type { Config } from "../../platform/config";
import type { AiProvider } from "../domain/Discovery";
import { FakeAiProvider } from "./FakeAiProvider";
import { WorkersAiProvider, type AiBinding } from "./WorkersAiProvider";

/** Runtime choice (architecture §6): AI_FAKE → fake; Workers AI binding + model → Workers AI; otherwise none (keyword fallback). */
export function selectAiProvider(config: Pick<Config, "aiFake" | "aiModel">, ai: AiBinding | undefined): AiProvider | null {
  if (config.aiFake) return new FakeAiProvider();
  if (ai && typeof ai.run === "function" && config.aiModel) return new WorkersAiProvider(ai, config.aiModel);
  return null;
}
