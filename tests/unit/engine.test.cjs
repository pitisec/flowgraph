// Silnik (flowgraph.js): normalizacja specyfikacji, rozgałęzienia, walidacja.
const test = require("node:test");
const assert = require("node:assert/strict");
const { FlowGraph, EXAMPLES } = require("./helpers.cjs");

const edges = doc => doc.segments.map(s => `${s.from}>${s.to}`);

test("przykłady normalizują się bez błędów", () => {
  assert.ok(EXAMPLES.length >= 6, "za mało przykładów");
  for (const { name, spec } of EXAMPLES) {
    const { doc, errors } = FlowGraph.normalize(spec);
    assert.deepEqual(errors, [], `${name}: ${errors.join("; ")}`);
    assert.ok(doc.nodes.length > 0, `${name}: brak węzłów`);
    assert.ok(doc.segments.length > 0, `${name}: brak odcinków`);
    for (const s of doc.segments) {
      assert.ok(doc.nodes.some(n => n.id === s.from) && doc.nodes.some(n => n.id === s.to), `${name}: odcinek ${s.from}>${s.to} bez węzła`);
    }
  }
});

test("rozgałęzienie rozdziela przepływ, a następny krok łączy gałęzie", () => {
  const { doc, errors } = FlowGraph.normalize({ flows: [{ id: "f", path: ["a", ["b", "c"], "d"] }] });
  assert.deepEqual(errors, []);
  assert.deepEqual(edges(doc).sort(), ["a>b", "a>c", "b>d", "c>d"]);
});

test("gałąź może mieć kilka kroków", () => {
  const { doc } = FlowGraph.normalize({ flows: [{ id: "f", path: ["a", [["b1", "b2"], "c"], "d"] }] });
  assert.deepEqual(edges(doc).sort(), ["a>b1", "a>c", "b1>b2", "b2>d", "c>d"]);
});

test("etykieta kroku trafia na strzałkę", () => {
  const { doc } = FlowGraph.normalize({ flows: [{ id: "f", path: ["a", { node: "b", label: "24h" }] }] });
  assert.deepEqual(doc.segments[0].labels, ["24h"]);
});

test("węzły użyte tylko w ścieżce są dodawane jako automatyczne", () => {
  const { doc } = FlowGraph.normalize({ nodes: [{ id: "a", label: "A" }], flows: [{ id: "f", path: ["a", "b"] }] });
  assert.deepEqual(doc.nodes.map(n => [n.id, !!n.auto]), [["a", false], ["b", true]]);
});

test("błędne wartości są zgłaszane, a graf i tak powstaje", () => {
  const { doc, errors } = FlowGraph.normalize({ direction: "XX", flows: [{ id: "f", color: "zielonkawy", path: ["a", "b"] }] });
  assert.equal(doc.direction, "LR");
  assert.equal(errors.length, 2);
  assert.match(errors.join(" "), /direction/);
  assert.match(errors.join(" "), /zielonkawy/);
});

test("wymuszona pozycja jest odczytywana z listy i ze słownika", () => {
  const { doc } = FlowGraph.normalize({ nodes: [{ id: "a", pos: [10, 20] }, { id: "b", pos: { x: 30, y: 40 } }], flows: [] });
  assert.deepEqual(doc.nodes.map(n => n.pos), [{ x: 10, y: 20 }, { x: 30, y: 40 }]);
});

test("silnik ładuje się bez przeglądarki (CLI Mermaid)", () => {
  assert.equal(typeof FlowGraph.normalize, "function");
  assert.equal(typeof FlowGraph.render, "function");
});

test("kolory dokumentu: nazwy z colors, wersja dla ciemnego motywu, walidacja", () => {
  const { doc, errors } = FlowGraph.normalize({
    colors: { marka: "#FF5500", las: { light: "#22aa77", dark: "#55dd99" } },
    groups: [{ id: "g", color: "las" }],
    nodes: [{ id: "a", color: "Marka", group: "g" }, { id: "b" }],
    flows: [{ id: "f", path: ["a", "b"], color: "las" }],
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(doc.colors, [{ name: "marka", light: "#ff5500", dark: "#ff5500" }, { name: "las", light: "#22aa77", dark: "#55dd99" }]);
  assert.equal(doc.nodes.find(n => n.id === "a").color, "var(--fgc-marka)");
  assert.equal(doc.groups[0].color, "var(--fgc-las)");
  assert.equal(doc.flows[0].color, "var(--fgc-las)");

  const bad = FlowGraph.normalize({ colors: { blue: "#000000", "Zła nazwa": "#ffffff", zly: "red", ok: "#123456" },
    nodes: [{ id: "a", color: "fiolet" }], flows: [] });
  assert.equal(bad.errors.length, 4, bad.errors.join("\n"));
  assert.match(bad.errors.join("\n"), /wbudowany kolor/);
  assert.match(bad.errors.join("\n"), /nieznany kolor „fiolet”.*\bok\b/);
  assert.deepEqual(bad.doc.colors.map(c => c.name), ["ok"]);
});

test("grot: domyślnie triangle, arrow wybiera typ, arrows: false to none, zły typ to błąd", () => {
  const { doc, errors } = FlowGraph.normalize({ nodes: [{ id: "a" }, { id: "b" }],
    flows: [{ id: "f", path: ["a", "b"] }, { id: "g", path: ["b", "a"], arrows: false }, { id: "h", path: ["a", "b"], arrow: "Diamond" }],
    edges: [{ from: "a", to: "b", arrow: "circle" }] });
  assert.deepEqual(errors, []);
  assert.deepEqual(doc.flows.map(f => [f.id, f.arrow]), [["f", "triangle"], ["g", "none"], ["h", "diamond"], ["__edge0", "circle"]]);
  const bad = FlowGraph.normalize({ nodes: [{ id: "a" }, { id: "b" }], flows: [{ id: "f", path: ["a", "b"], arrow: "harpun" }] });
  assert.match(bad.errors.join(), /nieznany typ strzałki „harpun”/);
  assert.equal(bad.doc.flows[0].arrow, "triangle");
});
