# Jak współtworzyć FlowGraph

## Przygotowanie

```sh
npm ci && npx playwright install chromium   # npm ci włącza też hook sprawdzający opisy commitów
npm test
```

Budowanie aplikacji na macOS opisuje [app/BUDOWANIE.md](app/BUDOWANIE.md).

## Opisy commitów: Conventional Commits

Każdy commit opisujemy w formacie [Conventional Commits](https://www.conventionalcommits.org/pl/v1.0.0/):

```
typ(zakres): krótki opis w trybie rozkazującym albo jako nazwa zmiany

Opcjonalne szczegóły: co i dlaczego.

BREAKING CHANGE: opcjonalnie, gdy zmiana psuje zgodność (np. format pliku YAML)
```

| Typ        | Kiedy                                         | W CHANGELOG       | Wersja    |
|------------|-----------------------------------------------|-------------------|-----------|
| `feat`     | nowa funkcja                                  | Nowe funkcje      | minor     |
| `fix`      | poprawka błędu                                | Poprawki          | patch     |
| `perf`     | wydajność                                     | Wydajność         | patch     |
| `revert`   | cofnięcie wcześniejszej zmiany                | Cofnięte zmiany   | patch     |
| `docs`     | dokumentacja                                  | Dokumentacja      | patch     |
| `refactor` | zmiana kodu bez zmiany działania              | –                 | patch     |
| `test`     | testy                                         | –                 | patch     |
| `build`    | budowanie, zależności (Dependabot: `build(deps)`) | –             | patch     |
| `ci`       | GitHub Actions (Dependabot: `ci(deps)`)       | –                 | patch     |
| `chore`    | porządki; commity wydań `chore(release): X.Y.Z` | –               | patch     |
| `style`    | samo formatowanie                             | –                 | patch     |

- **Zakres** jest opcjonalny, małymi literami: `editor`, `engine`, `mermaid`, `cli`, `app`, `docker`, `release`…
- **`!`** po typie lub zakresie (`feat(app)!: …`) albo stopka `BREAKING CHANGE:` oznacza zmianę niekompatybilną: dostaje osobną sekcję w CHANGELOG i podbija wersję główną (przed 1.0.0: drugi numer).
- Nagłówek ma najwyżej 100 znaków.

Przykłady:

```
feat(editor): eksport do PDF
fix(engine): linie nie omijały ramek grup
docs: instalacja z Dockera
build(deps): dagre 0.8.6
```

Format sprawdzają:
- hook `commit-msg` (`.githooks/`, włączany przez `npm ci` albo `npm install`);
- CI w każdym pull requeście.

Hook w wyjątkowej sytuacji pominiesz przez `git commit --no-verify`.

## Wydanie

`npm run release` wylicza numer z commitów, uzupełnia [CHANGELOG.md](CHANGELOG.md), uruchamia testy, tworzy commit i tag, a po potwierdzeniu wypycha je. Resztę robi GitHub Actions. Szczegóły: [app/BUDOWANIE.md](app/BUDOWANIE.md), sekcja 4.
