# Zmiany

Wszystkie istotne zmiany w FlowGraph. Plik uzupełnia `npm run release` na podstawie commitów w formacie [Conventional Commits](https://www.conventionalcommits.org/pl/v1.0.0/).

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
