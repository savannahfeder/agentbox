// HOW A CODEX WORKER'S COMMANDS COME TO ASK ABOUT MEMORY — w-e5225b62ba.
//
// w-3958c3753d built the whole of the decision (main/memory-gate.mjs), the
// coordinator (main/memory-gate-server.mjs) and the hook a worker runs
// (scripts/memory-gate-hook.sh) for Claude Code, and said plainly that Codex
// workers were not covered. This file is the Codex half, and it is small on
// purpose: everything measured below says Codex 0.160 presents a PreToolUse
// hook the way Claude Code does, so the script, the deny and the coordinator
// are carried over rather than rewritten.
//
// MEASURED ON THIS MAC, codex-cli 0.160.0, a real `codex app-server` and real
// turns, 2026-10-04. Read none of this as documentation; it was all run.
//
//   THE PAYLOAD IS CLAUDE CODE'S, FIELD FOR FIELD:
//     { session_id, turn_id, transcript_path, cwd, hook_event_name: "PreToolUse",
//       model, permission_mode, tool_name: "Bash",
//       tool_input: { command }, tool_use_id }
//   and the deny it reads is the same `hookSpecificOutput.permissionDecision`
//   object `denyOutput` already prints. A deny blocked the command and our
//   sentence reached the model verbatim. A hook that slept eight seconds made
//   the command wait and then run.
//
//   THE MATCHER IS "Bash". A group with matcher "shell" listed as trusted and
//   enabled and never fired once; with no matcher it fired and said its
//   tool_name was "Bash". That one word was the difference between this working
//   and silently doing nothing.
//
//   THE FILE IS `hooks.json` IN THE CODEX HOME, `{ description?, hooks: {...} }`,
//   whose event keys are PascalCase (`PreToolUse`) even though Codex's own
//   errors name them in snake_case. An unknown event key is dropped in silence,
//   which is why the key is pinned by a test rather than trusted to a comment.
//
//   A HOOK ONLY RUNS ONCE TRUSTED, AND TRUST IS PER HOOK. `hooks/list` reports
//   every hook with a `key`, a `currentHash` and a `trustStatus` of managed /
//   untrusted / trusted / modified. Writing
//   `hooks.state."<key>".trusted_hash = <currentHash>` through the app-server's
//   own `config/batchWrite` turned OURS trusted and left a second hook in the
//   same file untrusted, with an unrelated `[projects."..."]` table in
//   config.toml untouched. That is the whole of "do not switch off hook trust
//   for anyone's other hooks": we never touch the requirement, we satisfy it for
//   one key. Editing our own command afterwards turned ours "modified" rather
//   than leaving it trusted, so a hook somebody swapped under us does not
//   inherit what we wrote.
//
// WHY THE ITEM IS NOT IN THE ENVIRONMENT, which is the one real difference from
// the Claude side. A Claude worker is a process per work item, so `memoryGateEnv`
// puts the item on it. ONE app-server serves every Codex thread of a login, so
// there is one environment for all of them and an item id on it would label
// every thread as whichever row started first. The thread names itself instead:
// `session_id` in the payload is the app-server's own `thread.id`, which
// main/codex.mjs already keeps as `session.sessionId`. The lookup lives in
// main/memory-gate-server.mjs (`ownerOf`).

import fsNode from 'node:fs';
import path from 'node:path';

/** What Codex calls the tool that runs a shell command. Measured, not guessed. */
export const CODEX_MATCHER = 'Bash';

/** The file in a Codex home that holds its hooks. */
export const HOOKS_FILE = 'hooks.json';

/** The two events Codex has that we want. There is no PostToolUseFailure. */
export const CODEX_EVENTS = ['PreToolUse', 'PostToolUse'];

/** How we know a hook in somebody's file is one of ours. */
const OUR_SCRIPT = 'memory-gate-hook.sh';

/**
 * Whether a hook's command is one we wrote. It has to be the script ITSELF and
 * not a file whose name merely starts the same way, or turning the switch off
 * would delete `memory-gate-hook.sh.backup` out of somebody's config.
 */
