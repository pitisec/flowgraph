// Ładuje silnik i konwerter Mermaid w node (tak jak CLI w flowgraph.py) oraz przykłady z examples/.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
globalThis.window = globalThis;
const yaml = require(path.join(ROOT, "vendor/js-yaml.min.js"));
require(path.join(ROOT, "src", "flowgraph.js"));
const Mermaid = require(path.join(ROOT, "src", "mermaid.js"));

const EXAMPLES = fs.readdirSync(path.join(ROOT, "examples"))
  .filter(f => f.endsWith(".yml"))
  .map(f => ({ name: f, spec: yaml.load(fs.readFileSync(path.join(ROOT, "examples", f), "utf8")) }));

module.exports = { ROOT, yaml, FlowGraph: globalThis.FlowGraph, Mermaid, EXAMPLES };
