/**
 * Port for an OpenID Connect identity provider (Google today). The application layer runs the
 * sign-in flow against this interface; the real HTTP + JWKS work lives in infrastructure, and
 * tests swap in a fake, so no test ever calls Google.
 */
export interface OidcAuthorizeRequest {
  redirectUri: string;
  state: string;
  nonce: string;
  /** base64url(SHA-256(verifier)), sent with code_challenge_method=S256. */
  codeChallenge: string;
}

/** The verified claims we use from the ID token (signature, iss, aud and exp are already checked). */
export interface OidcIdentity {
  /** Google's stable subject id (`sub`). */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  nonce: string | null;
}

export interface OidcProvider {
  authorizeUrl(request: OidcAuthorizeRequest): string;
  /** Exchanges the authorization code (PKCE) and returns the verified ID-token identity. Throws OidcError on any failure. */
  exchange(code: string, verifier: string, redirectUri: string): Promise<OidcIdentity>;
}

/** Any provider-side failure (exchange refused, token invalid). The message is safe to log: never a token. */
export class OidcError extends Error {
  override readonly name = "OidcError";
}
