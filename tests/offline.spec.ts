import { test, expect } from "@playwright/test";
test("offline activity logging queues locally and syncs once online", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Your name").fill("Offline Tester");
  await page
    .getByLabel("Email address")
    .fill(`offline-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("long-passphrase-2026");
  await page.getByLabel("Confirm password").fill("long-passphrase-2026");
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.locator("code[aria-label='Recovery code']")).toBeVisible();
  await page.getByRole("button", { name: "I saved it — continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Offline." }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/Offline mode · new activities/)).toBeVisible();
  await page.getByRole("button", { name: "Activities", exact: true }).click();
  await page.getByRole("button", { name: /Log activity/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Offline walk");
  await dialog
    .getByRole("combobox", { name: "Category" })
    .selectOption({ label: "Exercise" });
  await dialog.getByLabel("Duration (minutes)").fill("30");
  await dialog.getByRole("button", { name: "Save activity" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.locator(".toast", { hasText: "saved on this device" }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Offline walk", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText(/offline activity synced/)).toBeVisible();
});
