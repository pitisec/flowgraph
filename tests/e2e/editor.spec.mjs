// Edytor WYSIWYG: start, karty, edycja z historią, przeciąganie węzła na żywo, YAML, Mermaid, zapamiętanie sesji.
import { test, expect } from "@playwright/test";
import { fileUrl, watchErrors } from "./helpers.mjs";

const YAML_A = "title: Graf A\nnodes: [{id: x, label: Iks}, {id: y, label: Igrek}]\nflows: [{id: f, path: [x, y]}]\n";
const YAML_B = "title: Graf B\nnodes: [{id: p}, {id: q}]\nflows: [{id: g, path: [p, q]}]\n";

let errors;
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.goto(fileUrl("dist/editor.html"));
  await expect(page.locator("#preview .fg-node").first()).toBeVisible();
});
test.afterEach(() => expect(errors).toEqual([]));

const tabs = page => page.locator("#tabs .ed-tab");
const activeTab = page => page.locator('#tabs .ed-tab[aria-selected="true"]');

test("start: przykład narysowany, ciemny motyw, jedna karta", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(tabs(page)).toHaveCount(1);
  expect(await page.locator("#preview .fg-node").count()).toBeGreaterThan(5);
  await expect(page.locator("#bSave")).toHaveText("Zapisz");
});

test("karty: otwieranie, przełączanie, ponowne otwarcie, zamykanie", async ({ page }) => {
  await page.evaluate(([a, b]) => { openFile("a.yml", a); openFile("b.yml", b); }, [YAML_A, YAML_B]);
  await expect(tabs(page)).toHaveCount(3);
  await expect(activeTab(page)).toContainText("b.yml");
  await expect(page.locator("#preview .fg-head h1")).toHaveText("Graf B");

  await tabs(page).filter({ hasText: "a.yml" }).click();
  await expect(activeTab(page)).toContainText("a.yml");
  await expect(page.locator("#preview .fg-head h1")).toHaveText("Graf A");

  // ten sam plik drugi raz: przełącza na kartę zamiast dodawać nową
  await page.evaluate(b => openFile("b.yml", b), YAML_B);
  await expect(tabs(page)).toHaveCount(3);
  await expect(activeTab(page)).toContainText("b.yml");

  await tabs(page).filter({ hasText: "b.yml" }).locator(".x").click();
  await expect(tabs(page)).toHaveCount(2);
});

test("edycja: kropka niezapisanych zmian na karcie, cofnij przywraca stan", async ({ page }) => {
  await page.evaluate(a => openFile("a.yml", a), YAML_A);
  await page.locator("#in-title").fill("Graf A zmieniony");
  await expect(page.locator("#preview .fg-head h1")).toHaveText("Graf A zmieniony");
  await expect(activeTab(page)).toHaveClass(/dirty/);
  await expect(page.locator("#bSave")).toHaveText("Zapisz");
  await expect(page.locator("#bSave")).toHaveClass(/dirty/);

  await page.locator("#preview").click({ position: { x: 5, y: 5 } }); // fokus poza polem tekstowym
  await page.locator("#bUndo").click();
  await expect(page.locator("#preview .fg-head h1")).toHaveText("Graf A");
  await expect(activeTab(page)).not.toHaveClass(/dirty/);
});

test("przeciąganie węzła: linie przerysowują się w trakcie, historia dostaje jeden wpis", async ({ page }) => {
  const node = page.locator('#preview .fg-node[data-id="koszyk"]');
  const box = await node.boundingBox();
  const lanes = () => page.evaluate(() => [...document.querySelectorAll("#preview .fg-lane")].map(p => p.getAttribute("d")).join("|"));
  const hist = () => page.evaluate(() => S.tl.length);
  const before = await lanes(), h0 = await hist();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 80, { steps: 8 });
  await expect.poll(lanes).not.toBe(before); // jeszcze przed puszczeniem
  expect(await hist()).toBe(h0);
  const mid = await node.boundingBox();
  expect(Math.abs(mid.x - (box.x + 60))).toBeLessThan(12); // węzeł idzie za kursorem (siatka 10)

  await page.mouse.up();
  await expect.poll(hist).toBe(h0 + 1);
  expect(await page.evaluate(() => findNode(S.spec, "koszyk").pos)).toBeTruthy();
});

test("YAML: zmiana tekstu trafia do grafu", async ({ page }) => {
  await page.locator("#vYaml").click();
  const ta = page.locator("#yamlText");
  await expect(ta).toBeVisible();
  await ta.fill(YAML_A);
  await expect(page.locator("#preview .fg-head h1")).toHaveText("Graf A");
  await expect(page.locator("#preview .fg-node")).toHaveCount(2);
});

test("Mermaid: eksport bieżącego grafu i wczytanie do nowej karty", async ({ page }) => {
  await page.locator("#bExport").click();
  await page.getByRole("menuitem", { name: /Mermaid/ }).click();
  const text = page.locator("#mmText");
  await expect(text).toHaveValue(/flowchart LR/);
  await text.fill("flowchart LR\n  A[Start] --> B[Koniec]\n");
  await page.locator("#mmImport").click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(page.locator("#preview .fg-node")).toHaveCount(2);
});

