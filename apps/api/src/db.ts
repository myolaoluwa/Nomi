import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readFile } from "node:fs/promises";
export interface Queryable {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function connect(): Promise<Database> {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
    throw new Error("DATABASE_URL required in production");
  const db: Database = process.env.DATABASE_URL
    ? (() => {
        const pool = new pg.Pool({
          connectionString: process.env.DATABASE_URL,
        });
        return {
          query: (sql: string, values?: any[]) => pool.query(sql, values),
          transaction: async <T>(fn: (tx: Queryable) => Promise<T>) => {
            const client = await pool.connect();
            try {
              await client.query("BEGIN");
              const result = await fn({
                query: (sql, values) => client.query(sql, values),
              });
              await client.query("COMMIT");
              return result;
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            } finally {
              client.release();
            }
          },
          close: () => pool.end(),
        };
      })()
    : (() => {
        const lite = new PGlite(process.env.DATA_DIR || "./.data");
        return {
          query: (sql: string, values?: any[]) => lite.query(sql, values),
          transaction: <T>(fn: (tx: Queryable) => Promise<T>) =>
            lite.transaction((tx) =>
              fn({ query: (sql, values) => tx.query(sql, values) }),
            ),
          close: () => lite.close(),
        };
      })();
  try {
    await db.transaction(async (tx) => {
      if (process.env.DATABASE_URL)
        await tx.query("SELECT pg_advisory_xact_lock(614734291)");
      await tx.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const [index, migration] of [
        "001_initial.sql",
        "002_v1.sql",
        "003_offline.sql",
        "004_recovery.sql",
      ].entries()) {
        const version = index + 1;
        if (
          (
            await tx.query(
              "SELECT version FROM schema_migrations WHERE version=$1",
              [version],
            )
          ).rows.length
        )
          continue;
        const sql = await readFile(
          new URL(`../migrations/${migration}`, import.meta.url),
          "utf8",
        );
        for (const statement of sql.split(";").filter((s) => s.trim()))
          await tx.query(statement);
      }
    });
  } catch (error) {
    await db.close();
    throw error;
  }
  return db;
}
