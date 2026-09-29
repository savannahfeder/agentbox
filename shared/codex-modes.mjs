// WHAT A CODEX WORKER MAY DO, SAID ONCE, IN CODEX'S OWN TERMS.
//
// The sister of renderer/src/modes.ts, which does this for Claude Code. That
// file's rule holds here too: every value below is a value Codex really takes,
// and nothing is invented to make a tidier row.
//
// WHY THERE ARE THREE AND NOT SIX. Claude Code has six permission modes and we
// print all six because they are its own list. Codex does not have six of
// anything. It has a SANDBOX with three settings and an APPROVAL POLICY that
// sits on top of it, and the two are not independent in any way a person would
// want to choose between: sixteen combinations, of which three are the ones
// anybody means. Read off `codex app-server generate-json-schema` on
// codex-cli 0.153.4, 2026-09-23:
//
//   SandboxMode      read-only | workspace-write | danger-full-access
//   AskForApproval   untrusted | on-request | never | {granular:{...}}
//
// So each row here is a PAIR, and the pair is the thing she picks.
//
// `untrusted` IS DELIBERATELY NOT OFFERED. It is the one Agentbox used to run
// and it is why Codex was unusable here: it cards every command before it runs,
// and it adds no containment the sandbox was not already providing. The
// measurements are in main/codex-session.mjs. Leaving it off the list is not
// hiding a choice, it is declining to offer a broken one. `granular` is not
// offered either: it is an object of five switches, which is a settings screen
// of its own and not a mode.
//
// THE LABELS ARE OURS, unlike the Claude Code file's, because Codex's own
// surfaces disagree with each other about what to call these. Its CLI says
// `--sandbox read-only`; its TUI says "Read Only"; its docs say "Auto". Since
// there is no single authority to copy, these are written for the person
// reading them, in the words the rest of this app uses.

/** Her three, in order of what they let an agent do. */
export const CODEX_MODE_ORDER = ['read-only', 'auto', 'full-access'];

/** The one a worker runs in when nothing has been picked. */
export const CODEX_DEFAULT_MODE = 'auto';

/**
 * THE PAIR EACH MODE REALLY IS. `sandbox` and `approvalPolicy` go straight into
 *  `thread/start`, so this table is the whole of the mapping and there is no
 *  second copy of it anywhere.
 *
 *  `approvalPolicy` is `on-request` on the two sandboxed rows: the sandbox does
 *  the refusing, and `on-request` leaves the agent able to ASK to step outside
 *  rather than simply failing. On `full-access` there is nothing left to ask
 *  about, so it is `never`.
 */
export const CODEX_MODES = {
  'read-only': {
    label: 'Read only',
    sandbox: 'read-only',
    approvalPolicy: 'on-request',
    // What runs without asking, in the same voice as the Claude Code list.
    what: 'Reads and searches. Writes nothing and runs nothing that changes anything.',
  },
  auto: {
    label: 'Auto',
    sandbox: 'workspace-write',
    approvalPolicy: 'on-request',
    // WHO ANSWERS THOSE ASKS, SAID HERE RATHER THAN LEFT TO A FILE. This used
    // to come only from `approvals_reviewer` in her `~/.codex/config.toml`, so
    // a second login's home, which starts with no config at all, sent every ask
    // to her inbox instead (2026-09-24, w-ca48e69535). One mode, one behaviour,
    // whichever account the run is on.
    approvalsReviewer: 'auto_review',
    what: 'Works inside the project folder. Asks before going outside it or onto the network.',
  },
  'full-access': {
    label: 'Full access',
    sandbox: 'danger-full-access',
    approvalPolicy: 'never',
    what: 'Anything, anywhere on this Mac, without asking.',
  },
};

/** Whether a word is one of the three. */
export function isCodexMode(word) {
  return typeof word === 'string' && Object.hasOwn(CODEX_MODES, word);
}

/**
 * The pair for a mode, or the default's pair when the word is not one of ours.
 *  FALLING BACK RATHER THAN THROWING IS DELIBERATE at this level: a stale word
 *  in her config should start a worker in the safe-ish default, not refuse to
 *  start one. The writers (main/settings.mjs) validate on the way IN, which is
 *  where a typo can still be reported to the person who made it.
 */
export function codexPosture(mode) {
  const row = CODEX_MODES[mode] ?? CODEX_MODES[CODEX_DEFAULT_MODE];
  const posture = { sandbox: row.sandbox, approvalPolicy: row.approvalPolicy };
  if (row.approvalsReviewer) posture.approvalsReviewer = row.approvalsReviewer;
  return posture;
}

/** The label for a mode, for any surface that has to name one. */
export function codexModeWords(mode) {
  return (CODEX_MODES[mode] ?? CODEX_MODES[CODEX_DEFAULT_MODE]).label;
}

/**
 * THE WORD SHE TYPES AFTER THE SLASH, one per mode.
 *
 *  Deliberately NOT the same words as Claude Code's six. `/auto` exists on both
 *  engines, which is fine and is the one overlap: a row has one engine, so the
 *  menu she is looking at only ever offers one of the two, and both mean "the
 *  sensible default" on their own engine.
 */
export const CODEX_MODE_COMMAND = {
  'read-only': '/read-only',
  auto: '/auto',
  'full-access': '/full-access',
};

/** One sentence per row of the menu, in the same voice as the Claude Code list. */
export const CODEX_MODE_HINT = {
  'read-only': 'reads and searches, writes nothing',
  auto: 'works in the project folder, asks to leave it',
  'full-access': 'anything, anywhere, without asking',
};

/**
 * The rows the menu draws for what has been typed. Mirrors `menuRowsFor` on the
 *  Claude Code side, including the way back when a mode is already set.
 */
export function codexMenuRowsFor(query, set) {
  if (query === null) return [];
  const rows = CODEX_MODE_ORDER.filter((id) => CODEX_MODE_COMMAND[id].slice(1).startsWith(query.toLowerCase()));
  // `/clear` puts it back to whatever the project is already set to, and is
  // only offered when there is something to clear.
  const back = set && 'clear'.startsWith(query.toLowerCase()) ? [null] : [];
  return [...rows, ...back];
}

/**
 * WHAT THE CHIP AND THE TOAST SAY while a mode is on. Same shape as Claude
 *  Code's `MODE_STATUS`, which is that engine's own status line with " on"
 *  after it. Codex prints no such line, so these are ours, kept in the same
 *  rhythm so the two engines read alike on one screen.
 */
export const CODEX_MODE_STATUS = {
  'read-only': 'read only on',
  auto: 'auto on',
  'full-access': 'full access on',
};

/** The next one round the loop, for Shift+Tab. */
export function nextCodexMode(mode) {
  const at = CODEX_MODE_ORDER.indexOf(mode);
  return CODEX_MODE_ORDER[(at + 1) % CODEX_MODE_ORDER.length];
}

/** The mode a typed `/word ` means, or null when it means nothing. */
export function exactCodexMode(word) {
  if (!word) return null;
  const hit = CODEX_MODE_ORDER.find((id) => CODEX_MODE_COMMAND[id] === `/${word}`);
  return hit ?? null;
}
