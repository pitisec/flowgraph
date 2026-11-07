#!/bin/zsh
# Po `tauri build`: dopracowuje okno instalatora w każdym zbudowanym .dmg (Tauri nie ma takich opcji).
#  - ukrywa rozszerzenie „.app” (SetFile -a E),
#  - wymusza czyste okno Findera: bez paska narzędzi, kart, ścieżki, stanu i panelu bocznego (window.py),
#    bo Finder zapisuje w .DS_Store globalne preferencje osoby, która buduje.
# Przepakowanie: UDZO → UDRW, zmiany, z powrotem UDZO.
# Uwaga: przy włączonym w Finderze „Pokazuj wszystkie rozszerzenia nazw plików” Finder i tak pokaże „.app”.
set -euo pipefail
HERE="${0:A:h}"
cd "$HERE/../src-tauri/target"
setopt null_glob
dmgs=(*/bundle/dmg/*.dmg */*/bundle/dmg/*.dmg)
(( ${#dmgs} )) || { echo "finalize: brak plików .dmg"; exit 0; }

# biblioteka ds_store w lokalnym środowisku (raz, potrzebny internet)
VENV="$HERE/.venv"
if [[ ! -x "$VENV/bin/python" ]] || ! "$VENV/bin/python" -c "import ds_store" 2>/dev/null; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --disable-pip-version-check "ds_store==1.3.3"
fi

# przy błędzie odmontuj obraz i usuń pliki tymczasowe, żeby nie zostawały „FlowGraph 1”, „FlowGraph 2”…
tmp="" mnt=""
cleanup() { [[ -n "$mnt" ]] && hdiutil detach "$mnt" -quiet -force 2>/dev/null; [[ -n "$tmp" ]] && rm -rf "$tmp"; }
trap cleanup EXIT

for dmg in $dmgs; do
  tmp=$(mktemp -d)
  hdiutil convert "$dmg" -quiet -format UDRW -o "$tmp/rw.dmg"
  mnt=$(hdiutil attach "$tmp/rw.dmg" -nobrowse -noautoopen 2>/dev/null | awk -F'\t' '/\/Volumes\//{print $NF}' | tail -1)
  # Finder zapisuje tu tło i pozycje ikon; brak pliku = Tauri pominął AppleScript (na CI: TAURI_BUNDLER_DMG_IGNORE_CI=true)
  [[ -f "$mnt/.DS_Store" ]] || { echo "finalize: ${dmg:t} nie ma .DS_Store (okno instalatora nie zostało ułożone przez Finder)"; exit 1; }
  for app in "$mnt"/*.app(N); do SetFile -a E "$app"; done
  "$VENV/bin/python" -I "$HERE/window.py" "$mnt/.DS_Store"
  sync
  hdiutil detach "$mnt" -quiet && mnt=""
  hdiutil convert "$tmp/rw.dmg" -quiet -format UDZO -imagekey zlib-level=9 -ov -o "$dmg"
  rm -rf "$tmp" && tmp=""
  echo "finalize: gotowe ${dmg:t}"
done
