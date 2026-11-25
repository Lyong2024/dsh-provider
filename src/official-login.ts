// Official sign-in for catalog rows whose kind is "login".
// The page shows the vendor URL and does not open it. A click on that link
// is the authorization step. Device and loopback grants finish in the background.
// The status payload never includes a token.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

export type LoginPhase = "link" | "waiting" | "saved" | "failed";

export interface LoginView {
  id: string;
  phase: LoginPhase;
  url?: string;
  instructions: string;
  userCode?: string;
  message?: string;
}

interface LoginDeps {
  fetch?: typeof fetch;
}

interface Grant {
  access: string;
  refresh: string;
  expiresAt?: number;
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const sessions = new Map<string, LoginView>();
const generation = new Map<string, number>();
const listeners = new Map<number, Server>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function loginsRoot(): string {
  return process.env.DSH_PROVIDER_LOGINS_DIR ?? join(homedir(), ".dsh-provider", "logins");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function callerFetch(deps?: LoginDeps): typeof fetch {
  return deps?.fetch ?? fetch;
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function bump(id: string): number {
  const next = (generation.get(id) ?? 0) + 1;
  generation.set(id, next);
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
  return next;
}

function current(id: string, token: number): boolean {
  return generation.get(id) === token;
}

function publish(id: string, view: Omit<LoginView, "id">): LoginView {
  const next: LoginView = { id, ...view };
  sessions.set(id, next);
  return next;
}

function failed(id: string, message: string): LoginView {
  return publish(id, { phase: "failed", instructions: "", message });
}

function tighten(target: string, mode: number): void {
  if (process.platform === "win32") return;
  chmodSync(target, mode);
}

function writeGrant(id: string, grant: Grant): void {
  const root = loginsRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  tighten(root, 0o700);
  const file = join(root, `${id}.json`);
  writeFileSync(file, JSON.stringify({ id, savedAt: new Date().toISOString(), ...grant }), { mode: 0o600 });
  tighten(file, 0o600);
}

function readGrant(id: string): Grant | undefined {
  if (!ID_PATTERN.test(id)) return undefined;
  const file = join(loginsRoot(), `${id}.json`);
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(parsed) || typeof parsed.access !== "string" || parsed.access.length === 0) return undefined;
    return {
      access: parsed.access,
      refresh: typeof parsed.refresh === "string" ? parsed.refresh : "",
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : undefined,
    };
  } catch {
    return undefined;
  }
}

function savedView(id: string): LoginView {
  return {
    id,
    phase: "saved",
    instructions: "Signed in on this machine. The grant stays in the login file and is not shown here.",
  };
}

function remembered(id: string): LoginView | undefined {
  const session = sessions.get(id);
  const grant = readGrant(id);
  if (grant !== undefined && session?.phase !== "waiting") return savedView(id);
  return session;
}

export function officialLoginStatus(id: string): LoginView | undefined {
  if (!ID_PATTERN.test(id)) return undefined;
  return remembered(id);
}

export function listOfficialLogins(): LoginView[] {
  const ids = new Set<string>();
  const root = loginsRoot();
  if (existsSync(root)) {
    for (const name of readdirSync(root)) {
      if (!name.endsWith(".json")) continue;
      ids.add(name.slice(0, -".json".length));
    }
  }
  for (const id of sessions.keys()) ids.add(id);
  const views: LoginView[] = [];
  for (const id of ids) {
    const view = remembered(id);
    if (view !== undefined) views.push(view);
  }
  return views;
}

/** Drops the saved grant and any in-progress sign-in for one catalog row. */
export function signOutOfficialLogin(id: string): LoginView {
  if (!ID_PATTERN.test(id)) return { id, phase: "failed", instructions: "", message: "Unknown login id." };
  bump(id);
  sessions.delete(id);
  const file = join(loginsRoot(), `${id}.json`);
  if (existsSync(file)) unlinkSync(file);
  return { id, phase: "link", instructions: "" };
}

function link(url: string, instructions: string): { kind: "link"; url: string; instructions: string } {
  return { kind: "link", url, instructions };
}

function deny(message: string): { kind: "failed"; message: string } {
  return { kind: "failed", message };
}

function network(): { kind: "network" } {
  return { kind: "network" };
}

type Offer =
  | { kind: "link"; url: string; instructions: string }
  | { kind: "failed"; message: string }
  | { kind: "network" };

const CONSOLE: Record<string, { url: string; instructions: string }> = {
  "alibaba-coding-plan": {
    url: "https://modelstudio.console.alibabacloud.com/",
    instructions: "Copy your API key, then paste it on the API Key tab. China console: https://bailian.console.aliyun.com/?tab=model#/api-key",
  },
  "alibaba-token-plan": {
    url: "https://home.qwencloud.com/billing/subscription/token-plan-individual",
    instructions: "Subscribe and copy the Token Plan key, then paste it on the API Key tab. China: https://www.aliyun.com/benefit/scene/tokenplan",
  },
  "cline-pass": {
    url: "https://app.cline.bot/dashboard/account",
    instructions: "Create an API key in the Cline dashboard, then paste it on the API Key tab.",
  },
  "minimax-code": {
    url: "https://platform.minimax.io/subscribe/token-plan",
    instructions: "Subscribe to Token Plan and copy your API key, then paste it on the API Key tab.",
  },
  "minimax-code-cn": {
    url: "https://platform.minimaxi.com/subscribe/token-plan",
    instructions: "Subscribe to Token Plan and copy your API key, then paste it on the API Key tab.",
  },
  "qwen-portal": {
    url: "https://chat.qwen.ai",
    instructions: "Copy your Qwen token or API key, then paste it on the API Key tab.",
  },
  "xiaomi-token-plan-ams": {
    url: "https://platform.xiaomimimo.com/console/plan-manage",
    instructions: "Copy your token-plan API key for the Europe region, then paste it on the API Key tab.",
  },
  "xiaomi-token-plan-cn": {
    url: "https://platform.xiaomimimo.com/console/plan-manage",
    instructions: "Copy your token-plan API key for the China region, then paste it on the API Key tab.",
  },
  "xiaomi-token-plan-sgp": {
    url: "https://platform.xiaomimimo.com/console/plan-manage",
    instructions: "Copy your token-plan API key for the Singapore region, then paste it on the API Key tab.",
  },
  "zhipu-coding-plan": {
    url: "https://bigmodel.cn/coding-plan/personal/overview",
    instructions: "Copy your API key from the Coding Plan dashboard, then paste it on the API Key tab.",
  },
};

/** Local description of a catalog login. Network rows are started by startOfficialLogin. */
export function classifyOfficialLogin(id: string): Offer {
  const consoleLogin = CONSOLE[id];
  if (consoleLogin !== undefined) return link(consoleLogin.url, consoleLogin.instructions);
  if (id === "google") {
    return deny("Google Gemini publishes no browser sign-in. Use an API key on the API Key tab. 这一项没有浏览器登录，请在 API Key 页粘贴密钥。");
  }
  if (id === "google-antigravity") {
    return deny("Google Antigravity is paused: third-party sign-in has suspended accounts. Use an API key. 已暂停，这里不会发起授权。");
  }
  if (id === "antigravity-cli") {
    return deny("The authorization URL is printed by the Antigravity CLI. This plugin does not launch that program. 授权链接只由 CLI 输出，插件不会启动它。");
  }
  if (id === "devin-cli") {
    return deny("Devin CLI has no browser authorization URL. Run devin auth login in that CLI, then retry there. 这一项没有浏览器授权链接。");
  }
  const built = buildAuthorize(id);
  if (built !== undefined) return link(built.url, built.instructions);
  if (NETWORK_IDS.has(id)) return network();
  return deny("This catalog row has no published sign-in. 这一项没有公开的登录链接。");
}

const NETWORK_IDS = new Set([
  "factory-droid",
  "github-copilot",
  "kimi-code",
  "kiro",
  "muse-code",
  "openai-codex-device",
  "xai-oauth",
]);

const LISTEN_IDS = new Set(["anthropic", "cursor", "devin", "devin-windsurf", "gitlab-duo", "openai-codex"]);

interface BuiltAuthorize {
  url: string;
  instructions: string;
  verifier: string;
  state: string;
  redirect: string;
  port: number;
  path: string;
}

function buildAuthorize(id: string): BuiltAuthorize | undefined {
  const pair = pkce();
  const state = randomUUID();
  if (id === "anthropic") {
    const redirect = "http://localhost:54545/callback";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
      redirect_uri: redirect,
      scope: "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload",
      code_challenge: pair.challenge,
      code_challenge_method: "S256",
      state,
      code: "true",
    });
    return {
      url: `https://claude.ai/oauth/authorize?${params.toString()}`,
      instructions: "Complete login in your browser. This page does not open the link.",
      verifier: pair.verifier,
      state,
      redirect,
      port: 54545,
      path: "/callback",
    };
  }
  if (id === "openai-codex") {
    const redirect = "http://localhost:1455/auth/callback";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      redirect_uri: redirect,
      scope: "openid profile email offline_access api.connectors.read api.connectors.invoke",
      code_challenge: pair.challenge,
      code_challenge_method: "S256",
      state,
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "omp",
    });
    return {
      url: `https://auth.openai.com/oauth/authorize?${params.toString()}`,
      instructions: "Complete login in your browser. This page does not open the link.",
      verifier: pair.verifier,
      state,
      redirect,
      port: 1455,
      path: "/auth/callback",
    };
  }
  if (id === "devin") {
    const redirect = "http://127.0.0.1:59653/callback";
    const params = new URLSearchParams({
      response_type: "code",
      redirect_uri: redirect,
      state,
      code_challenge: pair.challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return {
      url: `https://app.devin.ai/auth/cli/continue?${params.toString()}`,
      instructions: "Sign in to Devin in your browser. This page does not open the link.",
      verifier: pair.verifier,
      state,
      redirect,
      port: 59653,
      path: "/callback",
    };
  }
  if (id === "devin-windsurf") {
    const redirect = "http://127.0.0.1:59654/callback";
    const params = new URLSearchParams({
      response_type: "code",
      redirect_uri: redirect,
      state,
      code_challenge: pair.challenge,
      code_challenge_method: "S256",
      prompt: "login",
      redirect_parameters_type: "query",
    });
    return {
      url: `https://windsurf.com/editor/signin?${params.toString()}`,
      instructions: "Sign in with your Windsurf account. This page does not open the link.",
      verifier: pair.verifier,
      state,
      redirect,
      port: 59654,
      path: "/callback",
    };
  }
  if (id === "gitlab-duo") {
    const redirect = "http://localhost:8080/callback";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "da4edff2e6ebd2bc3208611e2768bc1c1dd7be791dc5ff26ca34ca9ee44f7d4b",
      redirect_uri: redirect,
      scope: "api",
      code_challenge: pair.challenge,
      code_challenge_method: "S256",
      state,
    });
    return {
      url: `https://gitlab.com/oauth/authorize?${params.toString()}`,
      instructions: "Complete GitLab login in your browser. This page does not open the link.",
      verifier: pair.verifier,
      state,
      redirect,
      port: 8080,
      path: "/callback",
    };
  }
  if (id === "gitlab-duo-agent") {
    const redirect = "vscode://gitlab.gitlab-workflow/authentication";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "36f2a70cddeb5a0889d4fd8295c241b7e9848e89cf9e599d0eed2d8e5350fbf5",
      redirect_uri: redirect,
      scope: "api",
      code_challenge: pair.challenge,
      code_challenge_method: "S256",
      state,
    });
    return {
      url: `https://gitlab.com/oauth/authorize?${params.toString()}`,
      instructions: "Complete GitLab login in your browser. The vendor sends the result to its editor scheme, so this page only shows the link.",
      verifier: pair.verifier,
      state,
      redirect,
      port: 0,
      path: "",
    };
  }
  if (id === "zai-coding-plan") {
    const redirect = "zcode://zai-auth/callback";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "client_P8X5CMWmlaRO9gyO-KSqtg",
      redirect_uri: redirect,
      state,
    });
    return {
      url: `https://chat.z.ai/api/oauth/authorize?${params.toString()}`,
      instructions: "Complete Z.ai login in your browser. The vendor callback is an app scheme, so this page only shows the link.",
      verifier: "",
      state,
      redirect,
      port: 0,
      path: "",
    };
  }
  if (id === "cursor") {
    const params = new URLSearchParams({
      challenge: pair.challenge,
      uuid: state,
      mode: "login",
      redirectTarget: "cli",
    });
    return {
      url: `https://cursor.com/loginDeepControl?${params.toString()}`,
      instructions: "Sign in to Cursor in your browser. This page does not open the link.",
      verifier: pair.verifier,
      state,
      redirect: "",
      port: 0,
      path: "",
    };
  }
  return undefined;
}

