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
  otherCookie = "";
const profile = {
  name: "Ada",
  email: "ada@example.test",
  password: "correct-horse-2026",
  password_confirmation: "correct-horse-2026",
  currency: "NGN",
  timezone: "Africa/Lagos",
  locale: "en-NG",
};
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  auth = cookie,
  origin?: string,
) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie: auth,
      ...(origin ? { origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
before(async () => {
  // Never connect the test suite to a configured development/production database.
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  directory = await mkdtemp(join(tmpdir(), "nomi-api-"));
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
test("phase 0–2 authenticated data lifecycle, integrity and persistence", async () => {
  assert.equal((await request("/accounts")).status, 401);
  assert.equal(
    (await request("/auth/register", "POST", { ...profile, password: "short" }))
      .status,
    400,
  );
  const registered = await request("/auth/register", "POST", profile);
  assert.equal(registered.status, 201);
  cookie = registered.cookie;
  assert.ok(cookie);
  assert.equal((await request("/auth/register", "POST", profile)).status, 409);
  assert.equal((await request("/me")).data.timezone, "Africa/Lagos");
  const stored = (
    await db.query("SELECT password_hash FROM users WHERE email=$1", [
      profile.email,
    ])
  ).rows[0];
  assert.ok(!stored.password_hash.includes(profile.password));
  const categories = (await request("/categories")).data;
  assert.equal(categories.length, 13);
  const food = categories.find((c: any) => c.name === "Food & dining"),
    work = categories.find((c: any) => c.name === "Work"),
    salary = categories.find((c: any) => c.name === "Salary");
  const accountPayload = {
    name: "Everyday",
    type: "bank",
    currency: "NGN",
    opening_balance: 100000,
  };
  const account = (await request("/accounts", "POST", accountPayload)).data;
  assert.equal(
    (
      await request("/accounts", "POST", {
        ...accountPayload,
        currency: "FAKE",
      })
    ).status,
    400,
  );
  const txPayload = {
    title: "Lunch",
    account_id: account.id,
    category_id: food.id,
    type: "expense",
    amount: 25000,
    occurred_at: "2026-09-23T10:00:00+01:00",
    notes: "With a friend",
  };
  assert.equal(
    (await request("/transactions", "POST", { ...txPayload, amount: 0 }))
      .status,
    400,
  );
  assert.equal(
    (await request("/transactions", "POST", { ...txPayload, amount: 1.5 }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/transactions", "POST", {
        ...txPayload,
        category_id: work.id,
      })
    ).status,
    400,
  );
  const tx = (await request("/transactions", "POST", txPayload)).data;
  assert.ok(tx.id);
  assert.equal(
    new Date(tx.occurred_at).toISOString(),
    "2026-09-23T09:00:00.000Z",
  );
  const income = (
    await request("/transactions", "POST", {
      ...txPayload,
      title: "Pay",
      category_id: salary.id,
      type: "income",
      amount: 500000,
    })
  ).data;
  const activityPayload = {
    title: "Lunch break",
    category_id: work.id,
    occurred_at: txPayload.occurred_at,
    duration: 45,
    transaction_id: tx.id,
    location: "Lagos",
    tags: "friends, food",
    notes: "A good break",
  };
  const activity = (await request("/activities", "POST", activityPayload)).data;
  assert.equal(activity.transaction_id, tx.id);
  assert.equal((await request("/transactions/" + tx.id, "DELETE")).status, 409);
  assert.equal(
    (await request("/accounts/" + account.id, "DELETE")).status,
    409,
  );
  assert.equal(
    (
      await request("/accounts/" + account.id, "PUT", {
        ...accountPayload,
        currency: "USD",
      })
    ).status,
    409,
  );
  const budgetPayload = {
    category_id: food.id,
    currency: "NGN",
    amount: 50000,
    month: "2026-09",
  };
  const budget = (await request("/budgets", "POST", budgetPayload)).data;
  assert.ok(budget.id);
  assert.equal((await request("/budgets", "POST", budgetPayload)).status, 409);
  const second = await request("/auth/register", "POST", {
    ...profile,
    email: "bea@example.test",
  });
  otherCookie = second.cookie;
  assert.deepEqual(
    (await request("/accounts", "GET", undefined, otherCookie)).data,
    [],
  );
  assert.equal(
    (await request("/transactions/" + tx.id, "PUT", txPayload, otherCookie))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        "/activities/" + activity.id,
        "DELETE",
        undefined,
        otherCookie,
      )
    ).status,
    404,
  );
  const otherCategories = (
    await request("/categories", "GET", undefined, otherCookie)
  ).data;
  assert.equal(
    (
      await request(
        "/transactions",
        "POST",
        {
          ...txPayload,
          category_id: otherCategories.find((c: any) => c.kind === "expense")
            .id,
        },
        otherCookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/activities",
        "POST",
        {
          ...activityPayload,
          category_id: otherCategories.find((c: any) => c.kind === "activity")
            .id,
        },
        otherCookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/accounts",
        "POST",
        accountPayload,
        cookie,
        "https://evil.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/me", "PUT", {
        name: "Ada Updated",
        currency: "USD",
        timezone: "America/New_York",
        locale: "en-US",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/me", "PUT", {
        name: "Ada",
        currency: "NGN",
        timezone: "Invalid/Zone",
        locale: "en-NG",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/activities/" + activity.id, "PUT", {
        ...activityPayload,
        transaction_id: null,
        duration: 60,
      })
    ).data.duration,
    60,
  );
  assert.equal(
    (
      await request("/transactions/" + tx.id, "PUT", {
        ...txPayload,
        amount: 30000,
      })
    ).data.amount,
    30000,
  );
  assert.equal(
    (
      await request("/budgets/" + budget.id, "PUT", {
        ...budgetPayload,
        amount: 80000,
      })
    ).data.amount,
    80000,
  );
  assert.equal((await request("/auth/logout", "POST")).status, 200);
  assert.equal((await request("/me")).status, 401);
  assert.equal(
    (
      await request("/auth/login", "POST", {
        email: profile.email,
        password: "incorrect-password",
      })
    ).status,
    401,
  );
  cookie = (await request("/auth/login", "POST", profile)).cookie;
  assert.equal((await request("/accounts")).data.length, 1);
  // Reopen the on-disk database and verify records survived a complete service restart.
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
  db = await connect();
  server = createApp(db).listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as any).port}`;
  assert.equal((await request("/activities")).data[0].duration, 60);
  assert.equal((await request("/transactions")).data.length, 2);
  for (const [resource, id] of [
    ["activities", activity.id],
    ["transactions", tx.id],
    ["transactions", income.id],
    ["budgets", budget.id],
    ["accounts", account.id],
  ])
    assert.equal((await request(`/${resource}/${id}`, "DELETE")).status, 200);
  assert.equal((await request("/categories/" + food.id, "DELETE")).status, 200);
  await db.query("UPDATE sessions SET expires_at=now()-interval '1 day'");
  assert.equal((await request("/me")).status, 401);
});
