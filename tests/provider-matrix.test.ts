import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { registersAsChatModel } from "../src/profile-policy.js";
import { loadCatalog, type CatalogEntry } from "../src/profile-routes.js";
import {
  deleteProfile,
  listProfiles,
  readSecret,
  saveProfile,
  setDefault,
  probeProfile,
} from "../src/profiles.js";
import { WIRES } from "./support/contract.js";
import { freshDirectory } from "./support/paths.js";
import { startProbeServer, type ProbeServer } from "./support/probe-server.js";

const catalog = loadCatalog();
let server: ProbeServer;

test.before(async () => {
  server = await startProbeServer();
});

test.after(async () => {
  await server.close();
});

function wireOf(entry: CatalogEntry): (typeof WIRES)[number] {
  const wire = WIRES.find((item) => item === entry.api);
  assert.ok(wire, `${entry.id} wire`);
  return wire;
}

test("every provider passes the same feature matrix", async (t) => {
  assert.ok(catalog.length > 0);
  for (const entry of catalog) {
    await t.test(entry.id, async () => {
      const wire = wireOf(entry);
      assert.equal(JSON.stringify(entry).includes("\"country\""), false);
      assert.equal(JSON.stringify(entry).includes("\"region\""), false);
      const directory = freshDirectory("dsh-provider-matrix-");
      const previous = process.env.DSH_PROVIDER_PROFILES_DIR;
      process.env.DSH_PROVIDER_PROFILES_DIR = directory;
      const before = server.seen.length;
      try {
        if (entry.kind === "login") {
          assert.equal(registersAsChatModel("api"), true);
          assert.throws(
            () =>
              saveProfile({
                name: entry.name,
                presetId: entry.id,
                kind: "login",
                baseUrl: server.url,
                api: wire,
                auth: "bearer",
                model: entry.id,
              }),
            /invalid kind/,
          );
          return;
        }
        const kind = entry.kind;
        const saved = saveProfile({
          name: entry.name,
          presetId: entry.id,
          kind,
          baseUrl: server.url,
          api: wire,
          auth: "bearer",
          key: `secret-${entry.id}`,
          model: entry.id,
        });
        assert.equal(saved.presetId, entry.id);
        assert.equal(saved.kind, kind);
        assert.equal(saved.api, wire);
        const published = JSON.stringify(saved);
        assert.equal(published.includes(`secret-${entry.id}`), false);
        if (kind === "local") {
          assert.equal(saved.auth, "dummy");
          assert.equal(saved.hasKey, false);
          assert.equal(readSecret(saved.id), undefined);
        } else {
          assert.equal(saved.hasKey, true);
          assert.equal(readSecret(saved.id), `secret-${entry.id}`);
        }
        assert.equal(registersAsChatModel(kind), kind !== "search");
        const other = saveProfile({
          name: "Other",
          kind: "local",
          baseUrl: server.url,
          api: "openai-completions",
          auth: "dummy",
          model: "other",
        });
        setDefault(saved.id);
        setDefault(other.id);
        const defaults = listProfiles().filter((row) => row.isDefault);
        assert.equal(defaults.length, 1);
        assert.equal(defaults[0]?.id, other.id);
        const probed = await probeProfile({ baseUrl: server.url });
        assert.equal(probed.protocol.ok, false);
        assert.equal(probed.protocol.skipped, true);
        assert.equal(probed.protocol.message, "skipped");
        assert.equal(probed.connectivity.ok, true);
        const hit = server.seen.slice(before).at(-1);
        assert.ok(hit, "probe request");
        assert.equal(hit?.authorization, undefined);
        assert.equal(hit?.apiKey, undefined);
        assert.equal(hit?.body, "");
        deleteProfile(saved.id);
        assert.equal(readSecret(saved.id), undefined);
        assert.equal(listProfiles().some((row) => row.id === saved.id), false);
      } finally {
        if (previous === undefined) delete process.env.DSH_PROVIDER_PROFILES_DIR;
        else process.env.DSH_PROVIDER_PROFILES_DIR = previous;
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