function closePort(port: number): Promise<void> {
  const server = listeners.get(port);
  if (server === undefined) return Promise.resolve();
  listeners.delete(port);
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function replyClosed(res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<!doctype html><p>You can close this window.</p>");
}

async function listenForCode(
  id: string,
  token: number,
  built: BuiltAuthorize,
  exchange: (code: string) => Promise<Grant>,
): Promise<void> {
  await closePort(built.port);
  await new Promise<void>((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!current(id, token)) {
        replyClosed(res);
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(req.url ?? "/", "http://127.0.0.1");
      } catch {
        replyClosed(res);
        return;
      }
      if (parsed.pathname !== built.path) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      replyClosed(res);
      const error = parsed.searchParams.get("error");
      if (error !== null) {
        publish(id, { phase: "failed", url: built.url, instructions: built.instructions, message: `Authorization was not granted (${error}).` });
        void closePort(built.port);
        return;
      }
      const code = parsed.searchParams.get("code") ?? "";
      const returned = parsed.searchParams.get("state") ?? "";
      if (code.length === 0 || returned !== built.state) {
        publish(id, { phase: "failed", url: built.url, instructions: built.instructions, message: "The callback did not include a matching authorization code." });
        void closePort(built.port);
        return;
      }
      void exchange(code).then(
        (grant) => {
          if (!current(id, token)) return;
          writeGrant(id, grant);
          publish(id, { phase: "saved", instructions: savedView(id).instructions });
          void closePort(built.port);
        },
        (cause: unknown) => {
          if (!current(id, token)) return;
          const message = cause instanceof Error ? cause.message : String(cause);
          publish(id, { phase: "failed", url: built.url, instructions: built.instructions, message });
          void closePort(built.port);
        },
      );
    });
    server.once("error", reject);
    server.listen(built.port, "127.0.0.1", () => {
      server.off("error", reject);
      listeners.set(built.port, server);
      resolve();
    });
  });
  const timer = setTimeout(() => {
    if (!current(id, token)) return;
    const view = sessions.get(id);
    if (view?.phase === "waiting") {
      publish(id, { phase: "failed", url: built.url, instructions: built.instructions, message: "The sign-in link expired before it was completed." });
    }
    void closePort(built.port);
  }, LOGIN_TIMEOUT_MS);
  timers.set(id, timer);
}