test("Mermaid: HTML w etykietach nie trafia do strony jako kod (XSS)", async ({ page }) => {
  // <b>, <i> itp. importer usuwa, a reszta musi zostać zwykłym tekstem, także przy sztuczkach typu <<b>img …>
  const evil = 'flowchart LR\n  A["<<b>img src=x onerror=window.__xss=1>"] -->|"<<i>script>window.__xss=2<</i>/script>"| B["<svg onload=window.__xss=3>"]\n';
  await page.evaluate(() => window.__xss = 0);
  await page.locator("#bExport").click();
  await page.getByRole("menuitem", { name: /Mermaid/ }).click();
  await page.locator("#mmText").fill(evil);
  await page.locator("#mmImport").click();
  await expect(page.locator("#preview .fg-node")).toHaveCount(2);
  await page.locator("#preview .fg-node").first().click(); // panel informacji też buduje HTML
  await expect(page.locator("#preview .fg-node").first()).toContainText("<img src=x onerror=");
  expect(await page.locator("#preview img, #preview script, #preview svg[onload]").count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBe(0);
});

test("sesja: karty i niezapisane zmiany wracają po przeładowaniu", async ({ page }) => {
  await page.evaluate(a => openFile("a.yml", a), YAML_A);
  await page.locator("#in-title").fill("Po przeładowaniu");
  await page.reload();
  await expect(tabs(page)).toHaveCount(2);
  await expect(activeTab(page)).toContainText("a.yml");
  await expect(activeTab(page)).toHaveClass(/dirty/);
  await expect(page.locator("#preview .fg-head h1")).toHaveText("Po przeładowaniu");
});

test("struktura: sekcje oddzielone linią, zwijane, stan zapamiętany", async ({ page }) => {
  const sec = key => page.locator(`#tree .ed-sec[data-key="${key}"]`);
  for (const key of ["flows", "nodes", "groups", "notes"]) {
    await expect(sec(key).locator(".ed-sec-t")).toHaveAttribute("aria-expanded", "true"); // domyślnie rozwinięte
    expect(await sec(key).evaluate(el => getComputedStyle(el).borderTopStyle)).toBe("solid");
  }
  const nodes = sec("nodes");
  await expect(nodes.locator(".ed-row").first()).toBeVisible();
  await nodes.locator(".ed-sec-t").click();
  await expect(nodes.locator(".ed-sec-t")).toHaveAttribute("aria-expanded", "false");
  await expect(nodes.locator(".ed-sec-b")).toBeHidden();
  await expect(nodes.locator(".ed-sec-h .ed-btn")).toBeVisible(); // „＋” działa też przy zwiniętej sekcji

  await page.reload();
  await expect(sec("nodes").locator(".ed-sec-b")).toBeHidden();
  await expect(sec("flows").locator(".ed-sec-b")).toBeVisible();
  await sec("nodes").locator(".ed-sec-t").press("Enter"); // klawiatura
  await expect(sec("nodes").locator(".ed-sec-b")).toBeVisible();
});

test("kolory dokumentu: dodanie w ustawieniach, wybór dla węzła, zmiana nazwy, usunięcie", async ({ page }) => {
  await page.evaluate(a => openFile("a.yml", a), YAML_A);
  await page.evaluate(() => select({ kind: "settings" }));
  await page.locator("#bAddColor").click();
  const row = page.locator("#doc-colors .ed-dcolor");
  await expect(row).toHaveCount(1);
  expect(await page.evaluate(() => Object.keys(S.spec.colors))).toEqual(["kolor-1"]);

  await page.evaluate(() => select({ kind: "node", id: "x" }));
  await page.locator('.ed-colors .ed-sw.doc[aria-label="kolor-1"]').click();
  const node = page.locator('#preview .fg-node[data-id="x"]');
  const hex = await page.evaluate(() => S.spec.colors["kolor-1"]);
  const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(", ")})`;
  await expect.poll(() => node.evaluate(el => getComputedStyle(el).borderTopColor)).toBe(rgb(hex));

  await page.evaluate(() => select({ kind: "settings" }));
  await row.locator("input.ed-in").fill("marka");
  await row.locator("input.ed-in").press("Enter");
  await expect.poll(() => page.evaluate(() => findNode(S.spec, "x").color)).toBe("marka");

  await page.locator('#doc-colors button[aria-label="Usuń kolor marka"]').click();
  await expect.poll(() => page.evaluate(() => findNode(S.spec, "x").color)).toBe(hex);
  expect(await page.evaluate(() => S.spec.colors)).toEqual({});
});

test("pasek: ikony historii i motywu, karty w górnym pasku", async ({ page }) => {
  for (const id of ["#bUndo", "#bRedo", "#bTheme"]) {
    await expect(page.locator(id)).toHaveText("");
    await expect(page.locator(`${id} svg`)).toBeVisible();
  }
  await expect(page.locator(".ed-top #tabs")).toBeVisible();
  await page.locator("#bTheme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "black");
  await expect(page.locator("#bTheme")).toHaveAttribute("aria-label", "Motyw: czarny");
  await expect(page.locator(".ed-top #bHist")).toHaveCount(0); // historia jest na pasku stanu
});

test("Nowy ▾: strzałka otwiera menu z przykładami, wybór otwiera przykład w karcie", async ({ page }) => {
  await expect(page.locator("#bExport")).toHaveText("Eksportuj ▾");
  await page.locator("#bNewMenu").click();
  const menu = page.locator("#exMenu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Pusty graf" })).toBeFocused();
  await menu.getByRole("menuitem").filter({ hasText: "Potok danych" }).first().click();
  await expect(menu).toBeHidden();
  await expect(tabs(page)).toHaveCount(2);
  await page.locator("#bNewMenu").click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator("#bNewMenu")).toBeFocused();
});

// Linie między węzłami jednej grupy (także w podgrupach) mieszczą się w ramce tej grupy.
const lanesOutsideGroups = page => page.evaluate(() => {
  const doc = page.doc, gmap = new Map(doc.groups.map(g => [g.id, g]));
  const groupsOf = id => { const out = new Set(); let g = doc.nodes.find(n => n.id === id)?.group; while (g && !out.has(g)) { out.add(g); g = gmap.get(g)?.parent; } return out; };
  const bad = [];
  document.querySelectorAll("#preview .fg-group-rect").forEach(r => {
    const id = r.dataset.group, R = r.getBBox();
    document.querySelectorAll("#preview .fg-lane").forEach(l => {
      if (!groupsOf(l.dataset.from).has(id) || !groupsOf(l.dataset.to).has(id)) return;
      const B = l.getBBox(), w = parseFloat(l.style.strokeWidth) / 2 || 0;
      if (B.x - w < R.x - 0.5 || B.y - w < R.y - 0.5 || B.x + B.width + w > R.x + R.width + 0.5 || B.y + B.height + w > R.y + R.height + 0.5)
        bad.push(`${id}: ${l.dataset.from}→${l.dataset.to}`);
    });
  });
  return bad;
});

test("grupy: ramka obejmuje linie między węzłami grupy (przykłady i węzły przypięte ręcznie)", async ({ page }) => {
  const keys = await page.evaluate(() => Object.keys(EXAMPLES));
  for (const k of keys) {
    await page.evaluate(k => openExample(k), k);
    expect(await lanesOutsideGroups(page), k).toEqual([]);
  }
  // dwa węzły grupy przypięte daleko od siebie: łuk między nimi nie może wyjść z ramki
  await page.evaluate(() => openFile("g.yml", [
    "title: G", "groups: [{id: g, label: Grupa}]",
    "nodes: [{id: a, group: g, pos: [0, 0]}, {id: b, group: g, pos: [400, 260]}, {id: c, group: g, pos: [0, 260]}]",
    "flows: [{id: f, path: [a, b], width: 6}, {id: h, path: [a, c, b]}]"].join("\n")));
  await expect(page.locator("#preview .fg-lane")).toHaveCount(3);
  expect(await lanesOutsideGroups(page)).toEqual([]);
});

test("zoom: przyciski, procent, Ctrl+kółko wokół kursora, skróty i dopasowanie", async ({ page }) => {
  const scale = () => page.evaluate(() => window.page ? null : page.scale); // globalne `page` edytora
  const val = page.locator("#preview .fg-zoom-val"), fit = page.locator("#preview .fg-fit");
  const s0 = await scale();
  await page.locator("#preview .fg-zoom-in").click();
  await expect.poll(scale).toBeGreaterThan(s0);
  await expect(fit).toHaveAttribute("aria-pressed", "false");
  await expect(val).toHaveText(`${Math.round((await scale()) * 100)}%`);

  await val.click(); // 100%
  await expect.poll(scale).toBe(1);
  await expect(val).toHaveText("100%");

  // Ctrl + kółko: punkt grafu pod kursorem zostaje w miejscu
  const node = page.locator('#preview .fg-node[data-id="koszyk"]');
  await node.scrollIntoViewIfNeeded();
  const b0 = await node.boundingBox();
  const at = { x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect.poll(scale).toBeGreaterThan(1);
  const b1 = await node.boundingBox();
  expect(Math.abs(b1.x + b1.width / 2 - at.x)).toBeLessThan(3);
  expect(Math.abs(b1.y + b1.height / 2 - at.y)).toBeLessThan(3);

  // Shift + dwa palce: przeglądarka na macOS podaje ruch w deltaX
  const sw = await scale();
  await page.locator("#preview .fg-canvas").dispatchEvent("wheel", { deltaX: 100, deltaY: 0, shiftKey: true, clientX: at.x, clientY: at.y });
  await expect.poll(scale).toBeLessThan(sw);
  const sw2 = await scale();
  await page.locator("#preview .fg-canvas").dispatchEvent("wheel", { deltaX: 0, deltaY: -100, shiftKey: true, clientX: at.x, clientY: at.y });
  await expect.poll(scale).toBeGreaterThan(sw2);

  await page.locator("#preview").click({ position: { x: 5, y: 5 } });
  const s1 = await scale();
  await page.keyboard.press("ControlOrMeta+Minus");
  await expect.poll(scale).toBeLessThan(s1);
  await page.keyboard.press("ControlOrMeta+0");
  await expect(fit).toHaveAttribute("aria-pressed", "true");

  // przeciąganie węzła po powiększeniu dalej trafia za kursorem
  await page.locator("#preview .fg-zoom-in").click();
  await page.locator("#preview .fg-zoom-in").click();
  const s2 = await scale();
  await node.scrollIntoViewIfNeeded();
  const box = await node.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 6 });
  const mid = await node.boundingBox();
  expect(Math.abs(mid.x - (box.x + 80))).toBeLessThan(10 * s2 + 2);
  await page.mouse.up();
  expect(await scale()).toBe(s2);
});

test("panele: przełączniki przy krawędziach, YAML na dole", async ({ page }) => {
  const box = sel => page.locator(sel).boundingBox();
  const main = await box(".ed-main"), l = await box("#vLeft"), r = await box("#vRight"), y = await box("#vYaml");
  expect(l.x - main.x).toBeLessThan(30);                          // lewy brzeg obszaru grafu
  expect(main.x + main.width - (r.x + r.width)).toBeLessThan(30); // prawy brzeg
  const status = await box(".ed-status"), cv = await box("#preview .fg-canvas");
  // zakładka wystaje od dołu: stoi na pasku stanu (zakrywa jego górną krawędź), pod polem grafu, po prawej
  expect(Math.abs(y.y + y.height - status.y)).toBeLessThanOrEqual(1.5);
  expect(y.y).toBeGreaterThanOrEqual(cv.y + cv.height);
  const hz = await box("#bHist");
  expect(main.x + main.width - (hz.x + hz.width)).toBeLessThan(30); // zakładki po prawej, skrajna to historia

  await page.locator("#vLeft").click();
  await expect(page.locator(".ed-side")).toBeHidden();
  await expect(page.locator("#vLeft")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#vLeft").click();
  await expect(page.locator(".ed-side")).toBeVisible();

  await page.locator("#vRight").click();
  await expect(page.locator("#insp")).toBeHidden();
  await page.locator("#vRight").click();
  await expect(page.locator("#insp")).toBeVisible();

  // dwuklik na elemencie otwiera zamknięty panel właściwości; dwuklik na tle nie
  await page.locator("#vRight").click();
  await expect(page.locator("#insp")).toBeHidden();
  const bg = await box("#preview .fg-canvas");
  await page.mouse.dblclick(bg.x + 4, bg.y + 4);
  await expect(page.locator("#insp")).toBeHidden();
  await page.locator("#preview .fg-node").first().dblclick();
  await expect(page.locator("#insp")).toBeVisible();
  await page.locator("#vRight").click();
  await page.locator("#tree .ed-row").nth(1).dblclick();
  await expect(page.locator("#insp")).toBeVisible();
  // z Shiftem: panel struktury (właściwości bez zmian)
  await page.locator('#tree .ed-sec[data-key="nodes"] .ed-sec-t').click(); // zwinięta sekcja węzłów
  await expect(page.locator('#tree .ed-sec[data-key="nodes"]')).toHaveClass(/collapsed/);
  // zaznaczony węzeł w zwiniętej sekcji: nagłówek sekcji wyróżniony, inne sekcje nie
  await page.locator("#preview .fg-node").nth(1).click();
  await expect(page.locator('#tree .ed-sec[data-key="nodes"]')).toHaveClass(/has-sel/);
  await expect(page.locator("#tree .ed-sec.has-sel")).toHaveCount(1);
  await page.locator("#vLeft").click();
  await expect(page.locator(".ed-side")).toBeHidden();
  await page.locator("#preview .fg-node").nth(1).dblclick({ modifiers: ["Shift"] });
  await expect(page.locator('#tree .ed-sec[data-key="nodes"]')).not.toHaveClass(/collapsed/);
  await expect(page.locator("#tree .ed-sec.has-sel")).toHaveCount(0); // po rozwinięciu wyróżnia się wiersz
  await expect(page.locator(".ed-side")).toBeVisible();
  await expect(page.locator("#tree .ed-row[aria-current=true]")).toBeInViewport();

  await page.locator("#vYaml").click();
  await expect(page.locator("#yamlPane")).toBeVisible();
  await expect(page.locator("#vYaml")).toBeVisible(); // zostaje, tylko zmienia kolor
  await expect(page.locator("#vYaml")).toHaveAttribute("aria-pressed", "true");
  // otwarty panel: zakładka jedzie z jego górną krawędzią
  await expect.poll(async () => { const t = await box("#vYaml"), p = await box("#yamlPane"); return Math.abs(t.y + t.height - p.y) <= 1.5; }).toBe(true);
  // otwarta zakładka bez dolnej linii (łączy się z panelem), zamknięta z linią
  const bottomLine = id => page.evaluate(id => { const cs = getComputedStyle(document.getElementById(id)); return cs.borderBottomColor === cs.backgroundColor; }, id);
  expect(await bottomLine("vYaml")).toBe(true);
  expect(await bottomLine("bHist")).toBe(false);
  await page.locator("#yamlClose").click();
  await expect(page.locator("#yamlPane")).toBeHidden();
  expect(await bottomLine("vYaml")).toBe(false);
  await expect(page.locator("#vYaml")).toBeFocused();
});

test("pole grafu wypełnia wolne miejsce, zoom nie zmienia jego rozmiaru", async ({ page }) => {
  const m = () => page.evaluate(() => {
    const c = document.querySelector("#preview .fg-canvas"), pv = document.querySelector("#preview");
    return { h: c.offsetHeight, w: c.offsetWidth, gap: Math.round(pv.getBoundingClientRect().bottom - c.getBoundingClientRect().bottom), pvScroll: pv.scrollTop };
  });
  const a = await m();
  expect(a.gap).toBeGreaterThan(28); expect(a.gap).toBeLessThan(45); // nad dolną krawędzią, z miejscem na zakładkę YAML
  for (let i = 0; i < 3; i++) await page.locator("#preview .fg-zoom-in").click();
  expect(await m()).toEqual(a);
  await page.setViewportSize({ width: 1400, height: 700 });
  await expect.poll(async () => (await m()).h).toBeLessThan(a.h); // mniejsze okno -> mniejsze pole
  await page.locator("#vYaml").click();
  await expect.poll(async () => (await m()).gap).toBeLessThan(45); // panel YAML zabiera miejsce, pole dalej mieści się nad nim
});

test("historia: zakładka z ikoną na prawo od YAML, dolny panel na zmianę z YAML", async ({ page }) => {
  const hist = page.locator("#bHist"), yaml = page.locator("#vYaml");
  const hb = await hist.boundingBox(), yb = await yaml.boundingBox();
  expect(hb.x).toBeGreaterThanOrEqual(yb.x + yb.width); // na prawo od YAML
  expect(Math.abs(hb.y + hb.height - (yb.y + yb.height))).toBeLessThanOrEqual(0.5); // ta sama linia, wystaje od dołu
  await expect(hist).toHaveText(""); // tylko ikona
  await expect(hist).toHaveAttribute("aria-label", "Historia zmian");
  await page.locator("#in-title").fill("Zmieniony tytuł");
  await page.locator("#preview").click({ position: { x: 5, y: 5 } });

  await hist.click();
  const pane = page.locator("#histPane");
  await expect(pane).toBeVisible();
  await expect(hist).toHaveAttribute("aria-pressed", "true");
  await expect(pane.locator(".ed-hrow")).toHaveCount(2);
  await expect(pane.locator(".ed-hrow.cur .lbl")).toContainText("tytuł");

  await pane.locator(".ed-hrow").nth(1).click(); // powrót do stanu początkowego
  await expect(page.locator("#preview .fg-head h1")).not.toHaveText("Zmieniony tytuł");
  await expect(pane.locator(".ed-hrow.future")).toHaveCount(1);
  await expect(page.locator("#bUndo")).toBeVisible(); // cofnij/ponów zostają na górze

  await yaml.click(); // YAML zastępuje historię
  await expect(page.locator("#yamlPane")).toBeVisible();
  await expect(pane).toBeHidden();
  await expect(hist).toHaveAttribute("aria-pressed", "false");
  await hist.click();
  await expect(pane).toBeVisible();
  await expect(page.locator("#yamlPane")).toBeHidden();
  await pane.locator(".ed-hrow").first().focus();
  await page.keyboard.press("Escape");
  await expect(pane).toBeHidden();
  await expect(hist).toBeFocused();
});

test("grot strzałki: wybór typu w ustawieniach przepływu zmienia marker na grafie", async ({ page }) => {
  await page.evaluate(a => openFile("a.yml", a), YAML_A);
  await page.evaluate(() => select({ kind: "flow", id: "f" }));
  const lane = () => page.locator("#preview .fg-lane").first();
  const head = () => page.evaluate(() => { const l = document.querySelector("#preview .fg-lane"); const id = l.getAttribute("marker-end")?.match(/#([^)]+)/)?.[1]; return id ? document.getElementById(id).querySelector("[data-arrow]").dataset.arrow : "none"; });
  await expect(page.locator('.ed-arrow[data-arrow="triangle"]')).toHaveAttribute("aria-checked", "true");
  expect(await head()).toBe("triangle");
  for (const t of ["open", "circle", "diamond", "cross"]) {
    await page.locator(`.ed-arrow[data-arrow="${t}"]`).click();
    await expect.poll(head).toBe(t);
    await expect(page.locator(`.ed-arrow[data-arrow="${t}"]`)).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => findFlow(S.spec, "f").arrow)).toBe(t);
    // kółko, romb i krzyżyk mają obwódkę w kolorze tła, która oddziela je od linii
    const halo = await page.evaluate(() => { const l = document.querySelector("#preview .fg-lane"); const id = l.getAttribute("marker-end").match(/#([^)]+)/)[1]; const hl = document.getElementById(id).querySelector(".fg-halo"); return hl ? getComputedStyle(hl).stroke === getComputedStyle(document.querySelector("#preview .fg-canvas")).backgroundColor : null; });
    expect(halo).toBe(["circle", "diamond", "cross"].includes(t) ? true : null);
  }
  await page.locator('.ed-arrow[data-arrow="none"]').click();
  await expect(lane()).not.toHaveAttribute("marker-end", /./);
  await page.locator('.ed-arrow[data-arrow="triangle"]').click();
  await expect(lane()).toHaveAttribute("marker-end", /url\(#/);
  expect(await page.evaluate(() => "arrow" in findFlow(S.spec, "f"))).toBe(false); // domyślny nie trafia do YAML
});

test("styl linii: przyciski z podglądem zmieniają linię na grafie", async ({ page }) => {
  await page.evaluate(a => openFile("a.yml", a), YAML_A);
  await page.evaluate(() => select({ kind: "flow", id: "f" }));
  const btn = s => page.locator(`#in-style .ed-arrow[data-style="${s}"]`);
  const dash = () => page.evaluate(() => document.querySelector("#preview .fg-lane").style.strokeDasharray);
  await expect(btn("solid")).toHaveAttribute("aria-checked", "true");
  for (const s of ["solid", "dashed", "dotted"]) await expect(btn(s).locator("svg")).toBeVisible();
  expect(await btn("dashed").locator("path").getAttribute("stroke-dasharray")).toBeTruthy();
  await btn("dashed").click();
  await expect(btn("dashed")).toHaveAttribute("aria-checked", "true");
  await expect.poll(dash).not.toBe("");
  expect(await page.evaluate(() => findFlow(S.spec, "f").style)).toBe("dashed");
  await btn("dotted").click();
  expect(await page.evaluate(() => findFlow(S.spec, "f").style)).toBe("dotted");
  await btn("solid").click();
  await expect.poll(dash).toBe("");
  expect(await page.evaluate(() => "style" in findFlow(S.spec, "f"))).toBe(false);
});

