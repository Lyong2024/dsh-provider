// Which saved profiles may be registered as chat models.
// Search stays on the conversation as a tool. Official login is not a profile kind.

import type { ProfileKind } from "./profiles.js";

export function registersAsChatModel(kind: ProfileKind): boolean {
  return kind === "api" || kind === "local";
}
