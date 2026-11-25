import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DSH_PACKAGE, DSH_VERSION } from "./contract.js";
import { assertNotUserDsh, freshDirectory, repoRoot } from "./paths.js";

export interface DshProcess {
  child: ChildProcess;
  port: number;
  token: string;
  output: () => string;
  stop: () => Promise<void>;
}

function prefixBinary(): string | undefined {
  const override = process.env.DSH_TEST_BIN;
  if (typeof override === "string" && override.trim().length > 0) return override;
  const candidate = path.join(repoRoot, "temp", "dsh-test-prefix", "node_modules", ".bin", "dsh.cmd");
  return existsSync(candidate) ? candidate : undefined;
}

export function resolveDshBinary(): string {
  const binary = prefixBinary();
  if (binary === undefined) {
    throw new Error(
      `missing DSH ${DSH_VERSION} binary. Install with: pnpm add --dir <clean-prefix> ${DSH_PACKAGE} and set DSH_TEST_BIN`,
    );
  }
  const globalShim = path.join(process.env.APPDATA ?? "", "npm", "dsh.cmd");
  if (path.resolve(binary) === path.resolve(globalShim)) {
    throw new Error("refusing the global dsh shim");
  }
  return binary;
}

const reusedPreviewHome = path.resolve(repoRoot, "temp", "dsh-test-home");

/** A test home must be a new temporary directory, never the user's DSH data or the reused preview. */
export function assertDisposableHome(home: string): void {
  assertNotUserDsh(home);
  const target = path.resolve(home);
  if (target === reusedPreviewHome || target.startsWith(reusedPreviewHome + path.sep)) {
    throw new Error(`refusing reused preview home: ${target}`);
  }
}

/**
 * Environment for one DSH process. Inherited DSH_HOME and DSH_PROVIDER_* are
 * removed so a shell or an older preview cannot leak into this run. Provider
 * files stay inside the home unless extraEnv points at another fresh directory.
 */
export function dshChildEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  assertDisposableHome(home);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "DSH_HOME" || key.startsWith("DSH_PROVIDER_")) delete env[key];
  }
  env.DSH_HOME = home;
  env.DSH_PROVIDER_PROFILES_DIR = path.join(home, "provider-profiles");
  env.DSH_PROVIDER_ACCOUNTS_DIR = path.join(home, "provider-accounts");
  env.DSH_PROVIDER_LOGINS_DIR = path.join(home, "provider-logins");
  env.DSH_PROVIDER_USAGE_DIR = path.join(home, "provider-usage");
  env.DSH_PROVIDER_JOURNAL = path.join(home, "provider-journal.jsonl");
  return { ...env, ...extra };
}

export function runDsh(home: string, args: readonly string[], timeoutMs = 180_000): Promise<{ stdout: string; stderr: string; code: number }> {
  const binary = resolveDshBinary();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], {
      env: dshChildEnv(home),
      windowsHide: true,
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`dsh timed out: ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export async function initWebProfile(home: string): Promise<void> {
  assertDisposableHome(home);
  if (existsSync(path.join(home, "profiles"))) {
    throw new Error(`DSH_HOME already has a profile and is not a new environment: ${home}`);
  }
  mkdirSync(home, { recursive: true });
  const dumped = await runDsh(home, ["--profile", "web", "--dump-default-config"]);
  if (dumped.code !== 0) {
    throw new Error(`dump-default-config failed (${dumped.code}): ${dumped.stderr || dumped.stdout}`);
  }
  const version = await runDsh(home, ["--version"]);
  if (!version.stdout.includes(DSH_VERSION)) {
    throw new Error(`expected ${DSH_VERSION}, got ${version.stdout.trim()}`);
  }
}

export async function addPlugin(home: string, spec: string): Promise<void> {
  const added = await runDsh(home, ["plugin", "--profile", "web", "add", spec], 300_000);
  if (added.code !== 0) {
    throw new Error(`plugin add ${spec} failed (${added.code}): ${added.stderr || added.stdout}`);
  }
}

export function profilePackage(home: string): { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } } {
  const file = path.join(home, "profiles", "web", "package.json");
  return JSON.parse(readFileSync(file, "utf8")) as {
    dependencies?: Record<string, string>;
    dsh?: { profile?: { bundles?: string[] } };
  };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("no free port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

export async function bootWeb(home: string, extraEnv: Record<string, string> = {}): Promise<DshProcess> {
  const port = await freePort();
  const binary = resolveDshBinary();
  const child = spawn(binary, ["--profile", "web", "--port", String(port), "--no-open"], {
    env: dshChildEnv(home, extraEnv),
    windowsHide: true,
    shell: process.platform === "win32",
  });
  let text = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    text += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    text += chunk.toString("utf8");
  });
  const ready = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dsh did not print a URL\n${text}`)), 90_000);
    const watch = (): void => {
      const matched = text.match(/https?:\/\/127\.0\.0\.1:\d+\/\?token=([^\s]+)/);
      if (matched?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(matched[1]);
      }
    };
    child.stdout?.on("data", watch);
    child.stderr?.on("data", watch);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`dsh exited ${code ?? 1} before ready\n${text}`));
    });
  });
  return {
    child,
    port,
    token: ready,
    output: () => text,
    stop: async () => {
      if (process.platform === "win32" && child.pid !== undefined) {
        await new Promise<void>((resolve) => {
          const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
          killer.on("exit", () => resolve());
          killer.on("error", () => resolve());
        });
        return;
      }
      child.kill();
    },
  };
}

export function newHome(prefix: string): string {
  return freshDirectory(prefix);
}

export async function exchangeCookie(port: number, token: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`, { redirect: "manual" });
  const cookies = response.headers.getSetCookie();
  const cookie = cookies.map((item) => item.split(";")[0] ?? "").filter((item) => item.length > 0).join("; ");
  if (cookie.length === 0) {
    throw new Error(`index did not set a cookie (status ${response.status})`);
  }
  return cookie;
}

export async function authed(port: number, token: string, pathname: string): Promise<Response> {
  const cookie = await exchangeCookie(port, token);
  return fetch(`http://127.0.0.1:${port}${pathname}`, { headers: { cookie } });
}

export const pluginFileSpec = `file:${repoRoot.replaceAll("\\", "/")}`;
