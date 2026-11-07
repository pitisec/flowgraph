# Budowanie, podpisywanie i wydawanie aplikacji FlowGraph (macOS)

Wszystkie polecenia uruchamiaj w katalogu `flowgraph/app/`, chyba że opis mówi inaczej.

## 1. Wymagania

| Narzędzie                | Wersja             | Po co                                        | Sprawdzenie / instalacja          |
|--------------------------|--------------------|----------------------------------------------|-----------------------------------|
| Xcode Command Line Tools | dowolna aktualna   | kompilator, linker, `codesign`, `notarytool` | `xcode-select --install`          |
| Rust przez `rustup`      | 1.91.0 (przypięta) | część natywna (Tauri 2 wymaga 1.90+)         | `rustup --version`                |
| Node.js z npm            | 22+                | Tauri CLI, testy, `npm run release`          | `node -v`                         |
| Python 3                 | 3.9+               | `flowgraph.py` składa edytor                 | `python3 -V`                      |
| Google Chrome            | dowolna            | tylko do przebudowy tła instalatora          | `/Applications/Google Chrome.app` |

Wersja Rusta jest przypięta w `src-tauri/rust-toolchain.toml`. `rustup` sam ją pobierze przy pierwszym budowaniu i używa jej tylko w tym projekcie, więc domyślny `stable` w systemie zostaje bez zmian.

## 2. Budowanie

```bash
npm install          # raz: instaluje @tauri-apps/cli do node_modules/
npm run build        # składa edytor i buduje FlowGraph.app oraz .dmg
```

Z katalogu głównego projektu to samo robi `npm run build-app`. Najpierw przebudowuje `dist/` (`npm run build`: edytor i strony przykładów), potem aplikację, więc wszystko jest świeże. Argumenty po `--` przechodzą dalej, np. `npm run build-app -- --target universal-apple-darwin`.

`npm run build` najpierw uruchamia `npm run web`, które wywołuje `../flowgraph.py editor -o app/dist/index.html`. Po zmianach w plikach z `src/` (`flowgraph.js`, `flowgraph.css`, `mermaid.js`, `editor-src.html`) wystarczy więc ponownie uruchomić `npm run build`. Pierwsza kompilacja trwa kilka minut, kolejne około minuty.

**Wynik budowania** (w `src-tauri/target/release/bundle/`):

| Plik                                 | Rozmiar | Do czego                          |
|--------------------------------------|--------:|-----------------------------------|
| `macos/FlowGraph.app`                | ~4,8 MB | gotowa aplikacja                  |
| `dmg/FlowGraph_<wersja>_aarch64.dmg` |   ~3 MB | instalator z tłem, do przekazania |

**Pozostałe polecenia:**

| Polecenie                      | Co robi                                                               |
|--------------------------------|-----------------------------------------------------------------------|
| `npm run dev`                  | uruchamia aplikację w trybie deweloperskim, bez instalatora           |
| `npm run web`                  | tylko składa `dist/index.html` i kopiuje `src/splash.html` do `dist/` |
| `npm run tauri -- <polecenie>` | dowolne polecenie Tauri CLI, np. `npm run tauri -- info`              |

### Wersja uniwersalna (Apple Silicon i Intel)

Domyślny build działa tylko na Macach z procesorami Apple (M1 i nowsze). Wersję dla obu architektur budujesz tak:

```bash
rustup target add x86_64-apple-darwin --toolchain 1.91.0     # raz
npm run build -- --target universal-apple-darwin
```

Wynik trafia do `src-tauri/target/universal-apple-darwin/release/bundle/`, a `.dmg` ma w nazwie `universal`.

### Numer wersji

Źródłem wersji jest `package.json` (w katalogu `app/`). `src-tauri/tauri.conf.json` ma `"version": "../package.json"`, więc aplikacja i nazwa `.dmg` biorą numer stamtąd. Kopia numeru jest też w `src-tauri/Cargo.toml` (okno „O programie”), w obu plikach blokad i w obrazie w `deploy/kubernetes.yaml`. Ręcznie tego nie zmieniaj: wszystkie miejsca naraz podnosi `npm run release` (sekcja 4).

### Ikona