export function hookIsOurs(command) {
  if (typeof command !== 'string') return false;
  return new RegExp(`${OUR_SCRIPT}'?\\s+(pre|post)\\s*$`).test(command.trim());
}

/** A path inside a single-quoted shell word, app bundles and apostrophes included. */
function quoted(scriptPath) {
  return `'${String(scriptPath).replace(/'/g, `'\\''`)}'`;
}

/**
 * Our matcher groups, one per event.
 *
 * The pre hook's limit sits above the longest wait the gate will ever impose,
 * for the reason the Claude side gives: a hook that times out lets its command
 * run, so the app's own refusal has to arrive first. Codex counts it in seconds.
 */
export function ourHookGroups(scriptPath, { maxWaitSec = 20 * 60 } = {}) {
  const group = (mode, timeout) => ([{
    matcher: CODEX_MATCHER,
    hooks: [{ type: 'command', command: `${quoted(scriptPath)} ${mode}`, timeout }],
  }]);
  return {
    PreToolUse: group('pre', maxWaitSec + 600),
    PostToolUse: group('post', 10),
  };
}

/** A hooks.json object, whatever shape the file on disk turned out to be. */
function asFile(file) {
  const base = file && typeof file === 'object' && !Array.isArray(file) ? { ...file } : {};
  base.hooks = base.hooks && typeof base.hooks === 'object' && !Array.isArray(base.hooks) ? { ...base.hooks } : {};
  return base;
}

/** Every group in `list` that is not one of ours, in the order it was written. */
function withoutOurGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((g) => !(g?.hooks ?? []).some?.((h) => hookIsOurs(h?.command)));
}

/**
 * The same hooks.json with our two hooks in it and everything else where it was.
 *
 * Ours go LAST so a hook somebody already had keeps running first, and any older
 * entry of ours is replaced rather than kept beside the new one: the app moves
 * between versions and a stale absolute path is a worker asking a script that is
 * not there. Running this twice gives the same file, so turning the switch on
 * again adds nothing.
 */
export function withOurHooks(file, scriptPath, options) {
  const out = asFile(file);
  const ours = ourHookGroups(scriptPath, options);
  for (const event of CODEX_EVENTS) {
    out.hooks[event] = [...withoutOurGroups(out.hooks[event]), ...ours[event]];
  }
  return out;
}

/**
 * The same hooks.json with ours taken out, for when the switch goes off. An
 * event left with nothing in it loses its key entirely, so a file that was only
 * ever ours reads as a file with no hooks rather than as empty lists.
 */
export function withoutOurHooks(file) {
  const out = asFile(file);
  for (const event of Object.keys(out.hooks)) {
    const kept = withoutOurGroups(out.hooks[event]);
    if (kept.length) out.hooks[event] = kept;
    else delete out.hooks[event];
  }
  return out;
}

/** A TOML key as `config/batchWrite` wants it: one quoted segment, escaped. */
function tomlKey(key) {
  return JSON.stringify(String(key));
}

/**
 * The `config/batchWrite` edits that trust our hooks and nothing else.
 *
 * Takes either a flat list of hook entries or a whole `hooks/list` answer
 * (one record per cwd), because the same hook is reported once per cwd and must
 * be asked for once. A hook already trusted needs nothing; a `managed` one is an
 * admin's decision and is left alone; a `modified` one is ours whose script
 * changed with the app, and re-trusting it is the whole reason this runs at every
 * start rather than once at install.
 */
export function ourTrustEdits(answer) {
  const entries = [];
  for (const row of Array.isArray(answer) ? answer : []) {
    if (Array.isArray(row?.hooks)) entries.push(...row.hooks);
    else if (row?.key) entries.push(row);
  }
  const edits = new Map();
  for (const h of entries) {
    if (!h?.key || !h?.currentHash) continue;
    if (!hookIsOurs(h.command)) continue;
    if (h.trustStatus === 'trusted' || h.trustStatus === 'managed') continue;
    edits.set(h.key, { keyPath: `hooks.state.${tomlKey(h.key)}.trusted_hash`, mergeStrategy: 'upsert', value: h.currentHash });
  }
  return [...edits.values()];
}

/**
 * PUT OUR HOOK IN A CODEX HOME, OR TAKE IT OUT, AND TRUST ONLY OUR OWN.
 *
 * Runs at every app start while the switch is on, not once at install, because
 * three things change underneath it: the app's path (a new version moves the
 * script, and Codex then calls our hook "modified" and stops running it), the
 * user's own hooks.json (they may add or remove their own entries at any time),
 * and the home itself (a second Codex login is a second home).
 *
 * NOTHING HERE WRITES config.toml. The trust goes through `config/batchWrite`,
 * which is the call the Codex TUI itself uses, so Codex edits its own file and
 * every other setting and every other hook's trust survives untouched. Measured
 * on this Mac: an unrelated `[projects."..."]` table was still there afterwards,
 * and a second hook in the same hooks.json was still `untrusted`.
 *
 * It is all best-effort. A Codex home we cannot write, an app-server that will
 * not answer, a refused config write: each one means Codex workers run ungated,
 * which is exactly where they were before this existed. It must never be a
 * reason the app fails to start.
 *
 * @param {object} how
 * @param {string} how.home The CODEX_HOME to write in.
 * @param {string} how.scriptPath scripts/memory-gate-hook.sh, unpacked.
 * @param {boolean} how.on Whether the memory check is on.
 * @param {(method: string, params: object) => Promise<any>} [how.request] The
 *   app-server call. Omitted means "write the file, do not try to trust it".
 * @param {string[]} [how.cwds] Folders to ask `hooks/list` about. A hook in the
 *   home is listed for any cwd, so one is enough; the app's own folder is used.
 * @param {object} [how.fs] Injected for tests.
 * @param {(line: string) => void} [how.log]
 * @returns {Promise<{wrote: boolean, trusted: number, error: string|null}>}
 */
export async function syncCodexMemoryGate({ home, scriptPath, on, request = null, cwds = [], fs = fsNode, log = () => {} }) {
  const out = { wrote: false, trusted: 0, error: null };
  if (!home || (on && !scriptPath)) { out.error = 'no codex home'; return out; }
  const file = path.join(home, HOOKS_FILE);

  // THEIR FILE IS READ BEFORE IT IS WRITTEN, AND A FILE WE CANNOT UNDERSTAND IS
  // LEFT ALONE. A hooks.json that exists and is not JSON is somebody's own,
  // broken or newer than us; replacing it to install ours would throw their work
  // away. Codex workers then run ungated, which is where they already were.
  let raw = null;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { raw = null; }
  let before = null;
  if (raw !== null && raw.trim()) {
    try { before = JSON.parse(raw); } catch {
      out.error = `${file} is not readable JSON, so it was left alone`;
      log(`memory gate: ${out.error}`);
      return out;
    }
  }
  // Off, and we were never in it: nothing to do, and no file to create.
  if (!on && before === null) return out;

  const wanted = `${JSON.stringify(on ? withOurHooks(before, scriptPath) : withoutOurHooks(before), null, 2)}\n`;
  if (raw !== wanted) {
    try {
      fs.mkdirSync(home, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, wanted);
      fs.renameSync(tmp, file);
      out.wrote = true;
    } catch (err) {
      out.error = `could not write ${file}: ${err.message}`;
      log(`memory gate: ${out.error}`);
      return out;
    }
  }
  if (!on || typeof request !== 'function') return out;

  // Trust ours. `hooks/list` is what reports the key and the hash Codex computed,
  // and neither can be worked out from here: the hash is not of the command text.
  try {
    const listed = await request('hooks/list', { cwds });
    const edits = ourTrustEdits(listed?.data ?? listed);
    if (!edits.length) return out;
    await request('config/batchWrite', { edits, reloadUserConfig: true });
    out.trusted = edits.length;
    log(`memory gate: trusted ${edits.length} Codex hook${edits.length === 1 ? '' : 's'} in ${home}`);
  } catch (err) { out.error = `could not trust the Codex hook: ${err.message}`; log(`memory gate: ${out.error}`); }
  return out;
}
