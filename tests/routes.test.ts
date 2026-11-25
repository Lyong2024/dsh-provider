import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { loadCatalog, profileBridgeRoutes, type BridgeRoute } from "../src/profile-routes.js";
import { freshDirectory } from "./support/paths.js";
import { startProbeServer, type ProbeServer } from "./support/probe-server.js";

interface FakeResponse {
  statusCode: number;
  body: string;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

function response(): FakeResponse {
  const sink: FakeResponse = {
    statusCode: 0,
    body: "",
    setHeader: () => undefined,
    end: (body?: string) => {
      sink.body = body ?? "";
    },
  };
  return sink;
}

async function call(
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
  const sink = response();
  await route.handler(request, sink);
  return { status: sink.statusCode, json: JSON.parse(sink.body) as Record<string, unknown> };
}

let server: ProbeServer;
let directory = "";

test.before(async () => {
  server = await startProbeServer();
  directory = freshDirectory("dsh-provider-routes-");
  process.env.DSH_PROVIDER_PROFILES_DIR = directory;
});

test.after(async () => {
  delete process.env.DSH_PROVIDER_PROFILES_DIR;
  rmSync(directory, { recursive: true, force: true });
  await server.close();
});

test("catalog and profile routes enforce loopback and the feature matrix", async () => {
  const denied = profileBridgeRoutes({ prefix: "/api/dsh-provider", isLoopback: () => false });
  const catalogDenied = denied.find((route) => route.path.endsWith("/catalog"));
  assert.ok(catalogDenied);
  const forbidden = await call(catalogDenied, "GET");
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.json.ok, false);

  const routes = profileBridgeRoutes({ prefix: "/api/dsh-provider", isLoopback: () => true });
  const catalogRoute = routes.find((route) => route.path.endsWith("/catalog"));
  const profileRoute = routes.find((route) => route.path.endsWith("/profiles"));
  assert.ok(catalogRoute);
  assert.ok(profileRoute);
  const listed = await call(catalogRoute, "GET");
  assert.equal(listed.status, 200);
  const value = listed.json.value;
  assert.ok(Array.isArray(value));
  assert.equal(value.length, loadCatalog().length);

  const saved = await call(profileRoute, "POST", {
    action: "save",
    name: "DeepSeek",
    presetId: "deepseek",
    kind: "api",
    baseUrl: server.url,
    api: "openai-completions",
    auth: "bearer",
    key: "sk-route-secret",
    model: "deepseek-v4-pro",
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(JSON.stringify(saved.json).includes("sk-route-secret"), false);
  const id = (saved.json.value as { id?: string }).id;
  assert.equal(typeof id, "string");

  const tested = await call(profileRoute, "POST", { action: "test", id });
  const probe = tested.json.value as { protocol?: { skipped?: boolean; ok?: boolean } };
  assert.equal(probe.protocol?.skipped, true);
  assert.equal(probe.protocol?.ok, false);
  assert.equal(server.seen.at(-1)?.authorization, undefined);
  assert.equal(server.seen.at(-1)?.body, "");

  const removed = await call(profileRoute, "POST", { action: "delete", id });
  assert.equal(removed.status, 200);
  const login = await call(profileRoute, "POST", {
    action: "save",
    name: "Claude",
    kind: "login",
    baseUrl: server.url,
    api: "anthropic-messages",
    auth: "bearer",
    model: "claude",
  });
  assert.equal(login.status, 400);
});
