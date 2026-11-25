import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertDisposableHome, dshChildEnv } from "./support/dsh-home.js";
import { repoRoot, userDshHome } from "./support/paths.js";

test("each DSH child gets a new home and drops inherited provider paths", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "dsh-provider-env-"));
  const previousHome = process.env.DSH_HOME;
  const previousLogins = process.env.DSH_PROVIDER_LOGINS_DIR;
  process.env.DSH_HOME = path.join(repoRoot, "temp", "dsh-test-home");
  process.env.DSH_PROVIDER_LOGINS_DIR = path.join(os.homedir(), ".dsh-provider", "logins");
  try {
    const env = dshChildEnv(home, { DSH_PROVIDER_PROFILES_DIR: path.join(home, "custom-profiles") });
    assert.equal(env.DSH_HOME, home);
    assert.equal(env.DSH_PROVIDER_PROFILES_DIR, path.join(home, "custom-profiles"));
    assert.equal(env.DSH_PROVIDER_LOGINS_DIR, path.join(home, "provider-logins"));
    assert.equal(env.DSH_PROVIDER_ACCOUNTS_DIR, path.join(home, "provider-accounts"));
    assert.equal(String(env.DSH_PROVIDER_LOGINS_DIR).includes(`${path.sep}.dsh-provider${path.sep}`), false);
    assert.throws(() => assertDisposableHome(userDshHome()), /real DSH home/);
    assert.throws(() => assertDisposableHome(path.join(repoRoot, "temp", "dsh-test-home")), /reused preview home/);
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    if (previousLogins === undefined) delete process.env.DSH_PROVIDER_LOGINS_DIR;
    else process.env.DSH_PROVIDER_LOGINS_DIR = previousLogins;
    rmSync(home, { recursive: true, force: true });
  }
});
