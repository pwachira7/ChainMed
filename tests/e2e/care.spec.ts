import { test, expect } from "@playwright/test";
import dotenv from "dotenv";
import fs from "node:fs";
dotenv.config();
async function signIn(page: import("@playwright/test").Page, role: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(role + "@chainmed.demo");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: /^Welcome back,/ }),
  ).toBeVisible();
}
test("citizen submits an incident, follows status, and cannot open audit pages", async ({
  page,
}) => {
  await signIn(page, "citizen");
  await page
    .getByRole("link", { name: "Report an incident", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Welfare check");
  await page
    .getByLabel("General location")
    .fill("Fictional Playwright Community Hub");
  await page
    .getByLabel("What happened?")
    .fill(
      "Fictional browser demonstration: coordinate a community welfare check.",
    );
  await page.getByRole("button", { name: "Submit incident" }).click();
  await expect(page.getByRole("heading", { name: /CM-2026/ })).toBeVisible();
  await expect(
    page.getByText("Submitted", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/audit");
  await expect(
    page.getByRole("heading", { name: /^Welcome back,/ }),
  ).toBeVisible();
});
test("administrator reviews, assigns and coordinates the citizen report", async ({
  page,
}) => {
  await signIn(page, "admin");
  fs.mkdirSync("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/admin-overview.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Care incidents", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search incidents" })
    .fill("Fictional Playwright Community Hub");
  await page
    .getByRole("row")
    .filter({ hasText: "Fictional Playwright Community Hub" })
    .first()
    .getByRole("link")
    .click();
  await page.getByRole("button", { name: "Move to Under review" }).click();
  await page
    .getByRole("combobox", { name: "Responsible staff", exact: true })
    .selectOption({ label: "Jamie Okello" });
  await page.getByRole("button", { name: "Assign staff", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Move to In progress" }),
  ).toBeVisible();
});
test("assigned staff updates operational notes and status", async ({
  page,
}) => {
  await signIn(page, "staff");
  await page.getByRole("link", { name: "Care incidents", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search incidents" })
    .fill("Fictional Playwright Community Hub");
  await page
    .getByRole("row")
    .filter({ hasText: "Fictional Playwright Community Hub" })
    .first()
    .getByRole("link")
    .click();
  await page
    .getByLabel("Add a note")
    .fill("Fictional browser test: care response team is on its way.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByText("Fictional browser test: care response team is on its way."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move to In progress" }).click();
  await expect(
    page.getByRole("button", { name: "Move to Resolved" }),
  ).toBeVisible();
});
test("auditor verifies inventory, downloads evidence, and sees notifications", async ({
  page,
}) => {
  await signIn(page, "auditor");
  await page.getByRole("link", { name: "Audit trail", exact: true }).click();
  await page.getByRole("button", { name: "Verify full inventory" }).click();
  await expect(
    page.getByRole("heading", { name: "Verification completed" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("chainmed-audit.csv");
  await page.screenshot({
    path: "docs/screenshots/audit-trail.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Integrity findings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Integrity findings", exact: true }),
  ).toBeVisible();
});
test("mobile layout remains navigable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "citizen");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Care incidents", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Care incidents", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/mobile-incidents.png",
    fullPage: true,
  });
});
