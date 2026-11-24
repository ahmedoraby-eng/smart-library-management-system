import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { OidcError, type OidcAuthorizeRequest, type OidcIdentity, type OidcProvider } from "../domain/OidcProvider";

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

// One remote JWKS per isolate: jose caches the keys and refetches on an unknown kid.
let googleJwks: JWTVerifyGetKey | null = null;
const defaultJwks = (): JWTVerifyGetKey => (googleJwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)));

export interface GoogleOidcOptions {
  /** Key source for ID-token signatures; tests pass a local JWKS. */
  jwks?: JWTVerifyGetKey;
  fetch?: typeof fetch;
}

/** Real Google adapter: authorization URL, code exchange (PKCE) and ID-token verification with jose. */
export class GoogleOidcProvider implements OidcProvider {
  constructor(
    private readonly client: { clientId: string; clientSecret: string },
    private readonly options: GoogleOidcOptions = {},
  ) {}

  authorizeUrl(req: OidcAuthorizeRequest): string {
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: this.client.clientId,
      redirect_uri: req.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: req.state,
      nonce: req.nonce,
      code_challenge: req.codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return url.toString();
  }

  async exchange(code: string, verifier: string, redirectUri: string): Promise<OidcIdentity> {
    const doFetch = this.options.fetch ?? fetch;
    let res: Response;
    try {
      res = await doFetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
          client_id: this.client.clientId,
          client_secret: this.client.clientSecret,
        }).toString(),
      });
    } catch {
      throw new OidcError("Token endpoint unreachable");
    }
    // Never log the body: it holds tokens.
    if (!res.ok) throw new OidcError(`Token exchange failed (HTTP ${res.status})`);
    const body = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
    if (!body || typeof body.id_token !== "string") throw new OidcError("Token response has no id_token");
    return this.verifyIdToken(body.id_token);
  }

  /** Signature against Google's JWKS, plus iss, aud and exp. Nonce and email_verified are checked by the caller. */
  async verifyIdToken(idToken: string): Promise<OidcIdentity> {
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, this.options.jwks ?? defaultJwks(), {
        issuer: GOOGLE_ISSUERS,
        audience: this.client.clientId,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "iat", "sub"],
      }));
    } catch (e) {
      throw new OidcError(`ID token rejected (${(e as { code?: string }).code ?? "invalid"})`);
    }
    if (typeof payload.email !== "string" || payload.email === "") throw new OidcError("ID token has no email");
    return {
      sub: payload.sub as string,
      email: payload.email,
      emailVerified: payload.email_verified === true || payload.email_verified === "true",
      name: typeof payload.name === "string" ? payload.name : null,
      nonce: typeof payload.nonce === "string" ? payload.nonce : null,
    };
  }
}
