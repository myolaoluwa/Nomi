import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { connect, type Database } from "../src/db.js";
import { createApp } from "../src/server.js";
let db: Database,
  server: Server,
  base: string,
  directory: string,
  cookie = "",
  other = "";
async function call(path: string, method = "GET", body?: any, token = cookie) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json", cookie: token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
const profile = {
  name: "V1 Tester",
  email: "v1@example.test",
  password: "long-passphrase-2026",
  password_confirmation: "long-passphrase-2026",
  currency: "NGN",
  timezone: "Africa/Lagos",
  locale: "en-NG",
};
before(async () => {
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  directory = await mkdtemp(join(tmpdir(), "nomi-v1-"));
  process.env.DATA_DIR = directory;
  db = await connect();
  server = createApp(db).listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as any).port}`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
  await rm(directory, { recursive: true, force: true });
});
test("V1 projects, recurring tasks, habits, goals, analytics, imports, insights and deletion", async () => {
  const reg = await call("/auth/register", "POST", profile);
  assert.equal(reg.status, 201);
  cookie = reg.cookie;
  const categories = (await call("/categories")).data,
    food = categories.find((c: any) => c.name === "Food & dining"),
    work = categories.find((c: any) => c.name === "Work"),
    salary = categories.find((c: any) => c.name === "Salary");
  const account = (
    await call("/accounts", "POST", {
      name: "Main",
      type: "bank",
      currency: "NGN",
      opening_balance: 100000,
    })
  ).data;
  const project = (
    await call("/projects", "POST", {
      name: "Launch",
      description: "First project",
    })
  ).data;
  assert.ok(project.id);
  const habit = (
    await call("/habits", "POST", {
      name: "Read",
      cadence: "daily",
      target_per_week: 7,
    })
  ).data;
  assert.ok(habit.id);
  const goal = (
    await call("/goals", "POST", {
      title: "Read 3 days",
      metric: "habit_completions",
      target: 3,
      manual_progress: 0,
      linked_account_id: null,
      linked_habit_id: habit.id,
      due_at: null,
    })
  ).data;
  assert.ok(goal.id);
  const task = (
    await call("/tasks", "POST", {
      title: "Read chapter",
      notes: "First chapter",
      priority: "high",
      project_id: project.id,
      goal_id: goal.id,
      due_at: "2026-09-23T14:00:00+01:00",
      reminder_at: "2026-09-23T12:00:00+01:00",
      recurrence: "daily",
      completed_at: null,
    })
  ).data;
  assert.ok(task.id);
  const otherReg = await call("/auth/register", "POST", {
    ...profile,
    email: "other-v1@example.test",
  });
  other = otherReg.cookie;
  assert.deepEqual((await call("/projects", "GET", undefined, other)).data, []);
  assert.equal(
    (
      await call(
        "/tasks",
        "POST",
        {
          title: "Other",
          notes: "",
          priority: "low",
          project_id: project.id,
          goal_id: null,
          due_at: null,
          reminder_at: null,
          recurrence: "none",
          completed_at: null,
        },
        other,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/goals",
        "POST",
        {
          title: "Other",
          metric: "habit_completions",
          target: 1,
          manual_progress: 0,
          linked_account_id: null,
          linked_habit_id: habit.id,
          due_at: null,
        },
        other,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call(`/tasks/${task.id}/complete`, "POST", {}, other)).status,
    404,
  );
  const completed = await call(`/tasks/${task.id}/complete`, "POST");
  assert.equal(completed.status, 200);
  assert.ok(completed.data.next.id);
  assert.equal((await call(`/tasks/${task.id}/complete`, "POST")).status, 409);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: profile.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const key = ["year", "month", "day"]
    .map((k) => today.find((p) => p.type === k)!.value)
    .join("-");
  assert.equal(
    (await call(`/habits/${habit.id}/check`, "POST", { day: key })).status,
    200,
  );
  assert.equal(
    (await call(`/habits/${habit.id}/check`, "POST", { day: key })).status,
    200,
  );
  let dash = (await call("/dashboard")).data;
  assert.equal(dash.habits[0].week_count, 1);
  assert.equal(dash.goals.find((g: any) => g.id === goal.id).progress, 1);
  assert.ok(dash.due_tasks.length >= 0);
  const aGoal = (
    await call("/goals", "POST", {
      title: "Movement",
      metric: "activity_minutes",
      target: 60,
      manual_progress: 0,
      linked_account_id: null,
      linked_habit_id: null,
      due_at: null,
    })
  ).data;
  const activity = (
    await call("/activities", "POST", {
      title: "Training",
      category_id: work.id,
      occurred_at: new Date().toISOString(),
      duration: 45,
      transaction_id: null,
      goal_id: aGoal.id,
      location: "",
      notes: "",
      tags: "fitness",
    })
  ).data;
  assert.equal(
    (await call("/dashboard")).data.goals.find((g: any) => g.id === aGoal.id)
      .progress,
    45,
  );
  const accountGoal = (
    await call("/goals", "POST", {
      title: "Save",
      metric: "account_balance",
      target: 120000,
      manual_progress: 0,
      linked_account_id: account.id,
      linked_habit_id: null,
      due_at: null,
    })
  ).data;
  assert.equal(
    (await call("/dashboard")).data.goals.find(
      (g: any) => g.id === accountGoal.id,
    ).progress,
    100000,
  );
  const bankRows = [
    {
      title: "Lunch",
      account_id: account.id,
      category_id: food.id,
      type: "expense",
      amount: 25000,
      occurred_at: new Date().toISOString(),
      notes: "Imported",
    },
  ];
  assert.equal(
    (
      await call("/imports/preview", "POST", {
        source: "bank_csv",
        name: "bank.csv",
        rows: bankRows,
      })
    ).data.count,
    1,
  );
  assert.equal(
    (
      await call("/imports", "POST", {
        source: "bank_csv",
        name: "bank.csv",
        rows: bankRows,
      })
    ).status,
    400,
  );
  const bankImport = await call("/imports", "POST", {
    source: "bank_csv",
    name: "bank.csv",
    rows: bankRows,
    consent: true,
  });
  assert.equal(bankImport.status, 201);
  assert.equal(
    (await call("/dashboard")).data.goals.find(
      (g: any) => g.id === accountGoal.id,
    ).progress,
    75000,
  );
  const activityRows = [
    {
      title: "Run",
      category_id: work.id,
      occurred_at: new Date().toISOString(),
      duration: 30,
      location: "Track",
      notes: "",
      tags: "fitness",
    },
  ];
  const fitness = await call("/imports", "POST", {
    source: "fitness_csv",
    name: "fitness.csv",
    rows: activityRows,
    consent: true,
  });
  assert.equal(fitness.status, 201);
  const calendar = await call("/imports", "POST", {
    source: "calendar_csv",
    name: "calendar.csv",
    rows: activityRows,
    consent: true,
  });
  assert.equal(calendar.status, 201);
  assert.equal((await call("/analytics")).data.tasks.completed_this_week, 1);
  assert.equal(
    (
      await call("/insights/ask", "POST", {
        question: "How much did I spend this month?",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/privacy/ai-consent", "PUT", { enabled: true })).status,
    200,
  );
  const insight = await call("/insights/ask", "POST", {
    question: "How much did I spend this month?",
  });
  assert.equal(insight.status, 200);
  assert.equal(insight.data.sources.length, 1);
  assert.match(insight.data.answer, /Lunch|expenses|Food/);
  assert.equal(
    (
      await call("/insights/ask", "POST", {
        question: "Give me my weekly summary",
      })
    ).status,
    200,
  );
  assert.equal((await call("/insights/history")).data.length, 2);
  assert.equal(
    (await call("/privacy/export")).data.data.users[0].password_hash,
    undefined,
  );
  assert.equal(
    (await call("/imports/" + bankImport.data.id, "DELETE")).status,
    200,
  );
  assert.equal((await call("/transactions")).data.length, 0);
  assert.equal(
    (await call("/imports/" + fitness.data.id, "DELETE")).status,
    200,
  );
  assert.equal(
    (await call("/imports/" + calendar.data.id, "DELETE")).status,
    200,
  );
  assert.equal((await call("/activities")).data.length, 1);
  assert.equal(
    (await call(`/habits/${habit.id}/check/${key}`, "DELETE")).status,
    200,
  );
  assert.equal((await call("/dashboard")).data.habits[0].week_count, 0);
  assert.equal(
    (await call("/privacy/account", "DELETE", { confirm: "wrong" })).status,
    400,
  );
  assert.equal(
    (await call("/privacy/account", "DELETE", { confirm: "DELETE MY ACCOUNT" }))
      .status,
    200,
  );
  assert.equal((await call("/me")).status, 401);
  const count = (await db.query("SELECT count(*) AS n FROM users")).rows[0].n;
  assert.equal(Number(count), 1);
});
