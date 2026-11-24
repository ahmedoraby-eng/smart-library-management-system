import type { Principal } from "../../platform/security/principal";
import { OidcError, type OidcProvider } from "../domain/OidcProvider";
import type { StaffIdentityService } from "./StaffIdentityService";

/** What the browser keeps (in a signed, short-lived cookie) between /start and /callback. */
export interface PendingGoogleSignIn {
  state: string;
  verifier: string;
  nonce: string;
  next: string | null;
}

/** Why a callback failed; the route maps it to /signin?error=<reason>. */
export class GoogleSignInError extends Error {
  constructor(readonly reason: "google" | "google_unverified", detail: string) {
    super(detail);
  }
}

const b64url = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const random = (n = 32): string => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** Only same-origin paths may be a post-sign-in target (mirrors the web's safeNext; no open redirect). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/^\/signin(\?|#|\/|$)/.test(next)) return null;
  try {
    if (new URL(next, "http://same.origin").origin !== "http://same.origin") return null;
  } catch {
    return null;
  }
  return next;
}

/** Google OIDC authorization-code flow with PKCE (S256), state and nonce (architecture §5.1–5.2). */
export class GoogleSignIn {
  constructor(private readonly provider: OidcProvider, private readonly identity: StaffIdentityService) {}

  async begin(redirectUri: string, next: string | null | undefined): Promise<{ url: string; pending: PendingGoogleSignIn }> {
    const pending: PendingGoogleSignIn = { state: random(), verifier: random(48), nonce: random(), next: safeNextPath(next) };
    const url = this.provider.authorizeUrl({
      redirectUri,
      state: pending.state,
      nonce: pending.nonce,
      codeChallenge: await pkceChallenge(pending.verifier),
    });
    return { url, pending };
  }

  /**
   * Checks state, exchanges the code, checks nonce and email_verified, then provisions or loads the
   * staff user. USER_DISABLED (ForbiddenError) passes through untouched.
   */
  async complete(pending: PendingGoogleSignIn | null, params: { code?: string; state?: string; error?: string }, redirectUri: string): Promise<Principal> {
    if (params.error) throw new GoogleSignInError("google", "Google returned an error");
    if (!pending || !params.state || !params.code || params.state !== pending.state) {
      throw new GoogleSignInError("google", "Missing or mismatched state");
    }
    let claims;
    try {
      claims = await this.provider.exchange(params.code, pending.verifier, redirectUri);
    } catch (e) {
      if (e instanceof OidcError) throw new GoogleSignInError("google", e.message);
      throw e;
    }
    if (claims.nonce !== pending.nonce) throw new GoogleSignInError("google", "Nonce mismatch");
    if (!claims.emailVerified) throw new GoogleSignInError("google_unverified", "Google email not verified");
    return this.identity.signInWithGoogle({ email: claims.email, name: claims.name });
  }
}
