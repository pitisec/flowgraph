#!/bin/zsh
# Renderuje background.html do background.tiff (1x + 2x dla ekranów Retina) przez Chrome w trybie headless.
set -euo pipefail
cd "${0:A:h}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
for s in 1 2; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=$s \
    --window-size=660,420 --virtual-time-budget=4000 \
    --screenshot="$TMP/bg@${s}x.png" "file://$PWD/background.html" 2>/dev/null
done
cp "$TMP/bg@2x.png" background@2x.png
tiffutil -cathidpicheck "$TMP/bg@1x.png" "$TMP/bg@2x.png" -out background.tiff >/dev/null
rm -rf "$TMP"
echo "background.tiff gotowe"
