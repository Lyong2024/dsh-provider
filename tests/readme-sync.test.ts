import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ABSENT_IDS,
  DEFAULT_PLUGIN_SEED,
  DSH_VERSION,
  EXTRA_API_IDS,
  FEATURE_IDS,
  LOCAL_IDS,
  LOGIN_IDS,
  MAINSTREAM_PLUGINS,
  SEARCH_IDS,
  STABILITY_COUNT,
  pluginSpec,
  shuffle,
} from "./support/contract.js";
import { repoRoot } from "./support/paths.js";

const readme = readFileSync(path.join(repoRoot, "tests", "README.md"), "utf8");

test("README names every feature, required id, and pinned plugin", () => {
  for (const feature of FEATURE_IDS) assert.match(readme, new RegExp(`\`${feature}\``));
  for (const id of [...LOCAL_IDS, ...SEARCH_IDS, ...EXTRA_API_IDS, ...LOGIN_IDS, ...ABSENT_IDS]) {
    assert.match(readme, new RegExp(`\`${id}\``));
  }
  for (const plugin of MAINSTREAM_PLUGINS) assert.match(readme, new RegExp(pluginSpec(plugin).replaceAll("/", "\\/")));
  assert.match(readme, new RegExp(DSH_VERSION));
  assert.match(readme, new RegExp(String(STABILITY_COUNT)));
  assert.match(readme, new RegExp(String(DEFAULT_PLUGIN_SEED)));
  assert.match(readme, /未被写入/);
  assert.match(readme, /付费/);
  assert.match(readme, /协议步骤跳过|protocol-skipped/);
});

test("plugin shuffle is deterministic for the default seed", () => {
  const first = shuffle(MAINSTREAM_PLUGINS, DEFAULT_PLUGIN_SEED).map(pluginSpec);
  const second = shuffle(MAINSTREAM_PLUGINS, DEFAULT_PLUGIN_SEED).map(pluginSpec);
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, MAINSTREAM_PLUGINS.length);
  assert.ok(MAINSTREAM_PLUGINS.length > STABILITY_COUNT);
});
