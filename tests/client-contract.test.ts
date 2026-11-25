import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { repoRoot } from "./support/paths.js";

const source = readFileSync(path.join(repoRoot, "src", "client.ts"), "utf8");

function dictionary(name: "zh" | "en"): Record<string, string> {
  const marker = `const ${name}: Dict = {`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, marker);
  const end = source.indexOf("\n};", start);
  assert.ok(end > start);
  const block = source.slice(start + marker.length, end);
  const entries: Record<string, string> = {};
  for (const match of block.matchAll(/\n  ([A-Za-z0-9]+): "((?:\\.|[^"\\])*)"/g)) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && value !== undefined) entries[key] = value;
  }
  return entries;
}

test("settings copy is bilingual and does not special-case a country", () => {
  const zh = dictionary("zh");
  const en = dictionary("en");
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  assert.equal(zh.nav, "模型配置");
  assert.equal(en.nav, "Model config");
  assert.match(zh.subtitle, /不按国家分/);
  assert.match(en.subtitle, /not by country/);
  assert.match(zh.loginPending, /不会打开外部授权/);
  assert.match(en.loginPending, /will not open an external authorization/);
  assert.match(zh.searchHint, /不伪装成聊天模型/);
  assert.equal(zh.protocolSkipped, "跳过");
  assert.equal(en.protocolSkipped, "skipped");
  for (const forbidden of ["服务区域", "国内主流", "仅桌面", "desktop only", "window.open", "oauth"]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  assert.match(source, /id: "dsh-provider"/);
  assert.match(source, /className: row\.isDefault \? "mcp-card is-default" : "mcp-card"/);
  assert.match(source, /kind === "search"/);
  assert.match(source, /target: "_blank"/);
  assert.match(source, /rel: "noopener noreferrer"/);
  assert.match(source, /\$\{BRIDGE\}\/login/);
  assert.equal(zh.signOut, "退出");
  assert.equal(en.signOut, "Sign out");
  assert.equal(zh.tabLogin, "官方平台");
  assert.equal(en.tabLogin, "Official platforms");
  assert.equal(zh.filterLogin, "官方平台");
  assert.equal(en.filterLogin, "Official platforms");
  assert.match(zh.loginRequired, /请先登录/);
  assert.match(en.loginRequired, /Sign in first/);
  assert.match(source, /useState<Tab>\("login"\)/);
  assert.match(source, /t\("tabLogin"\)[\s\S]{0,240}t\("tabApi"\)/);
  assert.match(source, /mcp-card is-signed-in/);
  assert.match(source, /mcp-signed-bar/);
  assert.match(source, /mcp-model is-on/);
  assert.match(source, /choosePlatform\(entry, false\)/);
  assert.match(source, /signedIn \? t\("signOut"\) : t\("signIn"\)/);
  assert.match(source, /phase === "saved" \? 0 : 1/);
  assert.match(source, /--dsw-alias-label-primary/);
  assert.match(source, /--dsw-alias-border-l2/);
  for (const hex of ["#2c2926", "#fffcf8", "#e7cbb8", "#f3e4d8", "#8a8178", "#e4ddd2"]) {
    assert.equal(source.toLowerCase().includes(hex), false, hex);
  }
  assert.equal(/^\s*import /m.test(source), false);
  assert.equal(/^\s*export /m.test(source), false);
});
