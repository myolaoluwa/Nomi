import type { Express, Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db.js";

const text = z.string().trim().min(1).max(160);
const id = z.string().uuid();
const optionalId = id.nullable().default(null);
const dateTime = z.string().datetime({ offset: true });
const money = z.number().int().safe().min(0).max(1e14);
const schemas = {
  projects: z.object({
    name: text,
    description: z.string().max(2000).default(""),
  }),
  habits: z.object({
    name: text,
    cadence: z.enum(["daily", "weekly"]),
    target_per_week: z.number().int().min(1).max(7),
  }),
  goals: z.object({
    title: text,
    metric: z.enum([
      "manual",
      "account_balance",
      "activity_minutes",
      "habit_completions",
      "tasks_completed",
    ]),
    target: money.positive(),
    manual_progress: money,
    linked_account_id: optionalId,
    linked_habit_id: optionalId,
    due_at: dateTime.nullable().default(null),
  }),
  tasks: z.object({
    title: text,
    notes: z.string().max(4000).default(""),
    priority: z.enum(["low", "medium", "high"]),
    project_id: optionalId,
    goal_id: optionalId,
    due_at: dateTime.nullable().default(null),
    reminder_at: dateTime.nullable().default(null),
    recurrence: z.enum(["none", "daily", "weekly", "monthly"]),
    completed_at: dateTime.nullable().default(null),
  }),
};
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
const dateKey = (value: string, timeZone: string) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
};
const daysAgo = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const formatMoney = (amount: number, currency: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    amount /
      10 **
        (new Intl.NumberFormat("en", {
          style: "currency",
          currency,
        }).resolvedOptions().maximumFractionDigits || 0),
  );
