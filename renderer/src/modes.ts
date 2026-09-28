// WHAT AGENTS MAY DO, SAID IN ONE PLACE, IN CLAUDE CODE'S OWN WORDS.
//
// She was right. The four words this file used to hold were ours, two of the
// four named nothing Claude Code has, and one of them ("Read only") was not a
// permission mode at all but a trick with --allowedTools.
//
// EVERY MODE AND EVERY LABEL IN HERE IS THEIRS. Every value is a value
// `claude --permission-mode` takes and every label is the label Claude Code
// prints for it.
//
// PLENTY BELOW IS STILL OURS AND EACH PIECE SAYS SO WHERE IT SITS: the slash
// command names (all but `/plan`), the typed aliases, the menu hints, the
// `custom` row, and SOME OF THE SIX SENTENCES, which are reworded from
// Anthropic's column rather than lifted from it. An earlier header claimed the
// command names were the only thing of ours in the file, which was not true and
// is the kind of tidy sentence that stops the next reader checking.
//
// DO NOT PUT A COUNT HERE. Two drafts said "four of the six are unchanged" and
// then "two are ours", and both were wrong the moment anybody touched a
// sentence; a review found acceptEdits, plan and dontAsk all reworded while the
// comment still said two. A count is a claim that has to be re-verified on
// every edit and silently rots when it is not. Say that some are reworded and
// send the reader to their table for the exact words. Both halves were read off the copy installed on this Mac
// (2.1.241) and off Anthropic's own page, on 2026-08-23:
//
//   `claude --help` -> choices: "acceptEdits", "auto", "bypassPermissions",
//                               "manual", "dontAsk", "plan"
//   code.claude.com/docs/en/permission-modes, table "Available modes", listing
//                               default, acceptEdits, plan, auto, dontAsk,
//                               bypassPermissions
//
// AND SINCE 2026-08-23 THE LABELS BELOW ARE READ OUT OF THE BINARY ITSELF, not
// off the page. `strings` on the installed 2.1.241 has Claude Code's own mode
// table in it, and it is the thing their status line and their menus read:
//
//   default:           title "Manual",             indicator "manual mode"
//   plan:              title "Plan",               indicator "plan mode"
//   acceptEdits:       title "Accept edits",       indicator "accept edits"
//   bypassPermissions: title "Bypass Permissions", indicator "bypass permissions"
//   dontAsk:           title "Don't Ask",          indicator "don't ask"
//   auto:              title "Auto",               indicator "auto mode"
//
// Their status line prints `${indicator} on`, which is why MODE_STATUS below is
// the indicator with " on" after it and why searching the binary for the whole
// phrase "bypass permissions on" finds nothing. It is composed at run time. A
// pass this session read that absence as three invented strings and was wrong;
// the check that settled it was finding the `${...} on` template, not guessing.
//
// The same file also states the cycle and the full list outright:
//   "The Shift+Tab permission-mode cycle is default -> acceptEdits -> plan ->
//    bypassPermissions -> auto -> default, where bypassPermissions and auto
//    appear only when available in that session. dontAsk is never in the cycle."
//   "valid modes are acceptEdits, auto, bypassPermissions, default, dontAsk,
//    plan (manual is an accepted alias for default)."
//
// The two lists are the same six. `default` is the config value and `manual`
// is the alias the CLI takes for it; the docs say so out loud: "The mode that
// reviews every action is named Manual in the CLI... Its config value is
// `default`". All seven spellings were handed to the real CLI in a one-turn
// run and all seven started, so nothing here is a guess about what it accepts.
//
// THE ORDER IS ANTHROPIC'S, not a risk ranking of mine. It is the row order of
// that same "Available modes" table, so a person who has read their page finds
// our list in the shape they already saw.
//
// Three surfaces read these words: the settings screen, the reply box menu and
// the mode chip on the reply footer. They read the same sentence out of here or
// they are three different products.

import type { PermissionMode } from './types';

/**
 * The mode a person is really running in, as opposed to the six they can
 *  pick. `custom` is flags set by hand that are none of the six, and it is
 *  never rounded to the nearest one. */
export type SessionMode = PermissionMode;

/** Anthropic's own row order, from the Available modes table. */
export const MODE_ORDER: PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
];

