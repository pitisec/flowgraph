"""Ustawia wygląd okna instalatora w .DS_Store zamontowanego (zapisywalnego) obrazu .dmg.

Finder, tworząc .DS_Store, przepisuje do niego globalne preferencje osoby budującej (pasek kart, pasek ścieżki).
Tu wymuszamy czyste okno: bez paska narzędzi, kart, ścieżki, stanu, panelu bocznego i podglądu.

Użycie: python window.py /Volumes/FlowGraph/.DS_Store
"""
import os
import sys

from ds_store import DSStore, store

# Zakładek (pBBk) nie potrzebujemy rozumieć, a biblioteka nie umie odczytać tych z nowszego macOS: zostają jako surowe bajty.
store.codecs.pop(b"pBBk", None)

CLEAN = {
    "ShowToolbar": False,
    "ShowTabView": False,
    "ShowPathbar": False,
    "ShowStatusBar": False,
    "ShowSidebar": False,
    "ContainerShowSidebar": False,
    "PreviewPaneVisibility": False,
}

path = sys.argv[1]
# Edycja rekordu w miejscu bywa zawodna w tej bibliotece, więc przepisujemy cały plik z poprawionym „bwsp”.
with DSStore.open(path, "r") as d:
    entries = [(e.filename, e.code, e.type, e.value) for e in d]
bw = next((v for f, c, t, v in entries if f == "." and c == b"bwsp"), {})
bw.update(CLEAN)
entries = [x for x in entries if not (x[0] == "." and x[1] == b"bwsp")] + [(".", b"bwsp", b"blob", bw)]
tmp = path + ".new"
with DSStore.open(tmp, "w+") as d:
    for f, c, t, v in entries:
        if c in store.codecs:
            d[f][c] = v
        else:
            d[f][c] = (t.decode() if isinstance(t, bytes) else t, v)
os.replace(tmp, path)

with DSStore.open(path, "r") as d:
    bw = d["."]["bwsp"]
    bad = {k: bw.get(k) for k in CLEAN if bw.get(k) is not False}
    if bad:
        sys.exit(f"window.py: nie ustawiono {bad}")
print("window.py: okno bez pasków (" + ", ".join(CLEAN) + ")")
