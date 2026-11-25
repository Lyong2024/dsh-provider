// Executable contract for tests/README.md. Keep the two in sync.
// readme-sync.test.ts fails if a feature id or a pinned plugin is missing from the README.

export const DSH_VERSION = "0.2.2-rc.5";

export const DSH_PACKAGE = `@deepseek-ai/dsh@${DSH_VERSION}`;

export const FEATURE_IDS = [
  "shape",
  "no-geo",
  "wire",
  "profile-kind",
  "secret-mask",
  "local-dummy",
  "search-not-chat",
  "login-not-stored",
  "probe-no-credential",
  "protocol-skipped",
  "single-default",
  "delete-secret",
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export const LOCAL_IDS = [
  "ollama",
  "ollama-cloud",
  "lm-studio",
  "llama.cpp",
  "vllm",
  "apple",
  "local",
] as const;

export const SEARCH_IDS = ["web", "exa", "tavily", "perplexity", "kagi", "parallel"] as const;

export const EXTRA_API_IDS = [
  "dashscope",
  "volcengine-ark",
  "hunyuan",
  "spark",
  "sensenova",
  "lingyi",
  "huawei-maas",
  "modelscope",
  "baichuan",
  "infiniai",
  "skywork",
  "zhinao360",
] as const;

export const LOGIN_IDS = [
  "anthropic",
  "openai-codex",
  "factory-droid",
  "google",
  "xai-oauth",
  "github-copilot",
] as const;

export const ABSENT_IDS = ["native-tools", "image-tokenization", "yolo-auto"] as const;

export const WIRES = [
  "anthropic-messages",
  "openai-completions",
  "openai-responses",
  "google-generative-ai",
] as const;

export const KINDS = ["api", "login", "local", "search"] as const;

export const STABILITY_COUNT = 10;

export const DEFAULT_PLUGIN_SEED = 20261124;

export interface MainstreamPlugin {
  name: string;
  version: string;
}

/** Community plugins with the dsh-plugin keyword. Not the web profile's built-in bundles. */
export const MAINSTREAM_PLUGINS: readonly MainstreamPlugin[] = [
  { name: "dsh-pet", version: "0.4.9" },
  { name: "dsh-context", version: "0.87.1" },
  { name: "dsh-whale-widget", version: "0.4.2" },
  { name: "dsh-cost-meter", version: "1.9.87" },
  { name: "dsh-m", version: "0.12.24" },
  { name: "dshmarket", version: "1.81.0" },
  { name: "dsh-config-manager", version: "0.12.0" },
  { name: "dsh-prompt-setting", version: "0.3.0" },
  { name: "dsh-settings-nav-organizer", version: "1.7.3" },
  { name: "dsh-llm-retry-settings", version: "0.1.19" },
  { name: "dsh-easyrewrite", version: "3.1.0" },
  { name: "@objectivex666/dsh-settings-search", version: "1.14.1" },
  { name: "@linxin666/dsh-usage", version: "0.4.21" },
  { name: "dsh-remember", version: "0.3.2" },
  { name: "@nonamelego/dsh-catppuccin", version: "0.7.5" },
  { name: "dsh-any-background", version: "0.5.0" },
];

export function pluginSpec(plugin: MainstreamPlugin): string {
  return `${plugin.name}@${plugin.version}`;
}

export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    const left = copy[index];
    const right = copy[swap];
    if (left !== undefined && right !== undefined) {
      copy[index] = right;
      copy[swap] = left;
    }
  }
  return copy;
}

export function pluginSeed(): number {
  const raw = process.env.DSH_TEST_PLUGIN_SEED;
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_PLUGIN_SEED;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) throw new Error("DSH_TEST_PLUGIN_SEED must be an integer");
  return parsed;
}
