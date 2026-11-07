/* FlowGraph ⇄ Mermaid (flowchart / graph).
   toMermaid(spec)  -> tekst Mermaid. Komentarze „%% fg:” przechowują to, czego Mermaid nie ma (przepływy, meta, pozycje),
                       więc eksport i ponowny import dają ten sam graf.
   fromMermaid(txt) -> { spec, warnings }. Działa też na zwykłym Mermaidzie bez komentarzy fg: krawędzie łączy w przepływy.
   Wymaga FlowGraph.normalize (flowgraph.js). Działa w przeglądarce (window.FlowGraphMermaid) i w node (module.exports). */
(function (root) {
  "use strict";
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  // Rodzaje diagramów Mermaid, których nie da się wczytać (rozpoznajemy je, żeby powiedzieć, co jest obsługiwane)
  const MERMAID_OTHER = /^(sequenceDiagram|classDiagram(-v2)?|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4(Context|Container|Component|Dynamic|Deployment)|sankey(-beta)?|xychart(-beta)?|block(-beta)?|packet(-beta)?|kanban|architecture(-beta)?|radar(-beta)?|zenuml)\b/i;
  const MERMAID_SUPPORTED = "Obsługiwany jest tylko schemat blokowy: tekst zaczyna się od „flowchart” albo „graph” z kierunkiem TB, TD, BT, LR lub RL (np. „flowchart LR”), opcjonalnie po bloku --- title ---. Diagramy sekwencji, klas, stanów, ER, Gantta, kołowe, mapy myśli i inne nie są obsługiwane.";
  // jasne wartości palety z flowgraph.css: Mermaid nie zna zmiennych CSS
  const PALETTE = { orange: "#c2620a", purple: "#6a3fc8", pink: "#b8326e", blue: "#1f6fb2", green: "#2e7d4f", yellow: "#9a7700", gray: "#56707f", teal: "#0f7f86", red: "#c0392b" };
  const HEX2NAME = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [v, k]));
  const RESERVED = new Set(["end", "graph", "flowchart", "subgraph", "style", "classdef", "class", "click", "linkstyle", "direction", "default"]);

  // kolory dokumentu (sekcja colors) bieżącej konwersji: nazwa -> jasny #hex i odwrotnie
  let CUSTOM = new Map(), CUSTOM_REV = new Map();
  const useCustom = colors => {
    CUSTOM = new Map(); CUSTOM_REV = new Map();
    if (!isObj(colors)) return;
    for (const [k, v] of Object.entries(colors)) {
      const name = String(k).trim().toLowerCase(), light = String(isObj(v) ? v.light : v).trim().toLowerCase();
      if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(light)) continue;
      const full = light.length === 4 ? "#" + [...light.slice(1)].map(c => c + c).join("") : light;
      CUSTOM.set(name, full); if (!CUSTOM_REV.has(full)) CUSTOM_REV.set(full, name);
    }
  };
  const hexOf = c => {
    if (!c) return null;
    const v = /^var\(--fgc-([a-z0-9-]+)\)$/.exec(c);
    if (v) return CUSTOM.get(v[1]) || null;
    const m = /^var\(--c-([a-z]+)\)$/.exec(c);
    if (m) return PALETTE[m[1]] || null;
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c.toLowerCase() : PALETTE[String(c).toLowerCase()] || null;
  };
  const colorName = hex => {
    if (!hex) return null;
    let h = String(hex).trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(h)) h = "#" + [...h.slice(1)].map(c => c + c).join("");
    if (HEX2NAME[h]) return HEX2NAME[h];
    if (CUSTOM_REV.has(h)) return CUSTOM_REV.get(h);
    if (PALETTE[h]) return h;
    return /^#[0-9a-f]{6}$/.test(h) ? h : null;
  };
  // koniec łącznika Mermaid -> typ grota: > strzałka, o kółko, x krzyżyk, - = . brak
  const headOf = tok => { const c = tok[tok.length - 1]; return c === ">" ? "triangle" : c === "o" ? "circle" : c === "x" ? "cross" : "none"; };
  const quoteText = s => '"' + String(s).replace(/"/g, "#quot;").replace(/\r?\n/g, "<br/>") + '"';

  /* ====================== eksport ====================== */
  function toMermaid(spec) {
    const FG = root.FlowGraph;
    if (!FG) throw new Error("Brak FlowGraph.normalize (flowgraph.js).");
    const { doc } = FG.normalize(spec);
    if (!doc) throw new Error("Nie da się odczytać grafu.");
    const raw = isObj(spec) ? spec : {};
    useCustom(raw.colors);
    const rawNodes = new Map((raw.nodes || []).filter(isObj).map(n => [String(n.id), n]));

    // id w Mermaidzie: tylko litery, cyfry i _; bez słów kluczowych
    const ids = new Map(), used = new Set();
    const mid = id => {
      if (ids.has(id)) return ids.get(id);
      let m = String(id).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/[^A-Za-z0-9_]/g, "_") || "n";
      if (RESERVED.has(m.toLowerCase())) m += "_";
      let k = m, i = 2; while (used.has(k)) k = `${m}_${i++}`;
      used.add(k); ids.set(id, k); return k;
    };

    const out = [];
    if (doc.title) out.push("---", "title: " + JSON.stringify(doc.title), "---");
    out.push("%% Wygenerowano w FlowGraph. Linie „%% fg:” pozwalają odtworzyć przepływy przy imporcie; Mermaid je pomija.");
    const extra = {};
    if (doc.subtitle) extra.subtitle = doc.subtitle;
    if (isObj(raw.colors) && Object.keys(raw.colors).length) extra.colors = raw.colors;
    if (Array.isArray(raw.notes) && raw.notes.length) extra.notes = raw.notes;
    if (Object.keys(extra).length) out.push("%% fg:doc " + JSON.stringify(extra));
    out.push(`flowchart ${doc.direction}`);

    const styles = [];
    let ghost = false;
    const nodeLine = (n, ind) => {
      const text = quoteText(n.sub ? `${n.label}<br/>${n.sub}` : n.label);
      const shape = n.shape === "pill" ? `([${text}])` : n.shape === "db" ? `[(${text})]` : `[${text}]`;
      if (n.shape === "ghost") ghost = true;
      out.push(`${ind}${mid(n.id)}${shape}${n.shape === "ghost" ? ":::ghost" : ""}`);
      const hex = hexOf(n.color);
      if (hex) styles.push(`style ${mid(n.id)} stroke:${hex}`);
      const r = rawNodes.get(n.id) || {};
      const keep = {};
      if (mid(n.id) !== n.id) keep.id = n.id;
      for (const k of ["meta", "items", "pos"]) if (r[k] != null && !(Array.isArray(r[k]) && !r[k].length)) keep[k] = r[k];
      if (Object.keys(keep).length) out.push(`${ind}%% fg:node ${mid(n.id)} ${JSON.stringify(keep)}`);
    };

    const groupIds = new Set(doc.groups.map(g => g.id));
    const kids = g => doc.groups.filter(x => x.parent === g);
    const emitGroup = (g, ind) => {
      out.push(`${ind}subgraph ${mid("grp:" + g.id)}[${quoteText(g.label)}]`);
      if (mid("grp:" + g.id) !== g.id) out.push(`${ind}  %% fg:group ${JSON.stringify({ id: g.id })}`);
      kids(g.id).forEach(c => emitGroup(c, ind + "  "));
      doc.nodes.filter(n => n.group === g.id).forEach(n => nodeLine(n, ind + "  "));
      out.push(`${ind}end`);
      const hex = hexOf(g.color);
      if (hex) styles.push(`style ${mid("grp:" + g.id)} stroke:${hex}`);
    };
    // id grup rezerwujemy z prefiksem tylko gdy koliduje z węzłem
    const nodeIdSet = new Set(doc.nodes.map(n => n.id));
    doc.groups.forEach(g => { if (!nodeIdSet.has(g.id)) { ids.set("grp:" + g.id, mid(g.id)); } });
    doc.groups.filter(g => !g.parent || !groupIds.has(g.parent)).forEach(g => emitGroup(g, "  "));
    doc.nodes.filter(n => !n.group || !groupIds.has(n.group)).forEach(n => nodeLine(n, "  "));

    const linkStyles = [];
    let li = 0;
    const rawFlows = (raw.flows || []).filter(isObj);
    doc.flows.forEach((f, fi) => {
      const segs = doc.segments.filter(s => s.flow === fi);
      if (!segs.length) return;
      const rf = rawFlows.find(x => String(x.id) === f.id);
      const keep = { id: f.id, label: f.label };
      if (rf) {
        keep.path = rf.path;
        if (rf.description) keep.description = rf.description;
        if (rf.legend === false) keep.legend = false;
        if (rf.color != null) keep.color = rf.color;
        if (f.arrow !== "triangle") keep.arrow = f.arrow; // dokładny typ grota (Mermaid zna tylko > o x)
      } else if (/^__edge/.test(f.id)) keep.edge = true;
      out.push("  %% fg:flow " + JSON.stringify(keep));
      const kind = f.style !== "solid" ? "dotted" : f.width >= 4 ? "thick" : "normal";
      // grot: --> (strzałka), --o (kółko), --x (krzyżyk), --- (brak); kropkowana linia w Mermaid ma tylko -.-> i -.-
      const head = f.arrow === "none" ? "" : kind !== "dotted" && (f.arrow === "circle" || f.arrow === "cross") ? (f.arrow === "circle" ? "o" : "x") : ">";
      const arrow = { dotted: head ? "-.->" : "-.-", thick: head ? "==" + head : "===", normal: head ? "--" + head : "---" }[kind];
      const first = li;
      segs.forEach(s => {
        const lab = s.labels.length ? `|${quoteText(s.labels.join(" / "))}|` : "";
        out.push(`  ${mid(s.from)} ${arrow}${lab} ${mid(s.to)}`);
        li++;
      });
      const hex = hexOf(f.color);
      const props = [];
      if (hex) props.push(`stroke:${hex}`);
      props.push(`stroke-width:${f.width}px`);
      if (f.style === "dotted") props.push("stroke-dasharray:2 4");
      else if (f.style === "dashed") props.push("stroke-dasharray:6 4");
      const idx = Array.from({ length: li - first }, (_, k) => first + k).join(",");
      linkStyles.push(`linkStyle ${idx} ${props.join(",")}`);
    });
    out.push("  %% fg:end");

    if (ghost) out.push("  classDef ghost stroke-dasharray:5 4");
    styles.forEach(s => out.push("  " + s));
    linkStyles.forEach(s => out.push("  " + s));
    return out.join("\n") + "\n";
  }

  /* ====================== import ====================== */
  const SHAPES = [ // kolejność ważna: dłuższe otwarcia najpierw
    ["(((", ")))", "pill"], ["([", "])", "pill"], ["((", "))", "pill"], ["[(", ")]", "db"], ["[[", "]]", "box"],
    ["[/", "/]", "box"], ["[/", "\\]", "box"], ["[\\", "\\]", "box"], ["[\\", "/]", "box"], ["{{", "}}", "box"],
    ["[", "]", "box"], ["(", ")", "pill"], ["{", "}", "box"], [">", "]", "box"],
  ];
  const decode = s => String(s).replace(/#quot;/g, '"').replace(/#(\d+);/g, (m, n) => String.fromCodePoint(+n))
    .replace(/#(amp|lt|gt);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">" }[k]))
    .replace(/^`|`$/g, "").replace(/\bfa[bsr]?:fa-[\w-]+\s*/g, "").replace(/<\/?(b|i|em|strong|small|span)\b[^>]*>/gi, "").trim();
  const splitLabel = s => {
    const parts = decode(s).split(/<br\s*\/?>|\\n|\n/i).map(x => x.trim()).filter(Boolean);
    return { label: parts[0] || "", sub: parts.slice(1).join(" ") };
  };
  const parseProps = s => {
    const o = {};
    String(s).split(",").forEach(p => { const i = p.indexOf(":"); if (i > 0) o[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim().replace(/;$/, ""); });
    return o;
  };

  function fromMermaid(text) {
    const warnings = [];
    let src = String(text || "").replace(/\r\n?/g, "\n");
    let title = "";
    // frontmatter ---\ntitle: ...\n---
    const fm = /^\s*---\n([\s\S]*?)\n---\s*\n/.exec(src);
    if (fm) {
      const t = /^title:\s*(.+)$/m.exec(fm[1]);
      if (t) { title = t[1].trim(); try { if (/^["']/.test(title)) title = title[0] === '"' ? JSON.parse(title) : title.slice(1, -1); } catch (e) { /* zostaje tekst */ } }
      src = src.slice(fm[0].length);
    }
    const st = { dir: "TB", nodes: new Map(), order: [], groups: [], groupStack: [], edges: [], classDefs: {}, nodeClass: {}, fgNode: {}, fgGroup: {}, doc: {}, flowBlocks: [], curBlock: null, header: false };

    const ensure = (id, g) => {
      if (!st.nodes.has(id)) { st.nodes.set(id, { id, label: id, sub: "", shape: "box", group: null, explicit: false }); st.order.push(id); }
      const n = st.nodes.get(id);
      if (g && !n.group) n.group = g;
      return n;
    };
    const curGroup = () => st.groupStack[st.groupStack.length - 1] || null;

    // instrukcje: linie i średniki poza cudzysłowami
    const stmts = [];
    for (const line of src.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("%%")) { stmts.push({ comment: t.slice(2).trim() }); continue; }
      let q = false, cur = "";
      for (const ch of line) {
        if (ch === '"') q = !q;
        if (ch === ";" && !q) { if (cur.trim()) stmts.push({ s: cur.trim() }); cur = ""; } else cur += ch;
      }
      if (cur.trim()) stmts.push({ s: cur.trim() });
    }

    const json = (s, what) => { try { return JSON.parse(s); } catch (e) { warnings.push(`Nieczytelny komentarz ${what}.`); return null; } };

    for (const it of stmts) {
      if (it.comment != null) {
        const c = it.comment;
        let m;
        if ((m = /^fg:doc\s+(.*)$/.exec(c))) st.doc = json(m[1], "fg:doc") || {};
        else if ((m = /^fg:node\s+(\S+)\s+(.*)$/.exec(c))) st.fgNode[m[1]] = json(m[2], "fg:node") || {};
        else if ((m = /^fg:group\s+(.*)$/.exec(c))) { const g = curGroup(); if (g) st.fgGroup[g] = json(m[1], "fg:group") || {}; }
        else if ((m = /^fg:flow\s+(.*)$/.exec(c))) { st.curBlock = { meta: json(m[1], "fg:flow") || {}, edges: [] }; st.flowBlocks.push(st.curBlock); }
        else if (/^fg:end\b/.test(c)) st.curBlock = null;
        continue;
      }
      const s = it.s;
      let m;
      if (!st.header) {
        if ((m = /^(flowchart|graph)(?:\s+(TB|TD|BT|RL|LR))?\s*$/i.exec(s))) { st.header = true; st.dir = (m[2] || "TB").toUpperCase().replace("TD", "TB"); continue; }
        if (MERMAID_OTHER.test(s))
          throw new Error(`„${s.split(/\s/)[0]}” to inny rodzaj diagramu Mermaid. ${MERMAID_SUPPORTED}`);
        if (/^(flowchart|graph)\b/i.test(s)) { st.header = true; continue; }
        throw new Error(`Nie rozpoznano diagramu Mermaid. ${MERMAID_SUPPORTED}`);
      }
      if ((m = /^subgraph\s+(.*)$/i.exec(s))) {
        const rest = m[1].trim();
        let id, label;
        let mm;
        if ((mm = /^([^\s\[\]"]+)\s*\[\s*(".*"|[^\]]*)\s*\]\s*$/.exec(rest))) { id = mm[1]; label = /^".*"$/.test(mm[2]) ? mm[2].slice(1, -1) : mm[2]; }
        else if ((mm = /^"(.*)"$/.exec(rest))) { label = mm[1]; id = null; }
        else if (/^[^\s]+$/.test(rest)) { id = rest; label = rest; }
        else { label = rest; id = null; }
        id = id || ("g" + (st.groups.length + 1));
        st.groups.push({ id, label: splitLabel(label).label || id, parent: curGroup(), color: null });
        st.groupStack.push(id);
        continue;
      }
      if (/^end$/i.test(s)) { if (!st.groupStack.length) warnings.push("Nadmiarowe „end”."); st.groupStack.pop(); continue; }
      if (/^direction\s+/i.test(s)) continue;
      if ((m = /^classDef\s+(\S+)\s+(.*)$/i.exec(s))) { m[1].split(",").forEach(c => { st.classDefs[c.trim()] = parseProps(m[2]); }); continue; }
      if ((m = /^class\s+(\S+)\s+(\S+)$/i.exec(s))) { m[1].split(",").forEach(id => { (st.nodeClass[id.trim()] ||= []).push(m[2]); }); continue; }
      if ((m = /^style\s+(\S+)\s+(.*)$/i.exec(s))) { (st.styles ||= []).push([m[1], parseProps(m[2])]); continue; }
      if ((m = /^linkStyle\s+(\S+)\s+(.*)$/i.exec(s))) { (st.linkStyles ||= []).push([m[1], parseProps(m[2])]); continue; }
      if (/^(click|accTitle|accDescr|%%)/i.test(s)) continue;
      try { parseChain(s); } catch (e) { warnings.push(`Pominięto „${s.length > 60 ? s.slice(0, 57) + "…" : s}”: ${e.message}`); }
    }
    if (!st.header) throw new Error(`Pusty tekst. ${MERMAID_SUPPORTED}`);
    if (st.groupStack.length) warnings.push(`Brakuje „end” dla ${st.groupStack.length} subgraph.`);

    /* --- łańcuch: A & B -->|x| C --> D --- */
    function parseChain(s) {
      let p = 0;
      const ws = () => { while (p < s.length && /\s/.test(s[p])) p++; };
      const readNode = () => {
        ws();
        const idm = /^[A-Za-z0-9_À-ɏ.$]+(?:-(?![-.>xo]?[-.>=])[A-Za-z0-9_À-ɏ.$]+)*/.exec(s.slice(p));
        if (!idm) throw new Error("oczekiwano id węzła");
        const id = idm[0]; p += id.length;
        const n = ensure(id, curGroup());
        // nowa składnia id@{ shape: x, label: "..." }
        if (s.startsWith("@{", p)) {
          const e = s.indexOf("}", p); if (e < 0) throw new Error("niezamknięte @{");
          const body = s.slice(p + 2, e); p = e + 1;
          const lab = /label\s*:\s*"([^"]*)"/.exec(body) || /label\s*:\s*([^,}]+)/.exec(body);
          if (lab) Object.assign(n, splitLabel(lab[1]), { explicit: true });
          const sh = /shape\s*:\s*([\w-]+)/.exec(body);
          if (sh) n.shape = /cyl|db|database/.test(sh[1]) ? "db" : /stadium|rounded|circle|pill/.test(sh[1]) ? "pill" : "box";
        } else {
          for (const [o, c, shape] of SHAPES) {
            if (!s.startsWith(o, p)) continue;
            let q = p + o.length, inner;
            if (s[q] === '"') { const e = s.indexOf('"', q + 1); if (e < 0) throw new Error("niezamknięty cudzysłów"); inner = s.slice(q + 1, e); q = e + 1; if (!s.startsWith(c, q)) { continue; } }
            else { const e = s.indexOf(c, q); if (e < 0) continue; inner = s.slice(q, e); q = e; }
            p = q + c.length;
            Object.assign(n, splitLabel(inner), { shape, explicit: true });
            break;
          }
        }
        const cm = /^:::([\w-]+)/.exec(s.slice(p));
        if (cm) { (st.nodeClass[id] ||= []).push(cm[1]); p += cm[0].length; }
        return id;
      };
      const readGroup = () => { const out = [readNode()]; ws(); while (s[p] === "&") { p++; out.push(readNode()); ws(); } return out; };
      const readLink = () => {
        ws();
        const rest = s.slice(p);
        let m;
        // z tekstem w środku: -- tekst -->, -. tekst .->, == tekst ==>
        if ((m = /^(<?)(--|==|-\.)\s+(.+?)\s+(-{2,}[->ox]|={2,}[=>ox]|\.-+[->ox]?|-{3,})(?=\s|[A-Za-z0-9_"])/.exec(rest)) && !/^-->|^==>|^-\.->/.test(rest)) {
          p += m[0].length;
          return { kind: m[2] === "-." ? "dotted" : m[2] === "==" ? "thick" : "normal", label: decode(m[3].replace(/^"|"$/g, "")), invisible: false, arrow: headOf(m[4]) };
        }
        if ((m = /^~~~+/.exec(rest))) { p += m[0].length; return { kind: "normal", label: "", invisible: true }; }
        if (!(m = /^<?(?:-{2,}[->ox]?|-\.+-[->ox]?|={2,}[=>ox]?)/.exec(rest))) return null;
        p += m[0].length;
        const kind = /\./.test(m[0]) ? "dotted" : /=/.test(m[0]) ? "thick" : "normal";
        const arrow = headOf(m[0]);
        let label = "";
        if (s[p] === "|") { const e = s.indexOf("|", p + 1); if (e < 0) throw new Error("niezamknięta etykieta |…|"); label = decode(s.slice(p + 1, e).trim().replace(/^"|"$/g, "")); p = e + 1; }
        return { kind, label, invisible: false, arrow };
      };
      let left = readGroup();
      let any = false;
      for (;;) {
        const link = readLink();
        if (!link) break;
        const right = readGroup();
        left.forEach(a => right.forEach(b => {
          const e = { from: a, to: b, label: link.label, kind: link.kind, arrow: link.arrow || "triangle", invisible: link.invisible, block: st.curBlock, idx: st.edges.length };
          st.edges.push(e);
          if (st.curBlock) st.curBlock.edges.push(e);
        }));
        left = right; any = true;
      }
      ws();
      if (p < s.length) throw new Error(`niezrozumiały fragment „${s.slice(p, p + 20)}”`);
      return any;
    }

    /* --- style --- */
    useCustom(st.doc.colors);
    const strokeOf = props => colorName(props.stroke) || colorName(props.color) || colorName(props.fill);
    const nodeColor = {}, groupColor = {}, ghosts = new Set();
    Object.entries(st.nodeClass).forEach(([id, cls]) => cls.forEach(c => {
      const d = st.classDefs[c]; if (!d) return;
      if (strokeOf(d)) nodeColor[id] = strokeOf(d);
      if (d["stroke-dasharray"]) ghosts.add(id);
    }));
    const gids = new Set(st.groups.map(g => g.id));
    (st.styles || []).forEach(([id, props]) => {
      const c = strokeOf(props);
      if (gids.has(id)) { if (c) groupColor[id] = c; return; }
      if (c) nodeColor[id] = c;
      if (props["stroke-dasharray"]) ghosts.add(id);
    });
    (st.linkStyles || []).forEach(([which, props]) => {
      const idx = which === "default" ? st.edges.map((_, i) => i) : which.split(",").map(Number).filter(n => Number.isInteger(n));
      idx.forEach(i => {
        const e = st.edges[i]; if (!e) return;
        const c = colorName(props.stroke); if (c) e.color = c;
        const w = parseFloat(props["stroke-width"]); if (w > 0) e.width = Math.min(12, w);
        const d = props["stroke-dasharray"]; if (d) e.dash = parseFloat(d) <= 3 ? "dotted" : "dashed";
      });
    });
    st.edges.forEach(e => {
      e.style = e.dash || (e.kind === "dotted" ? "dashed" : "solid");
      e.width = e.width || (e.kind === "thick" ? 4 : null);
    });

    /* --- id: odtwarzamy oryginalne z komentarzy fg --- */
    const rename = new Map();
    Object.entries(st.fgNode).forEach(([m, k]) => { if (k && k.id) rename.set(m, String(k.id)); });
    const gRename = new Map();
    Object.entries(st.fgGroup).forEach(([m, k]) => { if (k && k.id) gRename.set(m, String(k.id)); });
    const nid = id => rename.get(id) || id;
    const gid = id => id == null ? null : gRename.get(id) || id;

    const spec = { title: title || "Graf z Mermaid", direction: ["LR", "TB", "RL", "BT"].includes(st.dir) ? st.dir : "TB" };
    if (st.doc.subtitle) spec.subtitle = String(st.doc.subtitle);
    if (isObj(st.doc.colors)) spec.colors = st.doc.colors;
    spec.groups = st.groups.map(g => {
      const o = { id: gid(g.id), label: g.label };
      if (g.parent) o.parent = gid(g.parent);
      if (groupColor[g.id]) o.color = groupColor[g.id];
      return o;
    });
    const used = new Set(st.edges.filter(e => !e.invisible).flatMap(e => [e.from, e.to]));
    spec.nodes = st.order.map(id => {
      const n = st.nodes.get(id), o = { id: nid(id), label: n.label || id };
      if (n.sub) o.sub = n.sub;
      if (n.group) o.group = gid(n.group);
      if (nodeColor[id]) o.color = nodeColor[id];
      const shape = ghosts.has(id) ? "ghost" : n.shape;
      if (shape !== "box") o.shape = shape;
      const k = st.fgNode[id];
      if (k) for (const f of ["meta", "items", "pos"]) if (k[f] != null) o[f] = k[f];
      if (!used.has(id) && !n.explicit && !n.group) return null;
      return o;
    }).filter(Boolean);

    /* --- przepływy --- */
    const edges = st.edges.filter(e => !e.invisible);
    const flows = [];
    const flowIds = new Set();
    const uniq = base => { let k = base, i = 2; while (flowIds.has(k)) k = `${base}-${i++}`; flowIds.add(k); return k; };
    const labelOf = id => st.nodes.get(id)?.label || id;
    const attrs = e => ({ color: e.color || null, style: e.style, width: e.width || null, arrow: e.arrow || "triangle" });

    // segmenty, które daje zapisana ścieżka (do sprawdzenia, czy użytkownik nie zmienił krawędzi)
    const segsOfPath = path => {
      const out = new Set();
      const expand = (items, ends) => {
        items.forEach(it => {
          if (Array.isArray(it)) { let all = []; it.forEach(br => { all = all.concat(expand(Array.isArray(br) ? br : [br], ends)); }); ends = [...new Set(all)]; }
          else { const n = String(isObj(it) ? it.node : it); ends.forEach(e => out.add(e + "\u0000" + n)); ends = [n]; }
        });
        return ends;
      };
      expand(Array.isArray(path) ? path : [], []);
      return out;
    };

    const chainsOf = list => {
      // łączy krawędzie w ścieżki przez węzły „przelotowe” (jedno wejście, jedno wyjście, ten sam styl)
      const ins = {}, outs = {};
      list.forEach(e => { (outs[e.from] ||= []).push(e); (ins[e.to] ||= []).push(e); });
      const same = (a, b) => JSON.stringify(attrs(a)) === JSON.stringify(attrs(b));
      const through = n => (ins[n] || []).length === 1 && (outs[n] || []).length === 1 && same(ins[n][0], outs[n][0]);
      const done = new Set(), chains = [];
      const walk = e0 => {
        const ch = [e0]; done.add(e0);
        let e = e0;
        while (through(e.to)) { const nx = outs[e.to][0]; if (done.has(nx)) break; ch.push(nx); done.add(nx); e = nx; }
        chains.push(ch);
      };
      list.forEach(e => { if (!done.has(e) && !through(e.from)) walk(e); });
      list.forEach(e => { if (!done.has(e)) walk(e); }); // cykle
      return chains;
    };
    const chainPath = ch => [nid(ch[0].from), ...ch.map(e => e.label ? { node: nid(e.to), label: e.label } : nid(e.to))];
    const pushFlow = (base, path, a, extra = {}) => {
      const f = { id: uniq(base.id), label: base.label, ...extra };
      if (a.color) f.color = a.color;
      if (a.width) f.width = a.width;
      if (a.style && a.style !== "solid") f.style = a.style;
      if (f.arrow == null && a.arrow && a.arrow !== "triangle") f.arrow = a.arrow;
      f.path = path;
      flows.push(f);
    };

    const loose = [];
    edges.forEach(e => { if (!e.block) loose.push(e); });
    st.flowBlocks.forEach(b => {
      const es = b.edges.filter(e => !e.invisible);
      if (!es.length) return;
      const meta = b.meta || {};
      const have = new Set(es.map(e => nid(e.from) + "\u0000" + nid(e.to)));
      const want = segsOfPath(meta.path);
      const a = attrs(es[0]);
      const extra = {};
      if (meta.description) extra.description = meta.description;
      if (meta.legend === false || meta.edge) extra.legend = false;
      if (meta.arrow) extra.arrow = meta.arrow;
      if (meta.path && have.size === want.size && [...have].every(k => want.has(k))) {
        // krawędzie bez zmian: wracamy do oryginalnej ścieżki z rozgałęzieniami
        pushFlow({ id: meta.id || "przeplyw", label: meta.label || meta.id || "Przepływ" }, JSON.parse(JSON.stringify(meta.path)), a, extra);
        // etykiety na strzałkach bierzemy z Mermaida, bo mogły zostać tam zmienione
        const lab = new Map(es.map(e => [nid(e.from) + "\u0000" + nid(e.to), e.label]));
        const f = flows[flows.length - 1];
        const relabel = (items, ends) => {
          items.forEach((it, i) => {
            if (Array.isArray(it)) { let all = []; it.forEach((br, j) => { const arr = Array.isArray(br) ? br : [br]; all = all.concat(relabel(arr, ends)); if (!Array.isArray(br)) it[j] = arr[0]; }); ends = [...new Set(all)]; }
            else {
              const n = String(isObj(it) ? it.node : it);
              const l = ends.map(e => lab.get(e + "\u0000" + n)).find(x => x) || "";
              items[i] = l ? { node: n, label: l } : n;
              ends = [n];
            }
          });
          return ends;
        };
        relabel(f.path, []);
        if (meta.color != null && !a.color) f.color = meta.color;
        else if (meta.color != null && colorName(hexOf(meta.color)) === a.color) f.color = meta.color;
      } else {
        const chains = chainsOf(es);
        chains.forEach((ch, k) => pushFlow({ id: meta.id || "przeplyw", label: (meta.label || "Przepływ") + (chains.length > 1 ? ` ${k + 1}` : "") }, chainPath(ch), attrs(ch[0]), extra));
      }
    });
    const chains = chainsOf(loose);
    const many = chains.length > 8;
    chains.forEach((ch, k) => {
      const first = labelOf(ch[0].from), last = labelOf(ch[ch.length - 1].to);
      pushFlow({ id: `p${k + 1}`, label: `${first} → ${last}` }, chainPath(ch), attrs(ch[0]), many ? { legend: false } : {});
    });
    spec.flows = flows;
    spec.notes = Array.isArray(st.doc.notes) ? st.doc.notes : [];
    if (!edges.length && !spec.nodes.length) warnings.push("Nie znaleziono żadnych węzłów ani krawędzi.");
    return { spec, warnings };
  }

  // looksLikeMermaid: tekst wygląda na dowolny diagram Mermaid (także nieobsługiwany), żeby nie czytać go jako YAML
  const looksLikeMermaid = text => {
    const first = String(text).replace(/^\s*---[\s\S]*?---\s*/, "").split("\n").map(l => l.trim()).find(l => l && !l.startsWith("%%")) || "";
    return /^(flowchart|graph)\b/i.test(first) || MERMAID_OTHER.test(first);
  };
  const api = { toMermaid, fromMermaid, looksLikeMermaid, PALETTE, SUPPORTED: MERMAID_SUPPORTED };
  root.FlowGraphMermaid = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