test("grupa: kliknięcie w dowolne miejsce ramki otwiera jej ustawienia, zagnieżdżona wygrywa", async ({ page }) => {
  await page.evaluate(() => openFile("gr.yml", [
    "title: G", "groups: [{id: zew, label: Zewnętrzna}, {id: wew, label: Wewnętrzna, parent: zew}]",
    "nodes: [{id: a, group: wew}, {id: b, group: zew}, {id: c}]",
    "flows: [{id: f, path: [a, b, c]}]"].join("\n")));
  const rect = id => page.locator(`#preview .fg-group-rect[data-group="${id}"]`);
  const clickIn = async (id, fx, fy) => { const b = await rect(id).boundingBox(); await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy); };
  // prawy dolny róg ramki wewnętrznej: daleko od nazwy i od węzła
  await clickIn("wew", 0.97, 0.9);
  await expect.poll(() => page.evaluate(() => S.sel)).toEqual({ kind: "group", id: "wew" });
  await expect(rect("wew")).toHaveClass(/fg-sel/);
  await expect(page.locator('#preview .fg-group-label[data-group="wew"]')).toHaveClass(/fg-sel/);
  // pusty fragment ramki zewnętrznej poza wewnętrzną
  const inner = await rect("wew").boundingBox(), outer = await rect("zew").boundingBox();
  const spots = [[outer.x + 4, outer.y + outer.height - 4], [outer.x + outer.width - 4, outer.y + outer.height - 4], [outer.x + outer.width - 4, outer.y + 30]];
  const [x, y] = spots.find(([x, y]) => x < inner.x || x > inner.x + inner.width || y < inner.y || y > inner.y + inner.height);
  await page.mouse.click(x, y);
  await expect.poll(() => page.evaluate(() => S.sel)).toEqual({ kind: "group", id: "zew" });
  await expect(rect("wew")).not.toHaveClass(/fg-sel/);
  // tło poza grupami nadal otwiera ustawienia grafu, a węzeł w grupie nadal zaznacza węzeł
  const c = await page.locator("#preview .fg-canvas").boundingBox();
  await page.mouse.click(c.x + c.width - 10, c.y + c.height - 10);
  await expect.poll(() => page.evaluate(() => S.sel.kind)).toBe("settings");
  await page.locator('#preview .fg-node[data-id="a"]').click();
  await expect.poll(() => page.evaluate(() => S.sel)).toEqual({ kind: "node", id: "a" });
  // eksport obrazu nie zawiera podświetlenia zaznaczonej ramki
  await page.evaluate(() => select({ kind: "group", id: "zew" }));
  const svg = await page.evaluate(async () => {
    let text = null; FlowGraph.setSaver(async (blob, name) => { text = await blob.text(); return name; });
    await FlowGraph.exportImage(document.querySelector("#preview .fg-stage"), "svg", { title: "t", embedFonts: false });
    return text;
  });
  expect(svg).toMatch(/<rect[^>]*data-group="zew"[^>]*stroke-width="1.2"/); // zwykła ramka, nie podświetlona (2)
  await expect(rect("zew")).toHaveClass(/fg-sel/); // po eksporcie zaznaczenie wraca
});

