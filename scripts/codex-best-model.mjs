#!/usr/bin/env node
// Prints the Codex model the handoff skill should use: the first one Codex's
// own list offers this login. Codex ranks its newest frontier model first, so
// the answer moves on by itself when a better model ships.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexHome, codexModels } from '../main/codex-models.mjs';

export function bestCodexModel({ home = codexHome(), read } = {}) {
  return codexModels(read ? { home, read } : { home })[0]?.id ?? null;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const model = bestCodexModel();
  if (!model) {
    console.error(`No Codex models listed in ${codexHome()}/models_cache.json. Run codex once while signed in, then try again.`);
    process.exit(1);
  }
  console.log(model);
}
