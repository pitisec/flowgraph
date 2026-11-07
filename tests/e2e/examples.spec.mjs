// Wygenerowane strony z dist/examples/: graf się rysuje, legenda wyróżnia przepływ, eksport SVG działa.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ROOT, fileUrl, watchErrors } from "./helpers.mjs";

const pages = fs.readdirSync(path.join(ROOT, "dist", "examples")).filter(f => f.endsWith(".html"));

test("są wygenerowane strony przykładów", () => {
  expect(pages.length).toBeGreaterThanOrEqual(6);
});

for (const f of pages) {
  test(`przykład ${f}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(fileUrl(`dist/examples/${f}`));
    await expect(page.locator(".fg-node").first()).toBeVisible();
    expect(await page.locator(".fg-node").count()).toBeGreaterThan(2);
    expect(await page.locator(".fg-lane").count()).toBeGreaterThan(2);
    await expect(page.locator(".fg-errors")).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); // domyślny motyw

    // kliknięcie przepływu w legendzie wyróżnia go i pokazuje opis
    const first = page.locator(".fg-legend button").first();
    if (await first.count()) {
      await first.click();
      await expect(first).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".fg-stage")).toHaveClass(/fg-focus/);
      await expect(page.locator(".fg-info")).toBeVisible();
    }

    // obraz SVG składa się z kształtów i tekstu (bez foreignObject)
    const svg = await page.evaluate(() => FlowGraph.stageToSVG(document.querySelector(".fg-stage"), { title: "t" }).svg);
    expect(svg).toContain("<text");
    expect(svg).not.toContain("foreignObject");

    expect(errors).toEqual([]);
  });
}

test("strona przykładu: zoom przyciskami", async ({ page }) => {
  await page.goto(fileUrl(`dist/examples/${pages[0]}`));
  const stage = page.locator(".fg-stage");
  const sc = () => stage.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  await page.locator(".fg-zoom-val").click();
  await expect.poll(sc).toBe(1);
  await page.locator(".fg-zoom-in").click();
  await expect.poll(sc).toBe(1.1);
  await expect(page.locator(".fg-zoom-val")).toHaveText("110%");
  for (let i = 0; i < 20; i++) await page.locator(".fg-zoom-out").click({ force: true });
  await expect(page.locator(".fg-zoom-out")).toBeDisabled();
  await expect.poll(sc).toBe(0.2);
});

test("strona przykładu: pole grafu sięga dołu okna, zoom nie przewija strony", async ({ page }) => {
  await page.goto(fileUrl(`dist/examples/${pages[0]}`));
  const c = page.locator(".fg-canvas");
  const box = await c.boundingBox(), vh = page.viewportSize().height;
  expect(Math.abs(vh - (box.y + box.height) - 16)).toBeLessThan(3);
  await page.locator(".fg-zoom-in").click();
  await page.locator(".fg-zoom-in").click();
  expect((await c.boundingBox()).height).toBe(box.height);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