test("zamknięcie karty z niezapisanymi zmianami pyta oknem w stylu edytora, nie confirm()", async ({ page }) => {
  let native = 0; page.on("dialog", d => { native++; d.dismiss(); });
  await page.evaluate(a => openFile("a.yml", a), YAML_A);
  await page.evaluate(b => openFile("b.yml", b), YAML_B);
  await page.evaluate(() => commit(sp => { sp.title = "Zmienione B"; }));
  const tabs = page.locator(".ed-tab");
  const n = await tabs.count();
  const closeB = () => page.locator('.ed-tab .x[aria-label="Zamknij kartę b.yml"]').click();
  const dlg = page.locator("dialog.ed-ask");

  // Esc i „Anuluj” zostawiają kartę
  await closeB();
  await expect(dlg).toBeVisible();
  await expect(dlg).toHaveAttribute("role", "alertdialog");
  await expect(dlg.locator("h2")).toHaveText("Niezapisane zmiany");
  await expect(dlg.locator("p b")).toHaveText("„b.yml”");
  await expect(dlg.locator('[data-ask="save"]')).toBeFocused(); // domyślnie zapis (Enter), nic nie ginie
  // kolejność jak w macOS: „bez zapisywania” po lewej, potem Anuluj, Zapisz z prawej
  expect(await dlg.locator(".ed-ask-f button").evaluateAll(bs => bs.map(b => b.dataset.ask))).toEqual(["discard", "cancel", "save"]);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(tabs).toHaveCount(n);
  await closeB();
  await dlg.locator('[data-ask="cancel"]').click();
  await expect(dlg).toHaveCount(0);
  await expect(tabs).toHaveCount(n);

  // „Zapisz”: przerwany wybór miejsca zostawia kartę, udany zapis ją zamyka
  await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException("anulowano", "AbortError"); }; });
  await closeB();
  await dlg.locator('[data-ask="save"]').click();
  await expect(dlg).toHaveCount(0);
  await expect(tabs).toHaveCount(n);
  await page.evaluate(() => {
    window.__written = null;
    window.showSaveFilePicker = async () => ({ name: "b.yml", createWritable: async () => ({ write: async t => { window.__written = t; }, close: async () => {} }) });
  });
  await closeB();
  await dlg.locator('[data-ask="save"]').click();
  await expect(tabs).toHaveCount(n - 1);
  expect(await page.evaluate(() => window.__written)).toContain("Zmienione B");

  // „Zamknij bez zapisywania” zamyka kartę bez zapisu
  await page.evaluate(b => openFile("b.yml", b), YAML_B);
  await page.evaluate(() => commit(sp => { sp.title = "Zmienione B"; }));
  await page.evaluate(() => { window.__written = null; });
  await closeB();
  await expect(dlg.locator('[data-ask="discard"]')).toHaveText("Zamknij bez zapisywania");
  await dlg.locator('[data-ask="discard"]').click();
  await expect(tabs).toHaveCount(n - 1);
  await expect(page.locator(".ed-tab", { hasText: "b.yml" })).toHaveCount(0);
  expect(await page.evaluate(() => window.__written)).toBeNull();
  expect(native).toBe(0);
});

