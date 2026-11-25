import { createHash } from 'node:crypto';
import { canonicalProvider } from './provider-names.js';
import { scopeGoogleSdk } from './google.js';
// Local adapter-to-gateway metadata. These headers never reach Factory.
export const FACTORY_REQUEST_PURPOSE_HEADER = "x-dsh-factory-purpose";
export const FACTORY_REQUEST_SESSION_HEADER = "x-dsh-factory-session";

/** A detached profile preserves other calls and prepared model generations. */
const OWNED_PROVIDERS = new Set(["Claude", "Core", "OpenAI", "Google", "Grok", "Muse", "Muse Spark"]);

export function scopeFactoryRequest(snapshot, options) {
  const name = canonicalProvider(options.provider);
  if (!OWNED_PROVIDERS.has(name ?? "")) return snapshot;
  snapshot = scopeGoogleSdk(snapshot, options);
  const headers = {};
  if (name === "Claude" && options.purpose === "compaction") headers[FACTORY_REQUEST_PURPOSE_HEADER] = "compaction";
  if (typeof options.sessionId === 'string' || typeof options.sessionId === 'number') {
    headers[FACTORY_REQUEST_SESSION_HEADER] = createHash('sha256').update(String(options.sessionId)).digest('hex');
  }
  if (!Object.keys(headers).length) return snapshot;
  const profile = snapshot.profiles.get(options.provider);
  const profiles = new Map(snapshot.profiles);
  profiles.set(options.provider, { ...profile,
    headers: { ...profile?.headers, ...headers },
  });
  return { ...snapshot, profiles };
}
