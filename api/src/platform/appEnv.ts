import type { Container } from "../container";
import type { Principal } from "./security/principal";

/** Hono context variables shared by every route module. */
export type AppEnv = {
  Variables: { requestId: string; container: Container; principal: Principal };
};