/**
 * THE LABEL CLAUDE CODE PRINTS, character for character out of the `title`
 *  column of their own mode table. Two of these were ours until 2026-08-23:
 *  we wrote "Don't ask" and "Bypass permissions" where theirs are "Don't Ask"
 *  and "Bypass Permissions". Their capitalisation is inconsistent with the
 *  other four and it is still theirs, and she asked for their words. */
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
 * WHAT CLAUDE CODE'S OWN STATUS BAR SAYS while the mode is on, minus the
 *  arrows. Each one is their `indicator` with " on" after it, which is exactly
 *  how their status line builds it, and the header of this file lists the six
 *  indicators as they appear in the binary. The chip on the reply footer says
 *  this, so the words on our screen and the words in her terminal match. */
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
 * The sentence the settings screen prints under the picker.
 *
 *  THIS WAS WRONG FOUR TIMES AND THE FIX IN THE END WAS TO STOP WRITING IT.
 *
 *  Draft one overclaimed what each mode blocks. Draft two hedged the verbs and
 *  was still wrong. Draft three said the deny rules apply on top, which is true
 *  and was the wrong half to say alone. Draft four still promised that things
 *  stop and ask, and a review went through it line by line against Anthropic's
 *  page and found every one of the six wrong in the DANGEROUS direction: Manual
 *  runs read-only shell commands without asking, Accept edits runs mkdir, mv,
 *  cp, rm and sed, Plan runs classifier-approved commands, Auto skips the
 *  classifier for ordinary in-workspace edits, and Don't ask still honours a
 *  PreToolUse hook.
 *
 *  So these FOLLOW Anthropic's own "What runs without asking" column, in the
 *  order of their own table. SEVERAL ARE REWORDED AND NONE IS GUARANTEED
 *  VERBATIM: acceptEdits is shortened from their list of filesystem commands,
 *  plan is their "classifier-approved commands" turned around, and dontAsk has a
 *  second sentence of ours about nothing waiting. If the exact wording matters,
 *  read their table; do not treat these as quotations.
 *
 *  An earlier version said all six were "copied rather than paraphrased", and
 *  the version after it said exactly two were ours. Both were overclaims of the
 *  same kind these sentences exist to avoid, one level up, and the second was
 *  wrong within a day. Where we deviate we are on the hook for it, so keep the
 *  deviation small and keep it named here.
 *  RULES_ALWAYS_APPLY carries the rest.
 *
 * The lesson is narrower and more useful than "be careful": DO NOT REWRITE A
 * VENDOR'S DESCRIPTION OF THEIR OWN SAFETY BEHAVIOUR. Quote it.
 *
 * ONE THING THEIR OWN TABLE LEAVES OUT, AND WHY IT IS NOT ON HER SCREEN.
 *
 *  IT CANNOT HAPPEN TO A SESSION AGENTBOX PUTS IN PLAN, which is why the caveat
 *  lives here rather than beside the sentence. `buildSessionArgs`
 *  (main/settings.mjs) rebuilds the command line from a parse that lifts BOTH
 *  bypass flags out, so a picked mode reaches the CLI as the only permission
 *  flag on it and nothing makes bypass available beside it. The condition can
 *  only be created by a hand-written `sessionArgs` that pairs plan with the
 *  allow flag, and that config is passed through untouched by design.
 *  Verified against her own config 2026-08-23: `--permission-mode
 *  bypassPermissions`, no allow flag. If Agentbox ever stops rebuilding the
 *  command line on a picked mode, this caveat becomes hers to see and the
 *  sentence above has to change with it.
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
 * THE LINE THAT CARRIES EVERYTHING THE SIX ABOVE LEAVE OUT, printed beside
 *  them everywhere they appear. A mode is a baseline that rules sit on top of,
 *  in Anthropic's own words, and a person reading one line about a mode without
 *  that reads it as the whole story.
 *
 *  It names BOTH directions. An earlier draft said only that deny rules hold,
 *  which made the six sound like floors; the half that matters more is that an
 *  allow rule lets things through, because that is the direction where being
 *  wrong is dangerous.
 *
 *  "never auto-approved" TRACKS ANTHROPIC'S HEADING WITHOUT QUOTING IT. Theirs
 *  is "Actions no mode auto-approves"; ours is the same claim in the passive,
 *  and this comment used to call it their heading, which it is not word for
 *  word. What matters is the shape: not "actions that always stop", because in
 *  auto a critical-path removal goes to the classifier rather than to a person.
 *  A draft that said "never run unasked" promised more than they do.
 *
 * AND THE DENY HALF IS DELIBERATELY WEAKER THAN THEIR SENTENCE. So the line
 * says deny rules STILL APPLY, which is true without the carve-out, and the
 * carve-out lives here where an engineer will find it.
 *
 *  THE RULE THIS ROUND ESTABLISHED: quote the vendor rather than paraphrase
 *  them, and when a quote has a qualification you cannot carry, weaken the
 *  claim rather than dropping the qualification. */
