// Copy JSON data next to the compiled modules. tsc does not emit readFileSync targets.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });

const files = [
  ["src/model-presets-data.json", "model-presets-data.json"],
  ["src/provider-routing-data.json", "provider-routing-data.json"],
  ["lib/provider-catalog.json", "provider-catalog.json"],
];

for (const [from, name] of files) {
  const source = join(root, from);
  if (!existsSync(source)) {
    process.stderr.write(`copy-assets: missing ${from}\n`);
    process.exitCode = 1;
    continue;
  }
  copyFileSync(source, join(dist, name));
}

const client = readFileSync(join(dist, "client.js"), "utf8");
if (!client.includes('window.__ModuleLoader__.load') || !client.includes('id: "dsh-provider"')) {
  process.stderr.write("copy-assets: dist/client.js does not register dsh-provider\n");
  process.exitCode = 1;
}
if (/^\s*export(?:\s|[{])/mu.test(client) || /^\s*import(?:\s|[{.(])/mu.test(client)) {
  process.stderr.write("copy-assets: dist/client.js must stay a classic script with no import or export\n");
  process.exitCode = 1;
}
