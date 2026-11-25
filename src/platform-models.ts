// Model lists shown when the settings dialog switches official platforms.
// Ids come from the route tables this plugin already serves. A platform with
// no table stays empty so the page asks for a typed model name.

import { ANTHROPIC_MODELS, GENERIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS, STANDARD_MODELS, XAI_MODELS } from "./catalog.js";

export interface PlatformModel {
  id: string;
  name: string;
}

function isModel(value: object): value is { id: string; name: string; regionGated?: boolean } {
  if (!("id" in value) || !("name" in value)) return false;
  const id = value.id;
  const name = value.name;
  return typeof id === "string" && id.length > 0 && typeof name === "string" && name.length > 0;
}

function listed(models: readonly object[]): PlatformModel[] {
  const out: PlatformModel[] = [];
  for (const model of models) {
    if (!isModel(model) || model.regionGated === true) continue;
    out.push({ id: model.id, name: model.name });
  }
  return out;
}

const BY_ID: Record<string, readonly object[]> = {
  anthropic: ANTHROPIC_MODELS,
  "openai-codex": OPENAI_MODELS,
  "openai-codex-device": OPENAI_MODELS,
  google: GOOGLE_MODELS,
  "xai-oauth": XAI_MODELS,
  "factory-droid": GENERIC_MODELS,
  "muse-code": [{ id: "muse-spark-1.3", name: "Muse Spark 1.3" }, ...STANDARD_MODELS],
};

export function modelsForPlatform(id: string): PlatformModel[] {
  const models = BY_ID[id];
  return models === undefined ? [] : listed(models);
}
