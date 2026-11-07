#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyyaml>=6"]
# ///
"""FlowGraph: grafy przepływów z plików YAML.

Użycie:
    ./flowgraph.py render plik.yml [-o wynik.html] [--open]   # YAML -> samodzielna strona HTML
    ./flowgraph.py editor [plik.yml] [-o dist/editor.html] [--open] # edytor WYSIWYG (opcjonalnie z wczytanym plikiem)
    ./flowgraph.py example [nazwa]                             # wypisuje przykładowy YAML

Wszystkie biblioteki są wklejane do wynikowych plików, więc działają bez serwera i bez internetu
(z internetu pobierane są tylko fonty, a gdy ich brak, strona używa fontów systemowych).
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
EXAMPLES = HERE / "examples"


def read(name: str) -> str:
    return (HERE / name).read_text(encoding="utf-8")


def script_safe(js: str) -> str:
    """Zabezpiecza kod wklejany do <script>, żeby nie zamknął znacznika."""
    return js.replace("</script", "<\\/script")


def json_for_script(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1).replace("<", "\\u003c")


def fill(template: str, values: dict[str, str]) -> str:
    # jedno przejście, więc treść wklejona za jeden znacznik nie jest przetwarzana ponownie
    return re.sub(r"__([A-Z]+)__", lambda m: values.get(m.group(1), m.group(0)), template)


def load_yaml(path: Path) -> dict:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        sys.exit(f"Błąd: nie ma pliku {path}")
    except yaml.YAMLError as e:
        sys.exit(f"Błąd składni YAML w {path}:\n{e}")
    if not isinstance(data, dict):
        sys.exit(f"Błąd w {path}: na najwyższym poziomie musi być słownik (title, nodes, flows…).")
    for key in ("nodes", "flows"):
        if key in data and not isinstance(data[key], list):
            sys.exit(f"Błąd w {path}: '{key}' musi być listą.")
    return data


def libs() -> dict[str, str]:
    return {
        "CSS": read("src/flowgraph.css"),
        "DAGRE": script_safe(read("vendor/dagre.min.js")),
        "FLOWGRAPH": script_safe(read("src/flowgraph.js")),
    }


def viewer_html(spec: dict) -> str:
    title = str(spec.get("title") or "Graf przepływów").replace("&", "&amp;").replace("<", "&lt;")
    return fill(read("src/viewer-shell.html"), {**libs(), "TITLE": title, "SPEC": json_for_script(spec)})


def examples() -> dict[str, dict]:
    return {p.stem: load_yaml(p) for p in sorted(EXAMPLES.glob("*.yml"))}


def editor_html(spec: dict | None) -> str:
    ex = examples()
    if spec is None:
        spec = ex.get("zamowienie") or next(iter(ex.values()), {"title": "Nowy graf"})
    else:
        spec = {**spec, "__fromFile": True}
    return fill(read("src/editor-src.html"), {
        **libs(),
        "JSYAML": script_safe(read("vendor/js-yaml.min.js")),
        "MERMAID": script_safe(read("src/mermaid.js")),
        "SHELL": json_for_script(read("src/viewer-shell.html")),
        "SPEC": json_for_script(spec),
        "EXAMPLES": json_for_script(ex),
    })


NODE_MERMAID = """
globalThis.window = globalThis;
require(process.argv[1] + "/src/flowgraph.js");
const M = require(process.argv[1] + "/src/mermaid.js");
let input = ""; process.stdin.on("data", d => input += d).on("end", () => {
  try {
    if (process.argv[2] === "to") process.stdout.write(M.toMermaid(JSON.parse(input)));
    else process.stdout.write(JSON.stringify(M.fromMermaid(input)));
  } catch (e) { process.stderr.write(e.message + "\\n"); process.exit(2); }
});
"""


def mermaid(direction: str, text: str) -> str:
    # konwerter jest w JS (ten sam co w edytorze), więc uruchamiamy go przez node
    node = shutil.which("node")
    if not node:
        sys.exit("Konwersja Mermaid z wiersza poleceń wymaga node. Bez niego użyj przycisku „Mermaid…” w edytorze.")
    r = subprocess.run([node, "-e", NODE_MERMAID, str(HERE), direction], input=text, capture_output=True, text=True)
    if r.returncode:
        sys.exit("Błąd konwersji Mermaid: " + (r.stderr.strip() or "nieznany"))
    return r.stdout


def write(out: Path, html: str, open_it: bool, what: str):
    out.parent.mkdir(parents=True, exist_ok=True)  # np. app/dist/ w świeżym checkoutcie
    out.write_text(html, encoding="utf-8")
    print(f"Zapisano {what}: {out} ({len(html) // 1024} KB)")
    if open_it:
        webbrowser.open(out.resolve().as_uri())


def main():
    ap = argparse.ArgumentParser(description="Grafy przepływów z plików YAML.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("render", help="zamień YAML na samodzielną stronę HTML")
    r.add_argument("yaml")
    r.add_argument("-o", "--output")
    r.add_argument("--open", action="store_true")

    e = sub.add_parser("editor", help="zbuduj edytor WYSIWYG")
    e.add_argument("yaml", nargs="?")
    e.add_argument("-o", "--output", default=str(HERE / "dist" / "editor.html"))
    e.add_argument("--open", action="store_true")

    x = sub.add_parser("example", help="wypisz przykładowy YAML")
    x.add_argument("name", nargs="?", default="zamowienie", help=f"jeden z: {', '.join(p.stem for p in sorted(EXAMPLES.glob('*.yml')))}")

    m = sub.add_parser("to-mermaid", help="zamień YAML na Mermaid flowchart")
    m.add_argument("yaml")
    m.add_argument("-o", "--output", help="plik .mmd (domyślnie: wypisz na ekran)")

    f = sub.add_parser("from-mermaid", help="zamień Mermaid flowchart/graph na YAML")
    f.add_argument("mmd")
    f.add_argument("-o", "--output", help="plik .yml (domyślnie: wypisz na ekran)")

    a = ap.parse_args()
    if a.cmd in ("to-mermaid", "from-mermaid"):
        if a.cmd == "to-mermaid":
            text = mermaid("to", json.dumps(load_yaml(Path(a.yaml)), ensure_ascii=False, default=str))
        else:
            try:
                src = Path(a.mmd).read_text(encoding="utf-8")
            except FileNotFoundError:
                sys.exit(f"Błąd: nie ma pliku {a.mmd}")
            res = json.loads(mermaid("from", src))
            for w in res["warnings"]:
                print("Ostrzeżenie:", w, file=sys.stderr)
            text = yaml.safe_dump(res["spec"], allow_unicode=True, sort_keys=False, width=120)
        if a.output:
            Path(a.output).write_text(text, encoding="utf-8")
            print(f"Zapisano {a.output}")
        else:
            sys.stdout.write(text)
        return
    if a.cmd == "render":
        src = Path(a.yaml)
        write(Path(a.output) if a.output else src.with_suffix(".html"), viewer_html(load_yaml(src)), a.open, "graf")
    elif a.cmd == "editor":
        spec = load_yaml(Path(a.yaml)) if a.yaml else None
        write(Path(a.output), editor_html(spec), a.open, "edytor")
    else:
        p = EXAMPLES / f"{a.name}.yml"
        if not p.exists():
            sys.exit(f"Nie ma przykładu „{a.name}”.")
        sys.stdout.write(p.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