Źródłem ikony jest `assets/icon.svg`. Po jej zmianie wyrenderuj `assets/icon.png` (1024×1024) i wygeneruj wszystkie rozmiary:

```bash
rsvg-convert -w 1024 -h 1024 assets/icon.svg -o assets/icon.png
npm run tauri -- icon assets/icon.png      # nadpisuje src-tauri/icons/
```

### Wersja i commit w oknie „O programie”

Okno „O programie” pokazuje np. `Version 0.10.0 (abc1234)`: wersję z `Cargo.toml` i skrót commita, z którego powstał build. `src-tauri/build.rs` odczytuje commit z gita przy kompilacji. Jeśli śledzone pliki mają niezacommitowane zmiany, dopisuje `-dirty`, więc build do przekazania warto robić z czystego drzewa (np. po commicie i tagu). Poza repozytorium gita w nawiasie zostaje wersja z `Info.plist`.

### Ekran startowy

`src/splash.html` to okno startowe aplikacji (tylko aplikacja, nie edytor w przeglądarce): animowany motyw z ikony, nazwa, podtytuł i wersja. Okno `splash` w `tauri.conf.json` jest bez ramki i przezroczyste (stąd `macOSPrivateApi` i cecha `macos-private-api` w `Cargo.toml`). Ekran startowy jest zawsze na wierzchu. Główne okno startuje ukryte, a gdy edytor narysuje pierwszy graf, wywołuje komendę `app_ready` i okno od razu się pokazuje, pod ekranem startowym. Gdyby sygnał nie przyszedł, okno pokaże się po 8 s. Ekran startowy nie czeka na edytor: po animacji (1,5 s) sam gaśnie i zamyka swoje okno (uprawnienie `core:window:allow-close` w `capabilities/splash.json`). Motyw ekranu startowego bierze się z ustawienia edytora (`localStorage`).

### Tło instalatora `.dmg`

| Plik                     | Rola                                                                                                                                                                                                                                                                                                                   |
|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `dmg/background.html`    | źródło tła (SVG 660×420 pt): ciemne tło, przepływy, karty pod ikonami                                                                                                                                                                                                                                                  |
| `dmg/make-background.sh` | renderuje źródło przez Chrome do `background.tiff` (1x i 2x dla Retina)                                                                                                                                                                                                                                                |
| `dmg/background.tiff`    | gotowe tło, wskazane w `tauri.conf.json` → `bundle.macOS.dmg`                                                                                                                                                                                                                                                          |
| `dmg/finalize.sh`        | uruchamiany przez `npm run build` po `tauri build`: przepakowuje każdy `.dmg`, ukrywa w nim rozszerzenie „.app” i uruchamia `window.py` (Tauri nie ma takich opcji)                                                                                                                                                    |
| `dmg/window.py`          | ustawia w `.DS_Store` obrazu czyste okno: bez paska narzędzi, kart, ścieżki, stanu, panelu bocznego i podglądu. Finder przy budowaniu zapisuje tam globalne preferencje osoby, która buduje. Wymaga biblioteki `ds_store`: `finalize.sh` przy pierwszym uruchomieniu instaluje ją do `dmg/.venv/` (potrzebny internet) |

Pasek kart i pasek ścieżki to globalne ustawienia Findera (Widok → „Pokaż pasek kart”, „Pokaż pasek ścieżki”) i mają pierwszeństwo przed ustawieniami zapisanymi w obrazie. U osoby, która ma je włączone, okno instalatora też je pokaże. Domyślnie w macOS są wyłączone.

Rozszerzenie zostaje ukryte tylko wtedy, gdy w Finderze jest wyłączone **Ustawienia → Zaawansowane → „Pokazuj wszystkie rozszerzenia nazw plików”**. Przy włączonej opcji Finder zawsze pokazuje „FlowGraph.app”.

Jeśli budujesz przez `npm run tauri -- build`, a nie przez `npm run build`, uruchom potem `./dmg/finalize.sh` ręcznie. Notaryzację `.dmg` (punkt 3.4) rób dopiero po tym kroku, bo skrypt zmienia plik.

Po zmianie `background.html` uruchom `./dmg/make-background.sh`, a potem `npm run build`.

Ustawienia okna instalatora są w `src-tauri/tauri.conf.json`:

