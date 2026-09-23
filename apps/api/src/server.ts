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
import type { Database, Queryable } from "./db.js";
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
const confirmedPassword = z
  .object({
    password: z.string().min(12).max(128),
    password_confirmation: z.string(),
  })
  .refine((value) => value.password === value.password_confirmation, {
    path: ["password_confirmation"],
    message: "Passwords do not match",
  });
const email = credentials.shape.email;
const recoveryCodeInput = z.string().trim().max(100);
const passwordHash = async (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const digest = ((await scrypt(password, salt, 64)) as Buffer).toString("hex");
  return `${salt}:${digest}`;
};
const passwordMatches = async (password: string, stored?: string) => {
  const [salt, digest] = stored?.split(":") ?? ["invalid", "00".repeat(64)];
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(digest, "hex")) && !!stored;
};
const newRecoveryCode = () =>
  `NOMI-${randomBytes(20)
    .toString("hex")
    .toUpperCase()
    .match(/.{1,8}/g)!
    .join("-")}`;
const recoveryDigest = (code: string) =>
  hash(`nomi-recovery-v1:${code.replace(/[\s-]/g, "").toUpperCase()}`);
const recoveryMatches = (code: string, stored?: string) => {
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  const candidate = recoveryDigest(code);
  return (
    /^NOMI[0-9A-F]{40}$/.test(normalized) &&
    timingSafeEqual(
      Buffer.from(candidate, "hex"),
      Buffer.from(stored ?? "00".repeat(32), "hex"),
    ) &&
    !!stored
  );
};
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
  const production = process.env.NODE_ENV === "production";
  if (production) app.set("trust proxy", 1);
  if (production && !process.env.WEB_ORIGIN)
    throw new Error("WEB_ORIGIN required in production");
  const origins = (process.env.WEB_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(
    helmet(),
    cors({ origin: origins, credentials: true }),
    express.json({ limit: "2.5mb" }),
  );
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.vary("Sec-Fetch-Site");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      ((production && !req.headers.origin) ||
        (req.headers.origin && !origins.includes(req.headers.origin)) ||
        req.headers["sec-fetch-site"] === "cross-site")
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
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/api",
  };
  async function createSession(userId: string, query: Queryable = db) {
    const token = randomBytes(32).toString("hex");
    await query.query("DELETE FROM sessions WHERE expires_at<now()");
    await query.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [hash(token), userId],
    );
    return token;
  }
  function setSessionCookie(token: string, res: Response) {
    res.cookie("nomi_session", token, {
      ...cookieOptions,
      maxAge: 7 * 86400000,
    });
  }
  app.post(
    "/api/auth/register",
    wrap(async (req, res) => {
      const input = credentials
        .merge(profile)
        .and(confirmedPassword)
        .parse(req.body);
      const digest = await passwordHash(input.password);
      const recoveryCode = newRecoveryCode();
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
      const token = await db.transaction(async (tx) => {
        await tx.query(
          `WITH new_user AS (
          INSERT INTO users(id,email,password_hash,name,currency,timezone,locale,recovery_code_hash)
          VALUES($1,$2,$3,$4,$5,$6,$7,$9) RETURNING id
        ) INSERT INTO categories(id,user_id,name,kind)
        SELECT c.id,u.id,c.name,c.kind FROM new_user u
        CROSS JOIN jsonb_to_recordset($8::jsonb) AS c(id uuid,name text,kind text)`,
          [
            id,
            input.email,
            digest,
            input.name,
            input.currency,
            input.timezone,
            input.locale,
            JSON.stringify(
              defaults.map(([name, kind]) => ({
                id: randomUUID(),
                name,
                kind,
              })),
            ),
            recoveryDigest(recoveryCode),
          ],
        );
        return createSession(id, tx);
      });
      setSessionCookie(token, res);
      res.status(201).json({ id, recovery_code: recoveryCode });
    }),
  );
  app.post(
    "/api/auth/login",
    wrap(async (req, res) => {
      const input = credentials.parse(req.body);
      const user = (
        await db.query("SELECT * FROM users WHERE email=$1", [input.email])
      ).rows[0];
      if (!(await passwordMatches(input.password, user?.password_hash))) {
        res.status(401).json({ error: "Email or password is incorrect" });
        return;
      }
      setSessionCookie(await createSession(user.id), res);
      res.json({ id: user.id });
    }),
  );
  app.post(
    "/api/auth/recover",
    wrap(async (req, res) => {
      const input = z
        .object({ email, recovery_code: recoveryCodeInput })
        .and(confirmedPassword)
        .parse(req.body);
      const replacement = newRecoveryCode();
      const nextPassword = await passwordHash(input.password);
      const changed = await db.transaction(async (tx: Queryable) => {
        const user = (
          await tx.query(
            "SELECT id,recovery_code_hash FROM users WHERE email=$1 FOR UPDATE",
            [input.email],
          )
        ).rows[0];
        if (!recoveryMatches(input.recovery_code, user?.recovery_code_hash))
          return false;
        await tx.query(
          "UPDATE users SET password_hash=$1,recovery_code_hash=$2,updated_at=now() WHERE id=$3",
          [nextPassword, recoveryDigest(replacement), user.id],
        );
        await tx.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
        return true;
      });
      if (!changed) {
        res.status(401).json({ error: "Email or recovery code is incorrect" });
        return;
      }
      res.clearCookie("nomi_session", cookieOptions);
      res.json({ recovery_code: replacement });
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
            "SELECT u.id,u.email,u.name,u.currency,u.timezone,u.locale,(u.recovery_code_hash IS NOT NULL) AS recovery_code_set FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
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
  app.post(
    "/api/auth/recovery-code",
    wrap(async (req, res) => {
      const { password } = z
        .object({ password: z.string().min(1).max(128) })
        .parse(req.body);
      const code = newRecoveryCode();
      const changed = await db.transaction(async (tx) => {
        const user = (
          await tx.query(
            "SELECT password_hash FROM users WHERE id=$1 FOR UPDATE",
            [res.locals.user.id],
          )
        ).rows[0];
        if (!(await passwordMatches(password, user?.password_hash)))
          return false;
        await tx.query(
          "UPDATE users SET recovery_code_hash=$1,updated_at=now() WHERE id=$2",
          [recoveryDigest(code), res.locals.user.id],
        );
        return true;
      });
      if (!changed) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
      res.json({ recovery_code: code });
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
            "UPDATE users SET name=$1,currency=$2,timezone=$3,locale=$4,updated_at=now() WHERE id=$5 RETURNING id,email,name,currency,timezone,locale,(recovery_code_hash IS NOT NULL) AS recovery_code_set",
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
    if (error.type === "entity.too.large") {
      res.status(413).json({ error: "Request is too large" });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });
  return app;
}
