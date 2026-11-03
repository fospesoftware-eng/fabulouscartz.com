/* Screenshot runner — drives system Chrome via playwright-core.
   Requires the API (4000) and Vite dev (5174) to be running. */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = new URL("../screenshots/", import.meta.url).pathname;
const BASE = "http://localhost:5174";

const shots = [
  { name: "login", url: "/login", viewport: { width: 1440, height: 960 } },
  { name: "dashboard-light", url: "/", viewport: { width: 1440, height: 1080 } },
  { name: "dashboard-dark", url: "/", viewport: { width: 1440, height: 1080 }, dark: true },
  { name: "orders", url: "/orders", viewport: { width: 1440, height: 1080 } },
  { name: "orders-drawer", url: "/orders?order=ord_1038", viewport: { width: 1440, height: 1080 } },
  { name: "products", url: "/products", viewport: { width: 1440, height: 1080 } },
  { name: "product-editor", url: "/products/prd_001", viewport: { width: 1440, height: 1080 } },
  { name: "inventory", url: "/inventory", viewport: { width: 1440, height: 1080 } },
  { name: "customers", url: "/customers", viewport: { width: 1440, height: 1080 } },
  { name: "categories", url: "/categories", viewport: { width: 1440, height: 1080 } },
  { name: "vendors", url: "/vendors", viewport: { width: 1440, height: 1080 } },
  { name: "content", url: "/content", viewport: { width: 1440, height: 1080 } },
  { name: "discounts", url: "/discounts", viewport: { width: 1440, height: 1080 } },
  { name: "analytics", url: "/analytics", viewport: { width: 1440, height: 1080 } },
  { name: "settings", url: "/settings", viewport: { width: 1440, height: 1080 } },
  { name: "audit", url: "/audit", viewport: { width: 1440, height: 1080 } },
  { name: "dashboard-768", url: "/", viewport: { width: 768, height: 1180 } },
  { name: "dashboard-1920", url: "/", viewport: { width: 1920, height: 1100 } },
  { name: "mobile-390-dashboard", url: "/", viewport: { width: 390, height: 844 } },
  { name: "mobile-390-orders", url: "/orders", viewport: { width: 390, height: 844 } },
  { name: "mobile-390-products", url: "/products", viewport: { width: 390, height: 844 } },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "admin@fabulouscartz.com");
  await page.fill('input[type="password"]', "Admin#2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  await page.waitForTimeout(900);

  for (const shot of shots) {
    if (shot.name === "login") continue;
    await page.goto(`${BASE}${shot.url}`, { waitUntil: "networkidle" });
    if (shot.dark) {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    } else {
      await page.emulateMedia({ colorScheme: "light" });
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    }
    await page.setViewportSize(shot.viewport);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${OUT}${shot.name}.png`, fullPage: true });
    console.log(`✓ ${shot.name}`);
  }

  // login shot (fresh context, unauth)
  const loginPage = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await loginPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await loginPage.evaluate(() => {
    localStorage.setItem("fc-admin-theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await loginPage.waitForTimeout(700);
  await loginPage.screenshot({ path: `${OUT}login.png`, fullPage: true });
  console.log("✓ login");

  await browser.close();
  console.log("done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