async function owned(
  db: Database,
  table: string,
  record: string | null,
  user: string,
) {
  if (!record) return true;
  return (
    (
      await db.query(`SELECT id FROM ${table} WHERE id=$1 AND user_id=$2`, [
        record,
        user,
      ])
    ).rows.length > 0
  );
}
async function snapshot(db: Database, user: string) {
  const tables = [
    "accounts",
    "transactions",
    "categories",
    "budgets",
    "activities",
    "projects",
    "tasks",
    "habits",
    "habit_logs",
    "goals",
  ] as const;
  const results = await Promise.all(
    tables.map((t) =>
      db.query(
        t === "habit_logs"
          ? "SELECT id,user_id,habit_id,occurred_on::text AS occurred_on,created_at FROM habit_logs WHERE user_id=$1"
          : `SELECT * FROM ${t} WHERE user_id=$1`,
        [user],
      ),
    ),
  );
  return Object.fromEntries(
    tables.map((t, i) => [t, results[i].rows]),
  ) as Record<(typeof tables)[number], any[]>;
}
function enrich(raw: Awaited<ReturnType<typeof snapshot>>, timezone: string) {
  const today = dateKey(new Date().toISOString(), timezone),
    weekStart = daysAgo(today, 6),
    month = today.slice(0, 7);
  const accountCurrency = (id: string) =>
    raw.accounts.find((a) => a.id === id)?.currency;
  const accounts = raw.accounts.map((a) => ({
    ...a,
    balance:
      Number(a.opening_balance) +
      raw.transactions
        .filter((t) => t.account_id === a.id)
        .reduce(
          (n, t) => n + (t.type === "income" ? 1 : -1) * Number(t.amount),
          0,
        ),
  }));
  const habits = raw.habits.map((h) => {
    const dates = new Set(
      raw.habit_logs
        .filter((l) => l.habit_id === h.id)
        .map((l) => String(l.occurred_on).slice(0, 10)),
    );
    let streak = 0;
    let cursor = dates.has(today) ? today : daysAgo(today, 1);
    while (dates.has(cursor)) {
      streak++;
      cursor = daysAgo(cursor, 1);
    }
    const weekCount = [0, 1, 2, 3, 4, 5, 6].reduce(
      (n, i) => n + Number(dates.has(daysAgo(today, i))),
      0,
    );
    return {
      ...h,
      streak,
      week_count: weekCount,
      week_target: h.cadence === "daily" ? 7 : Number(h.target_per_week),
      total_completions: dates.size,
      completed_today: dates.has(today),
    };
  });
  const goals = raw.goals.map((g) => {
    let progress = Number(g.manual_progress);
    if (g.metric === "account_balance")
      progress = Math.max(
        0,
        Number(
          accounts.find((a) => a.id === g.linked_account_id)?.balance || 0,
        ),
      );
    if (g.metric === "activity_minutes")
      progress = raw.activities
        .filter((a) => a.goal_id === g.id)
        .reduce((n, a) => n + Number(a.duration), 0);
    if (g.metric === "habit_completions")
      progress = Number(
        habits.find((h) => h.id === g.linked_habit_id)?.total_completions || 0,
      );
    if (g.metric === "tasks_completed")
      progress = raw.tasks.filter(
        (t) => t.goal_id === g.id && t.completed_at,
      ).length;
    return {
      ...g,
      progress,
      ratio: Math.min(1, progress / Number(g.target)),
      status:
        progress >= Number(g.target)
          ? "achieved"
          : g.due_at && new Date(g.due_at) < new Date()
            ? "overdue"
            : "in_progress",
    };
  });
  const due = raw.tasks
    .filter(
      (t) =>
        !t.completed_at && t.due_at && dateKey(t.due_at, timezone) <= today,
    )
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
  const monthTransactions = raw.transactions.filter((t) =>
    dateKey(t.occurred_at, timezone).startsWith(month),
  );
  const weekTransactions = raw.transactions.filter(
    (t) => dateKey(t.occurred_at, timezone) >= weekStart,
  );
  const weekActivities = raw.activities.filter(
    (a) => dateKey(a.occurred_at, timezone) >= weekStart,
  );
  return {
    today,
    weekStart,
    month,
    accountCurrency,
    accounts,
    habits,
    goals,
    due,
    monthTransactions,
    weekTransactions,
    weekActivities,
  };
}
export function installV1(app: Express, db: Database) {
  for (const resource of Object.keys(schemas) as (keyof typeof schemas)[]) {
    app.get(
      `/api/${resource}`,
      wrap(async (_req, res) => {
        res.json(
          (
            await db.query(
              `SELECT * FROM ${resource} WHERE user_id=$1 ORDER BY created_at DESC`,
              [res.locals.user.id],
            )
          ).rows,
        );
      }),
    );
    for (const method of ["post", "put"] as const)
      app[method](
        `/api/${resource}${method === "put" ? "/:id" : ""}`,
        wrap(async (req, res) => {
          const data: Record<string, any> = schemas[resource].parse(req.body),
            user = res.locals.user.id,
            recordId =
              method === "post" ? randomUUID() : id.parse(req.params.id);
          if (
            method === "put" &&
            !(await owned(db, resource, recordId, user))
          ) {
            res.status(404).json({ error: "Record not found" });
            return;
          }
          for (const [field, table] of [
            ["project_id", "projects"],
            ["goal_id", "goals"],
            ["linked_account_id", "accounts"],
            ["linked_habit_id", "habits"],
          ] as const)
            if (data[field] && !(await owned(db, table, data[field], user))) {
              res
                .status(400)
                .json({ error: `Selected ${field} is unavailable` });
              return;
            }
          if (
            resource === "goals" &&
            ((data.metric === "account_balance" && !data.linked_account_id) ||
              (data.metric === "habit_completions" && !data.linked_habit_id))
          ) {
            res
              .status(400)
              .json({ error: "This goal needs a linked account or habit" });
            return;
          }
          if (resource === "habits" && data.cadence === "daily")
            data.target_per_week = 7;
          const keys = Object.keys(data),
            values = Object.values(data),
            sql =
              method === "post"
                ? `INSERT INTO ${resource}(${["id", "user_id", ...keys].join(",")}) VALUES(${[recordId, user, ...values].map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`
                : `UPDATE ${resource} SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(",")},updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`;
          res
            .status(method === "post" ? 201 : 200)
            .json((await db.query(sql, [recordId, user, ...values])).rows[0]);
        }),
      );
    app.delete(
      `/api/${resource}/:id`,
      wrap(async (req, res) => {
        const recordId = id.parse(req.params.id);
        const result = await db.query(
          `DELETE FROM ${resource} WHERE id=$1 AND user_id=$2 RETURNING id`,
          [recordId, res.locals.user.id],
        );
        res
          .status(result.rows.length ? 200 : 404)
          .json(
            result.rows.length ? { ok: true } : { error: "Record not found" },
          );
      }),
    );
  }
  app.post(
    "/api/tasks/:id/complete",
    wrap(async (req, res) => {
      const user = res.locals.user.id,
        recordId = id.parse(req.params.id);
      const task = (
        await db.query("SELECT * FROM tasks WHERE id=$1 AND user_id=$2", [
          recordId,
          user,
        ])
      ).rows[0];
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }
      if (task.completed_at) {
        res.status(409).json({ error: "Task already completed" });
        return;
      }
      await db.query(
        "UPDATE tasks SET completed_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2",
        [recordId, user],
      );
      let next = null;
      if (task.recurrence !== "none") {
        const date = new Date(task.due_at || new Date());
        if (task.recurrence === "daily") date.setUTCDate(date.getUTCDate() + 1);
        if (task.recurrence === "weekly")
          date.setUTCDate(date.getUTCDate() + 7);
        if (task.recurrence === "monthly")
          date.setUTCMonth(date.getUTCMonth() + 1);
        while (date <= new Date()) {
          if (task.recurrence === "daily")
            date.setUTCDate(date.getUTCDate() + 1);
          else if (task.recurrence === "weekly")
            date.setUTCDate(date.getUTCDate() + 7);
          else date.setUTCMonth(date.getUTCMonth() + 1);
        }
        next = (
          await db.query(
            "INSERT INTO tasks(id,user_id,title,notes,priority,project_id,goal_id,due_at,reminder_at,recurrence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
            [
              randomUUID(),
              user,
              task.title,
              task.notes,
              task.priority,
              task.project_id,
              task.goal_id,
              date.toISOString(),
              null,
              task.recurrence,
            ],
          )
        ).rows[0];
      }
      res.json({ ok: true, next });
    }),
  );
  app.post(
    "/api/habits/:id/check",
    wrap(async (req, res) => {
      const habit = id.parse(req.params.id),
        user = res.locals.user.id;
      const day = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(req.body?.day);
      if (!(await owned(db, "habits", habit, user))) {
        res.status(404).json({ error: "Habit not found" });
        return;
      }
      const today = dateKey(new Date().toISOString(), res.locals.user.timezone);
      if (day > today || day < daysAgo(today, 30)) {
        res.status(400).json({ error: "Choose a day within the past 30 days" });
        return;
      }
      await db.query(
        "INSERT INTO habit_logs(id,user_id,habit_id,occurred_on) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,habit_id,occurred_on) DO NOTHING",
        [randomUUID(), user, habit, day],
      );
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/habits/:id/check/:day",
    wrap(async (req, res) => {
      const habit = id.parse(req.params.id),
        day = z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .parse(req.params.day);
      await db.query(
        "DELETE FROM habit_logs WHERE user_id=$1 AND habit_id=$2 AND occurred_on=$3",
        [res.locals.user.id, habit, day],
      );
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/dashboard",
    wrap(async (_req, res) => {
      const raw = await snapshot(db, res.locals.user.id);
      const e = enrich(raw, res.locals.user.timezone);
      const reminderAlerts = raw.tasks
        .filter(
          (t) =>
            !t.completed_at &&
            t.reminder_at &&
            new Date(t.reminder_at) <= new Date(),
        )
        .map((t) => ({
          type: "reminder",
          title: `Reminder: ${t.title}`,
          id: t.id,
        }));
      const budgetAlerts = raw.budgets
        .filter((b) => b.month === e.month)
        .flatMap((b) => {
          const spent = e.monthTransactions
            .filter(
              (t) =>
                t.type === "expense" &&
                t.category_id === b.category_id &&
                e.accountCurrency(t.account_id) === b.currency,
            )
            .reduce((n, t) => n + Number(t.amount), 0);
          return spent > Number(b.amount)
            ? [
                {
                  type: "budget",
                  title: `${raw.categories.find((c) => c.id === b.category_id)?.name || "A category"} is over budget`,
                  id: b.id,
                },
              ]
            : [];
        });
      res.json({
        today: e.today,
        accounts: e.accounts,
        habits: e.habits,
        goals: e.goals,
        due_tasks: e.due,
        alerts: [...reminderAlerts, ...budgetAlerts],
        upcoming_tasks: raw.tasks
          .filter((t) => !t.completed_at && t.due_at)
          .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))
          .slice(0, 6),
        month_transactions: e.monthTransactions,
        week_activities: e.weekActivities,
      });
    }),
  );
  app.get(
    "/api/analytics",
    wrap(async (_req, res) => {
      const raw = await snapshot(db, res.locals.user.id),
        e = enrich(raw, res.locals.user.timezone);
      const currency = res.locals.user.currency,
        active = raw.transactions.filter(
          (t) => e.accountCurrency(t.account_id) === currency,
        );
      const months = Array.from({ length: 6 }, (_, i) => {
        const date = new Date(e.today + "T12:00:00Z");
        date.setUTCMonth(date.getUTCMonth() - (5 - i));
        return date.toISOString().slice(0, 7);
      });
      const spending = months.map((month) => ({
        month,
        income: active
          .filter(
            (t) =>
              t.type === "income" &&
              dateKey(t.occurred_at, res.locals.user.timezone).startsWith(
                month,
              ),
          )
          .reduce((n, t) => n + Number(t.amount), 0),
        expense: active
          .filter(
            (t) =>
              t.type === "expense" &&
              dateKey(t.occurred_at, res.locals.user.timezone).startsWith(
                month,
              ),
          )
          .reduce((n, t) => n + Number(t.amount), 0),
      }));
      const categories = raw.categories
        .filter((c) => c.kind === "expense")
        .map((c) => ({
          name: c.name,
          total: e.monthTransactions
            .filter(
              (t) =>
                t.category_id === c.id &&
                e.accountCurrency(t.account_id) === currency,
            )
            .reduce((n, t) => n + Number(t.amount), 0),
        }))
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total);
      const activities = raw.categories
        .filter((c) => c.kind === "activity")
        .map((c) => ({
          name: c.name,
          minutes: e.weekActivities
            .filter((a) => a.category_id === c.id)
            .reduce((n, a) => n + Number(a.duration), 0),
        }))
        .filter((c) => c.minutes > 0);
      res.json({
        currency,
        spending,
        categories,
        activities,
        tasks: {
          completed_this_week: raw.tasks.filter(
            (t) =>
              t.completed_at &&
              dateKey(t.completed_at, res.locals.user.timezone) >= e.weekStart,
          ).length,
          open: raw.tasks.filter((t) => !t.completed_at).length,
          overdue: e.due.length,
        },
        habits: e.habits.map((h) => ({
          id: h.id,
          name: h.name,
          week_count: h.week_count,
          week_target: h.week_target,
          streak: h.streak,
        })),
        goals: e.goals,
      });
    }),
  );
  app.put(
    "/api/privacy/ai-consent",
    wrap(async (req, res) => {
      const consent = z
        .object({ enabled: z.boolean() })
        .parse(req.body).enabled;
      await db.query(
        "UPDATE users SET ai_consent=$1,updated_at=now() WHERE id=$2",
        [consent, res.locals.user.id],
      );
      res.json({ enabled: consent });
    }),
  );
  app.get(
    "/api/privacy/status",
    wrap(async (_req, res) => {
      const user = res.locals.user.id;
      const consent = (
        await db.query("SELECT ai_consent FROM users WHERE id=$1", [user])
      ).rows[0].ai_consent;
      const tables = [
        "accounts",
        "transactions",
        "activities",
        "projects",
        "tasks",
        "habits",
        "goals",
        "imports",
        "ai_query_logs",
      ];
      const counts: Record<string, number> = {};
      for (const table of tables)
        counts[table] = Number(
          (
            await db.query(
              `SELECT count(*) AS count FROM ${table} WHERE user_id=$1`,
              [user],
            )
          ).rows[0].count,
        );
      res.json({ ai_consent: consent, counts, external_ai: false });
    }),
  );
  app.get(
    "/api/privacy/export",
    wrap(async (_req, res) => {
      const user = res.locals.user.id;
      const tables = [
        "users",
        "accounts",
        "transactions",
        "categories",
        "budgets",
        "activities",
        "projects",
        "tasks",
        "habits",
        "habit_logs",
        "goals",
        "imports",
        "ai_query_logs",
      ];
      const data: Record<string, any> = {};
      for (const table of tables) {
        const result = await db.query(
          table === "users"
            ? "SELECT id,email,name,currency,timezone,locale,ai_consent,created_at,updated_at FROM users WHERE id=$1"
            : `SELECT * FROM ${table} WHERE user_id=$1`,
          [user],
        );
        data[table] = result.rows;
      }
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="nomi-export.json"',
      );
      res.json({ exported_at: new Date().toISOString(), data });
    }),
  );
  app.delete(
    "/api/privacy/account",
    wrap(async (req, res) => {
      const confirmation = z
        .object({ confirm: z.literal("DELETE MY ACCOUNT") })
        .parse(req.body);
      void confirmation;
      const user = res.locals.user.id;
      for (const table of [
        "activities",
        "transactions",
        "budgets",
        "habit_logs",
        "tasks",
        "goals",
        "habits",
        "projects",
        "categories",
        "accounts",
        "imports",
        "ai_query_logs",
        "sessions",
      ])
        await db.query(`DELETE FROM ${table} WHERE user_id=$1`, [user]);
      await db.query("DELETE FROM users WHERE id=$1", [user]);
      res.clearCookie("nomi_session", {
        path: "/api",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/insights/history",
    wrap(async (_req, res) => {
      res.json(
        (
          await db.query(
            "SELECT id,question,answer,created_at FROM ai_query_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",
            [res.locals.user.id],
          )
        ).rows,
      );
    }),
  );
  app.delete(
    "/api/insights/history",
    wrap(async (_req, res) => {
      await db.query("DELETE FROM ai_query_logs WHERE user_id=$1", [
        res.locals.user.id,
      ]);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/insights/ask",
    wrap(async (req, res) => {
      const question = z
        .object({ question: z.string().trim().min(3).max(500) })
        .parse(req.body).question;
      const user = res.locals.user;
      const consent = (
        await db.query("SELECT ai_consent FROM users WHERE id=$1", [user.id])
      ).rows[0].ai_consent;
      if (!consent) {
        res
          .status(403)
          .json({ error: "Enable data insights in Settings first" });
        return;
      }
      const raw = await snapshot(db, user.id),
        e = enrich(raw, user.timezone),
        q = question.toLowerCase();
      let answer = "",
        sources: { type: string; id: string }[] = [];
      const c = user.currency;
      if (/weekly|this week|past week|last 7 days/.test(q)) {
        const tx = e.weekTransactions.filter(
          (t) => e.accountCurrency(t.account_id) === c,
        );
        const spent = tx
            .filter((t) => t.type === "expense")
            .reduce((n, t) => n + Number(t.amount), 0),
          earned = tx
            .filter((t) => t.type === "income")
            .reduce((n, t) => n + Number(t.amount), 0),
          minutes = e.weekActivities.reduce(
            (n, a) => n + Number(a.duration),
            0,
          ),
          completed = raw.tasks.filter(
            (t) =>
              t.completed_at &&
              dateKey(t.completed_at, user.timezone) >= e.weekStart,
          );
        answer = `In the past seven days you recorded ${formatMoney(earned, c, user.locale)} in income, ${formatMoney(spent, c, user.locale)} in expenses, ${minutes} activity minutes, and ${completed.length} completed tasks. These figures cover only records entered in Nomi.`;
        sources = [
          ...tx.map((t) => ({ type: "transaction", id: t.id })),
          ...e.weekActivities.map((a) => ({ type: "activity", id: a.id })),
          ...completed.map((t) => ({ type: "task", id: t.id })),
        ];
      } else if (/spend|spent|expense|cost|money out/.test(q)) {
        const mentioned = raw.categories.find(
          (cat) => cat.kind === "expense" && q.includes(cat.name.toLowerCase()),
        );
        const tx = e.monthTransactions.filter(
          (t) =>
            t.type === "expense" &&
            e.accountCurrency(t.account_id) === c &&
            (!mentioned || t.category_id === mentioned.id),
        );
        const total = tx.reduce((n, t) => n + Number(t.amount), 0);
        answer = `You recorded ${formatMoney(total, c, user.locale)} in ${mentioned?.name || "expenses"} this month across ${tx.length} transaction${tx.length === 1 ? "" : "s"}.`;
        sources = tx.map((t) => ({ type: "transaction", id: t.id }));
      } else if (/income|earned|money in/.test(q)) {
        const tx = e.monthTransactions.filter(
          (t) => t.type === "income" && e.accountCurrency(t.account_id) === c,
        );
        answer = `You recorded ${formatMoney(
          tx.reduce((n, t) => n + Number(t.amount), 0),
          c,
          user.locale,
        )} in income this month across ${tx.length} transaction${tx.length === 1 ? "" : "s"}.`;
        sources = tx.map((t) => ({ type: "transaction", id: t.id }));
      } else if (/time|activit|exercise|work|reading/.test(q)) {
        const mentioned = raw.categories.find(
          (cat) =>
            cat.kind === "activity" && q.includes(cat.name.toLowerCase()),
        );
        const acts = e.weekActivities.filter(
          (a) => !mentioned || a.category_id === mentioned.id,
        );
        answer = `You logged ${acts.reduce((n, a) => n + Number(a.duration), 0)} minutes of ${mentioned?.name || "activities"} in the past seven days across ${acts.length} entr${acts.length === 1 ? "y" : "ies"}.`;
        sources = acts.map((a) => ({ type: "activity", id: a.id }));
      } else if (/task|due|productiv/.test(q)) {
        answer = `You have ${raw.tasks.filter((t) => !t.completed_at).length} open tasks, including ${e.due.length} due today or overdue. ${raw.tasks.filter((t) => t.completed_at && dateKey(t.completed_at, user.timezone) >= e.weekStart).length} were completed in the past seven days.`;
        sources = e.due.map((t) => ({ type: "task", id: t.id }));
      } else if (/habit|streak|consisten/.test(q)) {
        answer = e.habits.length
          ? e.habits
              .map(
                (h) =>
                  `${h.name}: ${h.week_count}/${h.week_target} completions this week, ${h.streak}-day streak`,
              )
              .join(". ") + "."
          : "No habits are tracked yet.";
        sources = e.habits.map((h) => ({ type: "habit", id: h.id }));
      } else if (/goal|progress/.test(q)) {
        answer = e.goals.length
          ? e.goals
              .map(
                (g) =>
                  `${g.title}: ${g.progress}/${g.target} (${Math.round(g.ratio * 100)}%)`,
              )
              .join(". ") + "."
          : "No goals are tracked yet.";
        sources = e.goals.map((g) => ({ type: "goal", id: g.id }));
      } else
        answer =
          "I can answer questions about spending, income, activities, tasks, habits, goals, or your weekly summary using the records in Nomi.";
      await db.query(
        "INSERT INTO ai_query_logs(id,user_id,question,answer) VALUES($1,$2,$3,$4)",
        [randomUUID(), user.id, question, answer],
      );
      res.json({
        answer,
        sources,
        method:
          "Calculated from your Nomi records; dates follow your profile timezone. No external AI service receives your data.",
      });
    }),
  );
}
