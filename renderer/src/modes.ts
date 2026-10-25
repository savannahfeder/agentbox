// What agents may do, in Claude Code's own words. Every mode is a value
// `claude --permission-mode` accepts, and every label is the title in Claude
// Code's own mode table. `default` is the config value and `manual` is the
// CLI's alias for it. Ours, and marked where each sits: the slash command
// names (all but `/plan`), the typed aliases, the menu hints, the `custom` row
// and some of the sentences.
//
// The settings screen, the reply box menu and the reply footer's mode chip all
// read their words from here.

import type { PermissionMode } from './types';

/**
 * The mode a session is really running in. `custom` means flags set by hand
 * that match none of the six, and it is never rounded to the nearest one. */
export type SessionMode = PermissionMode;

/**
 * The row order of the "Available modes" table at
 * code.claude.com/docs/en/permission-modes, not a risk ranking. */
export const MODE_ORDER: PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
];

/**
 * The `title` column of Claude Code's mode table, character for character.
 * The capitals in "Don't Ask" and "Bypass Permissions" are theirs. */
export const MODE_WORDS: Record<PermissionMode, string> = {
  default: 'Manual',
  acceptEdits: 'Accept edits',
  plan: 'Plan',
  auto: 'Auto',
  dontAsk: "Don't Ask",
  bypassPermissions: 'Bypass Permissions',
  custom: 'Custom',
};

/**
 * What Claude Code's status bar says while the mode is on: the mode table's
 * `indicator` plus " on". The status line builds the phrase at run time, so
 * the whole phrase never appears in the binary. The reply footer chip shows
 * this. */
export const MODE_STATUS: Record<PermissionMode, string> = {
  default: 'manual mode on',
  acceptEdits: 'accept edits on',
  plan: 'plan mode on',
  auto: 'auto mode on',
  dontAsk: "don't ask on",
  bypassPermissions: 'bypass permissions on',
  custom: 'set by hand',
};

/**
 * The sentence the settings screen prints under the picker. Each follows
 * Anthropic's "What runs without asking" column. Several are reworded
 * (acceptEdits is shortened, plan is turned around, dontAsk has a second
 * sentence of ours) and none is a quotation. Do not rewrite a vendor's
 * description of its own safety behaviour: drafts that described what each
 * mode blocks were wrong in the dangerous direction. RULES_ALWAYS_APPLY
 * carries the rest.
 *
 * Their table does not cover plan in a session that also has bypass
 * available. That cannot happen to a session Agentbox puts in a mode, because
 * `buildSessionArgs` (main/settings.mjs) lifts both bypass flags out and
 * passes the picked mode as the only permission flag. Only a hand-written
 * `sessionArgs` that pairs plan with `--allow-dangerously-skip-permissions`
 * can create it. If that rebuild ever stops, the plan sentence has to change.
 */
export const MODE_SENTENCE: Record<PermissionMode, string> = {
  default: 'Runs without asking: reads only.',
  acceptEdits: 'Runs without asking: reads, file edits, and common filesystem commands like mkdir, mv and cp.',
  plan: 'Runs without asking: reads, plus commands the classifier approves when auto mode is available.',
  auto: 'Runs without asking: everything, with background safety checks.',
  dontAsk: 'Runs without asking: only pre-approved tools. Nothing else is put in front of you, so nothing waits.',
  bypassPermissions: 'Runs without asking: everything.',
  custom: 'Set by hand in zero.config.json. The screen leaves it exactly as it found it.',
};

/**
 * Printed beside the six sentences everywhere they appear, because a mode is
 * a baseline that rules sit on top of. It names both directions, and the allow
 * half matters more because that is where being wrong is dangerous.
 *
 * "Never auto-approved" restates Anthropic's heading "Actions no mode
 * auto-approves". It does not say those actions always stop, because in auto
 * some go to the classifier rather than to a person. The deny half says only
 * that deny rules still apply, which is weaker than Anthropic's sentence on
 * purpose: when a quote has a qualification we cannot carry, weaken the claim
 * rather than drop the qualification. */
export const RULES_ALWAYS_APPLY =
  'A mode is only the starting point. Your own rules sit on top of it: an allow rule can let something through without asking, and your deny rules still apply. A few dangerous actions are never auto-approved, whatever you pick.';

/**
 * The short line the menu prints beside each mode, from the same column and
 * never a promise about what is blocked. Each starts with "runs" so it reads
 * as what happens without asking, not as a ceiling on what the agent can do.
 * `MENU_TITLE` says the same above them. */
export const MODE_HINT: Record<PermissionMode, string> = {
  default: 'runs reads only',
  acceptEdits: 'runs reads, edits and everyday file commands',
  plan: 'runs reads, plans and approved commands',
  auto: 'runs everything, with safety checks',
  dontAsk: 'runs what is already approved, and never waits',
  bypassPermissions: 'runs everything',
  custom: 'set by hand',
};

/**
 * The words that pick each mode when typed, the mode's own word first. The
 * hyphenated spellings are ours; Claude Code's values are the camelCase ones,
 * and both are accepted. `yolo` is what people call bypass, but the CLI does
 * not accept it as a `--permission-mode` value. */
export const MODE_TYPED: Record<PermissionMode, string[]> = {
  default: ['manual', 'default'],
  acceptEdits: ['accept-edits', 'acceptedits', 'accept', 'edits'],
  plan: ['plan'],
  auto: ['auto'],
  dontAsk: ['dont-ask', 'dontask', 'deny'],
  bypassPermissions: ['bypass-permissions', 'bypasspermissions', 'bypass', 'yolo'],
  custom: [],
};

