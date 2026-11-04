/* Geo map verification + dashboard screenshots at the mounted console (4000). */
import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = new URL("../screenshots/", import.meta.url).pathname;
const BASE = "http://127.0.0.1:4000/backoffice";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const consoleErrors = [];
  const geoCalls = [];
  const geoBodies = [];
  page.on("response", async (response) => {
    if (response.url().includes("analytics/geo")) {
      try {
        const body = await response.json();
        geoBodies.push(`${body.meta?.metric}: ${(body.meta?.ranking ?? []).slice(0, 3).map((row) => row.stateCode).join(",")}`);
      } catch {
        /* ignore */
      }
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) consoleErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[placeholder="e.g. admin"]', "admin");
  await page.fill('input[placeholder="••••••••••"]', "Admin#2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/backoffice\/?$/, { timeout: 20000 });
  await page.waitForSelector(".usmap-board", { timeout: 20000 });
  await page.waitForTimeout(700);

  const probe = await page.evaluate(async () => {
    const stored = JSON.parse(localStorage.getItem("fc.backoffice.tokens") || "{}");
    const response = await fetch(
      "/backoffice/api/v1/admin/analytics/geo?metric=bookings&from=2025-11-04&to=2026-11-04&include=orders,bookings",
      { headers: { authorization: `Bearer ${stored.accessToken}` } },
    );
    const body = await response.json();
    return [response.status, body.meta.metric, (body.meta.ranking ?? []).slice(0, 3).map((row) => row.stateCode).join(",")];
  });
  console.log("in-page probe (bookings):", probe);

  const readTip = async (state) => {
    await page.hover(`path[aria-label^="${state}:"]`);
    await page.waitForSelector(".usmap-tip", { timeout: 5000 });
    const tip = await page.locator(".usmap-tip").first().innerText();
    return tip.replace(/\s+/g, " ").trim();
  };

  console.log("CA tooltip:", await readTip("California"));
  console.log("Subtitle:", (await page.locator(".usmap-sub").allInnerTexts()).join(" | "));

  await page.getByRole("tab", { name: "Rentals", exact: true }).click();
  await page.waitForTimeout(600);
  console.log("OR tooltip (Rentals layer):", await readTip("Oregon"));

  const bookingsResponse = page.waitForResponse((response) => response.url().includes("metric=bookings"), { timeout: 15000 });
  await page.getByRole("tab", { name: "Bookings", exact: true }).click();
  const captured = await bookingsResponse;
  console.log("Bookings URL:", captured.url());
  const capturedBody = await captured.json();
  console.log(
    "Bookings response:", captured.status(),
    capturedBody.meta?.metric,
    (capturedBody.meta?.ranking ?? []).slice(0, 3).map((row) => `${row.stateCode}:${row.value}`).join(","),
  );
  await page.waitForTimeout(900);
  const ranked = await page.locator(".usmap-rank li").allInnerTexts();
  console.log("Bookings ranking:", ranked.map((row) => row.replace(/\s+/g, " ").trim()).join(" | "));

  await page.locator(".usmap-controls .segmented").nth(0).getByRole("tab", { name: "Orders", exact: true }).click();
  await page.getByRole("tab", { name: "Rentals", exact: true }).click(); // layer back to Orders
  await page.waitForTimeout(500);
  console.log("Orders ranking:", (await page.locator(".usmap-rank-name").allInnerTexts()).slice(0, 4).map((row) => row.split("\n")[0]).join(", "));
  await page.click('path[aria-label^="California:"]');
  await page.waitForTimeout(500);
  const drawer = page.locator(".drawer, [role='dialog']").first();
  console.log("Drawer text:", (await drawer.innerText()).replace(/\s+/g, " ").slice(0, 140));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  console.log("Drawer hidden after Esc:", !(await drawer.isVisible().catch(() => false)));

  for (const [name, dark] of [
    ["geo-dashboard-1440-light", false],
    ["geo-dashboard-1440-dark", true],
  ]) {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.evaluate((theme) => {
      localStorage.setItem("fc-admin-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }, dark ? "dark" : "light");
    await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".usmap-board", { timeout: 20000 });
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
    console.log("shot", name);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    localStorage.setItem("fc-admin-theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".usmap-board", { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}geo-dashboard-390.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log("shot geo-dashboard-390; horizontal overflow px:", overflow);

  await page.setViewportSize({ width: 1440, height: 1100 });
  const dateInputs = page.locator(".usmap-range input[type='date']");
  await dateInputs.nth(0).fill("2026-01-01");
  await dateInputs.nth(1).fill("2026-01-01");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForTimeout(900);
  const emptyText = await page.locator(".usmap-board-col").innerText();
  console.log("Empty window state:", emptyText.replace(/\s+/g, " ").slice(0, 160));

  console.log("geo calls:", geoCalls);
  console.log("geo bodies:", geoBodies);
  console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
