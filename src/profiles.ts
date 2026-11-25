// Saved API-key, local-engine, and search profiles.
// Official logins are not stored here. Secrets stay out of list and save results.

import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const API_WIRES = [
  "anthropic-messages",
  "openai-completions",
  "openai-responses",
  "google-generative-ai",
] as const;
export type ApiWire = (typeof API_WIRES)[number];

export const PROFILE_KINDS = ["api", "local", "search"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export const AUTH_STYLES = ["bearer", "x-api-key", "dual", "dummy"] as const;
export type AuthStyle = (typeof AUTH_STYLES)[number];

export interface ProfileRecord {
  id: string;
  presetId: string;
  name: string;
  notes: string;
  kind: ProfileKind;
  baseUrl: string;
  api: ApiWire;
  auth: AuthStyle;
  model: string;
  order: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilePublic extends ProfileRecord {
  hasKey: boolean;
}

export interface SaveProfileInput {
  id?: string;
  presetId?: string;
  name?: string;
  notes?: string;
  kind?: string;
  baseUrl?: string;
  api?: string;
  auth?: string;
  key?: string;
  model?: string;
  order?: number;
}

export interface ProbeResult {
  connectivity: { ok: boolean; status: number | null; message: string };
  protocol: { ok: false; skipped: true; message: "skipped" };
}

interface StoreFile {
  profiles: ProfileRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is ProfileKind {
  return value === "api" || value === "local" || value === "search";
}

function isWire(value: unknown): value is ApiWire {
  return (
    value === "anthropic-messages" ||
    value === "openai-completions" ||
    value === "openai-responses" ||
    value === "google-generative-ai"
  );
}

function isAuth(value: unknown): value is AuthStyle {
  return value === "bearer" || value === "x-api-key" || value === "dual" || value === "dummy";
}

function tighten(target: string, mode: number): void {
  if (process.platform === "win32") return;
  try {
    chmodSync(target, mode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`could not restrict permissions on ${target}: ${message}`);
  }
}

export function profilesRoot(): string {
  const override = process.env.DSH_PROVIDER_PROFILES_DIR;
  if (typeof override === "string" && override.trim().length > 0) return override;
  return path.join(os.homedir(), ".dsh-provider", "profiles");
}

function ensureRoot(): string {
  const root = profilesRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  tighten(root, 0o700);
  const secrets = path.join(root, "secrets");
  mkdirSync(secrets, { recursive: true, mode: 0o700 });
  tighten(secrets, 0o700);
  return root;
}

function assertId(id: string): string {
  if (!ID_RE.test(id)) throw new Error("invalid profile id");
  return id;
}

function secretPath(id: string): string {
  const safe = assertId(id);
  const root = path.resolve(ensureRoot());
  const secretsDir = path.resolve(root, "secrets");
  const file = path.resolve(secretsDir, safe);
  if (file !== path.join(secretsDir, safe)) throw new Error("invalid profile id");
  return file;
}

function readStore(): StoreFile {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(ensureRoot(), "profiles.json"), "utf8"));
    if (!isRecord(raw) || !Array.isArray(raw.profiles)) return { profiles: [] };
    const profiles: ProfileRecord[] = [];
    for (const item of raw.profiles) {
      const parsed = parseStored(item);
      if (parsed !== undefined) profiles.push(parsed);
    }
    return { profiles };
  } catch {
    return { profiles: [] };
  }
}

function writeStore(store: StoreFile): void {
  const file = path.join(ensureRoot(), "profiles.json");
  writeFileSync(file, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  tighten(file, 0o600);
}

function parseStored(value: unknown): ProfileRecord | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !ID_RE.test(value.id)) return undefined;
  if (typeof value.name !== "string" || !isKind(value.kind) || !isWire(value.api) || !isAuth(value.auth)) {
    return undefined;
  }
  return {
    id: value.id,
    presetId: typeof value.presetId === "string" ? value.presetId : "",
    name: value.name,
    notes: typeof value.notes === "string" ? value.notes : "",
    kind: value.kind,
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
    api: value.api,
    auth: value.auth,
    model: typeof value.model === "string" ? value.model : "",
    order: typeof value.order === "number" && Number.isInteger(value.order) && value.order >= 0 ? value.order : 0,
    isDefault: value.isDefault === true,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) throw new Error("invalid name");
  return trimmed;
}

function assertBaseUrl(url: string): string {
  if (url.length === 0 || url.length > 300) throw new Error("invalid baseUrl");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("invalid baseUrl");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid baseUrl");
  return url;
}

