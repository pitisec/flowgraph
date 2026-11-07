// Konwerter Mermaid (mermaid.js): eksport + import bez strat i import zwykłego Mermaida.
const test = require("node:test");
const assert = require("node:assert/strict");
const { FlowGraph, Mermaid, EXAMPLES } = require("./helpers.cjs");

const summary = spec => {
  const { doc } = FlowGraph.normalize(spec);
  return {
    title: doc.title,
    direction: doc.direction,
    nodes: doc.nodes.map(n => [n.id, n.label, n.group, n.shape]).sort(),
    groups: doc.groups.map(g => [g.id, g.label, g.parent]).sort(),
    flows: doc.flows.map(f => [f.id, f.label, f.route, f.style]),
    edges: doc.segments.map(s => `${s.flow}:${s.from}>${s.to}:${s.labels.join("|")}`).sort(),
  };
};

for (const { name, spec } of EXAMPLES) {
  test(`eksport i ponowny import bez strat: ${name}`, () => {
    const text = Mermaid.toMermaid(spec);
    assert.match(text, /^flowchart (LR|TB|RL|BT)$/m);
    const { spec: back } = Mermaid.fromMermaid(text);
    assert.deepEqual(summary(back), summary(spec));
  });
}

test("zwykły Mermaid: łańcuch krawędzi staje się przepływem", () => {
  const { spec, warnings } = Mermaid.fromMermaid([
    "flowchart LR",
    "  subgraph sklep [Sklep]",
    "    A[Koszyk] --> B(Płatność)",
    "  end",
    "  B -- opłacone --> C[(Magazyn)]",
  ].join("\n"));
  assert.deepEqual(warnings, []);
  const { doc, errors } = FlowGraph.normalize(spec);
  assert.deepEqual(errors, []);
  assert.deepEqual(doc.nodes.map(n => n.id).sort(), ["A", "B", "C"]);
  assert.equal(doc.nodes.find(n => n.id === "A").group, "sklep");
  assert.equal(doc.nodes.find(n => n.id === "C").shape, "db");
  assert.deepEqual(doc.segments.map(s => `${s.from}>${s.to}`), ["A>B", "B>C"]);
  assert.deepEqual(doc.segments[1].labels, ["opłacone"]);
});

test("niepoprawny tekst daje czytelny błąd", () => {
  assert.throws(() => Mermaid.fromMermaid("to nie jest diagram"));
});

test("kolory dokumentu przechodzą przez Mermaid bez strat", () => {
  const spec = { title: "K", colors: { marka: "#ff5500", las: { light: "#22aa77", dark: "#55dd99" } },
    nodes: [{ id: "a", color: "marka" }, { id: "b", color: "las" }], flows: [{ id: "f", path: ["a", "b"], color: "las" }] };
  const text = Mermaid.toMermaid(spec);
  assert.match(text, /style a stroke:#ff5500/);
  assert.match(text, /%% fg:doc .*"colors"/);
  const back = Mermaid.fromMermaid(text).spec;
  assert.deepEqual(back.colors, spec.colors);
  assert.deepEqual(back.nodes.map(n => n.color), ["marka", "las"]);
  assert.equal(back.flows[0].color, "las");
});

test("Mermaid: typy grotów w obie strony (--- --o --x i dokładny typ w fg:flow)", () => {
  const spec = { title: "S", nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    flows: [{ id: "f", path: ["a", "b"], arrow: "none" }, { id: "g", path: ["b", "c"], style: "dashed", arrow: "none" },
      { id: "h", path: ["a", "c"] }, { id: "i", path: ["c", "d"], arrow: "circle" }, { id: "j", path: ["b", "d"], arrow: "cross" }, { id: "k", path: ["a", "d"], arrow: "diamond" }] };
  const text = Mermaid.toMermaid(spec);
  assert.match(text, /a --- b/);
  assert.match(text, /b -\.- c/);
  assert.match(text, /a --> c/);
  assert.match(text, /c --o d/);
  assert.match(text, /b --x d/);
  const back = Mermaid.fromMermaid(text).spec;
  assert.deepEqual(back.flows.map(f => [f.id, f.arrow ?? "triangle"]), [["f", "none"], ["g", "none"], ["h", "triangle"], ["i", "circle"], ["j", "cross"], ["k", "diamond"]]);

  const plain = Mermaid.fromMermaid("flowchart LR\n  A --- B\n  B --o C\n  C --x D\n  D --> E\n").spec;
  const { doc } = FlowGraph.normalize(plain);
  const arrowOf = (x, y) => doc.flows[doc.segments.find(s => s.from === x && s.to === y).flow].arrow;
  assert.deepEqual([arrowOf("A", "B"), arrowOf("B", "C"), arrowOf("C", "D"), arrowOf("D", "E")], ["none", "circle", "cross", "triangle"]);
});
