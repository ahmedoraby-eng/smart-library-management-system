import type { Config } from "../../platform/config";
import { AppError, ForbiddenError, UnauthenticatedError } from "../../platform/errors";
import { principalOf, type Principal } from "../../platform/security/principal";
import type { StaffUser, StaffUserRepository } from "../domain/StaffUser";

export class InvalidCredentialsError extends AppError {
  constructor() {
    // One generic message for a wrong email and a wrong password, so accounts can't be probed.
    super(401, "INVALID_CREDENTIALS", "Sign-in failed", "The email or password is not correct.");
  }
}

/**
 * Google may not sign in to a demo account, or to a row bound to another Google subject
 * (Yousef, SLM-8 review). Otherwise a real address configured as a demo email would get that
 * account's role with no password. The Google callback turns this into `?error=google`.
 */
export class GoogleAccountRefusedError extends AppError {
  constructor(reason: string) {
    super(403, "FORBIDDEN", "Forbidden", reason);
  }
}

/**
 * Turns a session or a sign-in into a staff principal.
 * The role always comes from our database, never from a token or cookie (architecture §5.2).
 */
export class StaffIdentityService {
  constructor(private readonly repo: StaffUserRepository, private readonly config: Config) {}

  /** Every request: the session carries only the id; role and status are read fresh. */
  async principalForSession(staffId: string): Promise<Principal> {
    const user = await this.repo.findById(staffId);
    if (!user) throw new UnauthenticatedError("Your session is no longer valid. Sign in again.");
    return this.active(user);
  }

  /**
   * Google sign-in (verified email). The row is found by Google's `sub` first, then by email (and the
   * `sub` is bound on that first match). New people: bootstrap admins become ADMIN, everyone else
   * read-only SUPERVISOR. Demo accounts never sign in through Google.
   */
  async signInWithGoogle(identity: { sub: string; email: string; name?: string | null }): Promise<Principal> {
    const email = identity.email.trim().toLowerCase();
    if (this.config.demoAccounts.some((a) => a.email === email)) throw new GoogleAccountRefusedError("Demo accounts sign in with their password only.");
    let user = await this.repo.findByGoogleSub(identity.sub);
    if (!user) {
      user = await this.repo.findByEmail(email);
      if (user && !user.isDemo) {
        if (user.googleSub && user.googleSub !== identity.sub) throw new GoogleAccountRefusedError("This staff account is bound to another Google account.");
        if (!user.googleSub && !(await this.repo.bindGoogleSub(user.id, identity.sub))) {
          throw new GoogleAccountRefusedError("This staff account was just bound to another Google account.");
        }
      }
    }
    if (user?.isDemo) throw new GoogleAccountRefusedError("Demo accounts sign in with their password only.");
    if (!user) {
      const role = this.config.bootstrapAdminEmails.includes(email) ? "ADMIN" : "SUPERVISOR";
      user = await this.repo.provision({ email, fullName: identity.name?.trim() || email.split("@")[0]!, role, googleSub: identity.sub });
      // A concurrent first sign-in with the same email but another subject inserted first.
      if (user.googleSub !== identity.sub) throw new GoogleAccountRefusedError("This staff account is bound to another Google account.");
    }
    return this.active(user);
  }

  /** Demo accounts (shared reviewer logins). Credentials come from secrets, never the repo. */
  async signInWithDemo(email: string, password: string): Promise<Principal> {
    const wanted = email.trim().toLowerCase();
    let match: Config["demoAccounts"][number] | null = null;
    // Compare against every account so timing does not reveal which email exists.
    for (const acc of this.config.demoAccounts) {
      const emailOk = await sameSecret(acc.email, wanted);
      const passwordOk = await sameSecret(acc.password, password);
      if (emailOk && passwordOk) match = acc;
    }
    if (!match) throw new InvalidCredentialsError();
    const user = await this.repo.upsertDemo({ email: match.email, fullName: match.fullName, role: match.role });
    return this.active(user);
  }

  /** Creates or restores the configured demo accounts (used by the reset job). */
  async ensureDemoAccounts(): Promise<void> {
    for (const acc of this.config.demoAccounts) {
      await this.repo.upsertDemo({ email: acc.email, fullName: acc.fullName, role: acc.role });
    }
  }

  private active(user: StaffUser): Principal {
    if (user.status !== "ACTIVE") throw new ForbiddenError("USER_DISABLED", "Your staff account is disabled.");
    return principalOf(user);
  }
}

/** Constant-time equality of two secrets: hash both, then compare every byte. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}
