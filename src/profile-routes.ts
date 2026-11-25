// Loopback routes for the model-config page: catalog list and saved profiles.
// Connectivity probes do not send a credential or a chat completion.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deleteProfile,
  listProfiles,
  probeProfile,
  saveProfile,
  setDefault,
  type SaveProfileInput,
} from "./profiles.js";
import { listOfficialLogins, officialLoginStatus, signOutOfficialLogin, startOfficialLogin } from "./official-login.js";
import { modelsForPlatform } from "./platform-models.js";

const CATALOG_KINDS = new Set(["api", "login", "local", "search"]);

export interface CatalogEntry {
  id: string;
  name: string;
  kind: "api" | "login" | "local" | "search";
  api: string;
  env?: string;
  baseUrl?: string;
  models?: { id: string; name: string }[];
}

interface BridgeRequest {
  method?: string;
  url?: string;
  [Symbol.asyncIterator]: () => AsyncIterator<Uint8Array | string>;
}

interface BridgeResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

type Handler = (req: BridgeRequest, res: BridgeResponse) => void | Promise<void>;

export interface BridgeRoute {
  kind: "exact";
  path: string;
  handler: Handler;
}

export interface ProfileRouteDeps {
  prefix: string;
  isLoopback: (req: BridgeRequest) => boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bridgeJson(res: BridgeResponse, status: number, value: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
}

async function readJsonBody(req: BridgeRequest): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) return undefined;
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as unknown;
  } catch {
    return null;
  }
}

function catalogCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "provider-catalog.json"),
    join(here, "..", "lib", "provider-catalog.json"),
    join(here, "..", "src", "provider-catalog.json"),
  ];
}

export function loadCatalog(): CatalogEntry[] {
  const file = catalogCandidates().find((candidate) => existsSync(candidate));
  if (file === undefined) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const entries: CatalogEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.kind !== "string") continue;
    if (!CATALOG_KINDS.has(item.kind)) continue;
    if (item.kind !== "api" && item.kind !== "login" && item.kind !== "local" && item.kind !== "search") continue;
    const entry: CatalogEntry = {
      id: item.id,
      name: item.name,
      kind: item.kind,
      api: typeof item.api === "string" ? item.api : "openai-completions",
    };
    if (typeof item.env === "string" && item.env.length > 0) entry.env = item.env;
    if (typeof item.baseUrl === "string" && item.baseUrl.length > 0) entry.baseUrl = item.baseUrl;
    const models = modelsForPlatform(entry.id);
    if (models.length > 0) entry.models = models;
    entries.push(entry);
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

function saveInput(body: Record<string, unknown>): SaveProfileInput {
  const input: SaveProfileInput = {};
  if (typeof body.id === "string") input.id = body.id;
  if (typeof body.presetId === "string") input.presetId = body.presetId;
  if (typeof body.name === "string") input.name = body.name;
  if (typeof body.notes === "string") input.notes = body.notes;
  if (typeof body.kind === "string") input.kind = body.kind;
  if (typeof body.baseUrl === "string") input.baseUrl = body.baseUrl;
  if (typeof body.api === "string") input.api = body.api;
  if (typeof body.auth === "string") input.auth = body.auth;
  if (typeof body.key === "string") input.key = body.key;
  if (typeof body.model === "string") input.model = body.model;
  return input;
}

function loginId(req: BridgeRequest): string {
  try {
    return new URL(req.url ?? "", "http://127.0.0.1").searchParams.get("id") ?? "";
  } catch {
    return "";
  }
}

function guarded(deps: ProfileRouteDeps, handler: Handler): Handler {
  return (req, res) => {
    if (!deps.isLoopback(req)) {
      bridgeJson(res, 403, { ok: false, code: "forbidden", message: "loopback callers only" });
      return;
    }
    return handler(req, res);
  };
}