export const RULES_ALWAYS_APPLY =
  'A mode is only the starting point. Your own rules sit on top of it: an allow rule can let something through without asking, and your deny rules still apply. A few dangerous actions are never auto-approved, whatever you pick.';

/**
 * The short line the menu prints beside each mode. Anthropic's same column,
 *  compressed to the room a row has, and never a promise about what is blocked
 *  for the same reason the sentences are not.
 *
 * EVERY ONE STARTS WITH "runs", which is not decoration. Without it, "Manual —
 * reads only" sits under a menu headed "What this message may do" and reads as
 * a ceiling on what the agent CAN do, which is not what a permission mode is.
 * Manual is about being asked first for MOST things, not about a short list of
 * what is possible. It is not an unqualified promise either: it runs reads
 * without asking, and an allow rule can pre-approve more. What is possible is
 * still bounded by deny rules and by the actions no mode auto-approves. The
 * verb makes the column what it actually is, the list of what happens without
 * anybody being asked. Caught in review, 2026-08-23. `MENU_TITLE` says the same
 * thing above them. */
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
 * WHAT SHE TYPES. The mode's own word first, then the spellings a person who
 *  knows the tool would reach for. `yolo` is in here because it is what people
 *  call bypass. THE CLI DOES NOT ACCEPT IT as a `--permission-mode` value, so it
 *  works here and not there.
 *
 *  It IS internal Claude Code vocabulary, though: 2.1.241 carries
 *  `yoloEquivEnabled`, `tengu_ant_yolo_equiv_strip_config` and
 *  `isYoloEquivStripEnabledForEntrypoint`. Two comments here have now been wrong
 *  about this in opposite directions, first calling it their internal name for
 *  the mode, then saying it appears zero times. The second was another search
 *  that could not find what it was looking for: `grep -ix yolo` matches whole
 *  lines only, and every occurrence is inside a longer identifier.
 *
 *  THE HYPHENATED SPELLINGS ARE OURS, NOT CLAUDE CODE'S VALUES. Their value is
 *  `acceptEdits`, and `accept-edits` is the command spelling this app invented
 *  for it. An earlier comment here called the hyphenated form "Claude Code's own
 *  value", which it is not. Both spellings are accepted below so it does not
 *  matter what she types; only the comment was wrong. */
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
 * THE ONE WORD THE MENU SHOWS AS THE THING TYPED, so a person learns a
 *  command they can type again rather than only a row they can click.
 *
 * THE SLASH IS CLAUDE CODE'S CHARACTER. THESE COMMAND NAMES ARE OURS, and that
 * distinction is written here because getting it wrong is what started this
 * round. She is right that the backslash was ours; Claude Code has no backslash
 * TRIGGER. What it has is `/` for commands and Shift+Tab for the modes. (An
 * earlier draft said "no backslash key at all", which is a claim about a
 * keyboard rather than about the app.)
 *
 *  ONE OF THE SIX BELOW IS A REAL CLAUDE CODE COMMAND AND FIVE ARE OURS.
 *  `/plan` is theirs, registered in the binary as
 *  `{name:"plan", description:"Enable plan mode or view the current session
 *  plan"}`. `/manual`, `/auto`, `/accept-edits`, `/dont-ask` and
 *  `/bypass-permissions` are not commands in Claude Code at all.
 *
 *  A PASS THIS SESSION "CORRECTED" THIS COMMENT INTO SAYING /plan WAS NOT REAL,
 *  on the strength of `strings | grep -cx "/plan"` returning zero. That grep was
 *  the wrong question: commands are registered as `name:"plan"`, with no slash
 *  in the string at all, so the search could only ever return zero and proved
 *  nothing. The right check is the command table, and the lesson is narrower
 *  than "verify": A SEARCH THAT CANNOT DISTINGUISH ABSENT FROM UNSEARCHABLE IS
 *  NOT EVIDENCE. Caught by review, 2026-08-23, after it had been shipped onto
 *  her page as a correction of something that had been right.
 *
 *  The other five are spelled from Claude Code's own values so nobody has to
 *  learn a second vocabulary. Shift+Tab is genuinely theirs and works here. */
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
 * WHAT THE MENU IS FOR, said above the rows rather than left to be inferred.
 *  The old accessible name was "What this message may do", which frames the
 *  column of hints as limits on what an agent CAN do. It is not that; it is what
 *  runs with nobody asked. */
export const MENU_TITLE = 'What this message runs without asking';

