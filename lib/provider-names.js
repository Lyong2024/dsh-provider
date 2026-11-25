// The host prints a provider id beside its name when the two differ.
// Registered ids are these platform names. factory-* remains the internal route id.

const LEGACY_PROVIDER_NAMES = {
  "factory-a": "Claude",
  "factory-g": "Core",
  "factory-o": "OpenAI",
  "factory-google": "Google",
  "factory-xai": "Grok",
  "factory-m": "Muse",
  "factory-s": "Muse Spark",
};

export function canonicalProvider(provider) {
  if (typeof provider !== "string") return undefined;
  return LEGACY_PROVIDER_NAMES[provider] ?? provider;
}
