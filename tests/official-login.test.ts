import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyOfficialLogin, listOfficialLogins, signOutOfficialLogin, startOfficialLogin } from "../src/official-login.js";
import { loadCatalog, profileBridgeRoutes, type BridgeRoute } from "../src/profile-routes.js";

const loginDir = mkdtempSync(path.join(os.tmpdir(), "dsh-provider-logins-"));
const previousLogins = process.env.DSH_PROVIDER_LOGINS_DIR;
process.env.DSH_PROVIDER_LOGINS_DIR = loginDir;
test.after(() => {
  if (previousLogins === undefined) delete process.env.DSH_PROVIDER_LOGINS_DIR;
  else process.env.DSH_PROVIDER_LOGINS_DIR = previousLogins;
  rmSync(loginDir, { recursive: true, force: true });
});

const loginIds = loadCatalog().filter((entry) => entry.kind === "login").map((entry) => entry.id);

test("every official login row has a real link, a visible failure, or a network start", () => {
  assert.ok(loginIds.length >= 29);
  for (const id of loginIds) {
    const offer = classifyOfficialLogin(id);
    if (offer.kind === "link") {
      const url = new URL(offer.url);
      assert.equal(url.protocol, "https:", id);
      assert.ok(offer.instructions.length > 0, id);
    } else if (offer.kind === "failed") {
      assert.equal("url" in offer, false, id);
      assert.ok(offer.message.length > 0, id);
    } else {
      assert.equal(offer.kind, "network", id);
    }
  }
});

test("browser sign-in links use the published endpoints and do not invent a google flow", () => {
  const anthropic = classifyOfficialLogin("anthropic");
  assert.equal(anthropic.kind, "link");
  if (anthropic.kind !== "link") return;
  const claude = new URL(anthropic.url);
  assert.equal(`${claude.origin}${claude.pathname}`, "https://claude.ai/oauth/authorize");
  assert.equal(claude.searchParams.get("redirect_uri"), "http://localhost:54545/callback");
  assert.equal(claude.searchParams.get("code_challenge_method"), "S256");
  assert.ok((claude.searchParams.get("code_challenge") ?? "").length >= 20);

  const codex = classifyOfficialLogin("openai-codex");
  assert.equal(codex.kind, "link");
  if (codex.kind !== "link") return;
  const openai = new URL(codex.url);
  assert.equal(openai.searchParams.get("redirect_uri"), "http://localhost:1455/auth/callback");
  assert.equal(openai.searchParams.get("originator"), "omp");

  const cline = classifyOfficialLogin("cline-pass");
  assert.deepEqual(cline, {
    kind: "link",
    url: "https://app.cline.bot/dashboard/account",
    instructions: "Create an API key in the Cline dashboard, then paste it on the API Key tab.",
  });

  for (const id of ["google", "google-antigravity", "antigravity-cli", "devin-cli"]) {
    const offer = classifyOfficialLogin(id);
    assert.equal(offer.kind, "failed", id);
    assert.equal("url" in offer, false, id);
  }
  const paused = classifyOfficialLogin("google-antigravity");
  assert.equal(paused.kind, "failed");
  if (paused.kind === "failed") assert.match(paused.message, /paused|暂停/u);
});

test("starting a console login returns the link and does not call the network", async () => {
  const view = await startOfficialLogin("cline-pass", {
    fetch: () => Promise.reject(new Error("network")),
  });
  assert.equal(view.phase, "link");
  assert.equal(view.url, "https://app.cline.bot/dashboard/account");
  assert.equal(JSON.stringify(view).includes("access_token"), false);

  const google = await startOfficialLogin("google");
  assert.equal(google.phase, "failed");
  assert.equal(google.url, undefined);
  assert.match(google.message ?? "", /API key|密钥/);
});

test("a saved sign-in is listed without the token and sign-out clears it", () => {
  writeFileSync(path.join(loginDir, "cline-pass.json"), JSON.stringify({ id: "cline-pass", access: "secret-token-value", refresh: "" }));
  const listed = listOfficialLogins();
  const saved = listed.find((item) => item.id === "cline-pass");
  assert.equal(saved?.phase, "saved");
  assert.equal(JSON.stringify(listed).includes("secret-token-value"), false);
  const cleared = signOutOfficialLogin("cline-pass");
  assert.notEqual(cleared.phase, "saved");
  assert.equal(listOfficialLogins().some((item) => item.id === "cline-pass"), false);
});

test("the login route is loopback-only and does not echo a token", async () => {
  const denied = profileBridgeRoutes({ prefix: "/api/dsh-provider", isLoopback: () => false });
  const hidden = denied.find((route) => route.path.endsWith("/login"));
  assert.ok(hidden);
  const forbidden = await call(hidden, "POST", { id: "cline-pass" });
  assert.equal(forbidden.status, 403);

  const routes = profileBridgeRoutes({ prefix: "/api/dsh-provider", isLoopback: () => true });
  const route = routes.find((item) => item.path.endsWith("/login"));
  assert.ok(route);
  const started = await call(route, "POST", { id: "zhipu-coding-plan" });
  assert.equal(started.status, 200);
  const value = started.json.value as { url?: string; phase?: string };
  assert.equal(value.phase, "link");
  assert.equal(value.url, "https://bigmodel.cn/coding-plan/personal/overview");
  assert.equal(JSON.stringify(started.json).includes("access_token"), false);

  const rejected = await call(route, "POST", { id: "deepseek" });
  assert.equal(rejected.status, 400);

  writeFileSync(path.join(loginDir, "zhipu-coding-plan.json"), JSON.stringify({ id: "zhipu-coding-plan", access: "secret-token-value" }));
  const listed = await call(route, "GET");
  const rows = listed.json.value as { id?: string; phase?: string }[];
  assert.equal(rows.find((item) => item.id === "zhipu-coding-plan")?.phase, "saved");
  assert.equal(JSON.stringify(listed.json).includes("secret-token-value"), false);
  const signedOut = await call(route, "POST", { id: "zhipu-coding-plan", action: "sign-out" });
  assert.equal(signedOut.status, 200);
  assert.notEqual((signedOut.json.value as { phase?: string }).phase, "saved");
});

function call(
  route: BridgeRoute,
  method: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const request = {
    method,
    url: route.path,
    async *[Symbol.asyncIterator](): AsyncIterator<Buffer> {
      if (payload !== undefined) yield payload;
    },
  };
  let statusCode = 0;
  let raw = "";
  const sink = {
    get statusCode(): number {
      return statusCode;
    },
    set statusCode(value: number) {
      statusCode = value;
    },
    setHeader: () => undefined,
    end: (next?: string) => {
      raw = next ?? "";
    },
  };
  return Promise.resolve(route.handler(request, sink)).then(() => ({
    status: statusCode,
    json: JSON.parse(raw) as Record<string, unknown>,
  }));
}
