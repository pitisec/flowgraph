#!/usr/bin/env node
// Nowa wersja jednym poleceniem: numer we wszystkich plikach, CHANGELOG.md z commitów (Conventional Commits),
// świeży dist/, testy, commit „chore(release): X.Y.Z”, tag X.Y.Z i (po potwierdzeniu) push.
// Resztę robi GitHub: workflow Release buduje .dmg i szkic wydania. Szczegóły: app/BUDOWANIE.md, sekcja 4.
//
//   npm run release                 # numer wyliczony z commitów: feat → minor, fix i inne → patch, ! → major
//   npm run release -- minor        # albo wprost: patch | minor | major | 1.2.3
//   npm run release -- --dry-run    # tylko pokaż, co by się stało
//   npm run release -- --yes        # wypchnij bez pytania
//   npm run release -- --skip-tests # bez testów (np. gdy przeszły przed chwilą)
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parse, bumpType, nextVersion, changelogSection, insertChangelog } from "./lib/conventional.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRANCH = "main";
const FILES = {
  npm: "app/package.json", // źródło wersji; tauri.conf.json wskazuje na ten plik
  lock: "app/package-lock.json",
  cargo: "app/src-tauri/Cargo.toml",
  cargoLock: "app/src-tauri/Cargo.lock",
  kube: "deploy/kubernetes.yaml",
  changelog: "CHANGELOG.md",
};

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const how = args.find(a => !a.startsWith("--"));
const DRY = flag("--dry-run"), YES = flag("--yes"), SKIP_TESTS = flag("--skip-tests");
for (const a of args) {
  if (a.startsWith("--") && !["--dry-run", "--yes", "--skip-tests"].includes(a)) fail(`nieznana opcja ${a}`);
}

const c = process.stdout.isTTY ? { b: s => `\x1b[1m${s}\x1b[0m`, g: s => `\x1b[32m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m` }
                               : { b: s => s, g: s => s, y: s => s, r: s => s };
function fail(msg) { console.error(c.r(`release: ${msg}`)); process.exit(1); }
const step = s => console.log(`\n${c.b("==> " + s)}`);
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
function run(cmd, a, opts = {}) {
  const r = spawnSync(cmd, a, { cwd: ROOT, stdio: "inherit", ...opts });
  return r.status === 0;
}
function replaceOnce(file, re, value) {
  const s = read(file);
  if (!re.test(s)) fail(`nie znalazłem numeru wersji w ${file}`);
  write(file, s.replace(re, `$1${value}$2`));
}

// ---------- 1. Stan repozytorium ----------
step("Repozytorium");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== BRANCH) fail(`wydania robimy z gałęzi ${BRANCH} (teraz: ${branch})`);
if (git("status", "--porcelain")) fail("są niezacommitowane zmiany");
const remote = tryGit("remote", "get-url", "origin");
if (remote) {
  if (!run("git", ["fetch", "--quiet", "--tags", "origin", BRANCH])) fail("nie udało się pobrać stanu z origin");
  const behind = Number(git("rev-list", "--count", `HEAD..origin/${BRANCH}`));
  if (behind) fail(`origin/${BRANCH} ma ${behind} nowych commitów: najpierw git pull`);
} else {
  console.log(c.y("brak zdalnego repo „origin”: commit i tag powstaną tylko lokalnie"));
}
// linki w CHANGELOG i komunikatach: adres z package.json (origin może być adresem SSH albo kopią lokalną)
const repoUrl = (JSON.parse(read("package.json")).repository?.url || "").replace(/^git\+/, "").replace(/\.git$/, "") || null;

// ---------- 2. Commity od ostatniej wersji ----------
const current = JSON.parse(read(FILES.npm)).version;
const lastTag = tryGit("describe", "--tags", "--abbrev=0", "--match", "[0-9]*.[0-9]*.[0-9]*");
if (lastTag && lastTag !== current) fail(`ostatni tag ${lastTag} nie zgadza się z wersją ${current} w ${FILES.npm}`);
const log = git("log", "--format=%H%x1f%B%x1e", lastTag ? `${lastTag}..HEAD` : "HEAD");
const commits = log.split("\x1e").map(s => s.trim()).filter(Boolean).map(s => {
  const [hash, message] = s.split("\x1f");
  return { hash, header: message.split("\n")[0], parsed: parse(message) };
});
if (!commits.length) fail(`od wersji ${current} nie ma nowych commitów`);

