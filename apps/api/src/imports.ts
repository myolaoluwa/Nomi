import type { Express, Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db.js";
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(160);
const date = z.string().datetime({ offset: true });
const bank = z.object({
  title: text,
  account_id: uuid,
  category_id: uuid,
  type: z.enum(["income", "expense"]),
  amount: z.number().int().safe().positive().max(1e14),
  occurred_at: date,
  notes: z.string().max(4000).default(""),
});
const activity = z.object({
  title: text,
  category_id: uuid,
  occurred_at: date,
  duration: z.number().int().min(1).max(10080),
  location: z.string().max(200).default(""),
  notes: z.string().max(4000).default(""),
  tags: z.string().max(500).default(""),
});
const schema = z.object({
  source: z.enum(["bank_csv", "calendar_csv", "fitness_csv"]),
  name: text,
  rows: z.array(z.unknown()).min(1).max(500),
});
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
async function prepare(
  db: Database,
  user: string,
  input: z.infer<typeof schema>,
) {
  const rows = input.rows.map((r, i) => {
    try {
      return input.source === "bank_csv" ? bank.parse(r) : activity.parse(r);
    } catch (e) {
      if (e instanceof z.ZodError)
        throw new Error(
          `Row ${i + 1}: ${e.issues.map((issue) => issue.path.join(".") + " " + issue.message).join("; ")}`,
        );
      throw e;
    }
  });
  const categories = (
    await db.query("SELECT id,kind FROM categories WHERE user_id=$1", [user])
  ).rows;
  const accounts = (
    await db.query("SELECT id,currency FROM accounts WHERE user_id=$1", [user])
  ).rows;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cat = categories.find((c) => c.id === row.category_id);
    const kind =
      input.source === "bank_csv"
        ? (row as z.infer<typeof bank>).type
        : "activity";
    if (cat?.kind !== kind)
      throw new Error(
        `Row ${i + 1}: select a ${kind} category from your account`,
      );
    if (
      input.source === "bank_csv" &&
      !accounts.some((a) => a.id === (row as z.infer<typeof bank>).account_id)
    )
      throw new Error(`Row ${i + 1}: select an account from your account`);
  }
  return rows;
}
export function installImports(app: Express, db: Database) {
  app.get(
    "/api/imports",
    wrap(async (_req, res) => {
      res.json(
        (
          await db.query(
            "SELECT * FROM imports WHERE user_id=$1 ORDER BY created_at DESC",
            [res.locals.user.id],
          )
        ).rows,
      );
    }),
  );
  app.post(
    "/api/imports/preview",
    wrap(async (req, res) => {
      const input = schema.parse(req.body);
      try {
        const rows = await prepare(db, res.locals.user.id, input);
        res.json({
          source: input.source,
          name: input.name,
          count: rows.length,
          sample: rows.slice(0, 5),
          message: "Preview only. Nothing has been saved or connected.",
        });
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
      }
    }),
  );
  app.post(
    "/api/imports",
    wrap(async (req, res) => {
      const input = schema.extend({ consent: z.literal(true) }).parse(req.body);
      let rows;
      try {
        rows = await prepare(db, res.locals.user.id, input);
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
        return;
      }
      const user = res.locals.user.id,
        importId = randomUUID();
      const payload = JSON.stringify(
        rows.map((row) => ({ id: randomUUID(), ...row })),
      );
      let sql: string;
      if (input.source === "bank_csv")
        sql = `WITH new_import AS (INSERT INTO imports(id,user_id,source,name,record_count) VALUES($1,$2,$3,$4,$5) RETURNING id,user_id)
 INSERT INTO transactions(id,user_id,import_id,title,account_id,category_id,type,amount,occurred_at,notes)
 SELECT r.id,i.user_id,i.id,r.title,r.account_id,r.category_id,r.type,r.amount,r.occurred_at,r.notes FROM new_import i
 CROSS JOIN jsonb_to_recordset($6::jsonb) AS r(id uuid,title text,account_id uuid,category_id uuid,type text,amount bigint,occurred_at timestamptz,notes text)`;
      else
        sql = `WITH new_import AS (INSERT INTO imports(id,user_id,source,name,record_count) VALUES($1,$2,$3,$4,$5) RETURNING id,user_id)
 INSERT INTO activities(id,user_id,import_id,title,category_id,occurred_at,duration,location,notes,tags)
 SELECT r.id,i.user_id,i.id,r.title,r.category_id,r.occurred_at,r.duration,r.location,r.notes,r.tags FROM new_import i
 CROSS JOIN jsonb_to_recordset($6::jsonb) AS r(id uuid,title text,category_id uuid,occurred_at timestamptz,duration integer,location text,notes text,tags text)`;
      await db.query(sql, [
        importId,
        user,
        input.source,
        input.name,
        rows.length,
        payload,
      ]);
      res.status(201).json({
        id: importId,
        source: input.source,
        name: input.name,
        record_count: rows.length,
        status: "completed",
      });
    }),
  );
  app.delete(
    "/api/imports/:id",
    wrap(async (req, res) => {
      const importId = uuid.parse(req.params.id),
        user = res.locals.user.id;
      if (
        !(
          await db.query("SELECT id FROM imports WHERE id=$1 AND user_id=$2", [
            importId,
            user,
          ])
        ).rows.length
      ) {
        res.status(404).json({ error: "Import not found" });
        return;
      }
      await db.transaction(async (tx) => {
        await tx.query(
          "DELETE FROM activities WHERE import_id=$1 AND user_id=$2",
          [importId, user],
        );
        await tx.query(
          "UPDATE activities SET transaction_id=NULL WHERE user_id=$1 AND transaction_id IN (SELECT id FROM transactions WHERE import_id=$2 AND user_id=$1)",
          [user, importId],
        );
        await tx.query(
          "DELETE FROM transactions WHERE import_id=$1 AND user_id=$2",
          [importId, user],
        );
        await tx.query("DELETE FROM imports WHERE id=$1 AND user_id=$2", [
          importId,
          user,
        ]);
      });
      res.json({ ok: true });
    }),
  );
}
