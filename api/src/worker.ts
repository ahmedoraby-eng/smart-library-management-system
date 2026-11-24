import { Client } from "pg";
import { createApp } from "./app";
import { buildContainer, type Container } from "./container";
import { systemClock } from "./platform/clock";
import { loadConfig } from "./platform/config";
import { createDb } from "./platform/db";

interface Env {
  HYPERDRIVE?: Hyperdrive;
  DATABASE_URL?: string;
  [key: string]: unknown;
}

/** One pg connection per invocation through Hyperdrive (its pool keeps the real connections warm). */
async function openContainer(env: Env): Promise<{ container: Container; close: () => Promise<void> }> {
  const config = loadConfig(env);
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) throw new Error("No database binding (HYPERDRIVE or DATABASE_URL)");
  const client = new Client({ connectionString });
  await client.connect();
  return { container: buildContainer(createDb(client), config, systemClock), close: () => client.end() };
}

/**
 * Cloudflare Worker entry. Static SPA assets are served by the platform; /api/* reaches Hono.
 * The Cron Trigger restores the demo data nightly (same code as the Admin reset button).
 */
export default {
  async fetch(request, env, ctx) {
    let opened: Awaited<ReturnType<typeof openContainer>> | null = null;
    const app = createApp(async () => (opened ??= await openContainer(env)).container);
    try {
      return await app.fetch(request, env, ctx);
    } finally {
      const o = opened as Awaited<ReturnType<typeof openContainer>> | null;
      if (o) ctx.waitUntil(o.close().catch(() => undefined));
    }
  },

  async scheduled(_controller, env, ctx) {
    const { container, close } = await openContainer(env);
    ctx.waitUntil(
      container.demoData.reset()
        .then(() => console.log(JSON.stringify({ level: "info", message: "demo data reset (cron)" })))
        .finally(() => close()),
    );
  },
} satisfies ExportedHandler<Env>;