```json
"macOS": {
  "dmg": {
    "background": "../dmg/background.tiff",
    "windowSize": { "width": 660, "height": 440 },
    "appPosition": { "x": 170, "y": 195 },
    "applicationFolderPosition": { "x": 490, "y": 195 },
    "windowPosition": { "x": 420, "y": 220 }
  }
}
```

Pozycje to środki ikon (128 pt) w punktach. Jasne karty na tle stoją dokładnie pod nimi, więc przy zmianie pozycji trzeba też przesunąć karty w `background.html`. Wysokość okna jest o 20 pt większa od tła, bo Finder wlicza w nią pasek tytułu.

Podpisy pod ikonami rysuje Finder: czarne w jasnym motywie systemu, białe w ciemnym. Dlatego ikony stoją na jasnych kartach. W ciemnym motywie systemu biały podpis na jasnej karcie będzie słabo widoczny.

## 3. Podpisywanie i notaryzacja

Bez podpisu aplikacja działa, ale na innym Macu Gatekeeper ją blokuje. Żeby otwierała się bez ostrzeżeń, potrzebne są dwa kroki:

1. **podpis** certyfikatem *Developer ID Application*,
2. **notaryzacja**: Apple skanuje aplikację i wydaje potwierdzenie, które dołącza się do pliku (*stapling*).

Tauri robi oba kroki sam przy `npm run build`, gdy ustawisz zmienne środowiskowe opisane niżej.

### 3.1. Konto i certyfikat (raz)

1. Wykup członkostwo w **Apple Developer Program** (99 USD na rok, developer.apple.com). Darmowe konto daje tylko certyfikat *Apple Development*. Ten certyfikat służy do uruchamiania na własnych urządzeniach, a Apple nie notaryzuje podpisanych nim aplikacji.
2. Utwórz certyfikat: Xcode → Settings → Accounts → wybierz konto → **Manage Certificates** → **＋** → **Developer ID Application**. Certyfikat razem z kluczem prywatnym trafi do pęku kluczy.
3. Sprawdź, czy jest dostępny:
   ```bash
   security find-identity -v -p codesigning
   # 1) ABCD… "Developer ID Application: Imię Nazwisko (TEAMID)"
   ```
   Pełna nazwa w cudzysłowie to wartość `APPLE_SIGNING_IDENTITY`. `TEAMID` (10 znaków) to `APPLE_TEAM_ID`.
4. Zrób kopię zapasową certyfikatu z kluczem: Pęk kluczy → certyfikat → Eksportuj → `.p12` z hasłem. Bez klucza prywatnego certyfikatu nie da się odtworzyć, trzeba by wystawić nowy.

### 3.2. Dane do notaryzacji (raz)

Wybierz jeden ze sposobów:

| Sposób              | Zmienne                                                   | Skąd je wziąć                                                                                                                       |
|---------------------|-----------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Apple ID (prostszy) | `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`             | `APPLE_PASSWORD` to **hasło dla aplikacji** z account.apple.com → Logowanie i bezpieczeństwo, a nie hasło do Apple ID               |
| Klucz API (do CI)   | `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH` | App Store Connect → Users and Access → Integrations → App Store Connect API: Issuer ID, Key ID i plik `.p8` (do pobrania tylko raz) |

Hasła nie wpisuj do repozytorium. Trzymaj je w pęku kluczy:

```bash
# hasło dla aplikacji, do odczytu przez skrypty (polecenie zapyta o hasło)
security add-generic-password -a "$USER" -s flowgraph-notary -w

# profil dla xcrun notarytool (potrzebny do notaryzacji .dmg w kroku 3.4)
xcrun notarytool store-credentials flowgraph-notary \
  --apple-id "twoj@email" --team-id "TEAMID"          # zapyta o hasło dla aplikacji
```

### 3.3. Podpisany build

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Imię Nazwisko (TEAMID)"
export APPLE_ID="twoj@email"
export APPLE_TEAM_ID="TEAMID"
export APPLE_PASSWORD="$(security find-generic-password -a "$USER" -s flowgraph-notary -w)"

