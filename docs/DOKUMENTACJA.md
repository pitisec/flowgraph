# FlowGraph: dokumentacja

Pełny opis formatu, edytora, wiersza poleceń i aplikacji. Krótkie wprowadzenie jest w [README](../README.md).

## Wiersz poleceń

```sh
./flowgraph.py editor [plik.yml] --open      # edytor (dist/editor.html), opcjonalnie z wczytanym plikiem
./flowgraph.py render plik.yml --open        # YAML -> samodzielna strona HTML
./flowgraph.py example etl > moj.yml         # przykład: zamowienie | etl | ci-cd | helpdesk | rekrutacja | inteligentny-dom | c4-1-kontekst | c4-2-kontenery | c4-3-komponenty
./flowgraph.py to-mermaid plik.yml -o plik.mmd      # YAML -> Mermaid flowchart (wymaga node)
./flowgraph.py from-mermaid plik.mmd -o plik.yml    # Mermaid flowchart/graph -> YAML (wymaga node)
```

Wymaga `uv` (PyYAML instaluje się sam). Wynikowe pliki HTML działają bez serwera i bez internetu.

## Format

```yaml
title: Tytuł
subtitle: Opis pod tytułem
direction: LR            # LR | TB | RL | BT

colors:                  # opcjonalnie: własne nazwane kolory, używane jak wbudowane
  marka: "#ff5500"       # ten sam kolor w każdym motywie
  las: {light: "#22aa77", dark: "#55dd99"}   # osobno dla jasnego i ciemnego motywu

groups:                  # ramki wokół węzłów, mogą być zagnieżdżone (parent)
  - {id: dc, label: Centrum danych, color: blue}

nodes:                   # węzły użyte w przepływach, a niezdefiniowane, tworzą się same
  - id: core
    label: Rdzeń sieci
    sub: podpis
    group: dc
    color: orange        # blue orange purple green pink teal yellow red gray, nazwa z colors albo #rrggbb
    shape: box           # box | pill | ghost | db
    meta: {adres: 10.0.0.1}
    items: [10.0.0.0/8]
    pos: [400, 120]      # opcjonalnie: wymuszona pozycja środka węzła (reszta układa się automatycznie)

flows:                   # przepływ = ścieżka przez węzły
  - id: glowny
    label: Główny proces
    color: blue
    width: 3             # grubość linii
    style: solid         # solid | dashed | dotted
    arrow: triangle      # grot: triangle | open | circle | diamond | cross | none (bez grota)
    description: Opis po kliknięciu
    path:
      - start
      - {node: a, label: etykieta na strzałce}
      - [b, c, [d, e]]   # rozgałęzienie: gałęzie b, c oraz d→e
      - koniec           # następny krok łączy wszystkie gałęzie

edges:                   # opcjonalne pojedyncze krawędzie poza legendą
  - {from: a, to: b, label: tekst, style: dashed, arrow: none}

notes:
  - {title: Uwaga, text: Tekst, items: [punkt 1, punkt 2]}
```

Lista na początku ścieżki to wiele źródeł, które zbiegają się w jednym węźle.

Nazwy w `colors` to małe litery, cyfry i myślnik, nie mogą powtarzać wbudowanych. Kolor z `{light, dark}` zmienia się razem z motywem, tak jak wbudowana paleta. W edytorze kolory dokumentu są w ustawieniach grafu: dodawanie, zmiana nazwy (aktualizuje wszystkie elementy), osobny kolor dla ciemnego motywu i usuwanie (elementy zachowują kolor jako `#hex`). W każdym wyborze koloru kolory dokumentu są okrągłymi próbkami za wbudowanymi, a „＋” obok pola własnego koloru zapisuje go w palecie. Eksport do Mermaid przenosi paletę w komentarzu `%% fg:doc`, więc ponowny import odtwarza nazwy.

W edytorze pozycję ustawia się przeciągając węzeł (przyciąganie do siatki co 10 px). Niebieska kropka w rogu oznacza węzeł przypięty. „Przypnij wszystkie” w ustawieniach grafu zamraża cały bieżący układ.

