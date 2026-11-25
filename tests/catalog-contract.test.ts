import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadCatalog } from "../src/profile-routes.js";
import { repoRoot } from "./support/paths.js";
import {
  ABSENT_IDS,
  EXTRA_API_IDS,
  FEATURE_IDS,
  KINDS,
  LOCAL_IDS,
  LOGIN_IDS,
  SEARCH_IDS,
  WIRES,
} from "./support/contract.js";

const catalog = loadCatalog();
const raw = JSON.parse(readFileSync(path.join(repoRoot, "lib", "provider-catalog.json"), "utf8")) as unknown[];

test("catalog loads every entry once and only the four wires", () => {
  assert.ok(catalog.length >= LOCAL_IDS.length + SEARCH_IDS.length + EXTRA_API_IDS.length + LOGIN_IDS.length);
  const ids = catalog.map((entry) => entry.id);
  assert.equal(raw.length, catalog.length);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of raw) {
    assert.equal(typeof entry, "object");
    assert.ok(entry !== null);
    assert.equal(Object.hasOwn(entry, "country"), false);
    assert.equal(Object.hasOwn(entry, "region"), false);
  }
  const names = catalog.map((entry) => entry.name);
  const sorted = [...names].sort((left, right) => left.localeCompare(right));
  assert.deepEqual(names, sorted);
  for (const entry of catalog) {
    assert.ok(KINDS.includes(entry.kind), `${entry.id} kind`);
    assert.ok(WIRES.includes(entry.api as (typeof WIRES)[number]), `${entry.id} wire ${entry.api}`);
    assert.equal(Object.hasOwn(entry, "country"), false, entry.id);
    assert.equal(Object.hasOwn(entry, "region"), false, entry.id);
  }
  assert.deepEqual(FEATURE_IDS.includes("no-geo"), true);
});

test("required provider groups are present and compat rules are absent", () => {
  const ids = new Set(catalog.map((entry) => entry.id));
  for (const id of [...LOCAL_IDS, ...SEARCH_IDS, ...EXTRA_API_IDS, ...LOGIN_IDS]) {
    assert.equal(ids.has(id), true, id);
  }
  for (const id of ABSENT_IDS) assert.equal(ids.has(id), false, id);
  for (const id of LOCAL_IDS) assert.equal(catalog.find((entry) => entry.id === id)?.kind, "local", id);
  for (const id of SEARCH_IDS) assert.equal(catalog.find((entry) => entry.id === id)?.kind, "search", id);
  for (const id of EXTRA_API_IDS) assert.equal(catalog.find((entry) => entry.id === id)?.kind, "api", id);
  for (const id of LOGIN_IDS) assert.equal(catalog.find((entry) => entry.id === id)?.kind, "login", id);
});
