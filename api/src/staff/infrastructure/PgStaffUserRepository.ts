import { asc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../../platform/db";
import type { StaffAccessStore, StaffListParams, StaffUser, StaffUserRepository } from "../domain/StaffUser";
import { staffUsers } from "./schema";

export class PgStaffUserRepository implements StaffUserRepository, StaffAccessStore {
  constructor(private readonly db: DbOrTx) {}

  async findByEmail(email: string): Promise<StaffUser | null> {
    const rows = await this.db
      .select()
      .from(staffUsers)
      .where(sql`lower(${staffUsers.email}) = ${email.toLowerCase()}`)
      .limit(1);
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<StaffUser | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rows = await this.db.select().from(staffUsers).where(eq(staffUsers.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByGoogleSub(sub: string): Promise<StaffUser | null> {
    const rows = await this.db.select().from(staffUsers).where(eq(staffUsers.googleSub, sub)).limit(1);
    return rows[0] ?? null;
  }

  async bindGoogleSub(id: string, sub: string): Promise<boolean> {
    const r = await this.db.execute(
      sql`UPDATE staff_users SET google_sub = ${sub} WHERE id = ${id} AND google_sub IS NULL`,
    );
    return (r.rowCount ?? 0) === 1;
  }

  async provision(input: {
    email: string;
    fullName: string;
    role: StaffUser["role"];
    googleSub: string;
  }): Promise<StaffUser> {
    await this.db
      .insert(staffUsers)
      .values({
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        role: input.role,
        googleSub: input.googleSub,
      })
      .onConflictDoNothing();
    const row = await this.findByEmail(input.email);
    if (!row) throw new Error("provision: row missing after insert");
    return row;
  }

  async upsertDemo(input: { email: string; fullName: string; role: StaffUser["role"] }): Promise<StaffUser> {
    const email = input.email.toLowerCase();
    await this.db.execute(sql`
      INSERT INTO staff_users (email, full_name, role, status, is_demo)
      VALUES (${email}, ${input.fullName}, ${input.role}, 'ACTIVE', true)
      ON CONFLICT (lower(email)) DO UPDATE
        SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = 'ACTIVE', is_demo = true`);
    const row = await this.findByEmail(email);
    if (!row) throw new Error("upsertDemo: row missing after upsert");
    return row;
  }

  async list(): Promise<StaffUser[]> {
    return this.db.select().from(staffUsers).orderBy(asc(staffUsers.fullName));
  }

  async update(
    id: string,
    change: { role: StaffUser["role"]; status: StaffUser["status"] },
  ): Promise<StaffUser | null> {
    const rows = await this.db.update(staffUsers).set(change).where(eq(staffUsers.id, id)).returning();
    return rows[0] ?? null;
  }

  async search(p: StaffListParams): Promise<{ items: StaffUser[]; total: number }> {
    const where = p.q
      ? sql`WHERE full_name ILIKE ${"%" + likeEscape(p.q) + "%"} OR email ILIKE ${"%" + likeEscape(p.q) + "%"}`
      : sql``;
    const [{ rows }, count] = await Promise.all([
      this.db.execute(sql`SELECT ${COLUMNS} FROM staff_users ${where}
        ORDER BY lower(full_name) ASC, id ASC LIMIT ${p.size} OFFSET ${(p.page - 1) * p.size}`),
      this.db.execute(sql`SELECT count(*)::int AS n FROM staff_users ${where}`),
    ]);
    return { items: rows.map(toStaffUser), total: Number(count.rows[0]?.n ?? 0) };
  }

  async changeAccess<V>(
    id: string,
    change: { role: StaffUser["role"]; status: StaffUser["status"] },
    decide: (target: StaffUser, activeAdminIds: string[]) => V | null,
  ): Promise<{ kind: "ok"; user: StaffUser } | { kind: "refused"; reason: V } | null> {
    if (!UUID.test(id)) return null;
    return this.db.transaction(async (tx) => {
      // One statement, ordered by id: the target and every ACTIVE ADMIN (the acting Admin among them)
      // are locked together, so two Admins demoting each other at once serialise here and the second
      // sees the first's change; the rules then re-check the actor against these locked rows.
      const { rows } = await tx.execute(sql`SELECT ${COLUMNS} FROM staff_users
        WHERE id = ${id} OR (role = 'ADMIN' AND status = 'ACTIVE') ORDER BY id FOR UPDATE`);
      const locked = rows.map(toStaffUser);
      const target = locked.find((u) => u.id === id);
      if (!target) return null;
      const activeAdminIds = locked.filter((u) => u.role === "ADMIN" && u.status === "ACTIVE").map((u) => u.id);
      const reason = decide(target, activeAdminIds);
      if (reason !== null) return { kind: "refused" as const, reason };
      const updated = await tx.execute(sql`UPDATE staff_users SET role = ${change.role}, status = ${change.status}
        WHERE id = ${id} RETURNING ${COLUMNS}`);
      return { kind: "ok" as const, user: toStaffUser(updated.rows[0]!) };
    });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);
const COLUMNS = sql.raw("id, email, full_name, role, status, is_demo, google_sub, created_at");

function toStaffUser(r: Record<string, unknown>): StaffUser {
  return {
    id: r.id as string,
    email: r.email as string,
    fullName: r.full_name as string,
    role: r.role as StaffUser["role"],
    status: r.status as StaffUser["status"],
    isDemo: Boolean(r.is_demo),
    googleSub: (r.google_sub as string | null) ?? null,
    createdAt: new Date(r.created_at as string | Date),
  };
}
