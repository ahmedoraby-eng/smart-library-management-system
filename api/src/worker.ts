import { Client } from "pg";
import { createApp } from "./app";
import { buildContainer } from "./container";
import { systemClock } from "./platform/clock";
import { loadConfig } from "./platform/config";
import type { AiBinding } from "./discovery/infrastructure/WorkersAiProvider";
import { createDb } from "./platform/db";

interface Env {
  HYPERDRIVE?: Hyperdrive;
  DATABASE_URL?: string;
  AI?: AiBinding;
  [key: string]: unknown;
}

/** One pg connection per invocation through Hyperdrive (its pool keeps the real connections warm). */
async function openContainer(env: Env) {
  const config = loadConfig(env);
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) throw new Error("No database binding (HYPERDRIVE or DATABASE_URL)");
  const client = new Client({ connectionString });
  await client.connect();
  return { container: buildContainer(createDb(client), config, systemClock, env.AI), close: () => client.end() };
}

/** Built once per isolate, so in-memory state (fallback rate limiters) survives across requests. */
const app = createApp((c) => openContainer(c.env as Env));

/**
 * Cloudflare Worker entry. Static SPA assets are served by the platform; /api/* reaches Hono.
 * The Cron Trigger restores the demo data nightly (same code as the Admin reset button).
 */
export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil((async () => {
      let close: (() => Promise<void>) | undefined;
      try {
        const opened = await openContainer(env);
        close = opened.close;
        await opened.container.demoData.reset();
        console.log(JSON.stringify({ level: "info", message: "demo data reset (cron)" }));
        await opened.container.bookIndex.syncAllSafely(); // SLM-16: re-embed the seeded books
      } catch (e) {
        console.error(JSON.stringify({ level: "error", message: "demo reset failed (cron)", error: String(e), stack: (e as Error)?.stack }));
        throw e;
      } finally {
        await close?.().catch(() => undefined);
      }
    })());
  },
} satisfies ExportedHandler<Env>;
