// Zrzuty ekranu do README: `npm run screenshots`. Przeglądarka bez okna (Chromium z Playwright),
// czyste localStorage, więc wynik nie zależy od stanu edytora na tym komputerze.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const url = rel => pathToFileURL(path.join(ROOT, rel)).href;
const out = name => path.join(ROOT, "docs/screenshots", name);

const browser = await chromium.launch();
const VIEW = { width: 1600, height: 940 };
const settle = page => page.evaluate(() => document.fonts.ready).then(() => page.waitForTimeout(400));

// każdy zrzut w osobnym kontekście: czyste localStorage (motyw, karty, historia)
async function shot(name, fn, opts = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, colorScheme: "dark", locale: "pl-PL" });
  const page = await ctx.newPage();
  await fn(page);
  await settle(page);
  await page.screenshot({ path: out(name), ...opts });
  await ctx.close();
  console.log("zapisano", `docs/screenshots/${name}`);
}

// 1. Edytor: przykład z rozgałęzieniami, zaznaczony przepływ i jego właściwości
await shot("editor.png", async page => {
  await page.goto(url("dist/editor.html"));
  await page.locator("#preview .fg-node").first().waitFor();
  await page.evaluate(() => select({ kind: "flow", id: page.doc.flows[0].id })); // startowy przykład to „zamowienie”
});

// 2. Edytor z panelem YAML: tekst i graf zmieniają się razem
await shot("editor-yaml.png", async page => {
  await page.goto(url("dist/editor.html"));
  await page.locator("#preview .fg-node").first().waitFor();
  await page.evaluate(() => { openExample("etl"); select({ kind: "settings" }); });
  await page.locator("#vYaml").click();
  await page.waitForTimeout(400);
});

// 3. Wygenerowana strona HTML w jasnym motywie, wyróżniony przepływ
await shot("viewer-light.png", async page => {
  await page.addInitScript(() => localStorage.setItem("flowgraph-theme", "light"));
  await page.goto(url("dist/examples/etl.html"));
  await page.locator(".fg-node").first().waitFor();
  await page.locator(".fg-legend button").nth(1).click();
});

// 4. Model C4 (kontenery) na stronie HTML
await shot("c4.png", async page => {
  await page.goto(url("dist/examples/c4-2-kontenery.html"));
  await page.locator(".fg-node").first().waitFor();
});

await browser.close();
