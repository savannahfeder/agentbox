// THE CLOUD'S OWN PERMISSION MODE, put on a cloud run's arguments. Its own file
// because the Claude harness and the settings both need it, and the settings
// already import the harnesses.
import { CLAUDE_PERMISSION_MODES } from '../shared/work-items.mjs';
import { isCodexMode } from '../shared/codex-modes.mjs';

const SKIP_FLAGS = ['--dangerously-skip-permissions'];

// Unset, a cloud run does not ask: the sandbox is thrown away after the run,
// holds no key that can push, and nobody is there to answer a card.
export const CLOUD_SAME = 'same';
export const CLOUD_CLAUDE_DEFAULT = 'bypassPermissions';
export const CLOUD_CODEX_DEFAULT = 'full-access';

/**
 * The Claude Code mode a cloud run starts in, or null to keep the flag the run
 * already has: this computer's, or the mode set on the thread itself, which
 * the cloud must not loosen.
 */
export function cloudClaudeMode(setting, threadMode = null) {
  if (CLAUDE_PERMISSION_MODES.includes(threadMode) || setting === CLOUD_SAME) return null;
  return CLAUDE_PERMISSION_MODES.includes(setting) ? setting : CLOUD_CLAUDE_DEFAULT;
}

/** The Codex mode a cloud run starts in, by the same rule. */
export function cloudCodexMode(setting, threadMode, here) {
  if (isCodexMode(threadMode)) return threadMode;
  if (setting === CLOUD_SAME) return here;
  return isCodexMode(setting) ? setting : CLOUD_CODEX_DEFAULT;
}

/**
 * Only the permission flag changes, in place, so nothing else moves. Null
 * leaves the run on this computer's mode. With no flag to replace it goes
 * first, where a list flag such as --allowedTools cannot take it as a value.
 */
export function cloudPermissionArgs(args, mode) {
  if (mode == null) return args;
  if (!CLAUDE_PERMISSION_MODES.includes(mode)) throw new Error(`unknown permission mode: ${mode}`);
  const out = [];
  let at = -1;
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    const flag = arg === '--permission-mode' || arg.startsWith('--permission-mode=') || SKIP_FLAGS.includes(arg);
    if (!flag) { out.push(args[i]); continue; }
    if (at < 0) at = out.length;
    if (arg === '--permission-mode') i += 1;
  }
  out.splice(at < 0 ? 0 : at, 0, '--permission-mode', mode);
  return out;
}