Autorozmieszczenie:
- **cały graf**: „⟲ Rozmieść cały graf” odpina wszystkie węzły, więc algorytm układa wszystko od nowa;
- **jedna grupa**: „⟲ Rozmieść grupę” (w ustawieniach grupy, opcjonalnie z innym kierunkiem) układa tylko węzły tej grupy i jej podgrup w miejscu, gdzie grupa była, i przypina je. Reszta ręcznego układu zostaje.

Przycisk „⟲ Rozmieść automatycznie” na pasku działa na zaznaczoną grupę albo, gdy żadna nie jest zaznaczona, na cały graf.

## Edytor

- **Zaznaczanie:** kliknięcie węzła, linii przepływu, grupy (w dowolnym miejscu ramki) albo notatki otwiera jej ustawienia w panelu właściwości. Kliknięcie tła wraca do ustawień grafu.
- **Dwuklik** na elemencie grafu, w legendzie albo w drzewie struktury otwiera zamknięty panel właściwości. **Shift + dwuklik** otwiera panel struktury, rozwija sekcję z tym elementem i przewija do niego.
- **Panel struktury:** sekcje (przepływy, węzły, grupy, notatki) można zwijać. Zwinięta sekcja z zaznaczonym elementem ma wyróżniony nagłówek, a gdy zaznaczony wiersz jest przewinięty poza widok, u góry albo u dołu panelu pojawia się strzałka, która do niego przewija.
- **Panele:** struktura po lewej i właściwości po prawej chowają się przyciskami przy krawędziach (⌘1 / ⌘3 w aplikacji); szerokość zmienia się przeciągnięciem krawędzi. YAML i historia zmian to zakładki pod grafem.
- **Pola wyboru:** kierunek grafu i grupy, styl linii i grot wybiera się ikonami. Listy (kształt węzła z podglądem, grupa, węzły w krokach przepływu) mają na długich listach pole szukania i obsługują klawiaturę: strzałki, Enter, Esc i pierwszą literę.
- **Rozgałęzienia** w ustawieniach przepływu są pokazane jako gałęzie A, B, C… z krokami i informacją, w którym kroku się łączą.

## Karty

Każdy otwarty plik ma własną kartę nad edytorem, z własną historią, zaznaczeniem i znacznikiem niezapisanych zmian (pomarańczowa kropka). Karty są na górnym pasku, w wolnym miejscu za przyciskami. „Otwórz” pozwala wybrać kilka plików naraz, a strzałka obok („Otwórz ▾”) ma też import z Mermaid. Ponowne otwarcie pliku, który już jest otwarty, przełącza na jego kartę. „Nowy”, przykłady i import z Mermaid otwierają się w nowej karcie. Pusta, nietknięta karta zostaje wykorzystana zamiast tworzenia kolejnej.

- przełączanie: klik, strzałki na pasku kart, Ctrl+Tab / Ctrl+Shift+Tab albo ⌘⇧[ i ⌘⇧];
- zamykanie: ✕ na karcie, środkowy przycisk myszy, Delete na zaznaczonej karcie, w aplikacji ⌘W (okno zamyka ⌘⇧W); karta z niezapisanymi zmianami najpierw pyta: „Zapisz” (domyślnie, Enter), „Anuluj” albo „Zamknij bez zapisywania”;
- kolejność: przeciągnij kartę w poziomie;
- ＋ albo dwuklik w puste miejsce paska otwiera nową kartę.

Otwarte karty zapamiętują się w przeglądarce i w aplikacji, więc po ponownym uruchomieniu wracają razem z niezapisanymi zmianami. W aplikacji można otworzyć kilka plików naraz z Findera albo przeciągając je na okno. Zmiany na dysku są śledzone dla pliku w aktywnej karcie, a pozostałe karty sprawdzają dysk przy przełączeniu na nie.

## Historia zmian

