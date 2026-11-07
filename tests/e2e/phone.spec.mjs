// Telefon: strony z grafami mieszczą się w szerokości ekranu, edytor pokazuje sam podgląd.
import { test, expect, devices } from "@playwright/test";
import { fileUrl, watchErrors } from "./helpers.mjs";

const { defaultBrowserType, ...iPhone } = devices["iPhone 14"];
const { defaultBrowserType: _l, ...iPhoneLand } = devices["iPhone 14 landscape"];

let errors;
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => expect(errors).toEqual([]));

const noHorizontalScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test.describe("pionowo", () => {
  test.use(iPhone);

  for (const name of ["zamowienie", "c4-2-kontenery"]) {
    test(`strona ${name}: bez przewijania na boki, graf dopasowany`, async ({ page }) => {
      await page.goto(fileUrl(`dist/examples/${name}.html`));
      await expect(page.locator(".fg-node").first()).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
      await expect(page.locator(".fg-zoom-val")).toHaveText("40%"); // na wąskim ekranie dopasowanie pomniejsza bardziej niż do 72%
      const fit = await page.locator(".fg-fit").boundingBox();
      expect(fit.height).toBeLessThan(50); // napis w jednej linii
    });
  }

  test("edytor: tylko podgląd, bez paneli edycji", async ({ page }) => {
    await page.goto(fileUrl("dist/editor.html"));
    await expect(page.locator("#preview .fg-node").first()).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    for (const sel of [".ed-side", "#insp", ".ed-toolbar", "#bSave", "#bUndo", "#vYaml"]) await expect(page.locator(sel)).toBeHidden();
    await expect(page.locator(".ed-phone-note")).toBeVisible();
    await expect(page.locator("#bOpen").locator("..")).toBeVisible();
    // graf zaczyna się na pierwszym ekranie
    expect((await page.locator("#preview .fg-canvas").boundingBox()).y).toBeLessThan(page.viewportSize().height * 0.6);
  });

  test("edytor: przeciąganie palcem nie przesuwa węzła", async ({ page }) => {
    await page.goto(fileUrl("dist/editor.html"));
    const node = page.locator('#preview .fg-node[data-id="koszyk"]');
    await expect(node).toBeVisible();
    await node.scrollIntoViewIfNeeded();
    const b = await node.boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 60, y + 80, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => findNode(S.spec, "koszyk").pos)).toBeFalsy(); // węzeł nie został przypięty
  });
});

test.describe("poziomo", () => {
  test.use(iPhoneLand);

  test("edytor: pasek w jednym wierszu, graf widoczny", async ({ page }) => {
    await page.goto(fileUrl("dist/editor.html"));
    await expect(page.locator("#preview .fg-node").first()).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    const top = await page.locator(".ed-top").boundingBox();
    expect(top.height).toBeLessThan(60);
    await expect(page.locator("#preview .fg-head p")).toBeHidden();
    expect((await page.locator("#preview .fg-canvas").boundingBox()).y).toBeLessThan(page.viewportSize().height * 0.7);
  });
});