test("struktura: strzałka do zaznaczonego elementu poza widokiem", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 380 }); // niski widok: drzewo się przewija
  const side = page.locator(".ed-side");
  await side.evaluate(e => { e.scrollTop = 0; });
  await page.locator("#preview .fg-node").last().click();
  const row = page.locator('#tree .ed-row[aria-current="true"]');
  await side.evaluate(e => { e.scrollTop = 0; });
  // wiersz ostatniego węzła jest niżej niż widok drzewa: strzałka w dół
  const below = await row.evaluate(r => r.getBoundingClientRect().top >= document.querySelector(".ed-side").getBoundingClientRect().bottom - 4);
  test.skip(!below, "drzewo mieści się w widoku");
  await expect(page.locator("#seekDown")).toBeVisible();
  await expect(page.locator("#seekUp")).toBeHidden();
  await page.locator("#seekDown").click();
  await expect(row).toBeInViewport();
  await expect(page.locator("#seekDown")).toBeHidden();
  // przewinięcie na sam dół, a zaznaczony pierwszy wiersz: strzałka w górę
  await page.locator('#tree .ed-row').first().click();
  await side.evaluate(e => { e.scrollTop = e.scrollHeight; });
  await expect(page.locator("#seekUp")).toBeVisible();
  await page.locator("#seekUp").click();
  await expect(page.locator("#seekUp")).toBeHidden();
  // zwinięte sekcje: zaznaczony wiersz jest ukryty, nie może dawać fałszywej strzałki
  await side.evaluate(e => { e.scrollTop = 0; });
  for (const key of ["flows", "nodes", "groups", "notes"]) await page.locator(`#tree .ed-sec[data-key="${key}"] .ed-sec-t`).click();
  await page.locator("#preview .fg-node").first().click();
  await expect(page.locator('#tree .ed-sec[data-key="nodes"]')).toHaveClass(/has-sel/);
  await page.waitForTimeout(100);
  await expect(page.locator("#seekUp")).toBeHidden();
  await expect(page.locator("#seekDown")).toBeHidden();
});

