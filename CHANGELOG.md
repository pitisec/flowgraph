# Zmiany

Wszystkie istotne zmiany w FlowGraph. Plik uzupełnia `npm run release` na podstawie commitów w formacie [Conventional Commits](https://www.conventionalcommits.org/pl/v1.0.0/).

## [0.10.7](https://github.com/pitisec/flowgraph/compare/0.10.5...0.10.7) (2026-11-08)

Zmiany techniczne bez wpływu na działanie (zależności, budowanie, testy).

## [0.10.6](https://github.com/pitisec/flowgraph/compare/0.10.5...0.10.6) (2026-11-07)

### Poprawki

- **editor:** czytelny widok na telefonie (#6) ([90ec6df](https://github.com/pitisec/flowgraph/commit/90ec6df59bee654253875325218a7c7eae4a7111))
- **editor:** plik bez zmian nie jest „niezapisany” po restarcie (#5) ([2c1055e](https://github.com/pitisec/flowgraph/commit/2c1055ea0b9574c0b15308c2d7a4129b5ead68a4))
- **release:** pełne escapowanie numeru wersji w wyrażeniu regularnym ([86e6839](https://github.com/pitisec/flowgraph/commit/86e6839ab8281ff37708acaa1b3397474698e1aa))

### Dokumentacja

- SECURITY.md, prywatne zgłaszanie podatności ([056247e](https://github.com/pitisec/flowgraph/commit/056247efb06147a02b49f91ff27693060f8cd787))

## [0.10.5](https://github.com/pitisec/flowgraph/compare/0.10.4...0.10.5) (2026-11-07)

### Dokumentacja

- Docker i Kubernetes w README, uwaga o niepodpisanej aplikacji ([49132c7](https://github.com/pitisec/flowgraph/commit/49132c7d2172efcd32a3a9eb074ced283e129f03))

## 0.10.4 (2026-11-07)

Pierwsze publiczne wydanie.

### Nowe funkcje

- grafy przepływów z pliku YAML: automatyczny układ, osobny kolor dla każdego przepływu, rozgałęzienia, grupy, notatki i model C4
- samodzielne strony HTML z legendą, opisami, zoomem, motywami i eksportem obrazu (PNG, SVG, JPG)
- edytor WYSIWYG: struktura, podgląd i właściwości, rysowanie ścieżek klikaniem, przeciąganie węzłów, karty, historia zmian, panel YAML
- import i eksport Mermaid `flowchart` bez utraty przepływów
- aplikacja na macOS (Apple Silicon i Intel): okna systemowe, menu, ostatnie pliki, otwieranie z Findera i przeładowanie po zmianie pliku na dysku
- edytor online na GitHub Pages i obraz Dockera z manifestem Kubernetes