Zakładka z ikoną zegara pod grafem (na prawo od zakładki „YAML”; w aplikacji też ⌘Y) otwiera panel z listą zmian, tak jak panel YAML. Naraz jest otwarty jeden z nich. Cofnij i ponów są na górnym pasku. Panel pokazuje listę zmian z godziną i automatycznym opisem (np. „Węzeł „Kurier”: pozycja”). Kliknięcie wpisu przywraca stan po tej zmianie; cofnięte wpisy zostają na liście, dopóki nie zrobisz nowej zmiany. Każdy plik ma własną historię: po otwarciu pliku, przykładu albo nowego grafu lista pokazuje tylko jego zmiany, a po powrocie do wcześniejszego pliku jego historia wraca. Jeśli plik zmienił się poza edytorem, dochodzi wpis „Otwarto plik…”, więc dalej można cofnąć się do stanu sprzed zmian. „Zapisz” pod nową nazwą przenosi historię na nowy plik. Przeglądarka pamięta historie 20 ostatnio używanych dokumentów, po 120 ostatnich stanów każdy.

## Mermaid

„Eksportuj ▾ → Mermaid…” w edytorze pokazuje bieżący graf jako Mermaid `flowchart` i pozwala go skopiować albo zapisać jako `.mmd`. Import: „Otwórz ▾ → Z Mermaid…” (w aplikacji Plik → Importuj z Mermaid…) otwiera puste okno do wklejenia diagramu albo otwarcia pliku `.mmd`. Pliki `.mmd` można też otworzyć zwykłym „Otwórz”. Zaimportowany graf otwiera się w nowej karcie.

- **Eksport**: grupy stają się `subgraph`, kształty `([pigułka])` i `[(baza)]`, kolory i grubości `style` / `linkStyle`. Linie `%% fg:` zapisują przepływy z rozgałęzieniami, `meta`, `items` i `pos`, więc eksport i ponowny import dają ten sam graf.
- **Import zwykłego Mermaida**: krawędzie (`-->`, `-.->`, `==>`, `-- tekst -->`, `-->|tekst|`, `A & B --> C`) łączą się w przepływy przez węzły z jednym wejściem i jednym wyjściem o tym samym stylu. Obsługiwane są tylko schematy blokowe `flowchart` / `graph` (kierunek TB, TD, BT, LR albo RL). Przy innym diagramie (np. `sequenceDiagram`, `classDiagram`) albo pliku w innym formacie edytor pokazuje okno z listą obsługiwanych typów i nie zostawia pustej karty.

## Powiększenie

Nad grafem (w edytorze i w wygenerowanych stronach) są przyciski **−**, **procent** i **+**, od 20% do 300%. Kliknięcie procentu ustawia 100%. Ctrl/⌘ + kółko myszy, Shift + kółko (na gładziku Shift + dwa palce w górę i w dół) albo szczypanie na gładziku powiększa wokół kursora, więc punkt pod kursorem zostaje w miejscu. „Dopasuj do szerokości” wraca do automatycznego rozmiaru. W edytorze działają też skróty ⌘+ / ⌘− / ⌘0 (dopasuj), a w aplikacji te same pozycje są w menu Widok. Przeciąganie węzłów działa przy każdym powiększeniu. Pole grafu zajmuje wolne miejsce do dołu okna (w edytorze do dołu panelu) i dopasowuje się do jego wielkości. Graf przewija się w środku pola, więc powiększenie zmienia tylko zawartość, a nie rozmiar pola. Notatki są pod polem.

## Eksport obrazu

W edytorze eksporty są pod przyciskiem „Eksportuj ▾” na górnym pasku: HTML, Mermaid, PNG, SVG i JPG. YAML zapisuje przycisk „Zapisz” (⌘S) obok „Otwórz”: w Chrome i Edge nadpisuje otwarty plik na dysku (za pierwszym razem pyta o miejsce), w innych przeglądarkach pobiera plik .yml. Pomarańczowa kropka na przycisku oznacza niezapisane zmiany. W eksportowanej stronie HTML obraz pobiera się z listy „Pobierz obraz…” nad grafem. SVG składa się z prostych kształtów i tekstu, bez `foreignObject`, więc otwiera się też w Inkscape i Figmie. Fonty IBM Plex są osadzane w pliku, gdy jest internet. PNG i JPG mają podwójną rozdzielczość. Opcja „Przezroczyste tło” (w menu edytora, w HTML jako osobne pozycje listy) zapisuje PNG i SVG bez tła, np. do wklejenia na slajd. JPG zawsze ma tło. Zapisuje się to, co widać, łącznie z wyróżnionym przepływem i bieżącym motywem.