function assertModel(model: string): string {
  if (model.length > 120) throw new Error("invalid model");
  return model;
}

function readSecretFile(id: string): string | undefined {
  try {
    const raw = readFileSync(secretPath(id), "utf8").trim();
    return raw.length > 0 ? raw : undefined;
  } catch {
    return undefined;
  }
}

function writeSecret(id: string, key: string): void {
  const file = secretPath(id);
  writeFileSync(file, key, { encoding: "utf8", mode: 0o600 });
  tighten(file, 0o600);
}

function removeSecret(id: string): void {
  rmSync(secretPath(id), { force: true });
}

function toPublic(record: ProfileRecord): ProfilePublic {
  return { ...record, hasKey: record.auth !== "dummy" && readSecretFile(record.id) !== undefined };
}

export function listProfiles(): ProfilePublic[] {
  return readStore()
    .profiles.slice()
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map(toPublic);
}

export function readSecret(id: string): string | undefined {
  if (!ID_RE.test(id)) return undefined;
  return readSecretFile(id);
}

export function saveProfile(input: SaveProfileInput): ProfilePublic {
  const kind = input.kind;
  if (!isKind(kind)) throw new Error("invalid kind");
  const api = input.api;
  if (!isWire(api)) throw new Error("invalid api");
  const auth = kind === "local" ? "dummy" : input.auth;
  if (!isAuth(auth)) throw new Error("invalid auth");
  const name = assertName(typeof input.name === "string" ? input.name : "");
  const baseUrl = assertBaseUrl(typeof input.baseUrl === "string" ? input.baseUrl : "");
  const model = assertModel(typeof input.model === "string" ? input.model : "");
  const notes = typeof input.notes === "string" ? input.notes.slice(0, 240) : "";
  const presetId = typeof input.presetId === "string" ? input.presetId.slice(0, 80) : "";
  const store = readStore();
  const now = new Date().toISOString();

  if (input.id !== undefined) {
    const id = assertId(input.id);
    const index = store.profiles.findIndex((item) => item.id === id);
    const current = index >= 0 ? store.profiles[index] : undefined;
    if (current === undefined) throw new Error("unknown profile");
    const next: ProfileRecord = {
      ...current,
      presetId,
      name,
      notes,
      kind,
      baseUrl,
      api,
      auth,
      model,
      updatedAt: now,
    };
    if (typeof input.order === "number" && Number.isInteger(input.order) && input.order >= 0) {
      next.order = input.order;
    }
    store.profiles[index] = next;
    if (auth === "dummy") removeSecret(id);
    else if (typeof input.key === "string" && input.key.trim().length > 0) writeSecret(id, input.key.trim());
    writeStore(store);
    return toPublic(next);
  }

  const id = randomUUID();
  const order = store.profiles.reduce((max, item) => Math.max(max, item.order), -1) + 1;
  const created: ProfileRecord = {
    id,
    presetId,
    name,
    notes,
    kind,
    baseUrl,
    api,
    auth,
    model,
    order,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
  store.profiles.push(created);
  if (auth !== "dummy" && typeof input.key === "string" && input.key.trim().length > 0) {
    writeSecret(id, input.key.trim());
  }
  writeStore(store);
  return toPublic(created);
}

export function setDefault(id: string): ProfilePublic {
  const safe = assertId(id);
  const store = readStore();
  const found = store.profiles.find((item) => item.id === safe);
  if (found === undefined) throw new Error("unknown profile");
  for (const item of store.profiles) item.isDefault = item.id === safe;
  writeStore(store);
  return toPublic(found);
}

export function deleteProfile(id: string): void {
  const safe = assertId(id);
  const store = readStore();
  const next = store.profiles.filter((item) => item.id !== safe);
  if (next.length === store.profiles.length) throw new Error("unknown profile");
  writeStore({ profiles: next });
  removeSecret(safe);
}

export async function probeProfile(profile: { baseUrl: string }): Promise<ProbeResult> {
  const protocol = { ok: false as const, skipped: true as const, message: "skipped" as const };
  let url: URL;
  try {
    url = new URL(profile.baseUrl);
  } catch {
    return { connectivity: { ok: false, status: null, message: "invalid baseUrl" }, protocol };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { connectivity: { ok: false, status: null, message: "invalid baseUrl" }, protocol };
  }
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });
    const ok = response.status > 0 && response.status < 500;
    return {
      connectivity: { ok, status: response.status, message: ok ? "reachable" : `status ${response.status}` },
      protocol,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreachable";
    return { connectivity: { ok: false, status: null, message }, protocol };
  }
}