test("kierunek grafu: cztery ikony zamiast listy", async ({ page }) => {
  await page.keyboard.press("Escape"); // ustawienia grafu
  const group = page.locator("#in-direction");
  await expect(group).toHaveAttribute("role", "radiogroup");
  await expect(group.locator('[role="radio"]')).toHaveCount(4);
  for (const [dir, name] of [["TB", "Z góry na dół"], ["BT", "Z dołu do góry"], ["RL", "Od prawej do lewej"], ["LR", "Od lewej do prawej"]]) {
    await page.getByRole("radio", { name }).click();
    await expect(page.locator(`#in-direction [data-dir="${dir}"]`)).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => S.spec.direction)).toBe(dir);
  }
});

test("stylowane listy wyboru: kształt z ikonami, grupa, węzły z szukaniem", async ({ page }) => {
  await expect(page.locator(".ed-insp select")).toHaveCount(0);
  await page.locator("#preview .fg-node").first().click();
  // kształt: lista z podglądem, wybór myszą
  await page.locator("#in-shape").click();
  const pop = page.locator(".ed-sel-pop");
  await expect(pop).toBeVisible();
  await expect(pop.locator('[role="option"] svg')).toHaveCount(4);
  await pop.getByRole("option", { name: /Magazyn danych/ }).click();
  await expect(pop).toBeHidden();
  await expect(page.locator("#in-shape")).toContainText("Magazyn danych");
  const id = await page.evaluate(() => S.sel.id);
  expect(await page.evaluate(id => S.spec.nodes.find(n => String(n.id) === id).shape, id)).toBe("db");
  // klawiatura: strzałka otwiera, Esc zamyka bez zmiany i nie odznacza węzła
  await page.locator("#in-shape").focus();
  await page.keyboard.press("ArrowDown");
  await expect(pop).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  expect(await page.evaluate(() => S.sel.kind)).toBe("node");
  // klawiatura: Home i Enter wybierają pierwszy kształt
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(id => S.spec.nodes.find(n => String(n.id) === id).shape, id)).toBeUndefined();
  // grupa węzła: stylowana lista
  await page.locator("#in-group").click();
  await expect(pop.getByRole("option", { name: /bez grupy/ })).toBeVisible();
  await page.keyboard.press("Escape");
  // kierunek w grupie: ikony (5 opcji z „jak graf”)
  const g = await page.evaluate(() => S.spec.groups[0] && String(S.spec.groups[0].id));
  test.skip(!g, "brak grup w przykładzie");
  await page.evaluate(g => select({ kind: "group", id: g }), g);
  await expect(page.locator('#in-arrange-dir [role="radio"]')).toHaveCount(5);
  await page.getByRole("radio", { name: "Z góry na dół" }).click();
  await expect(page.locator('#in-arrange-dir [data-dir="TB"]')).toHaveAttribute("aria-checked", "true");
  // dodaj węzeł do grupy: lista węzłów z szukaniem
  await page.locator("#in-addmember").click();
  const search = pop.locator(".ed-sel-f");
  if (await search.count()) {
    await search.fill("zzzz-nie-ma");
    await expect(pop.getByRole("option")).toHaveCount(1); // została tylko akcja „Nowy węzeł”
    await search.fill("");
  }
  await page.mouse.click(5, 5); // klik poza listą zamyka
  await expect(pop).toBeHidden();
});

