import { test, expect } from "@playwright/test";
import { minor, major, balance, dayKey } from "../apps/web/src/lib";
test("money precision, separate account balances and timezone day boundaries", () => {
  expect(minor("12.34", "NGN")).toBe(1234);
  expect(minor("1.234", "KWD")).toBe(1234);
  expect(minor("123", "JPY")).toBe(123);
  expect(() => minor("1.01", "JPY")).toThrow();
  expect(() => minor("1.234", "NGN")).toThrow();
  expect(major(-100, "USD")).toBe("-1.00");
  expect(
    balance({ id: "a", opening_balance: "1000" }, [
      { id: "x", account_id: "a", type: "income", amount: "500" },
      { id: "y", account_id: "a", type: "expense", amount: "200" },
      { id: "z", account_id: "b", type: "expense", amount: "9000" },
    ]),
  ).toBe(1300);
  expect(dayKey("2026-09-23T23:30:00Z", "Africa/Lagos")).toBe("2026-09-24");
  expect(dayKey("2026-09-23T01:00:00Z", "America/New_York")).toBe("2026-09-22");
});
test("desktop and mobile: create account, spending, budget and linked activity", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Your name").fill("Ada");
  await page.getByLabel("Email address").fill(`ada-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-2026");
  await page.getByLabel("Confirm password").fill("correct-horse-2026");
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.locator("code[aria-label='Recovery code']")).toBeVisible();
  await page.getByRole("button", { name: "I saved it — continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Ada." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finance", exact: true }).click();
  await page
    .getByRole("button", { name: "Add account", exact: false })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Everyday");
  await dialog.getByLabel("Opening balance").fill("10000");
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: /^Transactions/ }).click();
  await page
    .getByRole("button", { name: "Add transaction", exact: false })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Lunch with a friend");
  await dialog
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Food & dining" });
  await dialog.getByLabel("Amount (NGN)").fill("2500");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: /^Budgets/ }).click();
  await page
    .getByRole("button", { name: "Add budget", exact: false })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Food & dining" });
  await dialog.getByLabel("Amount (NGN)").fill("5000");
  await dialog.getByRole("button", { name: "Save budget" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "value",
    "250000",
  );
  await page.getByRole("button", { name: "Activities", exact: true }).click();
  await page
    .getByRole("button", { name: "Log activity", exact: false })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("A mindful lunch break");
  await dialog
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Personal" });
  await dialog.getByLabel("Duration (minutes)").fill("45");
  await dialog
    .getByRole("combobox", {
      name: "Link a transaction (optional)",
      exact: true,
    })
    .selectOption({ index: 1 });
  await dialog.getByLabel("Tags (comma separated)").fill("friends, wellbeing");
  await dialog.getByRole("button", { name: "Save activity" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Linked transaction", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(
    page.getByText("A mindful lunch break", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Lunch with a friend", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search moments").fill("wellbeing");
  await expect(
    page.getByText("Lunch with a friend", { exact: true }),
  ).not.toBeVisible();
  await page.getByLabel("Search moments").fill("");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Hello, Ada." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Activities", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit A mindful lunch break", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Duration (minutes)").fill("60");
  await dialog.getByRole("button", { name: "Save activity" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(/60 min/)).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Ada Updated");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Preferences saved");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you again." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
