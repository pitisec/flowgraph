# Bezpieczeństwo

## Zgłaszanie podatności

Podatności **nie zgłaszaj w publicznym issue**. Użyj prywatnego zgłoszenia: zakładka **Security** → **Report a vulnerability** ([bezpośredni link](https://github.com/pitisec/flowgraph/security/advisories/new)). Zgłoszenie widzi tylko opiekun projektu.

Opisz:
- czego dotyczy problem: silnik i strony HTML, edytor, aplikacja na macOS, obraz Dockera, workflowy;
- jak go odtworzyć: najlepiej plik YAML lub Mermaid i kolejne kroki;
- jakie widzisz skutki.

Odpowiedź dostaniesz zwykle w ciągu kilku dni. Po naprawie wydamy nową wersję. Jeśli chcesz, wymienimy Cię w opisie poprawki.

## Wspierane wersje

Poprawki bezpieczeństwa trafiają do najnowszego wydania, starsze wersje ich nie dostają.

| Wersja            | Wspierana |
|-------------------|-----------|
| najnowsze wydanie | ✓         |
| starsze           | ✗         |

## Zakres

FlowGraph działa lokalnie: edytor i wygenerowane strony nie wysyłają danych na serwer. Obraz Dockera serwuje wyłącznie pliki statyczne. Szczególnie interesują nas:
- wykonanie skryptu z pliku YAML lub Mermaid (XSS w edytorze albo w wygenerowanej stronie);
- odczyt lub zapis plików poza wskazanymi przez użytkownika w aplikacji na macOS;
- problemy w łańcuchu wydań: workflowy, `.dmg`, obraz w ghcr.io.
