// Edytor w roli aplikacji macOS: window.__TAURI__ podstawione w teście, dysk w pamięci.
// Sesja (localStorage) przetrwa ponowne wczytanie strony, czyli „restart” aplikacji.
import { test, expect } from "@playwright/test";
import { fileUrl, watchErrors } from "./helpers.mjs";

const PATH = "/Users/ktos/grafy/test.yml";
const YAML_A = "title: Graf A\nnodes: [{id: x, label: Iks}, {id: y, label: Igrek}]\nflows: [{id: f, path: [x, y]}]\n";
const YAML_B = YAML_A.replace("Graf A", "Graf B");

let errors, disk, pending;
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  disk = new Map(); pending = [];
  await page.exposeBinding("__host", (_src, cmd, a) => {
    if (cmd === "read_text") { if (!disk.has(a.path)) throw new Error(`brak pliku ${a.path}`); return disk.get(a.path); }
    if (cmd === "write_text") { disk.set(a.path, a.text); return null; }
    if (cmd === "take_pending") { const p = pending; pending = []; return p; }
    if (cmd === "selftest_enabled") return false;
    return null; // watch_file, set_recent, log_line, app_ready…
  });
  await page.addInitScript(() => {
    const listeners = {};
    window.__emit = (ev, payload) => (listeners[ev] || []).forEach(f => f({ payload }));
    window.__winTitle = "";
    const win = { setTitle: async t => { window.__winTitle = t; }, onCloseRequested: async () => () => {}, close() {}, destroy() {} };
    window.__TAURI__ = {
      core: { invoke: (cmd, args) => window.__host(cmd, args || {}) },
      event: { listen: async (ev, f) => { (listeners[ev] ||= []).push(f); return () => {}; } },
      webview: { getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }) },
      window: { getCurrentWindow: () => win },
      dialog: { open: async () => null, save: async () => null },
    };
  });
});
test.afterEach(() => expect(errors).toEqual([]));

/** Uruchomienie aplikacji; paths to pliki przekazane z Findera. */
async function launch(page, paths = []) {
  pending = paths;
  await page.goto(fileUrl("dist/editor.html"));
  await expect(page.locator("#preview .fg-node").first()).toBeVisible();
}
const winTitle = page => page.evaluate(() => window.__winTitle);

test("plik otwarty z Findera: bez znacznika niezapisanych zmian", async ({ page }) => {
  disk.set(PATH, YAML_A);
  await launch(page, [PATH]);
  await expect.poll(() => winTitle(page)).toBe("test.yml  —  ~/grafy");
});

test("plik zmieniony na dysku przy zamkniętej aplikacji: po starcie nowa treść, bez znacznika", async ({ page }) => {
  disk.set(PATH, YAML_A);
  await launch(page, [PATH]);
  await expect.poll(() => winTitle(page)).toBe("test.yml  —  ~/grafy");

  disk.set(PATH, YAML_B); // np. git pull, gdy aplikacja była zamknięta
  await launch(page); // sama przywrócona sesja
  await expect.poll(() => winTitle(page)).toBe("test.yml  —  ~/grafy");
  await expect(page.locator("#preview")).toContainText("Graf B");

  disk.set(PATH, YAML_A);
  await launch(page, [PATH]); // sesja i ten sam plik z Findera
  await expect.poll(() => winTitle(page)).toBe("test.yml  —  ~/grafy");
  await expect(page.locator("#preview")).toContainText("Graf A");
});

test("niezapisane zmiany z sesji zostają, gdy plik zmienił się na dysku", async ({ page }) => {
  disk.set(PATH, YAML_A);
  await launch(page, [PATH]);
  await page.evaluate(() => { S.spec.title = "Moja wersja"; histPush("zmiana tytułu"); persist(); refresh(); });
  await expect.poll(() => winTitle(page)).toBe("● test.yml  —  ~/grafy");

  disk.set(PATH, YAML_B);
  await launch(page);
  await expect.poll(() => winTitle(page)).toBe("● test.yml  —  ~/grafy");
  await expect(page.locator("#preview")).toContainText("Moja wersja");
});

test("zmiana na dysku przy otwartej aplikacji przeładowuje graf", async ({ page }) => {
  disk.set(PATH, YAML_A);
  await launch(page, [PATH]);
  disk.set(PATH, YAML_B);
  await page.evaluate(p => window.__emit("file-changed", p), PATH);
  await expect(page.locator("#preview")).toContainText("Graf B");
  await expect.poll(() => winTitle(page)).toBe("test.yml  —  ~/grafy");
});
