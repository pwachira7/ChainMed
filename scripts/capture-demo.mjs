import dotenv from "dotenv";
import fs from "node:fs";
import { chromium } from "@playwright/test";
dotenv.config();
if (process.env.NODE_ENV !== "development")
  throw new Error("Development screenshots only");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(process.env.WEB_ORIGIN + "/login");
  await page.getByLabel("Email address").fill("auditor@chainmed.demo");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await page.getByRole("heading", { name: /^Welcome back,/ }).waitFor();
  fs.mkdirSync("docs/screenshots", { recursive: true });
  await page
    .getByRole("link", { name: "Integrity findings", exact: true })
    .click();
  await page.locator(".finding-list .panel, section.empty").first().waitFor();
  await page.screenshot({
    path: "docs/screenshots/integrity-findings.png",
    fullPage: true,
  });
  await page
    .locator("nav")
    .getByRole("link", { name: "Notifications", exact: true })
    .click();
  await page.locator(".panel .activity-row, .panel .empty").first().waitFor();
  await page.screenshot({
    path: "docs/screenshots/notifications.png",
    fullPage: true,
  });
  console.log("Captured actual findings and notifications screens.");
} finally {
  await browser.close();
}
