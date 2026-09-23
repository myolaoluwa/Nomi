import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import type { Database } from "./db.js";
import { installV1 } from "./v1.js";
import { installImports } from "./imports.js";
const scrypt = promisify(scryptCallback);
const text = z.string().trim().min(1).max(160);
const currency = z
  .string()
  .refine(
    (v) => Intl.supportedValuesOf("currency").includes(v),
    "Choose a valid currency",
  );
const timezone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "Invalid timezone");
const locale = z
  .string()
  .max(40)
  .refine((v) => {
    try {
      return Intl.DateTimeFormat.supportedLocalesOf(v).length > 0;
    } catch {
      return false;
    }
  }, "Invalid locale");
const profile = z.object({ name: text, currency, timezone, locale });
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(128),
});
const money = z.number().int().safe().max(1e14);
const date = z.string().datetime({ offset: true });
const schemas = {
  accounts: z.object({
    name: text,
    type: z.enum(["bank", "cash", "savings", "credit"]),
    currency,
    opening_balance: money.min(-1e14),
  }),
  categories: z.object({
    name: text,
    kind: z.enum(["income", "expense", "activity"]),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default("#47796b"),
  }),
  transactions: z.object({
    title: text,
    account_id: z.string().uuid(),
    category_id: z.string().uuid(),
    type: z.enum(["income", "expense"]),
    amount: money.positive(),
    occurred_at: date,
    notes: z.string().max(4000).default(""),
  }),
  budgets: z.object({
    category_id: z.string().uuid(),
    currency,
    amount: money.positive(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }),
  activities: z.object({
    title: text,
    category_id: z.string().uuid(),
    occurred_at: date,
    duration: z.number().int().min(1).max(10080),
    transaction_id: z.string().uuid().nullable().default(null),
    goal_id: z.string().uuid().nullable().default(null),
    client_id: z.string().uuid().nullable().default(null),
    location: z.string().max(200).default(""),
    notes: z.string().max(4000).default(""),
    tags: z.string().max(500).default(""),
  }),
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const wrap =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
export function createApp(db: Database) {
  const app = express();
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  const origins = (process.env.WEB_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim());
  app.use(
    helmet(),
    cors({ origin: origins, credentials: true }),
    express.json({ limit: "32kb" }),
  );
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      !origins.includes(req.headers.origin)
    ) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    next();
  });
  app.get(
    "/health",
    wrap(async (_req, res) => {
      await db.query("SELECT 1");
      res.json({ status: "ok", app: "nomi-api" });
    }),
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 40,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many sign-in attempts. Try again later." },
    }),
  );
  const production = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: production ? ("none" as const) : ("lax" as const),
    path: "/api",
  };
  async function session(userId: string, res: Response) {
    const token = randomBytes(32).toString("hex");
    await db.query("DELETE FROM sessions WHERE expires_at<now()");
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [hash(token), userId],
    );
    res.cookie("nomi_session", token, {
      ...cookieOptions,
      maxAge: 7 * 86400000,
    });
  }
  app.post(
    "/api/auth/register",
    wrap(async (req, res) => {
      const input = credentials.merge(profile).parse(req.body);
      const salt = randomBytes(16).toString("hex");
      const digest = (
        (await scrypt(input.password, salt, 64)) as Buffer
      ).toString("hex");
      const id = randomUUID();
      const defaults = [
        ["Salary", "income"],
        ["Other income", "income"],
        ["Food & dining", "expense"],
        ["Transport", "expense"],
        ["Shopping", "expense"],
        ["Bills", "expense"],
        ["Other expenses", "expense"],
        ["Work", "activity"],
        ["Exercise", "activity"],
        ["Reading", "activity"],
        ["Shopping", "activity"],
        ["Travel", "activity"],
        ["Personal", "activity"],
      ];
      // Create the user and starter categories atomically in one SQL statement.
      await db.query(
        `WITH new_user AS (
          INSERT INTO users(id,email,password_hash,name,currency,timezone,locale)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id
        ) INSERT INTO categories(id,user_id,name,kind)
        SELECT c.id,u.id,c.name,c.kind FROM new_user u
        CROSS JOIN jsonb_to_recordset($8::jsonb) AS c(id uuid,name text,kind text)`,
        [
          id,
          input.email,
          `${salt}:${digest}`,
          input.name,
          input.currency,
          input.timezone,
          input.locale,
          JSON.stringify(
            defaults.map(([name, kind]) => ({ id: randomUUID(), name, kind })),
          ),
        ],
      );
      await session(id, res);
      res.status(201).json({ id });
    }),
  );
  app.post(
    "/api/auth/login",
    wrap(async (req, res) => {
      const input = credentials.parse(req.body);
      const user = (
        await db.query("SELECT * FROM users WHERE email=$1", [input.email])
      ).rows[0];
      const [salt, digest] = user
        ? user.password_hash.split(":")
        : ["invalid", "00".repeat(64)];
      const candidate = (await scrypt(input.password, salt, 64)) as Buffer;
      if (!timingSafeEqual(candidate, Buffer.from(digest, "hex")) || !user) {
        res.status(401).json({ error: "Email or password is incorrect" });
        return;
      }
      await session(user.id, res);
      res.json({ id: user.id });
    }),
  );
  app.use("/api", (req, res, next) => {
    void (async () => {
      const token = (req.headers.cookie || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("nomi_session="))
        ?.slice(13);
      const user =
        token &&
        (
          await db.query(
            "SELECT u.id,u.email,u.name,u.currency,u.timezone,u.locale FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
            [hash(token)],
          )
        ).rows[0];
      if (!user) {
        res.status(401).json({ error: "Please sign in to continue" });
        return;
      }
      res.locals.user = user;
      res.locals.token = token;
      next();
    })().catch(next);
  });
  app.post(
    "/api/auth/logout",
    wrap(async (_req, res) => {
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hash(res.locals.token),
      ]);
      res.clearCookie("nomi_session", cookieOptions);
      res.json({ ok: true });
    }),
  );
  app.get("/api/me", (_req, res) => res.json(res.locals.user));
  app.put(
    "/api/me",
    wrap(async (req, res) => {
      const p = profile.parse(req.body);
      res.json(
        (
          await db.query(
            "UPDATE users SET name=$1,currency=$2,timezone=$3,locale=$4,updated_at=now() WHERE id=$5 RETURNING id,email,name,currency,timezone,locale",
            [p.name, p.currency, p.timezone, p.locale, res.locals.user.id],
          )
        ).rows[0],
      );
    }),
  );
  installV1(app, db);
  installImports(app, db);
  for (const resource of Object.keys(schemas) as (keyof typeof schemas)[]) {
    app.get(
      `/api/${resource}`,
      wrap(async (_req, res) =>
        res.json(
          (
            await db.query(
              `SELECT * FROM ${resource} WHERE user_id=$1 ORDER BY created_at DESC`,
              [res.locals.user.id],
            )
          ).rows,
        ),
      ),
    );
    for (const method of ["post", "put"] as const)
      app[method](
        `/api/${resource}${method === "put" ? "/:id" : ""}`,
        wrap(async (req, res) => {
          const data: Record<string, any> = schemas[resource].parse(req.body);
          const uid = res.locals.user.id;
          const id =
            method === "put"
              ? z.string().uuid().parse(req.params.id)
              : randomUUID();
          if (
            method === "put" &&
            !(
              await db.query(
                `SELECT id FROM ${resource} WHERE id=$1 AND user_id=$2`,
                [id, uid],
              )
            ).rows.length
          ) {
            res.status(404).json({ error: "Record not found" });
            return;
          }
          if (data.category_id) {
            const category = (
              await db.query(
                "SELECT kind FROM categories WHERE id=$1 AND user_id=$2",
                [data.category_id, uid],
              )
            ).rows[0];
            const kind =
              resource === "activities"
                ? "activity"
                : resource === "budgets"
                  ? "expense"
                  : data.type;
            if (category?.kind !== kind) {
              res.status(400).json({ error: "Choose a matching category" });
              return;
            }
          }
          if (
            resource === "activities" &&
            data.goal_id &&
            !(
              await db.query(
                "SELECT id FROM goals WHERE id=$1 AND user_id=$2",
                [data.goal_id, uid],
              )
            ).rows.length
          ) {
            res.status(400).json({ error: "Choose a goal from your account" });
            return;
          }
          if (resource === "categories" && method === "put") {
            const old = (
              await db.query(
                "SELECT kind FROM categories WHERE id=$1 AND user_id=$2",
                [id, uid],
              )
            ).rows[0];
            if (old.kind !== data.kind) {
              res
                .status(400)
                .json({ error: "Category type cannot be changed" });
              return;
            }
          }
          if (resource === "accounts" && method === "put") {
            const old = (
              await db.query(
                "SELECT currency FROM accounts WHERE id=$1 AND user_id=$2",
                [id, uid],
              )
            ).rows[0];
            if (
              old.currency !== data.currency &&
              (
                await db.query(
                  "SELECT id FROM transactions WHERE account_id=$1 LIMIT 1",
                  [id],
                )
              ).rows.length
            ) {
              res.status(409).json({
                error:
                  "Currency cannot change after transactions have been recorded",
              });
              return;
            }
          }
          const keys = Object.keys(data),
            values = Object.values(data);
          const sql =
            method === "post"
              ? `INSERT INTO ${resource} (${["id", "user_id", ...keys].join(",")}) VALUES (${[id, uid, ...values].map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`
              : `UPDATE ${resource} SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(",")},updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`;
          res
            .status(method === "post" ? 201 : 200)
            .json((await db.query(sql, [id, uid, ...values])).rows[0]);
        }),
      );
    app.delete(
      `/api/${resource}/:id`,
      wrap(async (req, res) => {
        const id = z.string().uuid().parse(req.params.id);
        const result = await db.query(
          `DELETE FROM ${resource} WHERE id=$1 AND user_id=$2 RETURNING id`,
          [id, res.locals.user.id],
        );
        res
          .status(result.rows.length ? 200 : 404)
          .json(
            result.rows.length ? { ok: true } : { error: "Record not found" },
          );
      }),
    );
  }
  app.use((_req, res) => res.status(404).json({ error: "Endpoint not found" }));
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      return;
    }
    if (error.code === "23505") {
      res.status(409).json({ error: "This record already exists" });
      return;
    }
    if (error.code === "23503") {
      res.status(409).json({
        error:
          "Record is linked to other data, or the selected record is unavailable. Remove the link first.",
      });
      return;
    }
    if (error.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });
  return app;
}