npm run build                    # albo: npm run build -- --target universal-apple-darwin
```

Tauri:
1. podpisuje aplikację z włączonym *hardened runtime* i znacznikiem czasu,
2. wysyła ją do notaryzacji i czeka na wynik (zwykle 1–10 minut),
3. dołącza potwierdzenie do `FlowGraph.app`,
4. buduje `.dmg` z tą aplikacją.

Zamiast `APPLE_ID`, `APPLE_PASSWORD` i `APPLE_TEAM_ID` możesz ustawić `APPLE_API_ISSUER`, `APPLE_API_KEY` i `APPLE_API_KEY_PATH`.

**Na serwerze CI** (bez pęku kluczy z certyfikatem) dodatkowo ustaw:
- `APPLE_CERTIFICATE`: zawartość pliku `.p12` zakodowana w base64 (`base64 -i cert.p12 | pbcopy`),
- `APPLE_CERTIFICATE_PASSWORD`: hasło do `.p12`.

Tauri utworzy wtedy tymczasowy pęk kluczy i zaimportuje do niego certyfikat.

### 3.4. Podpis i notaryzacja `.dmg` (zalecane)

Znotaryzowana aplikacja w środku zwykle wystarcza. Podpisany i znotaryzowany obraz dysku nie wywołuje jednak żadnego ostrzeżenia już przy otwieraniu `.dmg`:

```bash
DMG=$(ls src-tauri/target/release/bundle/dmg/FlowGraph_*_aarch64.dmg)
codesign --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG"
xcrun notarytool submit "$DMG" --keychain-profile flowgraph-notary --wait
xcrun stapler staple "$DMG"
```

### 3.5. Sprawdzenie

```bash
APP=src-tauri/target/release/bundle/macos/FlowGraph.app
codesign --verify --deep --strict --verbose=2 "$APP"   # podpis poprawny
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E "Authority|TeamIdentifier|flags"
spctl -a -vv "$APP"                                    # oczekiwane: accepted, source=Notarized Developer ID
xcrun stapler validate "$APP"                          # potwierdzenie dołączone
spctl -a -vv -t open --context context:primary-signature "$DMG"   # .dmg
```

Gdy notaryzacja się nie powiedzie, pobierz szczegóły:

```bash
xcrun notarytool history --keychain-profile flowgraph-notary
xcrun notarytool log <submission-id> --keychain-profile flowgraph-notary
```

### 3.6. Bez płatnego konta

Pełnego podpisu nie da się uzyskać. Podpis ad-hoc (`"signingIdentity": "-"` w `bundle.macOS`) niczego nie zmienia dla innych osób. Na innym Macu:
- za pierwszym razem: Ustawienia systemowe → Prywatność i ochrona → **Otwórz mimo to** (w macOS 14 i starszych wystarczy prawy klik na aplikacji → **Otwórz**),
- albo, gdy system zgłasza, że aplikacja jest „uszkodzona”: `xattr -dr com.apple.quarantine /Applications/FlowGraph.app`.

Na Macu, na którym aplikacja została zbudowana, podpis nie jest potrzebny.

## 4. Wydanie przez GitHub Actions

Repozytorium ma cztery workflowy w `.github/workflows/`. Repozytorium jest publiczne, więc runnery GitHuba (także macOS) i GitHub Pages są darmowe:

| Workflow      | Kiedy                                                                        | Co robi                                                                                                                                                                                                                                                                             |
|---------------|------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ci.yml`      | push do `main`, każdy pull request                                           | w pull requeście sprawdza opisy commitów (Conventional Commits); sprawdza, czy `dist/` (`editor.html`, `examples/*.html`) jest aktualny; testy jednostkowe i end-to-end (Playwright, Chromium); `cargo fmt` i `clippy` dla aplikacji; obraz Dockera budowany i uruchamiany na próbę |
| `release.yml` | push tagu `X.Y.Z` (robi to `npm run release`), ręcznie z zakładki Actions    | testy z `ci.yml` → zgodność tagu z wersją → uniwersalny `.dmg` (Apple Silicon i Intel) → opcjonalnie podpis i notaryzacja → sumy SHA-256 i poświadczenie pochodzenia → **szkic** wydania z listą zmian z `CHANGELOG.md`                                                             |
| `pages.yml`   | publikacja wydania (szkic → **Publish release**), ręcznie z zakładki Actions | `dist/editor.html` jako strona główna i `dist/examples/*.html` z otagowanej wersji → GitHub Pages                                                                                                                                                                                   |
| `docker.yml`  | publikacja wydania, ręcznie z zakładki Actions                               | obraz z otagowanej wersji (`linux/amd64`, `linux/arm64`) → `ghcr.io/<właściciel>/flowgraph` z tagami `X.Y.Z`, `X.Y`, `latest` i poświadczeniem pochodzenia                                                                                                                          |

