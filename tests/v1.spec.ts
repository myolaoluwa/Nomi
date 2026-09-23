import { test, expect } from "@playwright/test";
test("V1 planner, habits, goals, insights and privacy flows", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Your name").fill("V1 Browser");
  await page.getByLabel("Email address").fill(`v1-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("long-passphrase-2026");
  await page.getByLabel("Confirm password").fill("long-passphrase-2026");
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.locator("code[aria-label='Recovery code']")).toBeVisible();
  await page.getByRole("button", { name: "I saved it — continue" }).click();
  await expect(page.getByRole("heading", { name: "Hello, V1." })).toBeVisible();
  await page.getByRole("button", { name: "Finance", exact: true }).click();
  await page
    .getByRole("button", { name: "Add account", exact: false })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Main");
  await dialog.getByLabel("Opening balance").fill("10000");
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "Project", exact: false }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Launch");
  await dialog.getByRole("button", { name: "Save project" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Task", exact: false }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Prepare launch");
  await dialog
    .getByRole("combobox", { name: "Project" })
    .selectOption({ label: "Launch" });
  await dialog.getByRole("combobox", { name: "Repeat" }).selectOption("daily");
  await dialog.getByLabel("Due date and time").fill("2026-09-24T09:00");
  await dialog.getByRole("button", { name: "Save task" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Prepare launch", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Complete Prepare launch" }).click();
  await expect(page.getByText("Prepare launch", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Habits", exact: true }).click();
  await page.getByRole("button", { name: /Habit$/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Read");
  await dialog.getByRole("button", { name: "Save habit" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Mark today" }).click();
  await expect(page.getByText("1/7 check-ins this week")).toBeVisible();
  await page.getByRole("button", { name: "Goals", exact: true }).click();
  await page.getByRole("button", { name: /Goal$/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Read 3 days");
  await dialog
    .getByRole("combobox", { name: "Measure progress by" })
    .selectOption("habit_completions");
  await dialog
    .getByRole("combobox", { name: "Habit" })
    .selectOption({ label: "Read" });
  await dialog.getByLabel("Target (count)").fill("3");
  await dialog.getByRole("button", { name: "Save goal" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("33% complete")).toBeVisible();
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await page.getByRole("button", { name: "Enable data insights" }).click();
  await page.getByRole("button", { name: "Weekly summary" }).click();
  await expect(page.getByText(/In the past seven days/)).toBeVisible();
  await expect(page.getByText(/supporting records/)).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Data and privacy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Download my data" }).click();
  await page.getByRole("button", { name: "Clear question history" }).click();
  await expect(page.getByText("✓ Question history deleted")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/v1-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByLabel("Type DELETE MY ACCOUNT").fill("DELETE MY ACCOUNT");
  await page
    .getByRole("button", { name: "Delete my account and data" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you again." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