/**
 * THE TRIGGER. A forward slash at the very start of the box and nothing but
 *  the word after it. Not anywhere in the message: a slash mid-sentence is a
 *  character somebody meant to type, in a path or a date, and a menu that opens
 *  over it is a menu that fires by accident. Nothing opens once there is a
 *  space, because at that point what is being written is prose. */
export function slashQuery(text: string): string | null {
  if (!text.startsWith('/')) return null;
  const rest = text.slice(1);
  if (/\s/.test(rest)) return null;
  return rest.toLowerCase();
}

/**
 * WHY THERE IS NO `/permissions` HERE, since it is the obvious thing to add.
 *
 *  It IS a real Claude Code command, and it does a different job:
 *  `{name:"permissions", aliases:["allowed-tools"], description:"Manage allow
 *  and deny tool permission rules"}`. It manages RULES. It does not pick a mode.
 *
 *  It was wired to this menu for one commit on 2026-08-23 and taken out again.
 *  The argument for keeping it was that Agentbox has no rules screen, so the mode
 *  picker is the only thing that word could mean here. The argument that won is
 *  that she asked for Claude Code's terminology BECAUSE ours kept meaning
 *  something slightly different from theirs, and giving their command a second
 *  meaning in our app is that same fault wearing their vocabulary. It also
 *  breaks the day Agentbox grows a rules screen, and then it has to be taken away
 *  from her, which is worse than never having offered it.
 *
 *  Nothing is lost by leaving it out: the menu opens on `/`, on the chip, and on
 *  Shift+Tab, and the chip now says the word Permissions in plain sight. */

/**
 * The rows the menu draws for what has been typed so far. An empty query
 *  shows all six, in the order above; anything else keeps the modes whose own
 *  word starts with it. Prefix rather than contains, because a word appearing
 *  inside a longer word is a coincidence and moving the selection on a
 *  coincidence is what makes a menu feel random. */
export function modeMatches(query: string | null): PermissionMode[] {
  if (query === null) return [];
  if (query === '') return [...MODE_ORDER];
  // THE MODE'S OWN WORD BEATS ANOTHER MODE'S ALIAS. Measured rather than
  // reasoned about: /a used to match Accept edits first, because acceptEdits is
  // Claude Code's value for it, and the cursor landed on the wrong row for the
  // most obvious thing anybody will type. A first-word match sorts above an
  // alias match, and inside each group the order is MODE_ORDER.
  const first = MODE_ORDER.filter((m) => MODE_TYPED[m][0]?.startsWith(query));
  const alias = MODE_ORDER.filter(
    (m) => !first.includes(m) && MODE_TYPED[m].some((w) => w.startsWith(query)),
  );
  return [...first, ...alias];
}

/**
 * Pressing Enter on a query nobody matched must not silently send a message
 *  starting with a slash, and must not silently eat it either. An exact word is
 *  a pick; anything else is text. */
export function exactMode(query: string | null): PermissionMode | null {
  if (!query) return null;
  return MODE_ORDER.find((m) => MODE_TYPED[m].includes(query)) ?? null;
}

/**
 * CLAUDE CODE'S OWN KEY. THE RING IS OURS AND IT IS SHAPED LIKE THEIRS.
 *
 *  Their docs: "press Shift+Tab to cycle permission modes. From auto, the first
 *  press switches to default, and the cycle then runs default -> acceptEdits ->
 *  plan -> back to default. Optional modes... slot in after plan, with
 *  bypassPermissions first and auto last." The binary states it outright too:
 *  "the Shift+Tab permission-mode cycle is default -> acceptEdits -> plan ->
 *  bypassPermissions -> auto -> default, where bypassPermissions and auto appear
 *  only when available in that session. dontAsk is never in the cycle."
 *
 *  "AVAILABLE" DOES NOT MEAN "STARTED IN IT", and this comment said it did.
 *  There are two flags, not one: `--dangerously-skip-permissions` starts the
 *  session in bypass, and `--allow-dangerously-skip-permissions` is described in
 *  the binary as "Enable bypassing all permission checks as an option, without
 *  it being enabled by default". The second one puts bypass in their ring for a
 *  session that did NOT start in bypass, so the old wording was false.
 *
 *  THE FIRST BUILD PUT ALL SIX IN THE RING and called that Claude Code's cycle,
 *  which was false: dontAsk is never in theirs. OURS IS NOT THEIRS EITHER, and
 *  nothing may call it that. Theirs varies per session; ours is a fixed four. It also put the most dangerous
 *  mode two keypresses from resting, which is not a thing to do by accident.
 *
 *  So the ring is default -> acceptEdits -> plan -> auto -> default. It is not
 *  identical to any particular Claude Code session's and this comment does not
 *  claim it is: theirs is default -> acceptEdits -> plan with auto slotted in
 *  after plan when the account has it, and bypass slotted in before auto when
 *  the session HAS BYPASS AVAILABLE, which either flag can arrange, so it varies
 *  per person and per launch.
 *  Ours is fixed. Auto is in it because Agentbox asks for auto by name rather
 *  than waiting to be offered it, and bypass is out of it because no key should
 *  be able to walk somebody into bypass by accident. Bypass is still reachable:
 *  by the chip, by typing the word, and in Settings.
 *
 *  The two that are not in it are still one press of the chip or one typed word
 *  away, and all six are in Settings. Nothing is hidden; the key simply does not
 *  walk you into bypass. */