Ręczne uruchomienie `release.yml` buduje `.dmg` i udostępnia go jako artefakt, bez tworzenia wydania. Przydaje się do sprawdzenia budowania.

### Lista kroków

Commity opisujemy w formacie [Conventional Commits](../CONTRIBUTING.md) (`feat: …`, `fix: …`). Z nich powstaje numer wersji i lista zmian.

1. Wypchnij zmiany na `main` i poczekaj, aż **CI** będzie zielone.
2. W katalogu głównym:
   ```bash
   npm run release -- --dry-run     # podgląd: nowy numer i wpis do CHANGELOG.md
   npm run release                  # wydanie
   ```
   Skrypt (`scripts/release.mjs`) wykonuje kolejno:

   | Krok | Co robi                                                                                                         |
   |------|-----------------------------------------------------------------------------------------------------------------|
   | 1    | sprawdza, czy jesteś na `main`, bez niezacommitowanych zmian i bez zaległości wobec `origin`                     |
   | 2    | wylicza numer z commitów od ostatniego tagu: `feat` → minor, pozostałe → patch, `!` lub `BREAKING CHANGE` → major (przed 1.0.0: minor) |
   | 3    | wpisuje numer w `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock` i `deploy/kubernetes.yaml`; dopisuje sekcję w `CHANGELOG.md` |
   | 4    | przebudowuje `dist/` i uruchamia wszystkie testy; gdy coś nie przejdzie, cofa zmiany w plikach                   |
   | 5    | tworzy commit `chore(release): X.Y.Z` i tag `X.Y.Z`                                                             |
   | 6    | pyta o push i wypycha gałąź z tagiem razem (`git push --atomic`)                                                 |

   Numer możesz podać wprost: `npm run release -- minor` (albo `patch`, `major`, `1.2.3`). `--yes` wypycha bez pytania, a `--skip-tests` pomija testy.
3. Poczekaj na workflow **Release**. Szkic wydania ma listę zmian z `CHANGELOG.md` i instrukcję instalacji. Przejrzyj go i opublikuj. Publikacja uruchamia workflow **Pages**, który wystawia edytor tej wersji pod `https://<właściciel>.github.io/<repo>/`, i **Docker**, który wypycha obraz do `ghcr.io`.

Jeśli nie zgodzisz się na push, commit i tag zostają lokalnie. Skrypt podpowie wtedy, jak je wypchnąć później albo wycofać.

Pierwszy obraz w `ghcr.io` może powstać jako prywatny pakiet. Wtedy raz zmień widoczność: profil → Packages → `flowgraph` → Package settings → Change visibility → **Public**.

Pages trzeba raz włączyć i pozwolić na publikację z tagów (środowisko `github-pages` domyślnie przyjmuje tylko gałąź główną, a workflow uruchamia się na tagu wydania):

```bash
gh api -X POST repos/<właściciel>/<repo>/pages -f build_type=workflow
gh api -X POST repos/<właściciel>/<repo>/environments/github-pages/deployment-branch-policies \
  -f name='[0-9]*.[0-9]*.[0-9]*' -f type=tag
```

To samo w przeglądarce: Settings → Pages → Source: **GitHub Actions**, potem Settings → Environments → `github-pages` → Deployment branches and tags → dodaj regułę dla tagów `[0-9]*.[0-9]*.[0-9]*`.

### Sekrety do podpisu i notaryzacji

Bez nich wydanie powstaje, ale `.dmg` jest niepodpisany, a opis wydania mówi, jak go otworzyć. Ustaw je w Settings → Secrets and variables → Actions (najlepiej w środowisku z wymaganym zatwierdzeniem):

