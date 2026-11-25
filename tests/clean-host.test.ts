import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { loadCatalog } from "../src/profile-routes.js";
import { addPlugin, authed, bootWeb, initWebProfile, pluginFileSpec, profilePackage } from "./support/dsh-home.js";
import { freshDirectory, homeStamp, userDshHome } from "./support/paths.js";

test("clean web profile installs this plugin and serves the full catalog", { timeout: 180_000 }, async () => {
  const userBefore = homeStamp(userDshHome());
  const home = freshDirectory("dsh-provider-home-");
  const profiles = freshDirectory("dsh-provider-profiles-");
  const accounts = freshDirectory("dsh-provider-accounts-");
  let booted: Awaited<ReturnType<typeof bootWeb>> | undefined;
  try {
    await initWebProfile(home);
    await addPlugin(home, pluginFileSpec);
    const manifest = profilePackage(home);
    assert.equal(manifest.dependencies?.["dsh-provider"] !== undefined, true);
    assert.ok(manifest.dsh?.profile?.bundles?.includes("dsh-provider"));
    booted = await bootWeb(home, {
      DSH_PROVIDER_PROFILES_DIR: profiles,
      DSH_PROVIDER_ACCOUNTS_DIR: accounts,
    });
    const output = booted.output();
    assert.equal(/dsh-provider[\s\S]{0,180}failed to import/.test(output), false, output);
    assert.equal(/dsh-provider[\s\S]{0,80}did not activate/.test(output), false, output);
    const response = await authed(booted.port, booted.token, "/api/dsh-provider/catalog");
    const text = await response.text();
    const payload = JSON.parse(text) as { ok?: boolean; value?: unknown };
    assert.equal(response.status, 200, `${text}\n${output}`);
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.value));
    assert.equal(payload.value.length, loadCatalog().length);
    const client = await authed(booted.port, booted.token, "/");
    assert.equal(client.status, 200);
  } finally {
    await booted?.stop();
    rmSync(home, { recursive: true, force: true });
    rmSync(profiles, { recursive: true, force: true });
    rmSync(accounts, { recursive: true, force: true });
    const userAfter = homeStamp(userDshHome());
    assert.equal(userAfter.exists, userBefore.exists);
    assert.equal(userAfter.mtimeMs, userBefore.mtimeMs);
  }
});
