import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "../src/db.js";
import { createApp } from "../src/server.js";

test("recovery codes rotate, require password confirmation, and revoke sessions", async () => {
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  const directory = await mkdtemp(join(tmpdir(), "nomi-recovery-"));
  process.env.DATA_DIR = directory;
  const db = await connect();
  const server = createApp(db).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://localhost:${(server.address() as { port: number }).port}/api`;
  const call = async (path: string, body?: object, cookie = "") => {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", cookie },
      body: body && JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  };
  const profile = {
    name: "Recovery Tester",
    email: "recovery@example.test",
    password: "a-long-original-password",
    password_confirmation: "a-long-original-password",
    currency: "NGN",
    timezone: "Africa/Lagos",
    locale: "en-NG",
  };
  try {
    assert.equal(
      (
        await call("/auth/register", {
          ...profile,
          password_confirmation: "wrong password",
        })
      ).status,
      400,
    );
    const registration = await call("/auth/register", profile);
    assert.equal(registration.status, 201);
    const originalCode = registration.body.recovery_code as string;
    assert.match(originalCode, /^NOMI-(?:[0-9A-F]{8}-){4}[0-9A-F]{8}$/);
    const stored = (
      await db.query(
        "SELECT password_hash,recovery_code_hash FROM users WHERE email=$1",
        [profile.email],
      )
    ).rows[0];
    assert.ok(!stored.password_hash.includes(profile.password));
    assert.ok(!stored.recovery_code_hash.includes(originalCode));
    const me = await call("/me", undefined, registration.cookie);
    assert.equal(me.body.recovery_code_set, true);
    assert.equal(JSON.stringify(me.body).includes(originalCode), false);
    const wrong = await call("/auth/recover", {
      email: profile.email,
      recovery_code: "NOMI-00000000-00000000-00000000-00000000-00000000",
      password: "a-long-replacement-password",
      password_confirmation: "a-long-replacement-password",
    });
    assert.equal(wrong.status, 401);
    assert.equal(
      (
        await call("/auth/recover", {
          email: "absent@example.test",
          recovery_code: originalCode,
          password: "a-long-replacement-password",
          password_confirmation: "a-long-replacement-password",
        })
      ).body.error,
      wrong.body.error,
    );
    const recovered = await call("/auth/recover", {
      email: profile.email,
      recovery_code: originalCode.toLowerCase().replaceAll("-", " "),
      password: "a-long-replacement-password",
      password_confirmation: "a-long-replacement-password",
    });
    assert.equal(recovered.status, 200);
    assert.notEqual(recovered.body.recovery_code, originalCode);
    assert.equal(
      (await call("/me", undefined, registration.cookie)).status,
      401,
    );
    assert.equal(
      (
        await call("/auth/login", {
          email: profile.email,
          password: profile.password,
        })
      ).status,
      401,
    );
    const login = await call("/auth/login", {
      email: profile.email,
      password: "a-long-replacement-password",
    });
    assert.equal(login.status, 200);
    assert.equal(
      (
        await call("/auth/recover", {
          email: profile.email,
          recovery_code: originalCode,
          password: "another-long-password",
          password_confirmation: "another-long-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (await call("/auth/recovery-code", { password: "wrong" }, login.cookie))
        .status,
      401,
    );
    const regenerated = await call(
      "/auth/recovery-code",
      { password: "a-long-replacement-password" },
      login.cookie,
    );
    assert.equal(regenerated.status, 200);
    assert.notEqual(
      regenerated.body.recovery_code,
      recovered.body.recovery_code,
    );
    assert.equal(
      (
        await call("/auth/recover", {
          email: profile.email,
          recovery_code: recovered.body.recovery_code,
          password: "another-long-password",
          password_confirmation: "another-long-password",
        })
      ).status,
      401,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
