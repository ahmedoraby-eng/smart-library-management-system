import { asc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../../platform/db";
import type { StaffUser, StaffUserRepository } from "../domain/StaffUser";
import { staffUsers } from "./schema";

export class PgStaffUserRepository implements StaffUserRepository {
  constructor(private readonly db: DbOrTx) {}

  async findByEmail(email: string): Promise<StaffUser | null> {
    const rows = await this.db.select().from(staffUsers).where(sql`lower(${staffUsers.email}) = ${email.toLowerCase()}`).limit(1);
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<StaffUser | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rows = await this.db.select().from(staffUsers).where(eq(staffUsers.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async provision(input: { email: string; fullName: string; role: StaffUser["role"] }): Promise<StaffUser> {
    await this.db
      .insert(staffUsers)
      .values({ email: input.email.toLowerCase(), fullName: input.fullName, role: input.role })
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

  async update(id: string, change: { role: StaffUser["role"]; status: StaffUser["status"] }): Promise<StaffUser | null> {
    const rows = await this.db.update(staffUsers).set(change).where(eq(staffUsers.id, id)).returning();
    return rows[0] ?? null;
  }
}
