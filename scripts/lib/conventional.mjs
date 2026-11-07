// Conventional Commits (https://www.conventionalcommits.org/pl/v1.0.0/): sprawdzanie opisów commitów,
// wyliczanie następnej wersji i sekcja CHANGELOG.md. Używają tego scripts/release.mjs i scripts/commit-check.mjs.

export const TYPES = {
  feat: "nowa funkcja",
  fix: "poprawka błędu",
  perf: "wydajność",
  refactor: "zmiana kodu bez zmiany działania",
  docs: "dokumentacja",
  test: "testy",
  build: "budowanie, zależności",
  ci: "GitHub Actions",
  chore: "porządki, wydania",
  style: "formatowanie",
  revert: "cofnięcie zmiany",
};

// typ(zakres)!: opis
const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9][a-z0-9._/-]*)\))?(?<bang>!)?: (?<subject>\S.*)$/;

// Commity tworzone automatycznie przez gita, których nie sprawdzamy.
const AUTO = /^(Merge |Revert "|fixup! |squash! |amend! )/;

/** Rozbiera opis commita. Zwraca null, gdy nagłówek nie jest w formacie Conventional Commits. */
export function parse(message) {
  const [header = "", ...rest] = message.replace(/\r/g, "").split("\n");
  const m = HEADER.exec(header.trim());
  if (!m || !(m.groups.type in TYPES)) return null;
  const body = rest.join("\n");
  return {
    type: m.groups.type,
    scope: m.groups.scope || null,
    subject: m.groups.subject.trim(),
    breaking: Boolean(m.groups.bang) || /^BREAKING[ -]CHANGE: /m.test(body),
  };
}

/** Błąd do pokazania albo null, gdy opis jest poprawny (lub to commit automatyczny gita). */
export function check(message) {
  // linie z # to komentarze, które git dopisuje w edytorze
  const header = (message.replace(/\r/g, "").split("\n").find(l => l.trim() && !l.startsWith("#")) || "").trim();
  if (!header) return "pusty opis commita";
  if (AUTO.test(header)) return null;
  if (parse(header)) return header.length > 100 ? `nagłówek ma ${header.length} znaków (najwyżej 100)` : null;
  const m = /^([a-zA-Z]+)(\(|!?:)/.exec(header);
  if (m && !(m[1] in TYPES)) return `nieznany typ „${m[1]}”`;
  return "nagłówek nie ma postaci „typ(zakres): opis”";
}

export function help() {
  const w = Math.max(...Object.keys(TYPES).map(t => t.length));
  return [
    "Format: typ(zakres): opis       zakres jest opcjonalny, np. editor, engine, app, mermaid, docker",
    "        typ!: opis              ! = zmiana niekompatybilna (też stopka „BREAKING CHANGE: …”)",
    "Typy:",
    ...Object.entries(TYPES).map(([t, d]) => `  ${t.padEnd(w)}  ${d}`),
    "Przykłady:",
    "  feat(editor): eksport do PDF",
    "  fix(engine): linie nie omijały ramek grup",
    "  docs: opis instalacji z Dockera",
  ].join("\n");
}

/** Rodzaj podbicia wersji wynikający z commitów: "major" | "minor" | "patch". */
export function bumpType(commits, current) {
  const parsed = commits.map(c => c.parsed).filter(Boolean);
  const major = Number(current.split(".")[0]);
  // przed 1.0.0 zmiana niekompatybilna podbija tylko drugi numer (zwyczaj semver dla wersji 0.x)
  if (parsed.some(c => c.breaking)) return major === 0 ? "minor" : "major";
  if (parsed.some(c => c.type === "feat")) return "minor";
  return "patch";
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Następna wersja: "patch" | "minor" | "major" albo konkretny numer X.Y.Z (musi być większy). */
export function nextVersion(current, how) {
  const cur = SEMVER.exec(current);
  if (!cur) throw new Error(`niepoprawna bieżąca wersja: ${current}`);
  const [maj, min, pat] = cur.slice(1).map(Number);
  let next;
  if (how === "major") next = `${maj + 1}.0.0`;
  else if (how === "minor") next = `${maj}.${min + 1}.0`;
  else if (how === "patch") next = `${maj}.${min}.${pat + 1}`;
  else if (SEMVER.test(how)) next = how;
  else throw new Error(`nie rozumiem „${how}”: podaj patch, minor, major albo numer X.Y.Z`);
  const a = SEMVER.exec(next).slice(1).map(Number), b = [maj, min, pat];
  const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (cmp <= 0) throw new Error(`wersja ${next} nie jest większa niż ${current}`);
  return next;
}

const SECTIONS = [
  ["breaking", "⚠ Zmiany niekompatybilne"],
  ["feat", "Nowe funkcje"],
  ["fix", "Poprawki"],
  ["perf", "Wydajność"],
  ["revert", "Cofnięte zmiany"],
  ["docs", "Dokumentacja"],
];

/** Sekcja CHANGELOG.md dla wersji. commits: [{hash, parsed}] od najnowszego. */
export function changelogSection({ version, previous, date, repoUrl, commits }) {
  const title = previous && repoUrl
    ? `## [${version}](${repoUrl}/compare/${previous}...${version}) (${date})`
    : `## ${version} (${date})`;
  const out = [title];
  const line = c => {
    const scope = c.parsed.scope ? `**${c.parsed.scope}:** ` : "";
    const hash = c.hash.slice(0, 7);
    const link = repoUrl ? `[${hash}](${repoUrl}/commit/${c.hash})` : hash;
    return `- ${scope}${c.parsed.subject} (${link})`;
  };
  const ok = commits.filter(c => c.parsed);
  for (const [key, name] of SECTIONS) {
    const list = key === "breaking" ? ok.filter(c => c.parsed.breaking) : ok.filter(c => c.parsed.type === key && !c.parsed.breaking);
    if (list.length) out.push("", `### ${name}`, "", ...list.map(line));
  }
  if (out.length === 1) out.push("", "Zmiany techniczne bez wpływu na działanie (zależności, budowanie, testy).");
  return out.join("\n") + "\n";
}

/** Wstawia sekcję na górę CHANGELOG.md (pod nagłówek), tworząc plik, gdy go nie ma. */
export function insertChangelog(existing, section) {
  const head = "# Zmiany\n\nWszystkie istotne zmiany w FlowGraph. Plik uzupełnia `npm run release` na podstawie commitów w formacie [Conventional Commits](https://www.conventionalcommits.org/pl/v1.0.0/).\n";
  if (!existing || !existing.trim()) return `${head}\n${section}`;
  const i = existing.search(/^## /m);
  return i < 0 ? `${existing.trimEnd()}\n\n${section}` : `${existing.slice(0, i)}${section}\n${existing.slice(i)}`;
}

/** Wycina z CHANGELOG.md treść sekcji danej wersji (bez nagłówka), np. do opisu wydania. */
export function extractSection(changelog, version) {
  const re = new RegExp(`^## \\[?${version.replace(/\./g, "\\.")}\\]?[ (].*$`, "m");
  const m = re.exec(changelog);
  if (!m) return null;
  const rest = changelog.slice(m.index + m[0].length);
  const end = rest.search(/^## /m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}
