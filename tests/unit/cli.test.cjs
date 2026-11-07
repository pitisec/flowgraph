// Wiersz poleceń (flowgraph.py): render, editor, konwersja Mermaid. Wymaga uv (shebang skryptu).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { ROOT, yaml } = require("./helpers.cjs");

const CLI = path.join(ROOT, "flowgraph.py");
const run = (...args) => execFileSync(CLI, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flowgraph-test-"));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("render tworzy samodzielną stronę HTML", () => {
  const out = path.join(tmp, "etl.html");
  run("render", "examples/etl.yml", "-o", out);
  const html = fs.readFileSync(out, "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Potok danych sprzedażowych/);
  assert.ok(!/<script[^>]+src=/i.test(html), "strona nie powinna ładować zewnętrznych skryptów");
});

test("editor buduje edytor z wklejonymi bibliotekami", () => {
  const out = path.join(tmp, "editor.html");
  run("editor", "-o", out);
  const html = fs.readFileSync(out, "utf8");
  assert.ok(html.length > 300_000);
  // te znaczniki wypełnia flowgraph.py; __CSS__, __SPEC__ itd. zostają celowo w szablonie eksportu HTML (wypełnia go przeglądarka)
  for (const m of ["__EXAMPLES__", "__JSYAML__", "__MERMAID__", "__SHELL__"]) assert.ok(!html.includes(m), `niewypełniony znacznik ${m}`);
  assert.ok(html.includes("window.FlowGraphMermaid") || html.includes("FlowGraphMermaid"), "brak konwertera Mermaid");
});

test("wynik trafia też do katalogu, którego jeszcze nie ma (np. app/dist/ w świeżym checkoutcie)", () => {
  const out = path.join(tmp, "nowy", "katalog", "index.html");
  run("editor", "-o", out);
  assert.ok(fs.statSync(out).size > 10000);
});

test("example wypisuje poprawny YAML", () => {
  const spec = yaml.load(run("example"));
  assert.ok(Array.isArray(spec.nodes) && Array.isArray(spec.flows));
});

test("to-mermaid i from-mermaid: przepływ tam i z powrotem", () => {
  const mmd = path.join(tmp, "c4.mmd"), back = path.join(tmp, "c4.yml");
  run("to-mermaid", "examples/c4-2-kontenery.yml", "-o", mmd);
  assert.match(fs.readFileSync(mmd, "utf8"), /flowchart TB/);
  run("from-mermaid", mmd, "-o", back);
  const a = yaml.load(fs.readFileSync(path.join(ROOT, "examples/c4-2-kontenery.yml"), "utf8"));
  const b = yaml.load(fs.readFileSync(back, "utf8"));
  assert.deepEqual(b.nodes.map(n => n.id).sort(), a.nodes.map(n => n.id).sort());
  assert.deepEqual(b.flows.map(f => f.id), a.flows.map(f => f.id));
});

test("błędny plik kończy się kodem błędu i komunikatem", () => {
  const bad = path.join(tmp, "zly.yml");
  fs.writeFileSync(bad, "- to\n- jest\n- lista\n");
  assert.throws(() => run("render", bad, "-o", path.join(tmp, "x.html")), /słownik/);
});