console.log(`ostatnia wersja: ${current}${lastTag ? "" : " (bez tagu)"}, nowych commitów: ${commits.length}`);
for (const cm of commits) console.log(`  ${cm.hash.slice(0, 7)} ${cm.parsed ? cm.header : c.y(cm.header + "   ← nie Conventional Commits, pominięty w CHANGELOG")}`);

let version;
try { version = nextVersion(current, how || bumpType(commits, current)); } catch (e) { fail(e.message); }
console.log(`\nnowa wersja: ${c.b(version)}${how ? "" : ` (${bumpType(commits, current)}, wyliczone z commitów)`}`);
if (tryGit("rev-parse", "-q", "--verify", `refs/tags/${version}`)) fail(`tag ${version} już istnieje`);

const date = new Date().toISOString().slice(0, 10);
const section = changelogSection({ version, previous: lastTag, date, repoUrl, commits });
console.log("\n" + section.replace(/^/gm, "  │ "));

if (DRY) { console.log(c.y("--dry-run: niczego nie zmieniam")); process.exit(0); }

// ---------- 3. Pliki ----------
step(`Wersja ${version} w plikach`);
const rollback = () => {
  console.error(c.y("cofam zmiany w plikach…"));
  run("git", ["checkout", "--", "."]);
  if (!tryGit("ls-files", FILES.changelog)) fs.rmSync(path.join(ROOT, FILES.changelog), { force: true });
};
try {
  // package.json i oba wpisy w package-lock.json, bez sieci
  if (!run("npm", ["version", version, "--no-git-tag-version", "--allow-same-version"], { cwd: path.join(ROOT, "app"), stdio: "ignore" })) throw new Error("npm version");
  replaceOnce(FILES.cargo, /(\[package\][^[]*?\nversion = ")[^"]+(")/, version);
  replaceOnce(FILES.cargoLock, /(\nname = "flowgraph"\nversion = ")[^"]+(")/, version);
  replaceOnce(FILES.kube, /(image: ghcr\.io\/[^/]+\/flowgraph:)[^\s]+()/, version);
  const conf = JSON.parse(read("app/src-tauri/tauri.conf.json"));
  if (conf.version !== "../package.json") throw new Error(`tauri.conf.json: "version" powinno wskazywać "../package.json", jest "${conf.version}"`);
  write(FILES.changelog, insertChangelog(fs.existsSync(path.join(ROOT, FILES.changelog)) ? read(FILES.changelog) : "", section));
  console.log(git("status", "--short"));
} catch (e) { rollback(); fail(`zmiana plików: ${e.message}`); }

// ---------- 4. dist/ i testy ----------
step("dist/ (npm run build)");
if (!run("npm", ["run", "--silent", "build"])) { rollback(); fail("npm run build nie przeszedł"); }
if (SKIP_TESTS) console.log(c.y("--skip-tests: pomijam testy"));
else {
  step("Testy");
  if (!run("npm", ["test"])) { rollback(); fail("testy nie przeszły, nic nie zostało zacommitowane"); }
}

// ---------- 5. Commit i tag ----------
step("Commit i tag");
git("add", "-A");
git("commit", "--quiet", "-m", `chore(release): ${version}`);
git("tag", "-a", version, "-m", `FlowGraph ${version}`);
console.log(git("log", "--oneline", "--decorate", "-1"));

// ---------- 6. Push ----------
if (!remote) {
  console.log(c.y(`\nGotowe lokalnie. Po dodaniu origin: git push --atomic origin ${BRANCH} ${version}`));
  process.exit(0);
}
let go = YES;
if (!go) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  go = /^(t|tak|y|yes)$/i.test((await rl.question(`\nWypchnąć ${BRANCH} i tag ${version} do origin? Uruchomi to wydanie. [t/N] `)).trim());
  rl.close();
}
if (!go) {
  console.log(`\nNie wypycham. Później: ${c.b(`git push --atomic origin ${BRANCH} ${version}`)}`);
  console.log(`Wycofanie: git tag -d ${version} && git reset --hard HEAD~1`);
  process.exit(0);
}
step("Push");
if (!run("git", ["push", "--atomic", "origin", BRANCH, version])) fail("push się nie udał; commit i tag są lokalnie");
console.log(c.g(`\nWydanie ${version} ruszyło: ${repoUrl}/actions/workflows/release.yml`));
console.log(`Po zakończeniu przejrzyj szkic i kliknij „Publish release”: ${repoUrl}/releases`);