test("rozgałęzienie we właściwościach przepływu: gałęzie z literą, pole węzła widoczne obok ✕", async ({ page }) => {
  const fid = await page.evaluate(() => { const f = S.spec.flows.find(f => (f.path || []).some(Array.isArray)); return f && String(f.id); });
  test.skip(!fid, "brak rozgałęzienia w przykładzie");
  await page.evaluate(id => select({ kind: "flow", id }), fid);
  const par = page.locator(".ed-par").first();
  await expect(par.locator(".ed-par-t")).toContainText("Rozgałęzienie");
  await expect(par.locator(".ed-branch-l").first()).toHaveText("A");
  const item = par.locator(".ed-bitem").first();
  const sel = await item.locator(".ed-sel-b").boundingBox(), del = await item.locator(".ed-bdel").boundingBox();
  expect(sel.width).toBeGreaterThan(80);
  expect(sel.x + sel.width).toBeLessThanOrEqual(del.x); // lista i ✕ obok siebie, nie na sobie
  await expect(par.locator(".ed-arrow")).toHaveCount(0); // strzałka między krokami nie udaje przycisku z ikoną
});

test("Otwórz ▾: import z Mermaid otwiera puste okno, wklejony diagram trafia do nowej karty", async ({ page }) => {
  await page.locator("#bOpenMenu").click();
  const menu = page.locator("#openMenu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Otwórz plik/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /Z Mermaid/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  const dlg = page.locator("#mmDlg");
  await expect(dlg).toBeVisible();
  await expect(page.locator("#mmTitle")).toHaveText("Import z Mermaid");
  await expect(page.locator("#mmText")).toHaveValue("");
  await expect(page.locator("#mmText")).toBeFocused();
  const n = await tabs(page).count();
  await page.locator("#mmText").fill("flowchart LR\n  a[Alfa] --> b[Beta]\n  b --> c[Gamma]");
  await page.locator("#mmImport").click();
  await expect(dlg).toBeHidden();
  await expect(tabs(page)).toHaveCount(n + 1);
  expect(await page.evaluate(() => S.spec.nodes.map(x => x.label))).toEqual(["Alfa", "Beta", "Gamma"]);
  // eksport → Mermaid dalej pokazuje bieżący graf pod zwykłym tytułem
  await page.evaluate(() => openMermaid());
  await expect(page.locator("#mmTitle")).toHaveText("Mermaid");
  await expect(page.locator("#mmText")).not.toHaveValue("");
  // Esc w menu wraca na strzałkę
  await page.locator("#mmClose").click();
  await page.locator("#bOpenMenu").click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator("#bOpenMenu")).toBeFocused();
});