/**
 * The command the menu shows for each mode, so a person learns something they
 * can type again. The slash is Claude Code's character, but
 * THESE COMMAND NAMES ARE OURS, all but one: `/plan` is theirs. Claude Code
 * registers it as `name:"plan"` with no slash in the string, so grepping the
 * binary for "/plan" finds nothing and proves nothing. The other five are
 * spelled from Claude Code's mode values. The wording of this comment is
 * pinned by tests/the-slash-picks-a-mode.test.mjs. */
export const MODE_COMMAND: Record<PermissionMode, string> = {
  default: '/manual',
  acceptEdits: '/accept-edits',
  plan: '/plan',
  auto: '/auto',
  dontAsk: '/dont-ask',
  bypassPermissions: '/bypass-permissions',
  custom: '/custom',
};

/**
 * Says above the rows that the hints are what runs with nobody asked, not
 * limits on what an agent can do. */
export const MENU_TITLE = 'What this message runs without asking';

/**
 * The menu opens only on a slash at the very start of the box with no space
 * after it, because a slash mid-sentence (a path, a date) is meant as text.
 * Returns the lowercased word, or null. */
export function slashQuery(text: string): string | null {
  if (!text.startsWith('/')) return null;
  const rest = text.slice(1);
  if (/\s/.test(rest)) return null;
  return rest.toLowerCase();
}

// There is no `/permissions` row on purpose. It is a real Claude Code command
// ("Manage allow and deny tool permission rules").
// It manages RULES. It does not pick a mode. Giving it a second meaning here
// would clash with Claude Code's, and with any rules screen Agentbox adds later.

/**
 * The modes matching what has been typed: all six for an empty query,
 * otherwise those with a typed word that starts with the query. Prefix rather
 * than contains, so the selection does not jump on a coincidence. */
export function modeMatches(query: string | null): PermissionMode[] {
  if (query === null) return [];
  if (query === '') return [...MODE_ORDER];
  // A mode's own word sorts above another mode's alias, so the cursor does not
  // land on a row the person did not mean. Within each group the order is
  // MODE_ORDER.
  const first = MODE_ORDER.filter((m) => MODE_TYPED[m][0]?.startsWith(query));
  const alias = MODE_ORDER.filter(
    (m) => !first.includes(m) && MODE_TYPED[m].some((w) => w.startsWith(query)),
  );
  return [...first, ...alias];
}

/**
 * The mode an exact typed word picks on Enter. Anything else returns null and
 * is treated as text, never silently dropped. */
export function exactMode(query: string | null): PermissionMode | null {
  if (!query) return null;
  return MODE_ORDER.find((m) => MODE_TYPED[m].includes(query)) ?? null;
}

/**
 * The ring Shift+Tab walks. The key is Claude Code's, but this ring is ours
 * and must not be called theirs. Theirs is default -> acceptEdits -> plan,
 * with bypassPermissions then auto slotted in after plan when the session has
 * them available, and never dontAsk. Bypass is available when the session was
 * started with `--dangerously-skip-permissions` or
 * `--allow-dangerously-skip-permissions`, so their ring varies per launch.
 *
 * Ours is fixed. Auto is in it because Agentbox asks for auto by name. Bypass
 * is out so no key walks somebody into it by accident; it and dontAsk are
 * still one chip press or one typed word away, and in Settings. */
export const MODE_CYCLE: PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
];

export function nextMode(current: PermissionMode | null): PermissionMode {
  // From nothing picked, from auto, or from a mode outside the ring, the next
  // press goes to Manual. Claude Code does the same from auto.
  if (!current) return 'default';
  const i = MODE_CYCLE.indexOf(current);
  if (i < 0) return 'default';
  return MODE_CYCLE[(i + 1) % MODE_CYCLE.length];
}

// The clear row: the way back from a thread's mode to the project's setting.
// `answerMode` is stored on the row and lasts for the whole thread, so this
// row is the only off switch. It stands for no mode (`null`), not a seventh
// one, and it is offered only when a mode is set.

/**
 * What the clear row types as. Ours, not Claude Code's: its own `/clear`
 * clears the conversation, which this does not. */
export const CLEAR_COMMAND = '/clear';
/**
 * Not "Manual" or "Default": both are real modes with their own rows, and
 * this row picks no mode. */
export const CLEAR_WORDS = 'Use the project\'s setting';
export const CLEAR_HINT = 'whatever this project is already set to';
/** The spellings that reach it, in the same shape as MODE_TYPED. */
export const CLEAR_TYPED = ['clear', 'reset', 'project'];

/**
 * The rows the menu draws: the matching modes, plus the clear row (`null`)
 * when a mode is set and the query matches it. On the empty query the clear
 * row comes last, since it is the least likely pick. */
export function menuRowsFor(query: string | null, set: boolean): (PermissionMode | null)[] {
  const modes: (PermissionMode | null)[] = modeMatches(query);
  if (!set) return modes;
  if (query === null) return modes;
  if (query === '') return [...modes, null];
  return CLEAR_TYPED.some((w) => w.startsWith(query)) ? [...modes, null] : modes;
}

/**
 * Whether the typed word is the clear row's, so `/clear ` works without
 * opening the menu. */
export function exactClear(query: string | null): boolean {
  return !!query && CLEAR_TYPED.includes(query);
}
