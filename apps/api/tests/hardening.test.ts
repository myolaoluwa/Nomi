import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "../src/db.js";
import { createApp } from "../src/server.js";

test("production sessions enforce origin checks and data changes roll back", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nomi-hardening-"));
  const previous = {
    node: process.env.NODE_ENV,
    data: process.env.DATA_DIR,
    origin: process.env.WEB_ORIGIN,
    database: process.env.DATABASE_URL,
  };
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.DATA_DIR = directory;
  const db = await connect();
  process.env.NODE_ENV = "production";
  process.env.WEB_ORIGIN = "https://nomi.example";
  const server = createApp(db).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://localhost:${(server.address() as { port: number }).port}`;
  try {
    const profile = {
      email: "hardening@example.test",
      password: "strong-test-passphrase",
      password_confirmation: "strong-test-passphrase",
      name: "Hardening",
      currency: "NGN",
      timezone: "Africa/Lagos",
      locale: "en-NG",
    };
    const register = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: {
        origin: "https://nomi.example",
        "content-type": "application/json",
      },
      body: JSON.stringify(profile),
    });
    assert.equal(register.status, 201);
    assert.match(register.headers.get("set-cookie") || "", /SameSite=Lax/);
    const cookie = register.headers.get("set-cookie")!.split(";")[0];
    const payload = JSON.stringify({
      name: "Cash",
      type: "cash",
      currency: "NGN",
      opening_balance: 0,
    });
    const post = (headers: Record<string, string>) =>
      fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json", ...headers },
        body: payload,
      });
    assert.equal((await post({})).status, 403);
    assert.equal(
      (await post({ origin: "https://attacker.example" })).status,
      403,
    );
    assert.equal(
      (
        await post({
          origin: "https://nomi.example",
          "sec-fetch-site": "cross-site",
        })
      ).status,
      403,
    );
    assert.equal((await post({ origin: "https://nomi.example" })).status, 201);
    const year = new Date().getUTCFullYear() + 1;
    const due = new Date(Date.UTC(year, 0, 31, 12));
    const task = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: {
        cookie,
        origin: "https://nomi.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Monthly check",
        notes: "",
        priority: "medium",
        project_id: null,
        goal_id: null,
        due_at: due.toISOString(),
        reminder_at: new Date(due.getTime() - 3600000).toISOString(),
        recurrence: "monthly",
        completed_at: null,
      }),
    });
    assert.equal(task.status, 201);
    const taskId = (await task.json()).id;
    const complete = () =>
      fetch(`${base}/api/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { cookie, origin: "https://nomi.example" },
      });
    const completions = await Promise.all([complete(), complete()]);
    assert.deepEqual(completions.map((r) => r.status).sort(), [200, 409]);
    const next = await completions.find((r) => r.status === 200)!.json();
    const lastFebruaryDay = new Date(Date.UTC(year, 2, 0)).getUTCDate();
    assert.equal(
      next.next.due_at,
      new Date(Date.UTC(year, 1, lastFebruaryDay, 12)).toISOString(),
    );
    assert.equal(
      next.next.reminder_at,
      new Date(Date.UTC(year, 1, lastFebruaryDay, 11)).toISOString(),
    );
    assert.equal(
      Number((await db.query("SELECT count(*) AS n FROM tasks")).rows[0].n),
      2,
    );
    const habitResponse = await fetch(`${base}/api/habits`, {
      method: "POST",
      headers: {
        cookie,
        origin: "https://nomi.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Review",
        cadence: "weekly",
        target_per_week: 1,
      }),
    });
    assert.equal(habitResponse.status, 201);
    const habitId = (await habitResponse.json()).id;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const today = ["year", "month", "day"]
      .map((key) => parts.find((part) => part.type === key)!.value)
      .join("-");
    for (const offset of [0, 7]) {
      const day = new Date(`${today}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() - offset);
      const response = await fetch(`${base}/api/habits/${habitId}/check`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://nomi.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ day: day.toISOString().slice(0, 10) }),
      });
      assert.equal(response.status, 200);
    }
    const dashboard = await fetch(`${base}/api/dashboard`, {
      headers: { cookie },
    });
    assert.equal((await dashboard.json()).habits[0].streak, 2);
    const before = Number(
      (await db.query("SELECT count(*) AS n FROM categories")).rows[0].n,
    );
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query("DELETE FROM categories");
        throw new Error("injected failure");
      }),
      /injected failure/,
    );
    assert.equal(
      Number(
        (await db.query("SELECT count(*) AS n FROM categories")).rows[0].n,
      ),
      before,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
    await rm(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries({
      NODE_ENV: previous.node,
      DATA_DIR: previous.data,
      WEB_ORIGIN: previous.origin,
      DATABASE_URL: previous.database,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
