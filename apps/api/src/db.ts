import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readFile } from "node:fs/promises";
export interface Database {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
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
          close: () => pool.end(),
        };
      })()
    : new PGlite(process.env.DATA_DIR || "./.data");
  const sql = await readFile(
    new URL("../migrations/001_initial.sql", import.meta.url),
    "utf8",
  );
  for (const statement of sql.split(";").filter((s) => s.trim()))
    await db.query(statement);
  return db;
}
