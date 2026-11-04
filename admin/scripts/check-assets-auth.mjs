/* Verifies the two defects against the mounted console: no 401 on hard reload,
   and storefront thumbnails render without 404s on orders/products/inventory. */
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:4000/backoffice";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failures = [];
  const imgFailures = [];
  page.on("response", (response) => {
    if (response.status() === 401) failures.push(`401 ${response.url()}`);
    if (response.url().includes("/img") && response.status() >= 400) imgFailures.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[placeholder="e.g. admin"]', "admin");
  await page.fill('input[placeholder="••••••••••"]', "Admin#2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/backoffice\/?$/, { timeout: 20000 });
  await page.waitForTimeout(1200);
  console.log("after login 401s:", failures.length);
  console.log("after login img failures:", imgFailures.length);

  for (let index = 1; index <= 3; index += 1) {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".kpi-card", { timeout: 20000 });
    await page.waitForTimeout(700);
    console.log(`reload ${index}: 401s so far=${failures.length}, signed in=${await page.locator(".kpi-value").first().isVisible()}`);
  }

  for (const [name, path] of [
    ["orders", "/orders"],
    ["products", "/products"],
    ["inventory", "/inventory"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    if (name === "orders") {
      await page.locator("tbody tr").first().click();
      await page.waitForSelector(".line-thumb", { timeout: 10000 });
      await page.waitForTimeout(600);
    }
    const images = await page.locator("img").evaluateAll((nodes) =>
      nodes
        .filter((node) => (node.getAttribute("src") ?? "").includes("/img"))
        .map((node) => ({ src: node.getAttribute("src"), loaded: node.naturalWidth > 0 })),
    );
    console.log(`${name}: ${images.length} storefront images, loaded ${images.filter((image) => image.loaded).length}`, images.slice(0, 2));
  }

  console.log("401s:", failures.length ? failures : "none");
  console.log("img failures:", imgFailures.length ? imgFailures : "none");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