export function profileBridgeRoutes(deps: ProfileRouteDeps): BridgeRoute[] {
  return [
    {
      kind: "exact",
      path: `${deps.prefix}/catalog`,
      handler: guarded(deps, (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          bridgeJson(res, 405, { ok: false, code: "method_not_allowed", message: "catalog is GET" });
          return;
        }
        bridgeJson(res, 200, { ok: true, value: loadCatalog() });
      }),
    },
    {
      kind: "exact",
      path: `${deps.prefix}/profiles`,
      handler: guarded(deps, async (req, res) => {
        if (req.method === "GET" || req.method === "HEAD") {
          bridgeJson(res, 200, { ok: true, value: listProfiles() });
          return;
        }
        if (req.method !== "POST") {
          bridgeJson(res, 405, { ok: false, code: "method_not_allowed", message: "profiles is GET/POST" });
          return;
        }
        const body = await readJsonBody(req);
        if (!isRecord(body)) {
          bridgeJson(res, 400, { ok: false, code: "bad_json", message: "profiles body must be JSON" });
          return;
        }
        try {
          if (body.action === "save") {
            bridgeJson(res, 200, { ok: true, value: saveProfile(saveInput(body)) });
            return;
          }
          if (body.action === "delete") {
            if (typeof body.id !== "string") throw new Error("invalid profile id");
            deleteProfile(body.id);
            bridgeJson(res, 200, { ok: true, value: { id: body.id } });
            return;
          }
          if (body.action === "default") {
            if (typeof body.id !== "string") throw new Error("invalid profile id");
            bridgeJson(res, 200, { ok: true, value: setDefault(body.id) });
            return;
          }
          if (body.action === "test") {
            if (typeof body.id !== "string") throw new Error("invalid profile id");
            const profile = listProfiles().find((item) => item.id === body.id);
            if (profile === undefined) throw new Error("unknown profile");
            const result = await probeProfile(profile);
            bridgeJson(res, 200, { ok: true, value: result });
            return;
          }
          bridgeJson(res, 400, { ok: false, code: "bad_action", message: "unknown profiles action" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          bridgeJson(res, 400, { ok: false, code: "profiles_error", message });
        }
      }),
    },
    {
      kind: "exact",
      path: `${deps.prefix}/login`,
      handler: guarded(deps, async (req, res) => {
        if (req.method === "GET" || req.method === "HEAD") {
          const id = loginId(req);
          if (id.length === 0) {
            bridgeJson(res, 200, { ok: true, value: listOfficialLogins() });
            return;
          }
          const view = officialLoginStatus(id);
          if (view === undefined) {
            bridgeJson(res, 404, { ok: false, code: "login_unknown", message: "no login in progress" });
            return;
          }
          bridgeJson(res, 200, { ok: true, value: view });
          return;
        }
        if (req.method !== "POST") {
          bridgeJson(res, 405, { ok: false, code: "method_not_allowed", message: "login is GET/POST" });
          return;
        }
        const body = await readJsonBody(req);
        if (!isRecord(body) || typeof body.id !== "string") {
          bridgeJson(res, 400, { ok: false, code: "bad_json", message: "login body must name a catalog id" });
          return;
        }
        const entry = loadCatalog().find((item) => item.id === body.id);
        if (entry === undefined || entry.kind !== "login") {
          bridgeJson(res, 400, { ok: false, code: "login_kind", message: "official login is only for catalog login rows" });
          return;
        }
        if (body.action === "sign-out") {
          const view = signOutOfficialLogin(body.id);
          bridgeJson(res, 200, { ok: true, value: view });
          return;
        }
        const view = await startOfficialLogin(body.id);
        const packed = JSON.stringify(view);
        if (packed.includes("access_token") || packed.includes("refresh_token") || packed.includes("clientSecret")) {
          bridgeJson(res, 500, { ok: false, code: "login_leak", message: "login status refused to include a token" });
          return;
        }
        bridgeJson(res, 200, { ok: true, value: view });
      }),
    },
  ];
}
