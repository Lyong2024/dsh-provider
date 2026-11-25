import assert from "node:assert/strict";
import test from "node:test";
import { loadCatalog } from "../src/profile-routes.js";
import { modelsForPlatform } from "../src/platform-models.js";

test("known official platforms expose their model lists and unknown ones stay empty", () => {
  const claude = modelsForPlatform("anthropic");
  assert.ok(claude.some((model) => model.id.startsWith("claude-")));
  assert.equal(modelsForPlatform("cursor").length, 0);
  assert.equal(modelsForPlatform("openai-codex").some((model) => model.id.startsWith("gpt-")), true);
  assert.equal(modelsForPlatform("google").some((model) => model.id.startsWith("gemini-")), true);
  const listed = loadCatalog().find((entry) => entry.id === "anthropic");
  assert.equal(listed?.models?.some((model) => model.id.startsWith("claude-")), true);
  assert.equal(loadCatalog().find((entry) => entry.id === "cursor")?.models, undefined);
});