export const MODE_CYCLE: PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
];

export function nextMode(current: PermissionMode | null): PermissionMode {
  // From nothing picked, from auto, and from either of the two modes that are
  // not in the ring, the first press goes to Manual. That is what Claude Code
  // does from auto, and it is the only safe place to land from outside.
  if (!current) return 'default';
  const i = MODE_CYCLE.indexOf(current);
  if (i < 0) return 'default';
  return MODE_CYCLE[(i + 1) % MODE_CYCLE.length];
}

/* ---------------------------- THE WAY BACK -------------------------------- */
/*
 * HOW YOU UNDO A MODE, NOW THAT THE CHIP IS GONE.
 *
 * The footer chip carried a small `×` beside it, and that `×` was the ONLY way
 * back from a mode set on one message to whatever the project itself is set to.
 *
 * THAT MATTERS BECAUSE THE VALUE PERSISTS. `answerMode` is stored on the row,
 * and Focus reads it back on every open (`setMode(item.answerMode ?? null)`), so
 * a mode picked for one reply is still on the next one. Without a way back, the
 * first time somebody picks bypass for a single message they are in bypass on
 * that row until they notice.
 *
 * AND IT MATTERS MORE SINCE 2026-09-24 (w-34b7b861b6). Until then this was only
 * half true on her screen: the box re-seeded from `answerMode`, but the
 * supervisor cleared the value the moment a run came up, so the mode really did
 * last one send and the footer went back to reading the fleet's. She asked for
 * the other thing, in these words: "It should change for the whole
 * conversation. If you switch to manual mode, every task after that, until you
 * switch it back for that thread, should then be in manual mode." So nothing
 * spends a mode now, and this clear row is the ONLY way back. It is not a
 * convenience any more; it is the off switch.
 *
 * SO THE WAY BACK MOVED INTO THE MENU THAT SURVIVED. It is NOT a seventh mode:
 * it is the absence of one, and everything downstream already understood `null`
 * that way, which is why this is a row rather than a new value.
 *
 * IT IS ONLY OFFERED WHEN THERE IS SOMETHING TO CLEAR, on the same rule the `×`
 * followed: a row saying "go back" on a message that has not been changed is a
 * row that does nothing, and the menu is short enough that a dead row in it is
 * noticeable. */

/**
 * What the clear row types as. Ours, like five of the six mode commands; there
 *  is no `/clear` in Claude Code and this file must not imply there is. */
export const CLEAR_COMMAND = '/clear';
/**
 * What it says it does. Not "Manual" and not "Default": both are real modes
 *  with their own rows above it, and calling this either of them would be
 *  telling somebody they had picked something when they had picked nothing. */
export const CLEAR_WORDS = 'Use the project\'s setting';
export const CLEAR_HINT = 'whatever this project is already set to';
/** The spellings that reach it, in the same shape as MODE_TYPED. */
export const CLEAR_TYPED = ['clear', 'reset', 'project'];

/**
 * The rows the menu draws, which is the modes plus the way back when there is
 *  a mode to come back FROM. `null` is the clear row.
 *
 *  The clear row is LAST on the empty query, because it is the least likely
 *  thing anybody opening the menu wants and the six modes are what the menu is
 *  for. On a typed query it is wherever the query puts it. */
export function menuRowsFor(query: string | null, set: boolean): (PermissionMode | null)[] {
  const modes: (PermissionMode | null)[] = modeMatches(query);
  if (!set) return modes;
  if (query === null) return modes;
  if (query === '') return [...modes, null];
  return CLEAR_TYPED.some((w) => w.startsWith(query)) ? [...modes, null] : modes;
}

/**
 * And the typed-straight-through path, the one that lets somebody write
 *  `/clear ` and carry on without ever seeing the menu. Returns true for the
 *  clear row, a mode for a mode, and null for anything else. */
export function exactClear(query: string | null): boolean {
  return !!query && CLEAR_TYPED.includes(query);
}
