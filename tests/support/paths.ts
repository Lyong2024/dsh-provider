import { mkdtempSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, "..", "..");

export function userDshHome(): string {
  return path.join(os.homedir(), ".dsh");
}

export function assertNotUserDsh(home: string): void {
  const target = path.resolve(home);
  const user = path.resolve(userDshHome());
  if (target === user || target.startsWith(user + path.sep)) {
    throw new Error(`refusing to use the real DSH home: ${target}`);
  }
}

export function freshDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  assertNotUserDsh(directory);
  return directory;
}

export function homeStamp(home: string): { exists: boolean; mtimeMs: number } {
  try {
    return { exists: true, mtimeMs: statSync(home).mtimeMs };
  } catch {
    return { exists: false, mtimeMs: 0 };
  }
}
