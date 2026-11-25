import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deleteProfile,
  listProfiles,
  readSecret,
  saveProfile,
  setDefault,
} from "../src/profiles.js";

const root = mkdtempSync(path.join(tmpdir(), "dsh-profiles-"));
process.env.DSH_PROVIDER_PROFILES_DIR = root;

test.after(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.DSH_PROVIDER_PROFILES_DIR;
});

test("save masks the key and keeps it on update", () => {
  const saved = saveProfile({
    name: "DeepSeek",
    kind: "api",
    baseUrl: "https://api.deepseek.com/v1",
    api: "openai-completions",
    auth: "bearer",
    key: "sk-test-secret",
    model: "deepseek-v4-pro",
  });
  assert.equal(saved.hasKey, true);
  assert.equal(JSON.stringify(saved).includes("sk-test-secret"), false);
  assert.equal(readSecret(saved.id), "sk-test-secret");

  const updated = saveProfile({
    id: saved.id,
    name: "DeepSeek",
    kind: "api",
    baseUrl: "https://api.deepseek.com/v1",
    api: "openai-completions",
    auth: "bearer",
    model: "deepseek-v4-pro",
  });
  assert.equal(updated.hasKey, true);
  assert.equal(readSecret(saved.id), "sk-test-secret");
});

test("dummy auth drops the key and a second default clears the first", () => {
  const first = saveProfile({
    name: "Gateway",
    kind: "api",
    baseUrl: "https://example.com/v1",
    api: "openai-completions",
    auth: "bearer",
    key: "secret-one",
    model: "m",
  });
  setDefault(first.id);
  const local = saveProfile({
    name: "Ollama",
    kind: "local",
    baseUrl: "http://127.0.0.1:11434/v1",
    api: "openai-completions",
    auth: "bearer",
    key: "should-not-stick",
    model: "llama",
  });
  assert.equal(local.auth, "dummy");
  assert.equal(local.hasKey, false);
  assert.equal(readSecret(local.id), undefined);

  setDefault(local.id);
  const rows = listProfiles();
  assert.equal(rows.filter((row) => row.isDefault).length, 1);
  assert.equal(rows.find((row) => row.id === local.id)?.isDefault, true);
  assert.equal(rows.find((row) => row.id === first.id)?.isDefault, false);
});

test("delete removes the secret, search kind is stored, bad url throws", () => {
  const search = saveProfile({
    name: "Exa",
    kind: "search",
    baseUrl: "https://api.exa.ai",
    api: "openai-completions",
    auth: "bearer",
    key: "exa-secret",
    model: "",
  });
  assert.equal(search.kind, "search");
  assert.equal(readSecret(search.id), "exa-secret");
  deleteProfile(search.id);
  assert.equal(readSecret(search.id), undefined);
  assert.equal(listProfiles().some((row) => row.id === search.id), false);
  assert.throws(
    () =>
      saveProfile({
        name: "Bad",
        kind: "api",
        baseUrl: "ftp://example.com",
        api: "openai-completions",
        auth: "bearer",
        model: "m",
      }),
    /invalid baseUrl/,
  );
});

test("list is ordered by order then name", () => {
  const names = listProfiles().map((row) => row.name);
  const sorted = [...names].sort((a, b) => {
    const left = listProfiles().find((row) => row.name === a);
    const right = listProfiles().find((row) => row.name === b);
    return (left?.order ?? 0) - (right?.order ?? 0) || a.localeCompare(b);
  });
  assert.deepEqual(names, sorted);
});