## C4

Przykłady `c4-1-kontekst`, `c4-2-kontenery`, `c4-3-komponenty` pokazują model C4 tym samym formatem: osoby jako pigułki, systemy zewnętrzne jako przerywane ramki, granice systemu i kontenera jako zagnieżdżone grupy, typ elementu w podpisie (`[Kontener: Spring Boot]`), protokoły jako etykiety na strzałkach. Przepływy to najważniejsze scenariusze.

## Aplikacja (macOS, Tauri)

Ten sam edytor jako aplikacja. W katalogu `app/`:

```sh
npm install            # raz: Tauri CLI
npm run dev            # uruchom w trybie deweloperskim
npm run build          # zbuduj FlowGraph.app i .dmg w src-tauri/target/release/bundle/
```

Z katalogu głównego to samo robi `npm run build-app`, które najpierw przebudowuje też `dist/` (edytor i strony przykładów).

Wymaga Rusta 1.90+ (projekt przypina 1.91.0 w `src-tauri/rust-toolchain.toml`, `rustup` doinstaluje go sam) i Xcode Command Line Tools. Edytor aplikacji (`app/dist/index.html`) składa się z plików w `src/` przy każdym `dev` i `build`.

Pełny opis budowania, wersji uniwersalnej (Apple Silicon i Intel), ikony, tła instalatora, podpisywania, notaryzacji, wydań (`npm run release`) i diagnostyki jest w [`app/BUDOWANIE.md`](../app/BUDOWANIE.md).

Co aplikacja dodaje do wersji przeglądarkowej:
- natywne okna „Otwórz” i „Zapisz jako”; „Zapisz” (⌘S) zawsze nadpisuje plik na dysku, także eksporty HTML, Mermaid i obrazy zapisują się tam, gdzie wskażesz;
- historia zmian przypisana do pełnej ścieżki pliku, więc pliki o tej samej nazwie w różnych katalogach się nie mieszają;
- obserwowanie pliku: zmiana na dysku (inny edytor, git) przeładowuje graf, a przy niezapisanych zmianach pyta;
- menu macOS: Plik (z „Otwórz ostatnie” i „Importuj z Mermaid…”), Edycja (⌘Y historia zmian), Widok (⌘1 struktura, ⌘2 YAML, ⌘3 właściwości);
- otwieranie z Findera: przeciągnięcie pliku na okno albo na ikonę, „Otwórz za pomocą”; pliki `.mmd` otwiera domyślnie, `.yml` tylko jako alternatywa, żeby nie przejąć wszystkich YAML-i w systemie;
- pytanie o niezapisane zmiany przy zamykaniu karty (⌘W), okna i aplikacji (⌘Q, „Zakończ” w Docku), z możliwością zapisania („Zapisz wszystkie”, gdy plików jest kilka);
- ekran startowy przy uruchomieniu; okno edytora otwiera się pod nim, a ekran znika po animacji.

Domyślny build nie jest podpisany kontem Apple Developer, więc przy pierwszym uruchomieniu na innym Macu system go zablokuje. Otwiera się go wtedy przez Ustawienia systemowe → Prywatność i ochrona → „Otwórz mimo to” (w starszych macOS: prawy klik → Otwórz). Podpis i notaryzację opisuje `app/BUDOWANIE.md`. Instalator `.dmg` ma własne tło (`app/dmg/`).

## Docker i Kubernetes

Obraz `ghcr.io/pitisec/flowgraph` serwuje edytor jako stronę główną i strony przykładów pod `/examples/`. Działa na nginx bez roota, na porcie 8080, dla `linux/amd64` i `linux/arm64`. Powstaje przy każdym wydaniu, z tagami `X.Y.Z`, `X.Y` i `latest`.

