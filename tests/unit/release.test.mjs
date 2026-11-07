// Conventional Commits: sprawdzanie opisów, wyliczanie wersji i CHANGELOG (scripts/lib/conventional.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, check, bumpType, nextVersion, changelogSection, insertChangelog, extractSection } from "../../scripts/lib/conventional.mjs";

test("parse: typ, zakres, opis, zmiana niekompatybilna", () => {
  assert.deepEqual(parse("feat(editor): eksport do PDF"), { type: "feat", scope: "editor", subject: "eksport do PDF", breaking: false });
  assert.deepEqual(parse("fix: literówka"), { type: "fix", scope: null, subject: "literówka", breaking: false });
  assert.equal(parse("feat(app)!: nowy format pliku").breaking, true);
  assert.equal(parse("refactor: x\n\nBREAKING CHANGE: inne API").breaking, true);
  assert.equal(parse("Dodaj eksport"), null);
  assert.equal(parse("feature: x"), null);
  assert.equal(parse("feat:brak spacji"), null);
  assert.equal(parse("feat(Editor): wielka litera w zakresie"), null);
});

test("check: komunikaty błędów, komentarze gita i commity automatyczne", () => {
  assert.equal(check("feat: ok\n\n# komentarz gita"), null);
  assert.equal(check("# komentarz\nfix(engine): ok"), null);
  assert.equal(check("Merge branch 'x'"), null);
  assert.equal(check('Revert "feat: x"'), null);
  assert.equal(check("fixup! feat: x"), null);
  assert.match(check("feature: x"), /nieznany typ „feature”/);
  assert.match(check("Poprawka"), /typ\(zakres\): opis/);
  assert.match(check("\n# tylko komentarz\n"), /pusty/);
  assert.match(check("feat: " + "x".repeat(100)), /najwyżej 100/);
});

const C = (msg, hash = "a".repeat(40)) => ({ hash, parsed: parse(msg) });

test("bumpType: feat → minor, fix → patch, ! → major (w 0.x minor)", () => {
  assert.equal(bumpType([C("fix: a"), C("docs: b")], "1.2.3"), "patch");
  assert.equal(bumpType([C("fix: a"), C("feat: b")], "1.2.3"), "minor");
  assert.equal(bumpType([C("feat!: a")], "1.2.3"), "major");
  assert.equal(bumpType([C("feat!: a")], "0.10.3"), "minor");
  assert.equal(bumpType([{ hash: "x", parsed: null }], "1.0.0"), "patch");
});

test("nextVersion: rodzaje podbicia i numer wprost", () => {
  assert.equal(nextVersion("0.10.3", "patch"), "0.10.4");
  assert.equal(nextVersion("0.10.3", "minor"), "0.11.0");
  assert.equal(nextVersion("0.10.3", "major"), "1.0.0");
  assert.equal(nextVersion("0.10.3", "0.12.0"), "0.12.0");
  assert.throws(() => nextVersion("0.10.3", "0.10.3"), /nie jest większa/);
  assert.throws(() => nextVersion("0.10.3", "0.9.9"), /nie jest większa/);
  assert.throws(() => nextVersion("0.10.3", "v1"), /patch, minor, major/);
});

test("changelogSection: grupy, zakresy, linki, pominięte typy", () => {
  const s = changelogSection({
    version: "0.11.0", previous: "0.10.3", date: "2026-11-07", repoUrl: "https://github.com/o/r",
    commits: [C("feat(editor): eksport PDF", "1".repeat(40)), C("fix: linie", "2".repeat(40)), C("chore: porządki"),
              C("feat!: nowy format", "3".repeat(40)), { hash: "4".repeat(40), parsed: null }],
  });
  assert.match(s, /^## \[0\.11\.0\]\(https:\/\/github\.com\/o\/r\/compare\/0\.10\.3\.\.\.0\.11\.0\) \(2026-11-07\)/);
  assert.match(s, /### ⚠ Zmiany niekompatybilne\n\n- nowy format \(\[3333333\]/);
  assert.match(s, /### Nowe funkcje\n\n- \*\*editor:\*\* eksport PDF \(\[1111111\]\(https:\/\/github\.com\/o\/r\/commit\/1{40}\)\)/);
  assert.match(s, /### Poprawki\n\n- linie/);
  assert.doesNotMatch(s, /porządki/);
  assert.equal(s.match(/nowy format/g).length, 1); // nie dubluje się w „Nowe funkcje”

  const empty = changelogSection({ version: "0.10.4", previous: null, date: "2026-11-07", repoUrl: null, commits: [C("chore: x")] });
  assert.match(empty, /^## 0\.10\.4 \(2026-11-07\)\n\nZmiany techniczne/);
});

test("CHANGELOG: wstawianie na górę i wycinanie sekcji do opisu wydania", () => {
  const a = insertChangelog("", "## 0.1.0 (d)\n\n- a\n");
  assert.match(a, /^# Zmiany\n/);
  const b = insertChangelog(a, "## [0.2.0](u) (d)\n\n- b\n");
  assert.ok(b.indexOf("0.2.0") < b.indexOf("0.1.0"));
  assert.equal(extractSection(b, "0.2.0"), "- b");
  assert.equal(extractSection(b, "0.1.0"), "- a");
  assert.equal(extractSection(b, "0.3.0"), null);
  assert.equal(extractSection("## 0.10.0 (d)\n\n- x\n## 0.1.0 (d)\n- y", "0.1.0"), "- y"); // 0.1.0 ≠ 0.10.0
});