test("nieobsługiwany diagram albo plik: okno z listą obsługiwanych typów, bez pustej karty", async ({ page }) => {
  const dlg = page.locator("dialog.ed-ask");
  await page.evaluate(a => openFile("a.yml", a), YAML_A);
  await page.evaluate(() => activate(0)); // otwieramy z pierwszej karty, nie z ostatniej
  const n = await tabs(page).count();
  // inny rodzaj diagramu Mermaid (także bez rozszerzenia .mmd)
  await page.evaluate(() => openFile("sekwencja.txt", "sequenceDiagram\n  A->>B: cześć"));
  await expect(dlg).toBeVisible();
  await expect(dlg.locator("h2")).toHaveText("Nie można wczytać diagramu Mermaid");
  await expect(dlg.locator("p")).toContainText("„sequenceDiagram” to inny rodzaj diagramu Mermaid");
  await expect(dlg.locator("p")).toContainText("flowchart");
  await page.keyboard.press("Enter");
  await expect(dlg).toHaveCount(0);
  await expect(tabs(page)).toHaveCount(n);
  expect(await page.evaluate(() => T.i)).toBe(0); // wraca na kartę, z której otwierano
  // plik w innym formacie
  await page.evaluate(() => openFile("obraz.png", "\u0089PNG\r\n\u001a\n binarne dane"));
  await expect(dlg.locator("h2")).toHaveText("Nieobsługiwany format pliku");
  await expect(dlg.locator("p")).toContainText("Obsługiwane pliki: graf YAML (.yml, .yaml), graf JSON (.json) i schemat blokowy Mermaid (.mmd, .mermaid).");
  await dlg.locator('[data-ask="ok"]').click();
  await expect(tabs(page)).toHaveCount(n);
  // import w oknie Mermaid: komunikat w oknie z listą obsługiwanych
  await page.evaluate(() => openMermaid("import"));
  await page.locator("#mmText").fill("classDiagram\n  A <|-- B");
  await page.locator("#mmImport").click();
  await expect(page.locator("#mmMsg")).toContainText("„classDiagram” to inny rodzaj diagramu Mermaid");
  await expect(page.locator("#mmMsg")).toContainText("Obsługiwany jest tylko schemat blokowy");
  await expect(page.locator("#mmDlg")).toBeVisible();
});