| Sekret                       | Wartość                                                           |
|------------------------------|-------------------------------------------------------------------|
| `APPLE_CERTIFICATE`          | certyfikat Developer ID z kluczem: `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | hasło do pliku `.p12`                                             |
| `APPLE_SIGNING_IDENTITY`     | np. `Developer ID Application: Imię Nazwisko (TEAMID)`            |
| `APPLE_ID`                   | adres konta Apple Developer                                       |
| `APPLE_PASSWORD`             | hasło dla aplikacji (nie hasło do Apple ID)                       |
| `APPLE_TEAM_ID`              | 10-znakowy Team ID                                                |

Lokalnie wydanie budujesz tak samo: punkt 3.3 (podpis) i 3.4 (`.dmg`).

### Dobre praktyki zastosowane w workflowach

- akcje przypięte do pełnych SHA commitów, obraz bazowy Dockera do digestu (Dependabot w `.github/dependabot.yml` co tydzień proponuje aktualizacje akcji, npm, Cargo i obrazu, z opisami `ci(deps)` / `build(deps)`);
- domyślne uprawnienia tylko do odczytu; zapis (`contents: write`) ma wyłącznie zadanie tworzące wydanie;
- `persist-credentials: false` przy checkout, brak `pull_request_target`;
- sekrety trafiają tylko do kroków, które ich potrzebują;
- opisy commitów w formacie Conventional Commits, sprawdzane hookiem `commit-msg` i w każdym pull requeście; z nich powstaje numer wersji i lista zmian;
- wydanie powstaje jako szkic z listą zmian z `CHANGELOG.md` i wymaga ręcznej publikacji;
- sumy SHA-256 i poświadczenie pochodzenia (`gh attestation verify <plik.dmg> --repo <właściciel>/<repo>`); w prywatnym repo na planie Free GitHub go nie wystawia, więc workflowy wtedy ten krok pomijają;
- limity czasu zadań i `concurrency`, żeby nie dublować uruchomień.

## 5. Diagnostyka

| Co                             | Gdzie / jak                                                                                                                                                                                    |
|--------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Dziennik aplikacji             | `~/Library/Logs/dev.flowgraph.editor/app.log` (start, błędy JS, przeładowania pliku)                                                                                                           |
| Autotest w silniku WebKit      | `open --env FLOWGRAPH_SELFTEST=1 -a "$PWD/src-tauri/target/release/bundle/macos/FlowGraph.app" ../examples/c4-2-kontenery.yml`, a potem `tail -30 ~/Library/Logs/dev.flowgraph.editor/app.log` |
| Narzędzia deweloperskie strony | w `npm run dev`: prawy klik w oknie → Inspect Element                                                                                                                                          |
| Środowisko Tauri               | `npm run tauri -- info`                                                                                                                                                                        |

Autotest sprawdza rysowanie grafu, fonty, eksport SVG i PNG, okno Mermaid, historię i menu eksportu. Każdy wiersz w dzienniku zaczyna się od `OK` albo `BŁĄD`.

**Znane problemy:**

| Objaw                                                       | Przyczyna i rozwiązanie                                                                                                                                               |
|-------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `rustc 1.88 is not supported` / błędy kompilacji zależności | za stary Rust; `rust-toolchain.toml` wymusza 1.91.0, sprawdź `rustup show` w `src-tauri/`                                                                             |
| `rustup update stable` kończy się błędem komponentu `cargo` | uszkodzona instalacja `stable`; nie przeszkadza w budowaniu, bo projekt używa 1.91.0. Naprawa: `rustup toolchain uninstall stable && rustup toolchain install stable` |
| macOS mówi, że aplikacja jest „uszkodzona”                  | aplikacja niepodpisana i pobrana z internetu; patrz punkt 3.6                                                                                                         |
| `spctl` zwraca `rejected`                                   | brak notaryzacji albo podpis certyfikatem *Apple Development*; patrz punkty 3.1–3.3                                                                                   |
| ⌘Q zamyka bez pytania o niezapisane zmiany                  | znane ograniczenie; pyta tylko zamknięcie okna. Zmiany zostają w historii                                                                                             |
| Eksport SVG bez fontów IBM Plex                             | fonty są pobierane z Google Fonts, więc potrzebny jest internet                                                                                                       |
