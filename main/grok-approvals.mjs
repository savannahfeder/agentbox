// GROK BUILD ASKS THROUGH A HOOK THAT AGENTBOX PUTS IN ~/.grok/hooks.
//
// Grok has no flag that loads a hook for one run, but it reads every
// `~/.grok/hooks/*.json` on every session, and a PreToolUse hook there can deny
// a tool call after waiting as long as its timeout allows (measured
// 2026-10-07, grok 1.0.46: a hook that slept 8 s and then denied stopped
// `touch`). So Agentbox installs one hook, once, and makes it inert unless the
// run was started by Agentbox: the script exits at once when
// AGENTBOX_APPROVAL_CLI is not in its environment, which it never is in a Grok
// session the person opens themselves.
//
// GROK FAILS OPEN, so the script never relies on it: a hook that crashes or
// times out lets the call through. The timeout is set above the fifteen
// minutes a card waits, and if the helper dies the script prints a deny itself.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TIMEOUT_MS } from './approval-ask.mjs';
import { Name, nameSlug } from '../shared/product-name.mjs';

export const HOOK_NAME = `${nameSlug}-approvals`;

export const HOOK_SCRIPT = `#!/bin/sh
# ${Name} approval cards for Grok Build, installed by ${Name}.
# It does nothing unless ${Name} started this Grok run.
[ -n "$AGENTBOX_APPROVAL_CLI" ] || exit 0
ELECTRON_RUN_AS_NODE=1 "$AGENTBOX_NODE" "$AGENTBOX_APPROVAL_CLI" grok
code=$?
[ "$code" -eq 0 ] || [ "$code" -eq 2 ] && exit "$code"
echo '{"decision":"deny","reason":"${Name} could not ask about this action, so it was not allowed."}'
exit 2
`;

export function hookJson(script) {
  const timeout = Math.ceil(TIMEOUT_MS / 1000) + 60;
  return `${JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: script, timeout }] }] } }, null, 2)}\n`;
}

/**
 * Write the hook if it is missing or out of date. True when it is in place.
 *  Never throws: a hook that could not be written is a run without cards, and
 *  the caller says so. */
export function ensureGrokApprovalHook({ grokHome = path.join(os.homedir(), '.grok') } = {}) {
  try {
    const dir = path.join(grokHome, 'hooks');
    fs.mkdirSync(dir, { recursive: true });
    const script = path.join(dir, `${HOOK_NAME}.sh`);
    const json = path.join(dir, `${HOOK_NAME}.json`);
    const write = (file, text, mode) => {
      let had = null;
      try { had = fs.readFileSync(file, 'utf8'); } catch { /* not there yet */ }
      if (had !== text) fs.writeFileSync(file, text, { mode });
      fs.chmodSync(file, mode);
    };
    write(script, HOOK_SCRIPT, 0o755);
    write(json, hookJson(script), 0o644);
    return true;
  } catch (err) {
    console.warn(`${nameSlug}: could not install the Grok approval hook:`, err?.message ?? err);
    return false;
  }
}
