#!/usr/bin/env node
// Sprawdza opisy commitów (Conventional Commits).
//   node scripts/commit-check.mjs --file .git/COMMIT_EDITMSG   # hook commit-msg (.githooks/commit-msg)
//   node scripts/commit-check.mjs --range origin/main..HEAD    # zakres commitów, np. w CI dla pull requestu
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { check, help } from "./lib/conventional.mjs";

const [mode, value] = process.argv.slice(2);
let items;
if (mode === "--file" && value) {
  items = [{ id: "ten commit", message: fs.readFileSync(value, "utf8").split(/^# -+ >8 -+$/m)[0] }];
} else if (mode === "--range" && value) {
  const log = execFileSync("git", ["log", "--format=%h%x1f%B%x1e", value], { encoding: "utf8" });
  items = log.split("\x1e").map(s => s.trim()).filter(Boolean).map(s => {
    const [id, message] = s.split("\x1f");
    return { id, message };
  });
} else {
  console.error("użycie: commit-check.mjs --file <plik> | --range <od>..<do>");
  process.exit(2);
}

const bad = items.map(i => ({ ...i, err: check(i.message) })).filter(i => i.err);
for (const b of bad) console.error(`✗ ${b.id}: ${b.err}\n    ${b.message.split("\n")[0]}`);
if (bad.length) {
  console.error(`\n${help()}\n\nWięcej: CONTRIBUTING.md`);
  process.exit(1);
}
if (mode === "--range") console.log(`✓ ${items.length} commitów w formacie Conventional Commits`);