async function postForm(url: string, body: Record<string, string>, headers: Record<string, string>, deps?: LoginDeps): Promise<{ status: number; body: unknown }> {
  const response = await callerFetch(deps)(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  let parsed: unknown = raw;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = raw;
    }
  }
  return { status: response.status, body: parsed };
}

async function postJson(url: string, body: Record<string, unknown>, headers: Record<string, string>, deps?: LoginDeps): Promise<{ status: number; body: unknown }> {
  const response = await callerFetch(deps)(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  let parsed: unknown = raw;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = raw;
    }
  }
  return { status: response.status, body: parsed };
}

function stringField(body: unknown, key: string): string {
  return isRecord(body) && typeof body[key] === "string" ? body[key] : "";
}

function numberField(body: unknown, key: string): number | undefined {
  if (!isRecord(body)) return undefined;
  const value = body[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function grantFromToken(body: unknown, accessKey = "access_token", refreshKey = "refresh_token"): Grant {
  const access = stringField(body, accessKey);
  if (access.length === 0) throw new Error("The token response did not include an access token.");
  const expires = numberField(body, "expires_in");
  return {
    access,
    refresh: stringField(body, refreshKey),
    expiresAt: expires === undefined ? undefined : Date.now() + expires * 1000,
  };
}

async function exchangeCode(
  url: string,
  bodyKind: "json" | "form",
  fields: Record<string, string>,
  deps: LoginDeps | undefined,
  accessKey = "access_token",
): Promise<Grant> {
  const result = bodyKind === "json"
    ? await postJson(url, fields, {}, deps)
    : await postForm(url, fields, {}, deps);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Token exchange failed (${result.status}).`);
  }
  return grantFromToken(result.body, accessKey);
}

function schedulePoll(id: string, token: number, intervalMs: number, run: () => Promise<"pending" | "done">): void {
  const timer = setTimeout(() => {
    if (!current(id, token)) return;
    void run().then(
      (state) => {
        if (!current(id, token) || state === "done") return;
        schedulePoll(id, token, intervalMs, run);
      },
      (cause: unknown) => {
        if (!current(id, token)) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        const view = sessions.get(id);
        publish(id, {
          phase: "failed",
          url: view?.url,
          instructions: view?.instructions ?? "",
          userCode: view?.userCode,
          message,
        });
      },
    );
  }, intervalMs);
  timers.set(id, timer);
}

async function rfcDevice(
  id: string,
  token: number,
  input: {
    deviceUrl: string;
    tokenUrl: string | (() => Promise<string>);
    clientId: string;
    scope?: string;
    headers?: Record<string, string>;
    json?: boolean;
  },
  deps?: LoginDeps,
): Promise<LoginView> {
  const fields: Record<string, string> = { client_id: input.clientId };
  if (input.scope !== undefined) fields.scope = input.scope;
  const begun = input.json === true
    ? await postJson(input.deviceUrl, fields, input.headers ?? {}, deps)
    : await postForm(input.deviceUrl, fields, input.headers ?? {}, deps);
  if (begun.status < 200 || begun.status >= 300) {
    return failed(id, `Device authorization failed (${begun.status}).`);
  }
  const userCode = stringField(begun.body, "user_code");
  const deviceCode = stringField(begun.body, "device_code");
  const complete = stringField(begun.body, "verification_uri_complete");
  const plain = stringField(begun.body, "verification_uri");
  const url = complete.length > 0 ? complete : plain;
  if (userCode.length === 0 || deviceCode.length === 0 || !url.startsWith("https://")) {
    return failed(id, "Device authorization did not return a verification link.");
  }
  const interval = Math.min(Math.max((numberField(begun.body, "interval") ?? 5) * 1000, 1000), 30_000);
  const expires = (numberField(begun.body, "expires_in") ?? 600) * 1000;
  const deadline = Date.now() + Math.min(expires, LOGIN_TIMEOUT_MS);
  const view = publish(id, {
    phase: "waiting",
    url,
    userCode,
    instructions: `Enter code: ${userCode}`,
  });
  const poll = async (): Promise<"pending" | "done"> => {
    if (Date.now() > deadline) throw new Error("The sign-in link expired before it was completed.");
    const tokenUrl = typeof input.tokenUrl === "string" ? input.tokenUrl : await input.tokenUrl();
    const result = await postForm(tokenUrl, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: input.clientId,
      device_code: deviceCode,
    }, input.headers ?? {}, deps);
    const error = stringField(result.body, "error");
    if (error === "authorization_pending" || error === "slow_down") return "pending";
    if (error === "expired_token" || error === "access_denied") {
      throw new Error(error === "access_denied" ? "The authorization was denied." : "The device code expired.");
    }
    if (result.status < 200 || result.status >= 300 || error.length > 0) {
      throw new Error(`Device token request failed (${result.status || error}).`);
    }
    writeGrant(id, grantFromToken(result.body));
    publish(id, { phase: "saved", instructions: savedView(id).instructions });
    return "done";
  };
  schedulePoll(id, token, interval, poll);
  return view;
}

async function xaiTokenUrl(deps?: LoginDeps): Promise<string> {
  const response = await callerFetch(deps)("https://auth.x.ai/.well-known/openid-configuration", {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 200) throw new Error(`xAI discovery failed (${response.status}).`);
  const payload: unknown = await response.json();
  const endpoint = stringField(payload, "token_endpoint");
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("xAI discovery did not return a token endpoint.");
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || (host !== "x.ai" && !host.endsWith(".x.ai"))) {
    throw new Error("xAI discovery returned an unexpected token endpoint.");
  }
  return endpoint;
}

async function startCursor(id: string, token: number, built: BuiltAuthorize): Promise<void> {
  let delay = 1000;
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  const poll = async (): Promise<"pending" | "done"> => {
    if (Date.now() > deadline) throw new Error("The sign-in link expired before it was completed.");
    const response = await fetch(`https://api2.cursor.sh/auth/poll?uuid=${encodeURIComponent(built.state)}&verifier=${encodeURIComponent(built.verifier)}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) {
      delay = Math.min(delay * 1.2, 10_000);
      return "pending";
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Cursor poll failed (${response.status}).`);
    const payload: unknown = await response.json();
    const access = stringField(payload, "accessToken");
    if (access.length === 0) throw new Error("Cursor did not return an access token.");
    writeGrant(id, { access, refresh: stringField(payload, "refreshToken") });
    publish(id, { phase: "saved", instructions: savedView(id).instructions });
    return "done";
  };
  const timer = setTimeout(() => {
    void poll().then(
      (state) => {
        if (state === "pending" && current(id, token)) schedulePoll(id, token, delay, poll);
      },
      (cause: unknown) => {
        if (!current(id, token)) return;
        publish(id, {
          phase: "failed",
          url: built.url,
          instructions: built.instructions,
          message: cause instanceof Error ? cause.message : String(cause),
        });
      },
    );
  }, delay);
  timers.set(id, timer);
}

async function startOpenAIDevice(id: string, token: number, deps?: LoginDeps): Promise<LoginView> {
  const begun = await postJson("https://auth.openai.com/api/accounts/deviceauth/usercode", {
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
  }, {}, deps);
  if (begun.status < 200 || begun.status >= 300) return failed(id, `Device authorization failed (${begun.status}).`);
  const userCode = stringField(begun.body, "user_code");
  const deviceAuthId = stringField(begun.body, "device_auth_id");
  if (userCode.length === 0 || deviceAuthId.length === 0) return failed(id, "Device authorization did not return a user code.");
  const url = "https://auth.openai.com/codex/device";
  const view = publish(id, { phase: "waiting", url, userCode, instructions: `Enter code: ${userCode}` });
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  const poll = async (): Promise<"pending" | "done"> => {
    if (Date.now() > deadline) throw new Error("The sign-in link expired before it was completed.");
    const result = await postJson("https://auth.openai.com/api/accounts/deviceauth/token", {
      device_auth_id: deviceAuthId,
      user_code: userCode,
    }, {}, deps);
    if (result.status === 403 || result.status === 404) return "pending";
    if (result.status < 200 || result.status >= 300) throw new Error(`Device token request failed (${result.status}).`);
    const code = stringField(result.body, "authorization_code");
    const verifier = stringField(result.body, "code_verifier");
    if (code.length === 0 || verifier.length === 0) throw new Error("Device token response did not include an authorization code.");
    const grant = await exchangeCode("https://auth.openai.com/oauth/token", "form", {
      grant_type: "authorization_code",
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      code,
      code_verifier: verifier,
      redirect_uri: "https://auth.openai.com/deviceauth/callback",
    }, deps);
    writeGrant(id, grant);
    publish(id, { phase: "saved", instructions: savedView(id).instructions });
    return "done";
  };
  schedulePoll(id, token, 5000, poll);
  return view;
}

function kiroHeaders(): Record<string, string> {
  const osName = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform === "linux" ? "linux" : "other";
  const base = `aws-sdk-rust/1.6.0 ua/2.1 api/ssooidc/1.100.0 os/${osName} lang/rust/1.94.1`;
  return {
    "content-type": "application/json",
    "user-agent": `${base} m/E,N app/AmazonQ-For-CLI`,
    "x-amz-user-agent": `${base} m/E,N app/AmazonQ-For-CLI`,
    "amz-sdk-request": "attempt=1; max=3",
    "amz-sdk-invocation-id": randomUUID(),
    accept: "application/json",
  };
}

async function startKiro(id: string, token: number, deps?: LoginDeps): Promise<LoginView> {
  const headers = kiroHeaders();
  const registered = await postJson("https://oidc.us-east-1.amazonaws.com/client/register", {
    clientName: "Kiro CLI",
    clientType: "public",
    scopes: ["codewhisperer:completions", "codewhisperer:analysis", "codewhisperer:conversations"],
  }, headers, deps);
  if (registered.status < 200 || registered.status >= 300) return failed(id, `Kiro client registration failed (${registered.status}).`);
  const clientId = stringField(registered.body, "clientId");
  const clientSecret = stringField(registered.body, "clientSecret");
  if (clientId.length === 0 || clientSecret.length === 0) return failed(id, "Kiro client registration did not return a client id.");
  const device = await postJson("https://oidc.us-east-1.amazonaws.com/device_authorization", {
    clientId,
    clientSecret,
    startUrl: "https://view.awsapps.com/start",
  }, headers, deps);
  if (device.status < 200 || device.status >= 300) return failed(id, `Kiro device authorization failed (${device.status}).`);
  const userCode = stringField(device.body, "userCode");
  const deviceCode = stringField(device.body, "deviceCode");
  const url = stringField(device.body, "verificationUriComplete");
  if (userCode.length === 0 || deviceCode.length === 0 || !url.startsWith("https://")) {
    return failed(id, "Kiro device authorization did not return a verification link.");
  }
  const interval = Math.min(Math.max((numberField(device.body, "interval") ?? 5) * 1000, 1000), 30_000);
  const view = publish(id, { phase: "waiting", url, userCode, instructions: `Confirm code ${userCode} in the browser.` });
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  const poll = async (): Promise<"pending" | "done"> => {
    if (Date.now() > deadline) throw new Error("The sign-in link expired before it was completed.");
    const result = await postJson("https://oidc.us-east-1.amazonaws.com/token", {
      clientId,
      clientSecret,
      deviceCode,
      grantType: "urn:ietf:params:oauth:grant-type:device_code",
    }, kiroHeaders(), deps);
    const error = stringField(result.body, "error");
    if (error === "authorization_pending" || error === "slow_down") return "pending";
    if (result.status < 200 || result.status >= 300) {
      throw new Error(error.length > 0 ? `Kiro sign-in failed (${error}).` : `Kiro sign-in failed (${result.status}).`);
    }
    const access = stringField(result.body, "accessToken") || stringField(result.body, "access_token");
    if (access.length === 0) throw new Error("Kiro did not return an access token.");
    writeGrant(id, { access, refresh: stringField(result.body, "refreshToken") || stringField(result.body, "refresh_token") });
    publish(id, { phase: "saved", instructions: savedView(id).instructions });
    return "done";
  };
  schedulePoll(id, token, interval, poll);
  return view;
}

export async function startOfficialLogin(id: string, deps?: LoginDeps): Promise<LoginView> {
  if (!ID_PATTERN.test(id)) return failed(id, "Unknown login id.");
  const token = bump(id);
  const offer = classifyOfficialLogin(id);
  if (offer.kind === "failed") return publish(id, { phase: "failed", instructions: "", message: offer.message });
  if (offer.kind === "link" && !LISTEN_IDS.has(id)) {
    return publish(id, { phase: "link", url: offer.url, instructions: offer.instructions });
  }
  if (offer.kind === "network") {
    try {
      if (id === "openai-codex-device") return await startOpenAIDevice(id, token, deps);
      if (id === "kiro") return await startKiro(id, token, deps);
      if (id === "github-copilot") {
        return await rfcDevice(id, token, {
          deviceUrl: "https://github.com/login/device/code",
          tokenUrl: "https://github.com/login/oauth/access_token",
          clientId: "Ov23li8tweQw6odWQebz",
          scope: "read:user",
          headers: { "user-agent": "copilot-developer-action/0.0.1" },
        }, deps);
      }
      if (id === "factory-droid") {
        return await rfcDevice(id, token, {
          deviceUrl: "https://api.workos.com/user_management/authorize/device",
          tokenUrl: "https://api.workos.com/user_management/authenticate",
          clientId: "client_01HNM792M5G5G1A2THWPXKFMXB",
          headers: { accept: "application/json" },
        }, deps);
      }
      if (id === "kimi-code") {
        return await rfcDevice(id, token, {
          deviceUrl: "https://auth.kimi.com/api/oauth/device_authorization",
          tokenUrl: "https://auth.kimi.com/api/oauth/token",
          clientId: "17e5f671-d194-4dfb-9706-5516cb48c098",
        }, deps);
      }
      if (id === "muse-code") {
        return await rfcDevice(id, token, {
          deviceUrl: "https://auth.meta.com/oidc/device/authorization/",
          tokenUrl: "https://auth.meta.com/oidc/device/token/",
          clientId: "1031625952748946",
          headers: { accept: "application/json", "x-api-version": "1.0.0" },
        }, deps);
      }
      if (id === "xai-oauth") {
        return await rfcDevice(id, token, {
          deviceUrl: "https://auth.x.ai/oauth2/device/code",
          tokenUrl: () => xaiTokenUrl(deps),
          clientId: "b1a00492-073a-47ea-816f-4c329264a828",
          scope: "openid profile email offline_access grok-cli:access api:access",
          headers: { accept: "application/json" },
        }, deps);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return failed(id, message);
    }
    return failed(id, "This catalog row has no published sign-in.");
  }
  const built = buildAuthorize(id);
  if (built === undefined) return failed(id, "This catalog row has no published sign-in.");
  if (id === "cursor") {
    const view = publish(id, { phase: "waiting", url: built.url, instructions: built.instructions });
    void startCursor(id, token, built);
    return view;
  }
  if (built.port === 0) {
    return publish(id, { phase: "link", url: built.url, instructions: built.instructions });
  }
  try {
    if (id === "devin-windsurf") {
      await listenForCode(id, token, built, () => Promise.reject(new Error("Windsurf returned to this machine. Saving the seat key needs Devin's protobuf exchange, which this plugin does not send.")));
      return publish(id, { phase: "waiting", url: built.url, instructions: built.instructions });
    }
    await listenForCode(id, token, built, async (code) => {
      if (id === "anthropic") {
        return exchangeCode("https://api.anthropic.com/v1/oauth/token", "json", {
          grant_type: "authorization_code",
          client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
          code,
          redirect_uri: built.redirect,
          code_verifier: built.verifier,
          state: built.state,
        }, deps);
      }
      if (id === "openai-codex") {
        return exchangeCode("https://auth.openai.com/oauth/token", "form", {
          grant_type: "authorization_code",
          client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
          code,
          redirect_uri: built.redirect,
          code_verifier: built.verifier,
        }, deps);
      }
      if (id === "devin") {
        return exchangeCode("https://api.devin.ai/auth/cli/token", "json", {
          code,
          code_verifier: built.verifier,
        }, deps, "token");
      }
      if (id === "gitlab-duo") {
        return exchangeCode("https://gitlab.com/oauth/token", "form", {
          grant_type: "authorization_code",
          client_id: "da4edff2e6ebd2bc3208611e2768bc1c1dd7be791dc5ff26ca34ca9ee44f7d4b",
          code,
          redirect_uri: built.redirect,
          code_verifier: built.verifier,
        }, deps);
      }
      throw new Error("This sign-in cannot be completed in the browser callback.");
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const busy = /EADDRINUSE|already in use/iu.test(message);
    return failed(id, busy ? `Callback port ${built.port} is already in use. Close the program using it and try again.` : message);
  }
  return publish(id, { phase: "waiting", url: built.url, instructions: built.instructions });
}
