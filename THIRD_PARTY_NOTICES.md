# Komponenty zewnętrzne

FlowGraph zawiera kod i korzysta z zasobów na poniższych licencjach. Biblioteki z `vendor/` są wklejane do generowanych stron HTML i do edytora.

| Komponent                                                          | Wersja | Gdzie                                              | Licencja                                                   |
|--------------------------------------------------------------------|--------|----------------------------------------------------|------------------------------------------------------------|
| [dagre](https://github.com/dagrejs/dagre)                          | 0.8.5  | `vendor/dagre.min.js`                              | MIT, Copyright (c) 2012-2014 Chris Pettitt                 |
| [graphlib](https://github.com/dagrejs/graphlib) (w pakiecie dagre) | 2.x    | `vendor/dagre.min.js`                              | MIT, Copyright (c) 2012-2014 Chris Pettitt                 |
| [lodash](https://github.com/lodash/lodash) (w pakiecie dagre)      | 4.x    | `vendor/dagre.min.js`                              | MIT, Copyright OpenJS Foundation and other contributors    |
| [js-yaml](https://github.com/nodeca/js-yaml)                       | 4.1.0  | `vendor/js-yaml.min.js`                            | MIT, Copyright (C) 2011-2015 by Vitaly Puzrin              |
| [IBM Plex Sans / Mono](https://github.com/IBM/plex)                | —      | pobierane z Google Fonts, osadzane w eksporcie SVG | SIL Open Font License 1.1                                  |
| [Tauri](https://tauri.app) i zależności Rust                       | 2.x    | aplikacja `app/`                                   | MIT lub Apache-2.0 (lista: `cargo tree` w `app/src-tauri`) |

## Licencja MIT (dagre, graphlib, lodash, js-yaml)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