```sh
docker run --rm -p 8080:8080 ghcr.io/pitisec/flowgraph     # http://localhost:8080
docker build -t flowgraph .                                # własny obraz z bieżącego dist/
kubectl apply -f deploy/kubernetes.yaml                    # Deployment (2 repliki) i Service
```

Edytor działa w całości w przeglądarce: pliki otwiera i zapisuje lokalnie, a sesję trzyma w `localStorage`. Serwer niczego nie przechowuje, więc kontener może mieć system plików tylko do odczytu. Potrzebuje jedynie zapisywalnego `/tmp` (`--read-only --tmpfs /tmp`, w Kubernetes `emptyDir`). Manifest uruchamia go właśnie tak: bez uprawnień roota i bez dodatkowych capabilities, z sondami na `/healthz`. Ingress jest w pliku zakomentowany, do uzupełnienia własną domeną.

## Testy

```sh
npm ci                          # raz: Playwright
npx playwright install chromium # raz: przeglądarka do testów
npm test                        # jednostkowe (node --test) i end-to-end (Playwright)
npm run build                   # przebudowa dist/editor.html i dist/examples/*.html po zmianach w silniku
```

Testy jednostkowe (`tests/unit/`) sprawdzają silnik, konwerter Mermaid (eksport i import wszystkich przykładów bez strat), wiersz poleceń oraz wyliczanie wersji i CHANGELOG z commitów (Conventional Commits). Testy end-to-end (`tests/e2e/`) otwierają przykłady i edytor w Chromium: karty, edycję z historią, przeciąganie węzłów, YAML, Mermaid i przywracanie sesji. To samo uruchamia GitHub Actions przy każdym pushu. Wydania opisuje `app/BUDOWANIE.md`.

## Pliki

- `src/`: kod źródłowy
  - `flowgraph.js`, `flowgraph.css`: silnik rysujący i eksport obrazu, wspólny dla edytora i eksportu HTML
  - `mermaid.js`: konwerter do i z Mermaid (edytor i CLI przez node)
  - `editor-src.html`: źródło edytora
  - `viewer-shell.html`: szablon eksportowanej strony
- `flowgraph.py`: wiersz poleceń (`render`, `editor`, `example`, `to-mermaid`, `from-mermaid`); skleja pliki z `src/` i `vendor/` w samodzielne strony
- `dist/`: wynik budowania (`npm run build`), w repozytorium, żeby dało się otworzyć bez Pythona
  - `editor.html`: gotowy edytor w jednym pliku
  - `examples/*.html`: strony przykładów
- `app/`: aplikacja Tauri
  - `src-tauri/`: kod Rust (`src/main.rs`: pliki, obserwowanie zmian, menu, otwieranie z Findera, ekran startowy) i konfiguracja
  - `src/splash.html`: ekran startowy
  - `assets/`: ikona (`icon.svg` i wyrenderowany `icon.png`)
  - `dmg/`: tło i skrypty instalatora
  - `BUDOWANIE.md`: budowanie, podpisywanie i wydania
- `vendor/`: dagre 0.8.5 (układ grafu), js-yaml 4.1.0
- `examples/`: przykładowe grafy (źródła `.yml`)
- `Dockerfile`, `docker/nginx.conf`, `.dockerignore`: obraz z edytorem (nginx); `deploy/kubernetes.yaml`: Deployment i Service
- `scripts/`: `release.mjs` (`npm run release`), `commit-check.mjs` (opisy commitów, hook z `.githooks/`), `lib/conventional.mjs`
- `CHANGELOG.md`: zmiany w kolejnych wersjach; `CONTRIBUTING.md`: format commitów i wydania; `SECURITY.md`: zgłaszanie podatności
- `tests/`: testy jednostkowe i end-to-end; `.github/workflows/`: CI, wydania, GitHub Pages i obraz Dockera
- `docs/`: ta dokumentacja i zrzuty ekranu do README (`npm run screenshots` odświeża je skryptem `docs/screenshots/make.mjs`)
- `THIRD_PARTY_NOTICES.md`: licencje bibliotek zewnętrznych

## Licencja

MIT, patrz [`LICENSE`](../LICENSE). Licencje bibliotek zewnętrznych są w [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
