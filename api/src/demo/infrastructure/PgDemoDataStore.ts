import demoSql from "../../../../seed/demo.sql";
import { inRawTransaction, type Db } from "../../platform/db";

/** Replaces catalogue, members and loans with the demo seed, atomically. Staff accounts are kept. */
export class PgDemoDataStore {
  constructor(private readonly db: Db) {}

  async replaceWithSeed(): Promise<void> {
    await inRawTransaction(this.db, async (client) => {
      await client.query("TRUNCATE loans, members, books");
      await client.query("ALTER SEQUENCE member_number_seq RESTART WITH 1");
      await client.query(demoSql);
    });
  }
}
