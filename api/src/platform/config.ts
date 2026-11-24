/** Typed configuration from Worker vars/secrets or process env. Fails fast on unsafe combinations. */
export interface DemoAccount { email: string; password: string; role: "LIBRARIAN" | "ADMIN"; fullName: string }

export interface Config {
  environment: "local" | "test" | "production";
  sessionSecret: string;
  sessionHours: number;
  google: { clientId: string; clientSecret: string } | null;
  bootstrapAdminEmails: string[];
  demoAccountsEnabled: boolean;
  demoAccounts: DemoAccount[];
  loanDays: number;
  maxActiveLoans: number;
  aiModel: string | null;
  /** SLM-16: Workers AI embedding model for hybrid retrieval; null = vector search off (EMBEDDING_MODEL=off). */
  embeddingModel: string | null;
  /** SLM-16: cosine below this is noise for the embedding model (bge-base scores sit high). */
  embeddingMinSimilarity: number;
  /** SLM-16 cost controls: global Neurons per UTC day (free allowance is 10,000) and AI searches per user per day. */
  aiDailyNeuronCap: number;
  aiUserDailySearches: number;
  aiFake: boolean;
}

export type RawEnv = Record<string, unknown>;

const str = (env: RawEnv, key: string): string | null => {
  const v = env[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const int = (env: RawEnv, key: string, fallback: number, min: number, max: number): number => {
  const raw = str(env, key);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Config ${key} must be an integer ${min}–${max}`);
  return n;
};
const num = (env: RawEnv, key: string, fallback: number, min: number, max: number): number => {
  const raw = str(env, key);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Config ${key} must be a number ${min}–${max}`);
  return n;
};
const bool = (env: RawEnv, key: string): boolean => str(env, key)?.toLowerCase() === "true";

export function loadConfig(env: RawEnv): Config {
  const environment = (str(env, "ENVIRONMENT") ?? "production") as Config["environment"];
  if (!["local", "test", "production"].includes(environment)) throw new Error("Config ENVIRONMENT is invalid");

  const sessionSecret = str(env, "SESSION_SECRET");
  if (!sessionSecret || sessionSecret.length < 32) throw new Error("Config SESSION_SECRET must be at least 32 characters");

  const aiFake = bool(env, "AI_FAKE");
  // Test-only switches are refused in production (the deploy job checks this too).
  if (environment === "production" && aiFake) throw new Error("AI_FAKE is not allowed in production");

  const clientId = str(env, "GOOGLE_CLIENT_ID");
  const clientSecret = str(env, "GOOGLE_CLIENT_SECRET");
  // Both or neither: with neither, Google sign-in is off and the button hides.
  if ((clientId === null) !== (clientSecret === null)) throw new Error("Config GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together");

  const demoAccountsEnabled = bool(env, "DEMO_ACCOUNTS_ENABLED");
  const demoAccounts: DemoAccount[] = [];
  if (demoAccountsEnabled) {
    for (const [prefix, role, fullName] of [["DEMO_LIBRARIAN", "LIBRARIAN", "Demo Librarian"], ["DEMO_ADMIN", "ADMIN", "Demo Admin"]] as const) {
      const email = str(env, `${prefix}_EMAIL`)?.toLowerCase();
      const password = str(env, `${prefix}_PASSWORD`);
      if (!email || !password) throw new Error(`DEMO_ACCOUNTS_ENABLED needs ${prefix}_EMAIL and ${prefix}_PASSWORD`);
      if (password.length < 12) throw new Error(`${prefix}_PASSWORD must be at least 12 characters`);
      // A demo email must be on a reserved domain (RFC 2606), never a real inbox (Yousef, SLM-8 review).
      if (!/@[^@\s]+\.(test|invalid|example)$/.test(email)) throw new Error(`${prefix}_EMAIL must end in .test, .invalid or .example`);
      demoAccounts.push({ email, password, role, fullName });
    }
  }

  return {
    environment,
    sessionSecret,
    sessionHours: int(env, "SESSION_HOURS", 8, 1, 24),
    google: clientId && clientSecret ? { clientId, clientSecret } : null,
    bootstrapAdminEmails: (str(env, "BOOTSTRAP_ADMIN_EMAILS") ?? "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
    demoAccountsEnabled,
    demoAccounts,
    loanDays: int(env, "LOAN_DAYS", 14, 1, 60),
    maxActiveLoans: int(env, "MAX_ACTIVE_LOANS", 5, 1, 50),
    aiModel: str(env, "AI_MODEL"),
    embeddingModel: str(env, "EMBEDDING_MODEL")?.toLowerCase() === "off" ? null : (str(env, "EMBEDDING_MODEL") ?? "@cf/baai/bge-base-en-v1.5"),
    aiFake,
    embeddingMinSimilarity: num(env, "EMBEDDING_MIN_SIMILARITY", 0.72, 0, 1),
    aiDailyNeuronCap: int(env, "AI_DAILY_NEURON_CAP", 8000, 0, 1_000_000),
    aiUserDailySearches: int(env, "AI_USER_DAILY_SEARCHES", 50, 0, 10_000),
  };
}
