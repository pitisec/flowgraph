/* FlowGraph: normalizacja specyfikacji (YAML/JSON) i rysowanie grafu przepływów.
   Wymaga globalnego `dagre` (dagre 0.8.5). Udostępnia window.FlowGraph. */
(function () {
  "use strict";

  const NAMED = ["blue", "orange", "purple", "green", "pink", "teal", "yellow", "red", "gray"];
  const ALIAS = { grey: "gray" };
  const SHAPES = ["box", "pill", "ghost", "db"];
  const STYLES = ["solid", "dashed", "dotted"];
  const ARROWS = ["triangle", "open", "circle", "diamond", "cross", "none"]; // grot na końcu linii
  const DIRS = ["LR", "TB", "RL", "BT"];

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);

  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;
  const COLOR_NAME = /^[a-z][a-z0-9-]*$/;
  // custom: Map nazwa -> {light, dark} z sekcji colors (kolory dokumentu)
  function color(raw, where, errors, fallback, custom) {
    if (raw == null || raw === "") return fallback;
    const s = String(raw).trim().toLowerCase();
    const n = ALIAS[s] || s;
    if (NAMED.includes(n)) return `var(--c-${n})`;
    if (custom && custom.has(n)) return `var(--fgc-${n})`;
    if (HEX.test(n)) return n;
    const names = [...NAMED, ...(custom ? custom.keys() : [])];
    errors.push(`${where}: nieznany kolor „${raw}”. Dozwolone: ${names.join(", ")} albo #rrggbb.`);
    return fallback;
  }
  /* Grot linii: arrow: triangle | open | circle | diamond | cross | none; arrows: false to skrót dla none. */
  function arrowOf(f, where, errors) {
    if (f.arrow == null || f.arrow === "") return f.arrows === false ? "none" : "triangle";
    const a = String(f.arrow).trim().toLowerCase();
    if (ARROWS.includes(a)) return a;
    errors.push(`${where}: nieznany typ strzałki „${f.arrow}”. Dozwolone: ${ARROWS.join(", ")}.`);
    return "triangle";
  }
  /* Sekcja colors: { nazwa: "#hex" } albo { nazwa: { light: "#hex", dark: "#hex" } }. */
  function customColors(raw, errors) {
    const out = new Map();
    if (raw == null) return out;
    if (!isObj(raw)) { errors.push("colors: oczekiwano słownika nazwa: kolor."); return out; }
    for (const [k, v] of Object.entries(raw)) {
      const name = String(k).trim().toLowerCase();
      if (!COLOR_NAME.test(name)) { errors.push(`colors: nazwa „${k}” może zawierać tylko małe litery, cyfry i myślnik i musi zaczynać się od litery.`); continue; }
      if (NAMED.includes(name) || ALIAS[name]) { errors.push(`colors: „${name}” to wbudowany kolor, wybierz inną nazwę.`); continue; }
      const light = isObj(v) ? v.light : v, dark = isObj(v) ? v.dark ?? v.light : v;
      const ok = x => typeof x === "string" && HEX.test(x.trim().toLowerCase());
      if (!ok(light) || !ok(dark)) { errors.push(`colors: kolor „${name}” musi być w formacie #rrggbb albo { light: #rrggbb, dark: #rrggbb }.`); continue; }
      out.set(name, { name, light: light.trim().toLowerCase(), dark: dark.trim().toLowerCase() });
    }
    return out;
  }
  /* Kolory dokumentu jako zmienne CSS --fgc-<nazwa>, z osobną wartością dla ciemnych motywów (jak paleta w flowgraph.css). */
  function applyCustomColors(colors) {
    if (typeof document === "undefined") return;
    let el = document.getElementById("fg-custom-colors");
    if (!colors.length) { el?.remove(); return; }
    if (!el) { el = document.createElement("style"); el.id = "fg-custom-colors"; document.head.append(el); }
    const decl = k => colors.map(c => `--fgc-${c.name}: ${c[k]};`).join(" ");
    el.textContent = `:root { ${decl("light")} }\n` +
      `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${decl("dark")} } }\n` +
      `:root[data-theme="dark"], :root[data-theme="black"] { ${decl("dark")} }`;
  }

  function list(v, where, errors) {
    if (v == null) return [];
    if (!Array.isArray(v)) { errors.push(`${where}: oczekiwano listy.`); return []; }
    return v;
  }

  /* Zamienia specyfikację użytkownika na dokument gotowy do rysowania. */
  function normalize(spec) {
    const errors = [];
    if (!isObj(spec)) return { doc: null, errors: ["Plik musi zawierać obiekt z polami title, nodes i flows."] };

    const custom = customColors(spec.colors, errors);
    const col = (raw, where, fallback) => color(raw, where, errors, fallback, custom);
    const direction = String(spec.direction || "LR").toUpperCase();
    if (!DIRS.includes(direction)) errors.push(`direction: dozwolone wartości to ${DIRS.join(", ")}.`);

    const groups = [], groupIds = new Set();
    list(spec.groups, "groups", errors).forEach((g, i) => {
      if (!isObj(g) || g.id == null || g.id === "") { errors.push(`groups[${i}]: grupa musi mieć pole id.`); return; }
      const id = String(g.id);
      if (groupIds.has(id)) { errors.push(`grupa „${id}”: powtórzone id.`); return; }
      groupIds.add(id);
      groups.push({ id, label: String(g.label ?? id), parent: g.parent != null ? String(g.parent) : null,
        color: col(g.color, `grupa „${id}”`, null) });
    });
    groups.forEach(g => {
      if (g.parent && !groupIds.has(g.parent)) { errors.push(`grupa „${g.id}”: grupa nadrzędna „${g.parent}” nie istnieje.`); g.parent = null; }
      if (g.parent === g.id) { errors.push(`grupa „${g.id}”: nie może zawierać samej siebie.`); g.parent = null; }
    });

    const nodes = [], nodeMap = new Map();
    list(spec.nodes, "nodes", errors).forEach((n, i) => {
      if (typeof n === "string" || typeof n === "number") n = { id: String(n) };
      if (!isObj(n) || n.id == null || n.id === "") { errors.push(`nodes[${i}]: węzeł musi mieć pole id.`); return; }
      const id = String(n.id);
      if (nodeMap.has(id)) { errors.push(`węzeł „${id}”: powtórzone id.`); return; }
      let group = n.group != null && n.group !== "" ? String(n.group) : null;
      if (group && !groupIds.has(group)) { errors.push(`węzeł „${id}”: grupa „${group}” nie istnieje.`); group = null; }
      const shape = n.shape ? String(n.shape) : "box";
      if (!SHAPES.includes(shape)) errors.push(`węzeł „${id}”: kształt „${shape}” nieznany. Dozwolone: ${SHAPES.join(", ")}.`);
      const meta = isObj(n.meta) ? Object.entries(n.meta).map(([k, v]) => [String(k), String(v ?? "")]) : [];
      if (n.meta != null && !isObj(n.meta)) errors.push(`węzeł „${id}”: meta musi być słownikiem klucz: wartość.`);
      let pos = null;
      if (n.pos != null) {
        const pv = Array.isArray(n.pos) ? n.pos : isObj(n.pos) ? [n.pos.x, n.pos.y] : null;
        if (pv && pv.length === 2 && pv.every(v => v !== null && v !== "" && isFinite(Number(v)))) pos = { x: Number(pv[0]), y: Number(pv[1]) };
        else errors.push(`węzeł „${id}”: pos musi mieć postać [x, y], np. [400, 120].`);
      }
      const node = { id, label: String(n.label ?? id), sub: n.sub ? String(n.sub) : "", group, pos,
        color: col(n.color, `węzeł „${id}”`, null), shape: SHAPES.includes(shape) ? shape : "box",
        meta, items: list(n.items, `węzeł „${id}”.items`, errors).map(String), auto: false };
      nodes.push(node); nodeMap.set(id, node);
    });

    const ensureNode = id => {
      if (!nodeMap.has(id)) { const n = { id, label: id, sub: "", group: null, pos: null, color: null, shape: "box", meta: [], items: [], auto: true }; nodes.push(n); nodeMap.set(id, n); }
    };

    const flows = [], segments = [], segKey = new Map();
    const addSeg = (flow, from, to, label) => {
      const k = flow + "\u0000" + from + "\u0000" + to;
      if (segKey.has(k)) { const s = segKey.get(k); if (label && !s.labels.includes(label)) s.labels.push(label); return; }
      const s = { flow, from, to, labels: label ? [label] : [] };
      segKey.set(k, s); segments.push(s);
    };

    function stepOf(it, where) {
      if (typeof it === "string" || typeof it === "number") return { node: String(it), label: "" };
      if (isObj(it) && it.node != null && it.node !== "") return { node: String(it.node), label: it.label ? String(it.label) : "" };
      errors.push(`${where}: krok musi być id węzła, {node, label} albo listą gałęzi.`);
      return null;
    }

    function expand(items, ends, fi, where) {
      items.forEach((it, j) => {
        const w = `${where}[${j}]`;
        if (Array.isArray(it)) {
          let all = [];
          if (!it.length) errors.push(`${w}: rozgałęzienie nie ma gałęzi.`);
          it.forEach((br, b) => { all = all.concat(expand(Array.isArray(br) ? br : [br], ends, fi, `${w}[${b}]`)); });
          ends = [...new Set(all)];
        } else {
          const st = stepOf(it, w);
          if (!st) return;
          ensureNode(st.node);
          ends.forEach(e => addSeg(fi, e, st.node, st.label));
          ends = [st.node];
        }
      });
      return ends;
    }

    function routeText(items) {
      return items.map(it => {
        if (Array.isArray(it)) return "(" + it.map(br => Array.isArray(br) ? routeText(br) : routeText([br])).join(" | ") + ")";
        const st = isObj(it) ? String(it.node) : String(it);
        return nodeMap.get(st)?.label ?? st;
      }).join(" → ");
    }

    const rawFlows = list(spec.flows, "flows", errors).slice();
    list(spec.edges, "edges", errors).forEach((e, i) => {
      if (!isObj(e) || e.from == null || e.to == null) { errors.push(`edges[${i}]: krawędź musi mieć from i to.`); return; }
      rawFlows.push({ id: `__edge${i}`, label: e.label || "", color: e.color || "gray", style: e.style || "solid", width: e.width || 1.5,
        legend: false, arrow: e.arrow, arrows: e.arrows, path: [String(e.from), { node: String(e.to), label: e.label || "" }] });
    });

    const flowIds = new Set();
    let autoColor = 0;
    rawFlows.forEach((f, i) => {
      if (!isObj(f)) { errors.push(`flows[${i}]: przepływ musi być obiektem.`); return; }
      const id = f.id != null && f.id !== "" ? String(f.id) : `flow${i + 1}`;
      if (flowIds.has(id)) { errors.push(`przepływ „${id}”: powtórzone id.`); return; }
      flowIds.add(id);
      const where = `przepływ „${f.label || id}”`;
      const style = f.style ? String(f.style) : "solid";
      if (!STYLES.includes(style)) errors.push(`${where}: styl „${style}” nieznany. Dozwolone: ${STYLES.join(", ")}.`);
      let width = f.width == null ? 2.5 : Number(f.width);
      if (!(width > 0 && width <= 12)) { errors.push(`${where}: width musi być liczbą od 0.5 do 12.`); width = 2.5; }
      const path = f.path == null ? [] : f.path;
      if (!Array.isArray(path)) errors.push(`${where}: path musi być listą kroków.`);
      const fi = flows.length;
      const fallback = `var(--c-${NAMED[autoColor++ % NAMED.length]})`;
      flows.push({ id, label: String(f.label ?? id), description: f.description ? String(f.description) : "",
        color: col(f.color, where, fallback), width, style: STYLES.includes(style) ? style : "solid",
        legend: f.legend !== false, arrow: arrowOf(f, where, errors), route: "", _path: Array.isArray(path) ? path : [] });
      if (Array.isArray(path)) expand(path, [], fi, `${where}.path`);
    });
    // opis trasy liczymy na końcu, gdy znamy już etykiety wszystkich węzłów
    flows.forEach(f => { f.route = routeText(f._path); delete f._path; });

    const notes = list(spec.notes, "notes", errors).map(n => typeof n === "string" ? { title: "", text: n, items: [] } :
      isObj(n) ? { title: String(n.title ?? ""), text: String(n.text ?? ""), items: list(n.items, "notes.items", errors).map(String) } : null).filter(Boolean);

    return { doc: { title: String(spec.title ?? "Graf przepływów"), subtitle: String(spec.subtitle ?? ""), direction: DIRS.includes(direction) ? direction : "LR",
      colors: [...custom.values()], groups, nodes, flows, segments, notes }, errors };
  }

  /* ---------- geometria ---------- */
  function offsetPoints(pts, off) {
    if (!off) return pts.map(p => ({ x: p.x, y: p.y }));
    const n = pts.length, out = [];
    const norm = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: -dy / l, y: dx / l }; };
    for (let i = 0; i < n; i++) {
      let nx, ny;
      if (i === 0) ({ x: nx, y: ny } = norm(pts[0], pts[1]));
      else if (i === n - 1) ({ x: nx, y: ny } = norm(pts[n - 2], pts[n - 1]));
      else {
        const a = norm(pts[i - 1], pts[i]), b = norm(pts[i], pts[i + 1]);
        nx = a.x + b.x; ny = a.y + b.y; const l = Math.hypot(nx, ny);
        if (l < 1e-3) { nx = a.x; ny = a.y; } else { nx /= l; ny /= l; }
      }
      out.push({ x: pts[i].x + nx * off, y: pts[i].y + ny * off });
    }
    return out;
  }

  /* Groty: tip = punkt grota dotykający węzła, back = odległość od tip do końca linii (jednostki viewBox 0..10).
     Pełne kształty zasłaniają koniec linii, więc linia wchodzi w nie (do środka kółka i rombu, lekko w trójkąt,
     żeby nie było szwu). Krzyżyk stoi przed węzłem, a linia kończy się w jego środku. halo = obwódka w kolorze tła. */
  const ARROW_SHAPES = {
    triangle: { tip: 10, back: 9, d: "M0,1 L10,5 L0,9 z", fill: true },
    open: { tip: 9.4, back: 1.6, d: "M1.5,1.5 L9,5 L1.5,8.5", fill: false },
    circle: { tip: 8.8, back: 3.8, circle: true, fill: true, halo: 1.6 },
    diamond: { tip: 10, back: 5, d: "M0,5 L5,1.6 L10,5 L5,8.4 z", fill: true, halo: 1.6 },
    cross: { tip: 10, back: 5, d: "M2,2 L8,8 M8,2 L2,8", fill: false, halo: 1.6 },
  };
  // rozmiar grota w px: 9 przy zwykłej linii, rośnie z grubością, żeby zawsze był szerszy niż linia
  const arrowSize = f => Math.round(9 * Math.max(1, (f.width || 2.5) / 3) * 10) / 10;
  // skraca łamaną od końca o len px (punkty kontrolne krzywej; koniec krzywej to ostatni punkt)
  function trimEnd(pts, len) {
    const out = pts.map(p => ({ x: p.x, y: p.y }));
    while (out.length >= 2 && len > 0) {
      const b = out[out.length - 1], a = out[out.length - 2];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l > len + 0.5 || out.length === 2) { const t = Math.min(len, Math.max(0, l - 0.5)) / (l || 1); b.x -= (b.x - a.x) * t; b.y -= (b.y - a.y) * t; break; }
      out.pop(); len -= l;
    }
    return out;
  }

  // Krzywa B-spline (jak d3.curveBasis): gładko przechodzi przez punkty pośrednie dagre.
  function basisPath(P) {
    const f = v => Math.round(v * 10) / 10;
    if (P.length < 2) return "";
    if (P.length === 2) return `M${f(P[0].x)},${f(P[0].y)}L${f(P[1].x)},${f(P[1].y)}`;
    let x0 = P[0].x, y0 = P[0].y, x1 = P[1].x, y1 = P[1].y;
    let d = `M${f(x0)},${f(y0)}L${f((5 * x0 + x1) / 6)},${f((5 * y0 + y1) / 6)}`;
    const seg = (x, y) => {
      d += `C${f((2 * x0 + x1) / 3)},${f((2 * y0 + y1) / 3)} ${f((x0 + 2 * x1) / 3)},${f((y0 + 2 * y1) / 3)} ${f((x0 + 4 * x1 + x) / 6)},${f((y0 + 4 * y1 + y) / 6)}`;
      x0 = x1; y0 = y1; x1 = x; y1 = y;
    };
    for (let i = 2; i < P.length; i++) seg(P[i].x, P[i].y);
    seg(x1, y1);
    return d + `L${f(x1)},${f(y1)}`;
  }

  function intersectRect(n, p) {
    const dx = p.x - n.x, dy = p.y - n.y;
    let w = n.w / 2, h = n.h / 2;
    if (!dx && !dy) return { x: n.x, y: n.y };
    let sx, sy;
    if (Math.abs(dy) * w > Math.abs(dx) * h) { if (dy < 0) h = -h; sx = h * dx / dy; sy = h; }
    else { if (dx < 0) w = -w; sx = w; sy = w * dy / dx; }
    return { x: n.x + sx, y: n.y + sy };
  }
  // Trasa krawędzi, gdy co najmniej jeden koniec ma wymuszoną pozycję (dagre jej nie zna).
  function routeBetween(a, b, dir) {
    const d = { LR: [1, 0], RL: [-1, 0], TB: [0, 1], BT: [0, -1] }[dir];
    const along = (b.x - a.x) * d[0] + (b.y - a.y) * d[1];
    const need = d[0] ? (a.w + b.w) / 2 : (a.h + b.h) / 2;
    if (along > need + 16) {
      const p0 = { x: a.x + d[0] * a.w / 2, y: a.y + d[1] * a.h / 2 };
      const p3 = { x: b.x - d[0] * b.w / 2, y: b.y - d[1] * b.h / 2 };
      const k = (along - need) * 0.45;
      return [p0, { x: p0.x + d[0] * k, y: p0.y + d[1] * k }, { x: p3.x - d[0] * k, y: p3.y - d[1] * k }, p3];
    }
    const p0 = intersectRect(a, b), p3 = intersectRect(b, a);
    return [p0, { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 }, p3];
  }

  /* Dagre kończy krawędzie na obrysie prostokąta. Pigułka ma zaokrąglone końce, więc koniec w pobliżu rogu wisiałby w powietrzu:
     przesuwamy go po promieniu od środka węzła do faktycznej krawędzi kształtu. */
  function insidePill(q, n) {
    const r = Math.min(n.w, n.h) / 2, hw = n.w / 2 - r, hh = n.h / 2 - r;
    const dx = Math.max(0, Math.abs(q.x - n.x) - hw), dy = Math.max(0, Math.abs(q.y - n.y) - hh);
    return dx * dx + dy * dy <= r * r;
  }
  function onPill(q, n) {
    if (insidePill(q, n)) return q;
    let lo = 0, hi = 1; // q = środek + t·(q − środek); szukamy t na krawędzi
    for (let i = 0; i < 24; i++) { const t = (lo + hi) / 2; insidePill({ x: n.x + (q.x - n.x) * t, y: n.y + (q.y - n.y) * t }, n) ? lo = t : hi = t; }
    return { x: n.x + (q.x - n.x) * lo, y: n.y + (q.y - n.y) * lo };
  }
  function clipToShape(pts, A, sa, B, sb) {
    if (pts.length < 2 || (sa !== "pill" && sb !== "pill")) return pts;
    const out = pts.slice();
    if (sa === "pill") out[0] = onPill(out[0], A);
    if (sb === "pill") out[out.length - 1] = onPill(out[out.length - 1], B);
    return out;
  }

  const SVGNS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  let uidCounter = 0;

  /* Rysuje graf w elemencie stage. Zwraca wymiary i mapy elementów. */
  function render(stage, doc, opts = {}) {
    const uid = "fg" + (++uidCounter);
    applyCustomColors(doc.colors || []);
    stage.innerHTML = "";
    if (typeof dagre === "undefined") { stage.innerHTML = '<div class="fg-empty">Brak biblioteki dagre.</div>'; return { w: 300, h: 80 }; }
    if (!doc.nodes.length) { stage.innerHTML = '<div class="fg-empty">Graf jest pusty. Dodaj węzły i przepływy.</div>'; return { w: 360, h: 100, empty: true }; }

    const svg = svgEl("svg");
    const gGroups = svgEl("g"), gLanes = svgEl("g"), gHits = svgEl("g"), defs = svgEl("defs");
    svg.append(defs, gGroups, gLanes, gHits);
    const layer = document.createElement("div"); layer.className = "fg-layer";
    stage.append(svg, layer);

    const flowsAt = {};
    doc.segments.forEach(s => { (flowsAt[s.from] ||= new Set()).add(s.flow); (flowsAt[s.to] ||= new Set()).add(s.flow); });

    const nodeEls = {};
    doc.nodes.forEach(n => {
      const el = document.createElement("div");
      el.className = `fg-node shape-${n.shape}`;
      el.dataset.id = n.id;
      el.dataset.flows = [...(flowsAt[n.id] || [])].join(" ");
      if (n.color) el.style.setProperty("--c", n.color);
      el.innerHTML = `<div class="fg-n-label">${esc(n.label)}</div>` + (n.sub ? `<div class="fg-n-sub">${esc(n.sub)}</div>` : "") +
        (n.meta.length ? `<dl>${n.meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "") +
        (n.items.length ? `<div class="fg-chips">${n.items.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : "");
      layer.append(el); nodeEls[n.id] = el;
    });

    // pary węzłów -> pasy (jeden pas na przepływ)
    const pairs = new Map();
    doc.segments.forEach(s => {
      const k = s.from + "\u0000" + s.to;
      if (!pairs.has(k)) pairs.set(k, { from: s.from, to: s.to, lanes: [], labels: [] });
      const p = pairs.get(k); p.lanes.push(s); s.labels.forEach(l => { if (!p.labels.includes(l)) p.labels.push(l); });
    });
    pairs.forEach(p => p.lanes.sort((a, b) => a.flow - b.flow));

    const g = new dagre.graphlib.Graph({ compound: true });
    g.setGraph({ rankdir: doc.direction, nodesep: 70, ranksep: 110, edgesep: 24, marginx: 34, marginy: 40 });
    g.setDefaultEdgeLabel(() => ({}));
    doc.nodes.forEach(n => g.setNode(n.id, { width: nodeEls[n.id].offsetWidth, height: nodeEls[n.id].offsetHeight }));

    const gmap = new Map(doc.groups.map(x => [x.id, x]));
    const used = new Set();
    doc.nodes.forEach(n => { let gid = n.group; while (gid && !used.has(gid)) { used.add(gid); gid = gmap.get(gid)?.parent; } });
    used.forEach(id => g.setNode("§" + id, {}));
    used.forEach(id => { const p = gmap.get(id).parent; if (p && used.has(p)) g.setParent("§" + id, "§" + p); });
    doc.nodes.forEach(n => { if (n.group) g.setParent(n.id, "§" + n.group); });

    const labelEls = new Map();
    pairs.forEach((p, k) => {
      const attrs = { weight: p.lanes.length, minlen: 1 };
      if (p.labels.length) {
        const el = document.createElement("div"); el.className = "fg-elabel"; el.textContent = p.labels.join(" · ");
        el.dataset.flows = p.lanes.map(l => l.flow).join(" ");
        layer.append(el); labelEls.set(k, el);
        Object.assign(attrs, { width: el.offsetWidth + 8, height: el.offsetHeight + 4, labelpos: "c" });
      }
      g.setEdge(p.from, p.to, attrs);
    });

    dagre.layout(g);

    // pozycje węzłów: wynik dagre albo wymuszona pozycja (pos = środek węzła)
    const P = {};
    doc.nodes.forEach(n => {
      const p = g.node(n.id);
      P[n.id] = { x: n.pos ? n.pos.x : p.x, y: n.pos ? n.pos.y : p.y, w: p.width, h: p.height, pinned: !!n.pos, dx: n.pos ? n.pos.x - p.x : 0, dy: n.pos ? n.pos.y - p.y : 0 };
      const el = nodeEls[n.id];
      el.style.left = (P[n.id].x - p.width / 2) + "px"; el.style.top = (P[n.id].y - p.height / 2) + "px";
      if (n.pos && opts.showPins) el.classList.add("fg-pinned");
    });

    // trasy linii liczone przed grupami: ramka grupy obejmuje też linie między jej węzłami
    const shapeOf = Object.fromEntries(doc.nodes.map(n => [n.id, n.shape]));
    const routes = new Map();
    pairs.forEach((p, k) => {
      const e = g.edge(p.from, p.to);
      const A = P[p.from], B = P[p.to];
      let pts, mid;
      if (!A.pinned && !B.pinned) { if (!e || !e.points) return; pts = e.points; mid = { x: e.x, y: e.y }; }
      else if (p.from === p.to) { if (!e || !e.points) return; pts = e.points.map(q => ({ x: q.x + A.dx, y: q.y + A.dy })); mid = { x: e.x + A.dx, y: e.y + A.dy }; }
      else { pts = routeBetween(A, B, doc.direction); const a = pts[0], z = pts[pts.length - 1]; mid = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 }; }
      pts = clipToShape(pts, A, shapeOf[p.from], B, shapeOf[p.to]);
      const gap = Math.max(...p.lanes.map(l => doc.flows[l.flow].width)) + 4;
      const spread = (p.lanes.length - 1) / 2 * gap + Math.max(...p.lanes.map(l => doc.flows[l.flow].width)) / 2; // połowa szerokości wiązki
      routes.set(k, { pts, mid, gap, spread });
    });
    // grupa, do której węzeł należy, i wszystkie grupy nadrzędne
    const groupsOf = id => { const out = new Set(); let gid = doc.nodes.find(n => n.id === id)?.group; while (gid && !out.has(gid)) { out.add(gid); gid = gmap.get(gid)?.parent; } return out; };
    const memberOf = Object.fromEntries(doc.nodes.map(n => [n.id, groupsOf(n.id)]));

    // grupy: obrys węzłów, podgrup oraz linii i etykiet między węzłami grupy (od najgłębszych), rysowane od zewnętrznych
    const depth = id => { let d = 0, p = gmap.get(id)?.parent; while (p) { d++; p = gmap.get(p)?.parent; } return d; };
    const box = {};
    const pad = 12, top = 22;
    [...used].sort((a, b) => depth(b) - depth(a)).forEach(id => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const grow = (ax, ay, bx, by) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); };
      doc.nodes.forEach(n => { if (n.group === id) { const q = P[n.id]; grow(q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2); } });
      used.forEach(c => { if (gmap.get(c).parent === id && box[c]) { const b = box[c]; grow(b.x, b.y, b.x + b.w, b.y + b.h); } });
      if (isFinite(x0)) pairs.forEach((p, k) => {
        const r = routes.get(k);
        if (!r || !memberOf[p.from]?.has(id) || !memberOf[p.to]?.has(id)) return;
        // krzywa B-spline leży w otoczce punktów kontrolnych, więc wystarczy objąć punkty z marginesem na wiązkę pasów
        const m = r.spread + 2;
        r.pts.forEach(q => grow(q.x - m, q.y - m, q.x + m, q.y + m));
        const lab = labelEls.get(k);
        if (lab && isFinite(r.mid.x)) grow(r.mid.x - lab.offsetWidth / 2, r.mid.y - lab.offsetHeight / 2, r.mid.x + lab.offsetWidth / 2, r.mid.y + lab.offsetHeight / 2);
      });
      if (isFinite(x0)) box[id] = { x: x0 - pad, y: y0 - pad - top, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 + top };
    });
    const groupEls = {};
    [...used].sort((a, b) => depth(a) - depth(b)).forEach(id => {
      const b = box[id], grp = gmap.get(id); if (!b) return;
      const r = svgEl("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 10, class: "fg-group-rect" });
      r.dataset.group = id;
      if (grp.color) r.style.setProperty("--c", grp.color);
      gGroups.append(r);
      const lab = document.createElement("div"); lab.className = "fg-group-label"; lab.textContent = grp.label; lab.dataset.group = id;
      if (grp.color) lab.style.setProperty("--c", grp.color);
      lab.style.left = (b.x + 10) + "px"; lab.style.top = (b.y + 6) + "px";
      layer.prepend(lab); groupEls[id] = { rect: r, label: lab };
    });

    doc.flows.forEach((f, i) => {
      if (f.arrow === "none") return;
      // Linia kończy się u podstawy grota (refX = tip - back), a grot dochodzi czubkiem do węzła, więc linia go nie zasłania.
      const shape = ARROW_SHAPES[f.arrow], size = arrowSize(f);
      const m = svgEl("marker", { id: `${uid}-a${i}`, viewBox: "0 0 10 10", refX: String(shape.tip - shape.back), refY: "5", markerWidth: String(size), markerHeight: String(size), markerUnits: "userSpaceOnUse", orient: "auto" });
      if (shape.halo) {
        // cienka obwódka w kolorze tła płótna oddziela grot od linii, która w niego wchodzi
        m.setAttribute("overflow", "visible");
        const hl = shape.circle ? svgEl("circle", { cx: "5", cy: "5", r: "3.8", class: "fg-halo" }) : svgEl("path", { d: shape.d, class: "fg-halo" });
        hl.style.fill = "none"; hl.style.strokeWidth = String((shape.fill ? 0 : 1.8) + shape.halo);
        hl.style.strokeLinecap = "round"; hl.style.strokeLinejoin = "round";
        m.append(hl);
      }
      const el = shape.circle ? svgEl("circle", { cx: "5", cy: "5", r: "3.8" }) : svgEl("path", { d: shape.d });
      if (shape.fill) { el.style.fill = f.color; el.style.stroke = "none"; }
      else { el.style.fill = "none"; el.style.stroke = f.color; el.style.strokeWidth = "1.8"; el.style.strokeLinecap = "round"; el.style.strokeLinejoin = "round"; }
      el.dataset.arrow = f.arrow;
      m.append(el); defs.append(m);
    });

    const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x, y) => { bounds.x0 = Math.min(bounds.x0, x); bounds.y0 = Math.min(bounds.y0, y); bounds.x1 = Math.max(bounds.x1, x); bounds.y1 = Math.max(bounds.y1, y); };
    Object.values(P).forEach(q => { grow(q.x - q.w / 2, q.y - q.h / 2); grow(q.x + q.w / 2, q.y + q.h / 2); });
    Object.values(box).forEach(b => { grow(b.x, b.y); grow(b.x + b.w, b.y + b.h); });

    const laneEls = [];
    pairs.forEach((p, k) => {
      const r = routes.get(k); if (!r) return;
      const { pts, mid, gap } = r;
      pts.forEach(q => grow(q.x, q.y));
      const k2 = p.lanes.length;
      p.lanes.forEach((s, i) => {
        const f = doc.flows[s.flow];
        const lanePts = offsetPoints(pts, (i - (k2 - 1) / 2) * gap);
        const d = basisPath(lanePts);
        // widoczna linia jest krótsza o długość grota (i pół grubości przy zaokrąglonym końcu kropek)
        const cut = f.arrow === "none" ? 0 : ARROW_SHAPES[f.arrow].back * arrowSize(f) / 10 + (f.style === "dotted" && !ARROW_SHAPES[f.arrow].fill ? f.width / 2 : 0);
        const path = svgEl("path", { d: cut ? basisPath(trimEnd(lanePts, cut)) : d, class: "fg-lane" });
        if (f.arrow !== "none") path.setAttribute("marker-end", `url(#${uid}-a${s.flow})`); // arrow: none -> sama linia
        path.style.stroke = f.color; path.style.strokeWidth = f.width;
        if (f.style === "dashed") path.style.strokeDasharray = `${f.width * 3 + 3} ${f.width * 2 + 3}`;
        if (f.style === "dotted") { path.style.strokeDasharray = `0.1 ${f.width * 2 + 3}`; path.style.strokeLinecap = "round"; }
        path.dataset.flow = s.flow; path.dataset.from = p.from; path.dataset.to = p.to;
        gLanes.append(path); laneEls.push(path);
        const hit = svgEl("path", { d, class: "fg-hit" }); hit.dataset.flow = s.flow;
        const t = svgEl("title"); t.textContent = f.label; hit.append(t);
        gHits.append(hit);
      });
      const lab = labelEls.get(k);
      if (lab && isFinite(mid.x)) {
        lab.style.left = (mid.x - lab.offsetWidth / 2) + "px"; lab.style.top = (mid.y - lab.offsetHeight / 2) + "px";
        grow(mid.x - lab.offsetWidth / 2, mid.y - lab.offsetHeight / 2); grow(mid.x + lab.offsetWidth / 2, mid.y + lab.offsetHeight / 2);
      }
    });

    // przesunięcie, żeby całość zaczynała się od marginesu (pozycje mogą być ujemne)
    const M = 30;
    // anchor (edytor, przeciąganie): początek sceny nie przesuwa się w prawo/w dół, więc reszta grafu stoi w miejscu
    if (opts.anchor) grow(opts.anchor.x0, opts.anchor.y0);
    const tx = M - bounds.x0, ty = M - bounds.y0;
    svg.style.transform = layer.style.transform = `translate(${tx}px, ${ty}px)`;
    const W = bounds.x1 - bounds.x0 + 2 * M, H = bounds.y1 - bounds.y0 + 2 * M;
    svg.setAttribute("width", Math.max(1, bounds.x1 + M)); svg.setAttribute("height", Math.max(1, bounds.y1 + M));
    return { w: Math.ceil(W), h: Math.ceil(H), tx, ty, x0: bounds.x0, y0: bounds.y0, pos: P, nodeEls, groupEls, laneEls, svg, layer };
  }

  /* Układa automatycznie podzbiór węzłów (np. jedną grupę) niezależnie od reszty grafu.
     sizes: {id: {w, h}}; subGroups: grupy zagnieżdżone w obrębie podzbioru (rysowane jako skupiska).
     Zwraca środki węzłów {id: {x, y}} w układzie zaczynającym się od (0, 0). */
  function layoutSubset(doc, { nodeIds, subGroups = [], direction, sizes }) {
    const set = new Set(nodeIds), sub = new Set(subGroups);
    const g = new dagre.graphlib.Graph({ compound: true });
    g.setGraph({ rankdir: direction || doc.direction, nodesep: 50, ranksep: 90, edgesep: 20, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    nodeIds.forEach(id => g.setNode(id, { width: sizes[id]?.w || 120, height: sizes[id]?.h || 40 }));
    const gmap = new Map(doc.groups.map(x => [x.id, x]));
    sub.forEach(id => g.setNode("§" + id, {}));
    sub.forEach(id => { const p = gmap.get(id)?.parent; if (p && sub.has(p)) g.setParent("§" + id, "§" + p); });
    doc.nodes.forEach(n => { if (set.has(n.id) && n.group && sub.has(n.group)) g.setParent(n.id, "§" + n.group); });
    const seen = new Set();
    doc.segments.forEach(s => {
      if (!set.has(s.from) || !set.has(s.to) || s.from === s.to) return;
      const k = s.from + "\u0000" + s.to; if (seen.has(k)) return; seen.add(k);
      g.setEdge(s.from, s.to, { minlen: 1, width: s.labels.length ? 80 : 0, height: s.labels.length ? 18 : 0, labelpos: "c" });
    });
    dagre.layout(g);
    const out = {};
    let x0 = Infinity, y0 = Infinity;
    nodeIds.forEach(id => { const p = g.node(id); x0 = Math.min(x0, p.x - p.width / 2); y0 = Math.min(y0, p.y - p.height / 2); });
    nodeIds.forEach(id => { const p = g.node(id); out[id] = { x: p.x - x0, y: p.y - y0, w: p.width, h: p.height }; });
    return out;
  }

  /* Motyw: auto (wg systemu) | light | dark | black; domyślnie ciemny. Zapamiętywany w przeglądarce. */
  const THEME_KEY = "flowgraph-theme", DEFAULT_THEME = "dark";
  const THEMES = [["auto", "Motyw: automatyczny"], ["light", "Motyw: jasny"], ["dark", "Motyw: ciemny"], ["black", "Motyw: czarny"]];
  function getTheme() { try { return localStorage.getItem(THEME_KEY) || DEFAULT_THEME; } catch (e) { return DEFAULT_THEME; } }
  function setTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* bez zapisu */ }
    document.querySelectorAll("select.fg-theme").forEach(s => { s.value = t; });
    document.dispatchEvent(new CustomEvent("fg-theme", { detail: t }));
  }
  function themeSelect() {
    const s = document.createElement("select"); s.className = "fg-theme"; s.setAttribute("aria-label", "Motyw kolorów");
    THEMES.forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; s.append(o); });
    s.value = getTheme(); s.addEventListener("change", () => setTheme(s.value));
    return s;
  }
  if (typeof document !== "undefined" && getTheme() !== "auto") document.documentElement.setAttribute("data-theme", getTheme()); // w node (CLI Mermaid) nie ma document

  /* Pełna strona: nagłówek, legenda, graf, panel informacji, notatki. */
  function mountPage(root, spec, opts = {}) {
    root.innerHTML = `<div class="fg-page">
      <div class="fg-errors" hidden></div>
      <header class="fg-head"><h1></h1><p></p></header>
      <div class="fg-bar"><div class="fg-legend" role="group" aria-label="Przepływy"></div>
        <div class="fg-tools"><div class="fg-zoom" role="group" aria-label="Powiększenie">
            <button type="button" class="fg-tool fg-zoom-out" aria-label="Pomniejsz" title="Pomniejsz (Shift albo Ctrl/⌘ + kółko, gest szczypania)">−</button>
            <button type="button" class="fg-tool fg-zoom-val" title="Rozmiar 100%">100%</button>
            <button type="button" class="fg-tool fg-zoom-in" aria-label="Powiększ" title="Powiększ (Shift albo Ctrl/⌘ + kółko, gest szczypania)">+</button></div>
          <button type="button" class="fg-tool fg-fit" aria-pressed="true" title="Pomniejsza graf, żeby zmieścił się na szerokość (najwyżej do 72%). Wyłączone: rozmiar 100%.">Dopasuj do szerokości</button>
          <select class="fg-theme fg-export" aria-label="Pobierz graf jako obraz" title="Pobierz graf jako obraz (to, co widać, łącznie z wyróżnieniem przepływu)">
            <option value="">Pobierz obraz…</option><option value="png">PNG</option><option value="svg">SVG</option><option value="jpg">JPG</option>
            <option value="png-t">PNG, przezroczyste tło</option><option value="svg-t">SVG, przezroczyste tło</option></select></div></div>
      <div class="fg-canvas-wrap">
        <div class="fg-info" role="status" hidden></div>
        <div class="fg-canvas"><div class="fg-sizer"><div class="fg-stage"></div></div></div>
      </div>
      <div class="fg-notes"></div></div>`;
    const $ = s => root.querySelector(s);
    const canvas = $(".fg-canvas"), sizer = $(".fg-sizer"), stage = $(".fg-stage");
    const st = { doc: null, size: { w: 0, h: 0 }, fit: true, zoom: null, focus: null, opts };
    const ZOOM_MIN = 0.2, ZOOM_MAX = 3;

    function applyFit() {
      const avail = canvas.clientWidth;
      // zoom: ręczne powiększenie; bez niego „Dopasuj do szerokości” albo 100%
      const s = st.opts.holdScale && st.scale ? st.scale : st.zoom ? st.zoom : st.fit && st.size.w > avail ? Math.max(0.72, avail / st.size.w) : 1;
      st.scale = s;
      $(".fg-zoom-val").textContent = Math.round(s * 100) + "%";
      $(".fg-zoom-out").disabled = s <= ZOOM_MIN + 1e-6; $(".fg-zoom-in").disabled = s >= ZOOM_MAX - 1e-6;
      $(".fg-fit").setAttribute("aria-pressed", String(st.fit && !st.zoom));
      stage.style.width = st.size.w + "px"; stage.style.height = st.size.h + "px";
      stage.style.transform = `scale(${s})`;
      sizer.style.width = st.size.w * s + "px"; sizer.style.height = st.size.h * s + "px";
    }

    function setFocus(focus) {
      // focus: null | {flow: id} | {node: id}
      st.focus = focus;
      const doc = st.doc; if (!doc) return;
      let on = null, info = "";
      if (focus?.flow != null) {
        const fi = doc.flows.findIndex(f => f.id === focus.flow);
        if (fi >= 0) {
          on = new Set([fi]); const f = doc.flows[fi];
          info = `<b>${esc(f.label)}</b>${f.description ? `<div>${esc(f.description)}</div>` : ""}<div class="route">${esc(f.route)}</div>`;
          $(".fg-info").style.setProperty("--c", f.color);
        } else st.focus = null;
      } else if (focus?.node != null) {
        const n = doc.nodes.find(x => x.id === focus.node);
        if (n) {
          on = new Set(doc.segments.filter(s => s.from === n.id || s.to === n.id).map(s => s.flow));
          const names = [...on].map(i => doc.flows[i]).filter(f => f.legend).map(f => esc(f.label));
          info = `<b>${esc(n.label)}</b><div>${names.length ? "Przepływy przez ten węzeł: " + names.join(", ") : "Żaden przepływ nie przechodzi przez ten węzeł."}</div>`;
          $(".fg-info").style.setProperty("--c", n.color || "var(--fg-muted)");
        } else st.focus = null;
      }
      stage.classList.toggle("fg-focus", !!on);
      stage.querySelectorAll("[data-flow]").forEach(el => el.classList.toggle("on", !!on && on.has(+el.dataset.flow)));
      stage.querySelectorAll(".fg-node, .fg-elabel").forEach(el => {
        const fl = (el.dataset.flows || "").split(" ").filter(Boolean).map(Number);
        el.classList.toggle("on", !!on && (fl.some(x => on.has(x)) || (focus?.node && el.dataset.id === focus.node)));
      });
      root.querySelectorAll(".fg-legend button").forEach(b => b.setAttribute("aria-pressed", String(st.focus?.flow === b.dataset.id)));
      const box = $(".fg-info"); box.innerHTML = info; box.hidden = !info;
      if (info) {
        const x = document.createElement("button"); x.type = "button"; x.className = "fg-info-x"; x.setAttribute("aria-label", "Zamknij opis"); x.textContent = "✕";
        x.addEventListener("click", ev => { ev.stopPropagation(); box.hidden = true; });
        box.prepend(x);
      }
    }

    function markSelected() {
      const sel = st.opts.selected;
      stage.querySelectorAll(".fg-sel").forEach(e => e.classList.remove("fg-sel"));
      if (sel?.kind === "node") stage.querySelector(`.fg-node[data-id="${CSS.escape(sel.id)}"]`)?.classList.add("fg-sel");
      if (sel?.kind === "group") stage.querySelectorAll(`.fg-group-label[data-group="${CSS.escape(sel.id)}"], .fg-group-rect[data-group="${CSS.escape(sel.id)}"]`).forEach(e => e.classList.add("fg-sel"));
    }

    function update(newSpec, newOpts) {
      if (newOpts) st.opts = newOpts;
      const { doc, errors } = normalize(newSpec);
      const errBox = $(".fg-errors");
      errBox.hidden = !errors.length || st.opts.hideErrors;
      errBox.innerHTML = errors.length ? `<b>Błędy w danych (${errors.length})</b><ul>${errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : "";
      st.doc = doc;
      if (!doc) return { errors };
      $(".fg-head h1").textContent = doc.title;
      document.title = st.opts.pageTitle || doc.title;
      const sub = $(".fg-head p"); sub.textContent = doc.subtitle; sub.hidden = !doc.subtitle;

      const leg = $(".fg-legend"); leg.innerHTML = "";
      doc.flows.forEach(f => {
        if (!f.legend) return;
        const b = document.createElement("button"); b.type = "button"; b.dataset.id = f.id; b.style.setProperty("--c", f.color);
        b.innerHTML = `<span class="fg-swatch ${f.style}"></span>${esc(f.label)}`;
        b.addEventListener("click", () => { if (st.opts.onFlowClick) st.opts.onFlowClick(f.id); else setFocus(st.focus?.flow === f.id ? null : { flow: f.id }); });
        leg.append(b);
      });

      st.size = render(stage, doc, st.opts);
      st.sizeCanvas?.(); applyFit();
      stage.querySelectorAll(".fg-hit").forEach(h => h.addEventListener("click", ev => {
        ev.stopPropagation(); const f = doc.flows[+h.dataset.flow];
        if (st.opts.onFlowClick) st.opts.onFlowClick(f.id); else setFocus(st.focus?.flow === f.id ? null : { flow: f.id });
      }));
      stage.querySelectorAll(".fg-node").forEach(n => n.addEventListener("click", ev => {
        ev.stopPropagation(); const id = n.dataset.id;
        if (st.opts.onNodeClick) st.opts.onNodeClick(id); else setFocus(st.focus?.node === id ? null : { node: id });
      }));
      stage.querySelectorAll(".fg-group-label").forEach(n => n.addEventListener("click", ev => {
        ev.stopPropagation(); st.opts.onGroupClick?.(n.dataset.group);
      }));
      // w edytorze cała ramka grupy jest klikalna; zagnieżdżona grupa leży nad nadrzędną, więc wygrywa
      stage.classList.toggle("fg-groups-click", !!st.opts.onGroupClick);
      if (st.opts.onGroupClick) stage.querySelectorAll(".fg-group-rect").forEach(r => r.addEventListener("click", ev => {
        ev.stopPropagation(); st.opts.onGroupClick(r.dataset.group, { area: true });
      }));

      const notes = $(".fg-notes"); notes.innerHTML = "";
      doc.notes.forEach(n => notes.insertAdjacentHTML("beforeend", `<div class="fg-note">${n.title ? `<h2>${esc(n.title)}</h2>` : ""}${n.text ? `<p>${esc(n.text)}</p>` : ""}${n.items.length ? `<ul>${n.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>`));
      notes.hidden = !doc.notes.length;

      setFocus(st.opts.focus !== undefined ? st.opts.focus : st.focus);
      markSelected();
      return { errors, doc };
    }

    canvas.addEventListener("click", () => { if (st.opts.onBackgroundClick) st.opts.onBackgroundClick(); else setFocus(null); });
    if (!opts.noThemeSelect) $(".fg-tools").append(themeSelect());
    if (opts.noExport) $(".fg-export").remove();
    $(".fg-export")?.addEventListener("change", async e => {
      const v = e.target.value; e.target.value = ""; if (!v || !st.doc) return;
      const [fmt, t] = v.split("-");
      try { await exportImage(stage, fmt, { title: st.doc.title, transparent: t === "t" }); }
      catch (err) { alert("Nie udało się zapisać obrazu: " + err.message); }
    });
    $(".fg-fit").addEventListener("click", () => { if (st.zoom) { st.zoom = null; st.fit = true; } else st.fit = !st.fit; applyFit(); });
    /* Powiększenie wokół punktu (clientX/Y), domyślnie środka widocznej części: ten punkt grafu zostaje pod kursorem.
       Przewija się tylko pole grafu, strona i panele stoją w miejscu. */
    function scrollBy(axis, delta) { if (axis === "x") canvas.scrollLeft += delta; else canvas.scrollTop += delta; }
    function setZoom(z, at) {
      const old = st.scale || 1;
      z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
      if (z === old && st.zoom) return;
      const cr = canvas.getBoundingClientRect();
      if (!at) at = { x: cr.left + Math.min(cr.width, innerWidth - cr.left) / 2, y: cr.top + Math.max(0, Math.min(cr.height, innerHeight - cr.top)) / 2 };
      const s0 = sizer.getBoundingClientRect(), gx = (at.x - s0.left) / old, gy = (at.y - s0.top) / old; // punkt grafu pod kursorem
      st.zoom = z;
      applyFit();
      const s1 = sizer.getBoundingClientRect();
      scrollBy("x", s1.left + gx * z - at.x);
      scrollBy("y", s1.top + gy * z - at.y);
    }
    const STEPS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    const zoomStep = dir => { const s = st.scale || 1; setZoom(dir > 0 ? STEPS.find(x => x > s + 0.005) ?? ZOOM_MAX : [...STEPS].reverse().find(x => x < s - 0.005) ?? ZOOM_MIN); };
    const zoomReset = () => { st.zoom = null; st.fit = true; applyFit(); };
    $(".fg-zoom-in").addEventListener("click", () => zoomStep(1));
    $(".fg-zoom-out").addEventListener("click", () => zoomStep(-1));
    $(".fg-zoom-val").addEventListener("click", () => setZoom(1));
    // Ctrl/⌘ + kółko, szczypanie na gładziku (przeglądarka zgłasza je jako wheel z ctrlKey) oraz Shift + kółko / dwa palce góra-dół.
    // Z Shiftem macOS i Windows zamieniają przewijanie pionowe na poziome, więc ruch przychodzi w deltaX.
    canvas.addEventListener("wheel", e => {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return;
      e.preventDefault();
      const raw = e.shiftKey && !e.ctrlKey && !e.metaKey ? (e.deltaY || e.deltaX) : e.deltaY;
      const d = e.deltaMode === 1 ? raw * 16 : raw;
      setZoom((st.scale || 1) * Math.exp(-Math.max(-60, Math.min(60, d)) * 0.01), { x: e.clientX, y: e.clientY });
    }, { passive: false });
    /* Pole grafu ma stałą wysokość: wolne miejsce do dołu najbliższego przewijanego przodka (panel edytora) albo okna.
       Graf przewija się w środku, więc zoom zmienia zawartość, a nie wielkość pola. Notatki są pod spodem, po przewinięciu strony. */
    const CANVAS_MIN = 280;
    const scroller = () => {
      for (let el = root; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        const o = getComputedStyle(el).overflowY;
        if ((o === "auto" || o === "scroll") && el.clientHeight) return el;
      }
      return null; // okno
    };
    function sizeCanvas() {
      if (!canvas.isConnected) return;
      const sc = scroller(), r = canvas.getBoundingClientRect();
      let avail;
      if (sc) {
        const sr = sc.getBoundingClientRect(), cs = getComputedStyle(sc);
        const top = r.top - sr.top - sc.clientTop + sc.scrollTop; // położenie pola w treści przodka, niezależne od przewinięcia
        avail = sc.clientHeight - top - parseFloat(cs.paddingBottom || 0);
      } else avail = (window.visualViewport?.height || innerHeight) - (r.top + scrollY) - 16;
      const h = Math.max(CANVAS_MIN, Math.floor(avail));
      if (Math.abs(canvas.offsetHeight - h) > 0.5) canvas.style.height = h + "px";
    }
    st.sizeCanvas = sizeCanvas;
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => { sizeCanvas(); applyFit(); });
      ro.observe(canvas);
      const sc = scroller(); if (sc) ro.observe(sc);
      ro.observe($(".fg-head")); ro.observe($(".fg-bar")); // nagłówek i legenda mogą zmienić wysokość (zawijanie, edycja tytułu)
    }
    addEventListener("resize", sizeCanvas);

    update(spec, opts);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => update(st.lastSpec || spec));
    const api = { update: (s, o) => { st.lastSpec = s; return update(s, o); }, setFocus, get doc() { return st.doc; },
      get layout() { return st.size; }, get scale() { return st.scale || 1; },
      zoomIn: () => zoomStep(1), zoomOut: () => zoomStep(-1), zoomTo: setZoom, zoomFit: zoomReset };
    st.lastSpec = spec;
    return api;
  }

  /* ---------- eksport obrazu ----------
     Z narysowanego grafu (węzły HTML + linie SVG) składamy samodzielny SVG z prostych prostokątów, ścieżek i tekstu,
     bez foreignObject, więc otwiera się też w Inkscape, Figmie i przeglądarkach plików. PNG i JPG rysujemy z tego SVG. */
  function colorConv() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    const cache = new Map();
    return c => {
      if (!c || c === "none" || c === "transparent") return null;
      if (cache.has(c)) return cache.get(c);
      cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
      const hx = "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
      const out = a === 0 ? null : a === 255 ? hx : `${hx}${a.toString(16).padStart(2, "0")}`;
      cache.set(c, out); return out;
    };
  }
  const xmlEsc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = v => Math.round(v * 100) / 100;

  function stageToSVG(stage, o = {}) {
    const col = colorConv();
    const prevT = stage.style.transform; stage.style.transform = "none"; // mierzymy w skali 1
    try {
      const base = stage.getBoundingClientRect();
      const W = Math.ceil(stage.offsetWidth), H = Math.ceil(stage.offsetHeight);
      const css = getComputedStyle(stage);
      const bg = col(o.background || css.getPropertyValue("--fg-panel").trim() || "#ffffff") || "#ffffff";
      const head = o.title ? 64 : 0;
      const out = [], used = new Set();
      const fill = (c, attr = "fill") => { const v = col(c); if (!v) return `${attr}="none"`; return v.length === 9 ? `${attr}="${v.slice(0, 7)}" ${attr}-opacity="${num(parseInt(v.slice(7), 16) / 255)}"` : `${attr}="${v}"`; };
      const opac = (el, stop) => { let a = 1; for (let e = el; e && e !== stop; e = e.parentElement) a *= parseFloat(getComputedStyle(e).opacity) || 0; return a; };
      const font = cs => `font-family="${xmlEsc(cs.fontFamily)}" font-size="${parseFloat(cs.fontSize)}" font-weight="${cs.fontWeight}"${cs.fontStyle !== "normal" ? ` font-style="${cs.fontStyle}"` : ""}${parseFloat(cs.letterSpacing) ? ` letter-spacing="${parseFloat(cs.letterSpacing)}"` : ""}`;

      // 1. linie i ramki grup: kopia SVG z wpisanymi na sztywno stylami
      const svg = stage.querySelector(":scope > svg");
      if (svg) {
        const clone = svg.cloneNode(true);
        const a = [svg, ...svg.querySelectorAll("*")], b = [clone, ...clone.querySelectorAll("*")];
        a.forEach((el, i) => {
          const c = b[i];
          if (el.classList.contains("fg-hit")) { c.remove(); return; }
          if (el === svg) return;
          const cs = getComputedStyle(el);
          if (["path", "rect", "circle", "line", "polyline", "polygon"].includes(el.tagName)) {
            const f = col(cs.fill), st = col(cs.stroke);
            c.setAttribute("fill", f ? f.slice(0, 7) : "none");
            if (f && f.length === 9) c.setAttribute("fill-opacity", num(parseInt(f.slice(7), 16) / 255));
            c.setAttribute("stroke", st ? st.slice(0, 7) : "none");
            if (st) {
              c.setAttribute("stroke-width", parseFloat(cs.strokeWidth) || 1);
              if (cs.strokeDasharray && cs.strokeDasharray !== "none") c.setAttribute("stroke-dasharray", cs.strokeDasharray.replace(/px/g, ""));
              if (cs.strokeLinecap !== "butt") c.setAttribute("stroke-linecap", cs.strokeLinecap);
            }
            const op = parseFloat(cs.opacity); if (op < 1) c.setAttribute("opacity", op);
          }
          c.removeAttribute("class"); c.removeAttribute("style");
        });
        const tm = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(svg.style.transform || "");
        out.push(`<g${tm ? ` transform="translate(${tm[1]} ${tm[2]})"` : ""}>${clone.innerHTML}</g>`);
      }

      // 2. węzły, etykiety krawędzi i grup: prostokąty i tekst
      const layer = stage.querySelector(".fg-layer");
      if (layer) {
        layer.querySelectorAll("*").forEach(el => {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") return;
          const bw = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
          const bgc = col(cs.backgroundColor), bc = bw ? col(cs.borderTopColor) : null;
          if (!bgc && !bc) return;
          const r = el.getBoundingClientRect(), x = r.left - base.left, y = r.top - base.top;
          const rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.height / 2, r.width / 2);
          const op = opac(el, stage);
          const dash = cs.borderTopStyle === "dashed" ? ` stroke-dasharray="${bw * 3} ${bw * 2}"` : cs.borderTopStyle === "dotted" ? ` stroke-dasharray="${bw} ${bw * 1.5}"` : "";
          out.push(`<rect x="${num(x + bw / 2)}" y="${num(y + bw / 2)}" width="${num(r.width - bw)}" height="${num(r.height - bw)}" rx="${num(rad)}" ${fill(cs.backgroundColor)} ${bc ? fill(cs.borderTopColor, "stroke") + ` stroke-width="${bw}"` + dash : ""}${op < 1 ? ` opacity="${num(op)}"` : ""}/>`);
          if (bb > bw + 0.5) { // kształt „db”: grubsza dolna krawędź
            out.push(`<line x1="${num(x + rad)}" x2="${num(x + r.width - rad)}" y1="${num(y + r.height - bb / 2)}" y2="${num(y + r.height - bb / 2)}" ${fill(cs.borderBottomColor, "stroke")} stroke-width="${bb}"${op < 1 ? ` opacity="${num(op)}"` : ""}/>`);
          }
        });
        // tekst linia po linii: zawijanie bierzemy z przeglądarki, więc wygląda tak samo jak na stronie
        const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const el = t.parentElement, cs = getComputedStyle(el);
          if (!t.data.trim() || cs.visibility === "hidden" || cs.display === "none") continue;
          const op = opac(el, stage);
          used.add(`${cs.fontFamily.split(",")[0].replace(/["']/g, "").trim()}|${cs.fontWeight}`);
          const attrs = `${font(cs)} ${fill(cs.color)}${op < 1 ? ` opacity="${num(op)}"` : ""}`;
          const up = cs.textTransform === "uppercase" ? x => x.toUpperCase() : x => x;
          const lines = []; // {top, left, h, text}
          const add = (str, q, gap) => {
            const L = lines[lines.length - 1];
            if (L && Math.abs(q.top - L.top) < 2) L.text += (gap ? " " : "") + str;
            else lines.push({ top: q.top, left: q.left, h: q.height, text: str });
          };
          const re = /\S+/g; let m;
          while ((m = re.exec(t.data))) {
            range.setStart(t, m.index); range.setEnd(t, m.index + m[0].length);
            const rects = [...range.getClientRects()].filter(q => q.width > 0);
            if (rects.length <= 1) { if (rects[0]) add(m[0], rects[0], true); continue; }
            for (let k = 0; k < m[0].length; k++) { // słowo przełamane między liniami (np. po łączniku)
              range.setStart(t, m.index + k); range.setEnd(t, m.index + k + 1);
              add(m[0][k], range.getBoundingClientRect(), k === 0);
            }
          }
          lines.forEach(L => out.push(`<text x="${num(L.left - base.left)}" y="${num(L.top - base.top + L.h / 2)}" dominant-baseline="central" xml:space="preserve" ${attrs}>${xmlEsc(up(L.text))}</text>`));
        }
      }

      const title = o.title ? `<text x="30" y="40" font-family="${xmlEsc(css.fontFamily)}" font-size="22" font-weight="700" ${fill(css.color)}>${xmlEsc(o.title)}</text>` : "";
      if (o.title) used.add(`${css.fontFamily.split(",")[0].replace(/["']/g, "").trim()}|700`);
      return { w: W, h: H + head, used, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + head}" viewBox="0 0 ${W} ${H + head}">` +
        `<!--FONTS-->${o.transparent ? "" : `<rect width="100%" height="100%" fill="${bg.slice(0, 7)}"/>`}${title}<g transform="translate(0 ${head})">${out.join("")}</g></svg>` };
    } finally { stage.style.transform = prevT; }
  }

  // W aplikacji (Tauri) pobieranie przez <a download> nie działa, więc edytor podstawia własny zapis z oknem „Zapisz jako”.
  let customSaver = null;
  const setSaver = fn => { customSaver = fn; };
  function saveBlob(blob, name) {
    if (customSaver) return customSaver(blob, name);
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const fileSlug = t => String(t || "graf").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[łŁ]/g, "l").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "graf";

  /* Fonty z Google Fonts osadzamy w SVG jako data URL (tylko alfabet łaciński i użyte grubości),
     bo obraz SVG rysowany na canvasie nie widzi fontów strony. Bez internetu zostają fonty systemowe. */
  let fontCssCache = null;
  async function fontFaces(used) {
    try {
      const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => /fonts\.googleapis\.com/.test(l.href));
      if (!link) return "";
      fontCssCache ||= fetch(link.href).then(r => r.ok ? r.text() : "");
      const css = await fontCssCache;
      // Chrome dostaje pliki podzielone na alfabety (z komentarzem /* latin */ itp.), Safari jeden plik na grubość, bez komentarzy
      const tagged = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g)];
      const blocks = (tagged.length ? tagged.filter(m => m[1] === "latin" || m[1] === "latin-ext").map(m => m[2]) : css.match(/@font-face\s*{[^}]*}/g) || [])
        .filter(b => {
          const fam = (/font-family:\s*['"]?([^;'"]+)/.exec(b) || [])[1], wt = (/font-weight:\s*(\d+)/.exec(b) || [])[1];
          return used.has(`${fam}|${wt}`);
        });
      const done = await Promise.all(blocks.map(async b => {
        const url = (/url\(([^)]+)\)/.exec(b) || [])[1]; if (!url) return "";
        const blob = await (await fetch(url.replace(/['"]/g, ""))).blob();
        const data = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
        return b.replace(/url\([^)]+\)/, `url(${data})`);
      }));
      return done.join("\n");
    } catch (e) { return ""; }
  }

  /* format: svg | png | jpg. Zwraca Promise z nazwą pliku. */
  async function exportImage(stage, format, o = {}) {
    if (format === "jpg") o = { ...o, transparent: false }; // JPG nie ma kanału przezroczystości
    // zaznaczenie z edytora (np. podświetlona ramka grupy) nie trafia do obrazu
    const sel = [...stage.querySelectorAll(".fg-sel")]; sel.forEach(e => e.classList.remove("fg-sel"));
    let r0; try { r0 = stageToSVG(stage, o); } finally { sel.forEach(e => e.classList.add("fg-sel")); }
    const { w, h } = r0;
    const faces = o.embedFonts === false ? "" : await fontFaces(r0.used);
    const svg = r0.svg.replace("<!--FONTS-->", faces ? `<defs><style>${faces}</style></defs>` : "");
    const name = `${o.fileName || fileSlug(o.title)}.${format}`;
    const done = r => r === false ? null : (r || name); // false = użytkownik anulował zapis
    if (format === "svg") return done(await saveBlob(new Blob([svg], { type: "image/svg+xml" }), name));
    const scale = o.scale || 2;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error("nie udało się narysować SVG")); img.src = url; });
      const cv = document.createElement("canvas");
      const max = 16000, k = Math.min(scale, max / w, max / h); // limit rozmiaru płótna w przeglądarkach
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const cx = cv.getContext("2d");
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      const type = format === "jpg" ? "image/jpeg" : "image/png";
      const blob = await new Promise(ok => cv.toBlob(ok, type, 0.92));
      if (!blob) throw new Error("obraz jest za duży dla przeglądarki");
      return done(await saveBlob(blob, name));
    } finally { URL.revokeObjectURL(url); }
  }

  window.FlowGraph = { normalize, render, mountPage, layoutSubset, getTheme, setTheme, themeSelect, stageToSVG, exportImage, setSaver, fontFaces, NAMED, SHAPES, STYLES, ARROWS, DIRS };
})();
