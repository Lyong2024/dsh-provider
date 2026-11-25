import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { loadCatalog } from "../src/profile-routes.js";
import {
  MAINSTREAM_PLUGINS,
  STABILITY_COUNT,
  pluginSeed,
  pluginSpec,
  shuffle,
} from "./support/contract.js";
import { addPlugin, authed, bootWeb, initWebProfile, pluginFileSpec, profilePackage } from "./support/dsh-home.js";
import { freshDirectory, homeStamp, userDshHome } from "./support/paths.js";

test(
  "provider plugin still serves the catalog after random mainstream plugins",
  { timeout: 900_000 },
  async () => {
    const userBefore = homeStamp(userDshHome());
    const home = freshDirectory("dsh-provider-stability-");
    const profiles = freshDirectory("dsh-provider-stability-profiles-");
    const accounts = freshDirectory("dsh-provider-stability-accounts-");
    const seed = pluginSeed();
    const selected = shuffle(MAINSTREAM_PLUGINS, seed).slice(0, STABILITY_COUNT);
    assert.equal(selected.length, STABILITY_COUNT);
    let booted: Awaited<ReturnType<typeof bootWeb>> | undefined;
    try {
      await initWebProfile(home);
      await addPlugin(home, pluginFileSpec);
      for (const plugin of selected) {
        await addPlugin(home, pluginSpec(plugin));
      }
      const dependencies = profilePackage(home).dependencies ?? {};
      assert.ok(dependencies["dsh-provider"]);
      for (const plugin of selected) {
        const installed = Object.keys(dependencies).some((name) => name === plugin.name);
        assert.equal(installed, true, pluginSpec(plugin));
      }
      booted = await bootWeb(home, {
        DSH_PROVIDER_PROFILES_DIR: profiles,
        DSH_PROVIDER_ACCOUNTS_DIR: accounts,
      });
      const output = booted.output();
      assert.equal(/dsh-provider[\s\S]{0,160}failed to import/.test(output), false, output);
      const response = await authed(booted.port, booted.token, "/api/dsh-provider/catalog");
      const payload = (await response.json()) as { ok?: boolean; value?: unknown[] };
      assert.equal(response.status, 200, `${response.status} ${JSON.stringify(payload)} seed=${seed}`);
      assert.equal(payload.ok, true);
      assert.equal(payload.value?.length, loadCatalog().length);
    } finally {
      await booted?.stop();
      rmSync(home, { recursive: true, force: true });
      rmSync(profiles, { recursive: true, force: true });
      rmSync(accounts, { recursive: true, force: true });
      const userAfter = homeStamp(userDshHome());
      assert.equal(userAfter.exists, userBefore.exists);
      assert.equal(userAfter.mtimeMs, userBefore.mtimeMs);
    }
  },
);
