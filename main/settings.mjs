// The settings screen's model: everything the app lets the founder change,
// read from where it actually lives and written back to the same place.
//
// There is no settings STORE here on purpose. Every value below already has a
// home that something else owns — the supervisor's in-memory pause, its state
// file, her config, a file in the project's docs dir — and a second copy of any
// of them is a copy that can disagree with the running fleet. So this module is
// a view and a set of writes, never a cache.
//
// The four per-project settings the screen exists to surface were global arrays
// of slugs in zero.config.json. They still are, because that file is the one
// place a grant is reviewed; what changed is that she edits them as fields on
// the project they belong to instead of in a text editor.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveConfig } from './config.mjs';
import { resolveClaudeBin, forgetClaudeBin, INSTALL_URL } from './claude-bin.mjs';
import { AGENT_MODES } from '../shared/agents.mjs';
import { analyticsKey, diagnosticsOn } from './analytics.mjs';
import { CLAUDE_PERMISSION_MODES } from '../shared/work-items.mjs';
import { accountSentence, engineTroubleNote } from '../shared/spawn-trouble.mjs';
import { readPlan } from './claude-plan.mjs';
import { effectiveProfiles } from './account-discovery.mjs';
import { machineSlots, machineNote, MAX_SLOTS } from './machine.mjs';
import { NAME } from '../shared/product-name.mjs';
import { autoSlots } from './memory-gate.mjs';
import { accountIdentity, claudeLoginCommand, duplicateAccountNote, linkAccountTooling, makeClaudeHome } from './account-tooling.mjs';
import { isEngine } from '../shared/engines.mjs';
import { codexAccount, codexLoginCommand, makeCodexHome } from './codex-account.mjs';
import { codexDefaultModel, codexModels } from './codex-models.mjs';
import { CODEX_DEFAULT_MODE, isCodexMode } from '../shared/codex-modes.mjs';
import { claudeModels } from './claude-models.mjs';
import { resolveCodexBin, forgetCodexBin, INSTALL_URL as CODEX_INSTALL_URL } from './codex-bin.mjs';

// Her Claude Code sessions in her inbox: all of them, only the ones stopped on
// a question, or none. One reader, here, so the settings screen and the
// snapshot the inbox is drawn from cannot end up believing different defaults.
//
// NOBODY'S TERMINAL IS IN THE INBOX UNLESS THEY ASK FOR IT.
//
// So the default is `off` on every install, new or old, and the fact it used to
// turn on — whether this Mac had run Agentbox before — decides nothing any more.
// Her own file has no `outsideAgents` in it, which is why the default is the
// whole of what she sees: measured 2026-08-27, her running app resolved `all`
// out of this line and filed a row for every session on the machine.
//
// SEPARATED IS NOT DELETED, and this is the half that makes it honest. An
// outside session is still on the project's rail in the sidebar (`onTheRail`,
// shared/agents.mjs), which no mode gates, and still opens in one click. It
// just does not queue up beside the work she has to answer.
//
// WHAT SHE IMPORTS IS UNAFFECTED, and it never came through here. The agents
// taken in during the first run are FILES (~/.claude/agents/*.md), and each one
// files its own work item asking for a first job (shared/agent-import.mjs).
// That is the "imported manually" side of her answer, and it is already a
// separate path from this one.
//
// A setting actually chosen still wins over this line.
export function outsideAgentsMode(config) {
  if (AGENT_MODES.includes(config?.outsideAgents)) return config.outsideAgents;
  return 'off';
}

/* ---------------------------- session grants ------------------------------ */
// What a session may do is a list of CLI flags, and the screen offers three
// named shapes over it. The shapes are built from her CURRENT flags rather than
// from a hardcoded list, so choosing one cannot quietly drop the model or the
// git grants she spent a day getting right (CLAUDE.md: capability grants belong
// in sessionArgs, and never in her global settings).

// EVERY WAY THE CLI CAN BE PUT IN A MODE, not just the one we happen to write.
//
// Caught in review, 2026-08-23: this used to know only the two-token form, so
// `--permission-mode=bypassPermissions` and `--dangerously-skip-permissions`
// were carried through as unknown flags and appended AFTER whatever mode the
// screen had just chosen. The CLI takes the last one, so picking Plan over a
// config holding `--dangerously-skip-permissions` produced a session running
// in bypass while the screen said Plan. That is the exact class of lie this
// whole row exists to remove.
const SKIP_FLAGS = ['--dangerously-skip-permissions'];

// NOT A MODE, BUT IT UNDERMINES ONE. Anthropic: this flag "adds the permission
// mode to the cycle without activating it", and a session where bypass is
// available does not enforce plan mode's blocks. So it is not read as a mode,
// and it is dropped the moment somebody picks one, because leaving it beside a
// deliberate choice weakens exactly the choice they just made.
const SKIP_ADJACENT = ['--allow-dangerously-skip-permissions'];

// FLAGS WE DO NOT OWN THAT TAKE A VALUE, so their value is never mistaken for
// one of ours. Caught in review, 2026-08-23: with
// `--append-system-prompt --dangerously-skip-permissions` (a perfectly legal
// pair, the prompt being that literal string) the parser read the value as a
// mode and the flag was left dangling. A parser that guesses arity is a parser
// that silently rewrites somebody's command line.
//
// It is the value-taking flags a person plausibly puts in `sessionArgs`. One we
// have not listed still costs only the old behaviour, which is that its value
// lands in `other` beside it, in order, and is passed through.
const TAKES_A_VALUE = new Set([
  '--append-system-prompt', '--system-prompt', '--append-system-prompt-file',
  '--system-prompt-file', '--settings', '--mcp-config', '--add-dir',
  '--permission-prompt-tool', '--agent', '--agents', '--resume', '--session-id',
  '--fallback-model', '--betas', '--plugin-dir', '--autocompact', '--name',
  '--input-format', '--output-format', '--json-schema', '--max-budget-usd',
  '--tools', '--disallowedTools', '--disallowed-tools', '--setting-sources',
  '--plugin-url', '--ide', '--cwd',
]);

// SOME OF THOSE TAKE A VALUE ONLY SOMETIMES. `--resume` on its own opens the
// session picker; `--resume <id>` resumes one. Consuming the next token blindly
// turned `--resume --permission-mode bypassPermissions` into a run where the
// bypass flag survived a deliberate Plan and won by being last, which is the
// exact mismatch this file exists to prevent. Caught in review, 2026-08-23.
//
// So the rule is the shell's own: a value is the next token ONLY if it does not
// itself look like a flag. That is right for the required ones too, and it means
// a flag missing from the set above costs nothing worse than landing in `other`
// beside its value, in order, which is what always happened.
const takesValue = (flag, next) => TAKES_A_VALUE.has(flag) && next !== undefined && !next.startsWith('--');

export function parseSessionArgs(args) {
  const list = Array.isArray(args) ? args.map(String) : [];
  const out = { model: null, allowedTools: [], permissionMode: null, allowsBypass: false, other: [] };
  let sink = out.other;
  for (let i = 0; i < list.length; i += 1) {
    const arg = list[i];
    // A value we do not own is carried through with its flag and never read as
    // anything, whatever it looks like.
    if (TAKES_A_VALUE.has(arg)) {
      out.other.push(arg);
      if (takesValue(arg, list[i + 1])) { out.other.push(list[i + 1]); i += 1; }
      sink = out.other;
      continue;
    }
    if (arg === '--model') { out.model = list[i + 1] ?? null; i += 1; sink = out.other; continue; }
    if (arg.startsWith('--model=')) { out.model = arg.slice(8); sink = out.other; continue; }
    if (arg === '--permission-mode') { out.permissionMode = list[i + 1] ?? null; i += 1; sink = out.other; continue; }
    if (arg.startsWith('--permission-mode=')) { out.permissionMode = arg.slice(18); sink = out.other; continue; }
    // The bypass shorthand IS a mode, so it is read as one. Nothing else in
    // this file has to know the flag exists.
    if (SKIP_FLAGS.includes(arg)) { out.permissionMode = 'bypassPermissions'; sink = out.other; continue; }
    if (SKIP_ADJACENT.includes(arg)) { out.allowsBypass = true; sink = out.other; continue; }
    // Variadic: every value up to the next flag belongs to --allowedTools.
    if (arg === '--allowedTools' || arg === '--allowed-tools') { sink = out.allowedTools; continue; }
    if (arg.startsWith('--allowedTools=') || arg.startsWith('--allowed-tools=')) {
      out.allowedTools.push(arg.slice(arg.indexOf('=') + 1)); sink = out.other; continue;
    }
    if (arg.startsWith('--')) { out.other.push(arg); sink = out.other; continue; }
    sink.push(arg);
  }
  return out;
}

// CLAUDE CODE'S OWN SIX MODES, plus "custom" for flags that are none of them.
// Custom is a real answer and never silently rounded to the nearest one:
// showing "Accept edits" over grants that are not that is how a screen starts
// lying about the fleet.
//
// She was right. This used to answer 'read', 'edit', 'auto' and 'full', and
// 'read' was not a permission mode at all: it was the absence of the flag plus
// a filtered --allowedTools list, which is a different mechanism wearing a
// mode's name.
//
// The six values below are exactly the choices `claude --permission-mode`
// prints in `claude --help` on 2.1.241, with `default` in place of the CLI's
// `manual` alias because `default` is the config value the docs and the SDK
// use. All seven spellings were handed to the real CLI and all seven started.
// ONE LIST, IN shared/, because the ledger, main and the renderer all need it
// and three copies of six strings is three chances to drift.
export const CLAUDE_MODES = CLAUDE_PERMISSION_MODES;

// The alias the CLI takes for `default`, read back as `default` so one mode
// never shows up as two.
const MODE_ALIASES = { manual: 'default' };

export function permissionMode(args) {
  const parsed = parseSessionArgs(args);
  // Auto is Claude Code's own classifier: every tool call is checked for risk
  // and for prompt injection first, the lower-risk ones run, the rest are
  // blocked.It is NOT bypassPermissions, which runs that check not at all (the
  // CLI's own internal name for that one is yolo), and it is not acceptEdits
  // either. Measured on 2.1.241, same command in the same folder: auto refused
  // to write a file outside the workspace and logged the denial;
  // bypassPermissions wrote it without a word.
  const raw = parsed.permissionMode;
  if (!raw) return 'custom';
  const named = MODE_ALIASES[raw] ?? raw;
  return CLAUDE_MODES.includes(named) ? named : 'custom';
}

export function buildSessionArgs(base, mode) {
  // A mode this file does not know is a bug upstream, and the safe answer is
  // to refuse rather than to quietly drop the grant that is there. Silently
  // removing --permission-mode and adding nothing hands the session back to
  // whatever the machine's own settings say, which is the inheritance this
  // whole feature exists to stop.
  if (!CLAUDE_MODES.includes(mode)) throw new Error(`unknown permission mode: ${mode}`);
  const parsed = parseSessionArgs(base);
  const model = parsed.model ? ['--model', parsed.model] : [];
  // HER TOOL GRANTS ARE CARRIED THROUGH UNTOUCHED. The old 'read' shape used to
  // strip --allowedTools down to the store tools, which meant picking a
  // permission mode quietly rewrote a list that took her a day to get right
  // and that a permission mode has nothing to do with. Claude Code's `plan` is
  // the real read-only mode and it needs no help from us.
  const tools = parsed.allowedTools;
  // Every mode writes its own flag, and the flag is Claude Code's own value.
  // `parsed.other` cannot contain a second way of setting the mode: the parser
  // above lifts the equals form and the bypass shorthand out of it, so exactly
  // one permission flag reaches the CLI and it is the one on the screen.
  const grant = ['--permission-mode', mode];
  return [...model, ...(tools.length ? ['--allowedTools', ...tools] : []), ...grant, ...parsed.other];
}

// THE MODEL, WRITTEN BACK INTO THE SAME LIST buildSessionArgs READS FROM.The
// screen had no control over this at all; the flag was already there and only
// a text editor could change it.
//
// null is a real answer and it means "let the CLI pick", so it REMOVES the
// flag rather than writing an empty one: `--model` with nothing after it is
// how you get a session that will not start.
//
// Everything else in the list is carried through untouched and in its original
// order, for the same reason permission changes are: her grants took a day to
// get right and choosing a model must not quietly drop one of them.
export function setModelArg(base, model) {
  const list = Array.isArray(base) ? base.map(String) : [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === '--model') { i += 1; continue; }
    // AND THE EQUALS FORM. Teaching parseSessionArgs to read `--model=x` while
    // this still removed only `--model x` left a config with both, and the CLI
    // and our own reader would then disagree about which model was running.
    // Caught in review, 2026-08-23.
    if (list[i].startsWith('--model=')) continue;
    out.push(list[i]);
  }
  // Ahead of the rest, which is where parseSessionArgs and every existing
  // config already have it.
  return model ? ['--model', String(model), ...out] : out;
}

/* -------------------------------- reading -------------------------------- */

const lineCount = (text) => (text.trim() ? text.trim().split('\n').length : 0);

// Claude Code: the path, whether it is really there, and where to get it when
// it is not. One reader, here, so the screen and the config cannot disagree.
export function claudeState(config) {
  const found = resolveClaudeBin(config.claudeBinConfigured ?? null);
  return {
    claudeBin: found.path ?? config.claudeBin,
    claudeFound: found.found,
    // Whether the search got an answer at all.
    claudeCertain: found.certain !== false,
    claudeInstallUrl: INSTALL_URL,
  };
}

// LOOK AGAIN, PROPERLY. The last card of the walk will not let anybody into an
// inbox on a Mac with no Claude Code on it (hers, 2026-08-23), so the button
// that says it looked again has to have looked again. The path checks were
// never cached, but the shell answer is held for thirty seconds, and a person
// who installs Claude Code and presses this within those thirty seconds would
// be told no by a memory rather than by a search. That is exactly the promise
// `forgetClaudeBin` exists for.
export function recheckClaude(config) {
  forgetClaudeBin();
  const state = claudeState(config);
  // The config carries the path everything else spawns from, so a search that
  // has just found Claude Code updates it rather than leaving the rest of the
  // app pointing at where it used to not be.
  if (state.claudeFound && state.claudeBin) config.claudeBin = state.claudeBin;
  // And whether it is here at all, which is what decides that a Mac with only
  // Codex runs on Codex (`Supervisor#_enginesFound`). Only a certain answer
  // moves it, so an unsure search never takes Claude Code away from anybody.
  if (state.claudeFound || state.claudeCertain) config.claudeFound = state.claudeFound;
  return state;
}

/**
 * THE SAME THREE FACTS ABOUT CODEX, AND ONE ASYMMETRY THAT IS NOT AN OVERSIGHT.
 *
 * `found`, `certain` and the path, read exactly as `claudeState` reads Claude
 * Code's, out of the sibling finder (main/codex-bin.mjs) that already computes
 * all three. Until now nothing on any screen read them: `engineSettings`
 * returned early without ever saying whether Codex was here, so a Mac where the
 * search missed it said nothing about Codex anywhere at all.
 *
 * `bin` IS THE EMPTY STRING WHEN THERE IS NONE, not the installer's path.
 * `claudeState` falls back to a path because Claude Code is required and
 * anything spawning it should fail with a real path in the message; Codex is
 * optional and `config.codexBin` is deliberately null when it is missing
 * (main/config.mjs), so inventing one here would print a path to a file that is
 * not there under a row that has just said it is not there.
 *
 * READ AT EVERY OPEN OF THE SCREEN, never taken from boot, for the reason
 * claudeState is: somebody who reads "install it, then check again" and does
 * exactly that has to see it turn found without restarting the app. The search
 * is stat calls plus a shell answer held for thirty seconds, and it only runs
 * on a Mac that has opened the gate, so no machine pays for it that would not
 * read the answer.
 *
 * `where` IS THE FINDER'S OWN SEAM, PASSED THROUGH RATHER THAN INVENTED HERE.
 * main/codex-bin.mjs is "a pure function of its inputs so a test can put Codex
 * anywhere without touching the machine it runs on", and the three states this
 * screen draws are its three answers; a card whose unsure state could only be
 * checked by uninstalling Codex from the machine running the suite is a card
 * whose unsure state is not checked. Nothing in the app passes it.
 */
export function codexState(config, where = {}) {
  const found = resolveCodexBin(config.codexBinConfigured ?? null, where);
  return {
    // Empty rather than a path when there is nothing there, which is the same
    // asymmetry `config.codexBin` already keeps (main/config.mjs): a configured
    // path that does not exist is still `found: false`, and printing it under a
    // row that has just said Codex is not here would be the screen arguing with
    // itself.
    bin: found.found ? (found.path ?? '') : '',
    found: found.found,
    // Whether the search got an answer at all.
    certain: found.certain !== false,
    url: CODEX_INSTALL_URL,
  };
}

/** `codexState` under the names the walk's last card reads beside Claude's. */
export function codexFoundState(config, where = {}) {
  const state = codexState(config, where);
  return { codexFound: state.found, codexCertain: state.certain, codexInstallUrl: state.url };
}

/**
 * LOOK AGAIN, PROPERLY, for the second engine. The twin of `recheckClaude`
 *  above, and it earns its place for a sharper reason: finding Codex here is
 *  what puts `codexBin` on the config, which is what `engineChoices` reads, so
 *  a search that succeeds is also what makes the Coding agent row appear
 *  without a restart. */
export function recheckCodex(config) {
  forgetCodexBin();
  const state = codexState(config);
  config.codexBin = state.found ? state.bin : null;
  return state;
}

export function readSettings({ config, supervisor, store }) {
  const products = store.listProducts();
  const status = supervisor.status();
  const sessions = [...supervisor.sessions.values()];
  const workspaceArgs = Array.isArray(config.sessionArgs) ? config.sessionArgs : [];
  // Read once and used twice below, so the ceiling the stepper offers and the
  // sentence explaining it cannot come from two different answers.
  const slotsHere = machineSlots();

  let standing = '';
  try { standing = supervisor.readStanding(); } catch {}
  // ONE document since w-3dc46f3a67, where the writing rules and the finishing
  // rules were two boxes on the same page.
  let messageRules = '';
  try { messageRules = supervisor.readMessageRules(); } catch {}

  // THE SAME LIST THE FLEET SPAWNS ON, from the one module that decides it
  // (main/account-discovery.mjs): what she configured, plus any subscription
  // signed in on this machine that none of hers already covers. A page that
  // derived its own list is how an account she had logged into could be
  // missing from the screen while she was looking straight at it.
  const profiles = effectiveProfiles(config.authProfiles, { home: config.home });
  const now = Date.now();
  // THE ACCOUNTS PAGE IS WHERE AN ACCOUNT-SHAPED PROBLEM BELONGS, and until it
  // had no word for the only one that ever really happens. A signed-out
  // subscription read here as "resting", which is what a healthy account that
  // has had a bad half hour also reads as, so the page could not tell her the
  // one thing she could have acted on. It says it now, and it says it without
  // waiting, because a page she chose to open interrupts nobody.
  const troubles = status.accountTrouble ?? {};
  const accounts = (profiles.length ? profiles : ['default']).map((profile) => {
    const trouble = troubles[profile] ?? null;
    const resting = (supervisor._profileCooldown?.[profile] ?? 0) >= now;
    // WHOSE SUBSCRIPTION THIS ROW IS, not merely which folder it lives in.
    // The page named its rows after folders, so nothing on it could tell her
    // that her work account had been replaced by her personal one;
    // main/account-tooling.mjs has the morning that cost. Null when the
    // folder holds no login, and then the row reads as it always did.
    const identity = accountIdentity(profile === 'default' ? null : profile);
    return {
      profile,
      email: identity?.email ?? null,
      accountUuid: identity?.accountUuid ?? null,
      // WHICH ONE RUNS, when she has picked one. False on every row while she
      // has not, and then every account runs as it always has.
      chosen: (config.activeAccount?.claude ?? null) === profile,
      // The default profile is whatever ~/.claude holds; anything else is a
      // second logged-in home directory, and its path is the only name it has.
      label: profile === 'default' ? 'default' : path.basename(profile),
      dir: profile === 'default' ? null : profile,
      cooldownUntil: supervisor._profileCooldown?.[profile] ?? 0,
      live: !resting && !trouble,
      state: trouble ? trouble.cause : resting ? 'resting' : 'live',
      trouble: trouble ? { cause: trouble.cause, since: trouble.since, note: accountSentence(trouble.cause, profile === 'default' ? null : profile) } : null,
      // SESSIONS ON THIS SUBSCRIPTION, NOT SESSIONS IN A FOLDER OF THIS NAME.
      // `profile` is a folder and a CODEX worker's profile is also 'default',
      // so this counted Codex threads as sessions on her Claude login -- the
      // exact collision `_accountKey` exists to prevent (: a fact about one
      // account applied to another), reappearing in a second place. The key is
      // asked for rather than spelled here, because the supervisor owns how one
      // is spelled; a session written before the second engine existed carries
      // no engine and reads as Claude Code, which is what it is.
      running: sessions.filter((s) => supervisor._accountKey(s.engine, s.profile) === profile).length,
      // WHICH PLAN THIS ACCOUNT IS ON. Nothing in the app had ever said, on
      // any screen, and the founder's own bullet off a tester's onboarding was
      // the question "not on max plan?" asked out loud about somebody else's
      // Mac. This page already exists to hold an account-shaped fact; the plan
      // is the plainest one there is, and it decides how many sessions Agentbox
      // is willing to start.
      //
      // Read here rather than kept, because Claude Code refreshes its own
      // profile as it runs and this page is opened by hand a few times a day.
      // `null` when the file cannot be read, and then no screen says anything.
      plan: (() => { const p = readPlan(profile); return p.known ? { label: p.label, max: p.max } : null; })(),
    };
  });

  const projects = products.map((product) => {
    let instructions = '';
    try { instructions = supervisor.readProjectInstructions(product.slug); } catch {}
    const override = supervisor.projectSessionArgs(product.slug);
    return {
      slug: product.slug,
      name: product.name,
      dir: product.dir,
      repoPath: product.repoPath,
      // THE MARK, already a drawable url or null, resolved once by listProducts.
      logo: product.logo,
      // ONE SWITCH A PROJECT STILL HAS (w-d19d6d387c, 2026-09-22). It had five
      // controls, and what they did was not clear even after reading their
      // labels, so project-level instructions replace them. The drive, the
      // per-project pause and personal mode are gone from the app entirely.
      // `permission` stays readable because `projectSessionArgs` is still
      // honoured for anyone who sets one in the config by hand, and the page
      // draws it only where one exists, so there is always a way back to the
      // workspace default and never a strip of Claude Code jargon on a page
      // she opens to change her rules.
      autonomous: (config.autonomousProducts ?? []).includes(product.slug),
      permission: override ? permissionMode(override) : 'workspace',
      permissionArgs: override ?? null,
      codexMode: config.projectCodexMode?.[product.slug] ?? 'workspace',
      instructions,
      running: sessions.filter((s) => s.product === product.slug).length,
    };
  });

  // ARCHIVED PROJECTS, only so the Projects page can bring one back. Name and
  // folder, the two things that tell three projects called Daydream apart.
  let archivedProjects = [];
  try {
    archivedProjects = store.listProducts({ includeArchived: true })
      .filter((p) => p.archived === true)
      .map((p) => ({ slug: p.slug, name: p.name, dir: p.dir }));
  } catch {}

  return {
    archivedProjects,
    workspace: {
      agentsRunning: !supervisor.paused,
      sessionsAtOnce: config.maxConcurrentSessions,
      // THE PLAN THAT SET THE NUMBER ABOVE, when a plan set it. Null in the
      // ordinary case: she picked the number herself, or it is the three every
      // install has always had. It is only ever filled in when somebody would
      // otherwise open this page, see one, and have nothing on the screen to
      // explain it.
      sessionsAtOnceFromPlan: config.planSlotsFrom ?? null,
      // WHAT WE SUGGEST FOR THIS MAC, AND WHY. Not a ceiling: `slotsMax` is the
      // control's own range and is the same number on every machine, while
      // `slotsSuggested` is what main worked out from the hardware
      // (main/machine.mjs). `machineNote` is the one sentence that says so, and
      // it goes quiet once somebody is at or under the suggestion.
      slotsSuggested: slotsHere.slots,
      slotsMax: MAX_SLOTS,
      machineNote: machineNote(slotsHere, config.maxConcurrentSessions),
      memoryGate: memoryGateSettings({ config, supervisor }),
      leftovers: leftoverSettings({ config, supervisor }),
      capacity: status.capacity,
      running: sessions.length,
      model: parseSessionArgs(workspaceArgs).model,
      // THE SECOND CODING AGENT, and everything a screen needs to draw a choice
      // between the two.
      //
      // `engineChoices` is the supervisor's own answer, not a look at the disk:
      // it asks the capability gate before it asks whether Codex is installed,
      // so a Mac with Codex on it and no `engineChoice` moment in her config
      // comes back with ONE entry and this screen draws exactly what it drew
      // before. A page that derived its own list would offer her a choice the
      // supervisor is about to refuse.
      ...engineSettings(supervisor, config),
      permission: permissionMode(workspaceArgs),
      permissionArgs: workspaceArgs,
      // ONE SWITCH FOR EVERYTHING THAT LEAVES THE MACHINE, and it is on when
      // Agentbox is installed (legal/privacy.html, section 10). Off stops the
      // counts AND the crash reports; there is deliberately no partial mode and
      // no second switch, because the page promises there is not.
      diagnostics: diagnosticsOn(config),
      // Whether this copy has anywhere to send to at all. A build from source
      // has no key, so the switch can read on while nothing whatsoever leaves,
      // and a screen that does not say so is a screen that is lying quietly.
      diagnosticsDestination: !!analyticsKey(config),
      // ADHD mode: whether the ADHD rules ride under hers (w-5737fe67cf). Off
      // unless she turned it on, so only `true` means on.
      adhdMode: config.adhdMode === true,
      // How much of her own Claude Code goes in her inbox: all / waiting / off.
      // All by default, because the machine nobody has opened this page on is
      // the one with thirteen forgotten sessions on it.
      outsideAgents: outsideAgentsMode(config),
      accounts,
      // The one thing the page could not say on 2026-08-29: that both of her
      // rows had become the same subscription. Null on the ordinary machine,
      // where they differ.
      accountsNote: duplicateAccountNote(accounts),
      storePath: config.accountRoot,
      // THE HOME FOLDER ITSELF, said rather than derived. The renderer used to
      // get at it by taking the last segment off `storePath`, which is not the
      // home folder at all: it is `<store root>/accounts`. Two screens read
      // that value as a home and both were wrong with it. The walk's folder
      // screen never shortened a path to `~`, and worse, the New Project card
      // proposes a parent folder judged against the home it is given, so on a
      // Mac with no projects yet it proposed putting the first project's code
      // INSIDE the store, and on one whose only project sits in ~/Documents it
      // proposed ~/Documents, which is the guarded folder this whole row exists
      // to stop us proposing.
      homePath: os.homedir(),
      // Looked up again on every read of this screen, not taken from boot.
      // Someone who reads "install it, then open this screen again" and does
      // exactly that has to see it turn found, without restarting the app.
      ...claudeState(config),
      // AND WHETHER CODEX IS, because the app needs one of the two and not
      // both: the last card of the walk only shuts the inbox when neither is
      // here (renderer/src/App.tsx).
      ...codexFoundState(config),
      // AND WHAT THIS MAC'S CLAUDE CODE CALLS ITS MODELS.
      //
      // In the same trip, and for the same reason the line above is looked up
      // again rather than taken from boot: someone who runs `claude update` and
      // reopens the app has to see the new model without waiting for a release
      // of Agentbox. Read off the binary, cached against its own mtime, and
      // falling back to the table committed at build time on a Mac that has no
      // Claude Code on it (main/claude-models.mjs).
      claudeModels: claudeModels({ bin: config.claudeBin }).models
        // WITH THE LEVEL EACH ONE THINKS AT WHEN NOBODY PICKS, beside its name
        // rather than as a list of its own, the same shape the Codex rows
        // above already use. It is per model and it really differs.
        .map((m) => ({ id: m.alias, label: m.label, model: m.id, defaultLevel: m.defaultLevel })),
      standingLines: lineCount(standing),
      messageRulesLines: lineCount(messageRules),
      projectsWithInstructions: projects.filter((p) => p.instructions.trim()).length,
      projectCount: projects.length,
    },
    projects,
  };
}

/**
 * THE SECOND CODING AGENT, AS MUCH OF IT AS A SCREEN MAY KNOW.
 *
 * `engineChoices` is `Supervisor#engineChoices`, which is the one place that
 * asks the capability gate. One entry means no choice, and every surface reads
 * it the same way: the composer draws no clause, the Settings row is not drawn,
 * the byline names nothing.
 *
 * AND CODEX'S MODEL LIST IS ONLY READ WHEN THERE IS A CHOICE. Reading it means
 * parsing the 199KB cache codex-cli keeps (main/codex-models.mjs, measured
 * 2026-09-04), and on a Mac with one coding agent that is work with no reader.
 * The empty answer costs those machines nothing and is also exactly what they
 * should be told.
 *
 * IT RIDES THE SETTINGS MODEL RATHER THAN THE SNAPSHOT for the same reason, the
 * other way up: the snapshot is refetched every few seconds and a picker must
 * not be the reason a 199KB file is parsed while she is typing. What the INBOX
 * needs -- whether there is a choice, and which engine each row runs on -- is on
 * the snapshot instead, and both come from the same method.
 */
/**
 * ONE SENTENCE OR NOTHING, and the words are shared/spawn-trouble.mjs's, not
 *  this file's: every sentence the app says about a dead run lives there, once,
 *  so two surfaces cannot end up with two vocabularies. */
function engineTroubleFor(supervisor, engine) {
  const trouble = supervisor.engineTrouble(engine);
  return trouble ? engineTroubleNote(trouble.cause) : null;
}

function engineSettings(supervisor, config) {
  const choices = supervisor.engineChoices();
  const engine = supervisor.engineFacts().workspace;
  // WHETHER THIS MAC HAS ASKED TO HEAR ABOUT CODEX AT ALL, which is a different
  // question from whether there is a choice, and is the one the connection card
  // is drawn on. `Supervisor#engineChoiceOpened` says why at length.
  //
  // AND WHETHER IT CAN ACTUALLY RUN ANYTHING, which the card had no way to say.
  // `engineTrouble` is the supervisor's own book, read through the account key
  // it was really written at, because the Accounts page next door indexes by a
  // bare Claude folder name and could never match `codex:default`. Null on a
  // healthy engine, and then the card reads exactly as it always did. WHICH
  // CODEX ACCOUNT, WHICH THE CARD COULD NOT SAY UNTIL NOW.The card was built
  // with a reason for that silence -- auth.json held no email and no plan --
  // and that stopped being true somewhere between codex-cli versions.
  // main/codex-account.mjs holds the measurement. Null when nobody is signed
  // in, and the card then reads exactly as it always did.
  // A Mac that runs on Codex alone has asked about it by having nothing else.
  const codexIsHome = engine === 'codex';
  const codex = supervisor.engineChoiceOpened() || codexIsHome
    ? {
      ...codexState(config),
      trouble: engineTroubleFor(supervisor, 'codex'),
      account: codexAccount(supervisor._codexHome()),
      // EVERY CODEX LOGIN ON THE MAC, NOT JUST THE FIRST. The supervisor has
      // run one app-server per CODEX_HOME since a second login became real;
      // what never existed was a screen that could see them. One entry per
      // `codexProfiles` word, resolved through the supervisor's own mapping so
      // the card and the fleet cannot disagree about which folder a name
      // means.
      accounts: codexAccountRows(supervisor),
    }
    : null;
  if (choices.length < 2 && !codexIsHome) {
    return { engine, engineChoices: choices, codex, codexModels: [], codexModelDefault: null, codexModel: null };
  }
  const home = supervisor._codexHome();
  return {
    engine,
    engineChoices: choices,
    codex,
    // WITH EACH MODEL'S OWN REASONING LEVELS. They differ per model, and the
    // strip in the model drawer draws the picked model's list, so they travel
    // beside the name rather than as a list of their own that could disagree
    // with it.
    codexModels: codexModels({ home }).map((m) => ({
      id: m.id, label: m.label, levels: m.levels.map((l) => l.id), defaultLevel: m.defaultLevel,
    })),
    // What her own `codex` in a terminal runs, so the card's word and her
    // terminal cannot disagree. Null is a real answer and the card says
    // "Codex's own" for it rather than guessing (renderer/src/models.ts).
    codexModelDefault: codexDefaultModel({ home }),
    // AND WHAT SHE HAS SET FOR THE WHOLE WORKSPACE, which is the value the
    // Model row draws when Codex is the coding agent. Null means she has set
    // none, and then the row draws the default above and nothing is sent
    // (`Supervisor#codexThreadParamsFor`).
    codexModel: supervisor._codexWorkspaceModel(),
    // WHAT A CODEX WORKER MAY DO, for the whole workspace. The picker reads
    // this; `Supervisor#effectiveCodexMode` is what a run reads, and it layers
    // the project's answer over this one.
    codexMode: isCodexMode(config.codexMode) ? config.codexMode : CODEX_DEFAULT_MODE,
  };
}

/* -------------------------------- writing -------------------------------- */

const withSlug = (list, slug, on) => {
  const set = new Set(Array.isArray(list) ? list : []);
  if (on) set.add(slug); else set.delete(slug);
  return [...set];
};

// One switch on one project, and there is one switch left (w-d19d6d387c). It
// writes her config, the way the workspace settings beside it do. `personal`,
// `paused` and `driven` were the other three and all three are gone from the
// app: the first two because she could not tell what they did and would never
// have used them, the third because the self-driving it belonged to is deleted.
export function setProjectSetting({ config, supervisor }, { product, key, value }) {
  if (!product) throw new Error('no project');
  switch (key) {
    case 'autonomous':
      saveConfig(config, { autonomousProducts: withSlug(config.autonomousProducts, product, !!value) });
      break;
    // WHICH OF HER CLAUDE CODE AGENTS THIS PROJECT TOOK. Names only: the files
    // stay where their author put them and Agentbox never copies or moves one,
    // so a list here that has gone stale costs nothing and an agent she
    // deletes simply stops being found.
    case 'agents': {
      const map = { ...(config.projectAgents ?? {}) };
      const names = Array.isArray(value) ? value.filter((n) => typeof n === 'string' && n.trim()) : [];
      if (!names.length) delete map[product];
      else map[product] = names;
      saveConfig(config, { projectAgents: Object.keys(map).length ? map : undefined });
      break;
    }
    // Refused rather than coerced if it is not one of Claude Code's six, the
    // same rule outsideAgents follows below. buildSessionArgs throws on an
    // unknown mode too; this is the check at the boundary, where the message
    // can say which setting was wrong.
    case 'permission': {
      if (value !== 'workspace' && !CLAUDE_MODES.includes(value)) {
        throw new Error(`unknown permission mode: ${value}`);
      }
      const map = { ...(config.projectSessionArgs ?? {}) };
      if (value === 'workspace') delete map[product];
      else map[product] = buildSessionArgs(config.sessionArgs ?? [], value);
      // An empty map is removed rather than written as `{}`: her config file is
      // read by people, and a key that means nothing is a key that gets asked
      // about.
      saveConfig(config, { projectSessionArgs: Object.keys(map).length ? map : undefined });
      break;
    }
    // The Codex half, stored the same way and with the same 'workspace' escape
    // meaning "stop having an opinion of your own".
    case 'codexMode': {
      if (value !== 'workspace' && !isCodexMode(value)) throw new Error(`unknown codex mode: ${value}`);
      const map = { ...(config.projectCodexMode ?? {}) };
      if (value === 'workspace') delete map[product];
      else map[product] = value;
      saveConfig(config, { projectCodexMode: Object.keys(map).length ? map : undefined });
      break;
    }
    default:
      throw new Error(`unknown project setting: ${key}`);
  }
  return true;
}


/**
 * EVERY CODEX LOGIN THIS MAC HOLDS, in the shape the agent card draws.
 *
 * `profile` is the word the fleet spawns on and `default` is her primary login
 * rather than a folder called "default" -- `_codexProfileHome` owns that
 * mapping and is asked rather than copied, because two spellings of it is how
 * the app came to show one account's models while billing another.
 *
 * A folder with no readable login still gets a row: it is a thing she added and
 * can remove, and a row that vanishes silently is worse than one saying it is
 * not signed in.
 */
function codexAccountRows(supervisor) {
  const chosen = supervisor.config.activeAccount?.codex ?? null;
  return supervisor._codexProfiles().map((profile) => {
    const home = supervisor._codexProfileHome(profile);
    const id = codexAccount(home);
    return {
      profile,
      email: id?.email ?? null,
      name: id?.name ?? null,
      plan: id?.plan ?? null,
      planNamed: id?.planNamed ?? false,
      accountId: id?.accountId ?? null,
      signedIn: !!id,
      // WHICH ONE RUNS. Null when she has never picked, and then every account
      // runs and the card says so rather than marking one at random.
      chosen: chosen === profile,
    };
  });
}


/**
 * MAKE ROOM FOR A SECOND CODEX LOGIN AND HAND BACK THE LINE THAT FILLS IT.
 *
 * The card used to print a command for her to run and the command was broken:
 * codex-cli refuses a CODEX_HOME that does not exist yet.
 *
 * So the app does the two parts she should never have had to do -- making the
 * folder and telling the fleet the login exists -- and the terminal is left
 * with the one part that is genuinely hers, which is signing in to OpenAI in a
 * browser. `codex login` is their OAuth flow and this app has no business
 * driving it.
 *
 * THE PROFILE IS REGISTERED BEFORE THE LOGIN, not after, and that is deliberate.
 * The row appears immediately, reading "Not signed in", so a sign-in she
 * abandons leaves something she can see and remove rather than an empty folder
 * nothing mentions.
 */
export function addCodexAccount({ config, supervisor }) {
  const made = makeCodexHome({ home: config.home });
  const existing = (config.codexProfiles ?? []).map((x) => x || 'default');
  const list = existing.length ? existing : ['default'];
  saveConfig(config, { codexProfiles: [...list, made.profile] });
  supervisor.onChange?.();
  return { home: made.home, profile: made.profile, command: codexLoginCommand(made.home) };
}

/**
 * THE SAME DOOR FOR CLAUDE CODE, which it did not have until 2026-09-22.
 *
 * The Claude card described the logins on the disk and offered no way to add
 * one, on her instruction of 2026-08-30: we should not encourage multi
 * accounting while this was a product we sold. She withdrew that on
 * w-3498e0cad2 ("we're no longer offering this as a commercially viable
 * product... the rules have changed so I think you should allow
 * multi-accounting"), and this is the door that decision asked for. Her reason
 * for wanting it is the ordinary one: a work login and a personal login, both
 * live, on one Mac.
 *
 * Everything else is the Codex flow exactly. Main makes the folder and
 * registers the profile, so the row appears immediately reading "Not signed
 * in"; the terminal is left with the browser half, which is genuinely hers.
 *
 * THE TOOLING IS LINKED AT CREATION, which the Codex side has no equivalent of.
 * `linkAccountTooling` otherwise runs at the first spawn, and the first thing
 * that happens in this folder is not a spawn, it is her own session in the
 * settings terminal. Linking here means her skills, commands and agents are
 * already there when she signs in.
 */
export function addClaudeAccount({ config, supervisor }) {
  const made = makeClaudeHome({ home: config.home });
  const existing = (config.authProfiles ?? []).map((x) => x || 'default');
  const list = existing.length ? existing : ['default'];
  saveConfig(config, { authProfiles: [...list, made.profile] });
  // A failure here is a folder without her skills in it, which is a smaller
  // thing than a sign in that does not happen: the links are retried at every
  // spawn anyway.
  try { linkAccountTooling(made.home, { home: config.home }); } catch { /* the spawn links it */ }
  supervisor.onChange?.();
  return { home: made.home, profile: made.profile, command: claudeLoginCommand(made.home) };
}

/**
 * The Agents page's memory rows: the switch, the number of heavy commands at
 * once (null is Auto), what Auto works out to here, and one sentence about
 * right now while it is on.
 */
export function memoryGateSettings({ config, supervisor }) {
  const on = !!config.memoryGate;
  const slots = Number.isFinite(config.memoryGateSlots) ? config.memoryGateSlots : null;
  // What Auto works out to on this Mac, whether or not somebody picked.
  const slotsAuto = autoSlots(os.totalmem());
  let now = null;
  if (on) {
    let s = null;
    try { s = supervisor.memoryGateStatus?.() ?? null; } catch {}
    if (s?.role === 'standby') now = `Another ${NAME} on this Mac is coordinating.`;
    else if (s) {
      const heavy = (s.running ?? []).filter((r) => r.holdsSlot).length;
      const waiting = (s.waiting ?? []).length;
      const mem = s.pressure === 'critical' ? 'Memory is very short.' : s.pressure === 'tight' ? 'Memory is tight.' : 'Memory is fine.';
      const run = heavy ? `${heavy} heavy command${heavy === 1 ? '' : 's'} running` : 'Nothing heavy running';
      now = `${mem} ${run}${waiting ? `, ${waiting} waiting` : ''}.`;
    }
  }
  return { on, slots, slotsAuto, slotsMax: MAX_SLOTS, now };
}

/**
 * The Agents page's leftovers row: the switch, and one sentence about what
 * finished agents have left running while it is on.
 */
export function leftoverSettings({ config, supervisor }) {
  const on = !!config.cleanupLeftovers;
  let now = null;
  if (on) {
    let s = null;
    try { s = supervisor.leftoverStatus?.() ?? null; } catch {}
    const list = s?.leftovers ?? [];
    const stoppable = list.reduce((n, l) => n + (l.programs ?? 0), 0);
    const kept = list.reduce((n, l) => n + (l.kept ?? 0), 0);
    const total = stoppable + kept;
    if (!total) now = 'Nothing left running by finished agents.';
    else {
      const next = list.filter((l) => l.programs && l.stopsAt).map((l) => l.stopsAt).sort((a, b) => a - b)[0];
      const when = (ms) => {
        const m = Math.max(1, Math.round((ms - Date.now()) / 60_000));
        return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ''}` : `${m} m`;
      };
      now = `Finished agents have left ${total} program${total === 1 ? '' : 's'} running.`;
      if (stoppable) now += ` ${stoppable} ${next && next > Date.now() ? `stop in ${when(next)}` : 'are stopping'}`;
      if (kept) now += `${stoppable ? ';' : ''} ${kept} ${kept === 1 ? 'is' : 'are'} kept`;
      now += '.';
      const survivors = s?.survivors?.length ?? 0;
      if (survivors) now += ` ${survivors} did not stop when asked.`;
    }
  }
  return { on, now };
}

export function setWorkspaceSetting({ config, supervisor }, { key, value }) {
  switch (key) {
    case 'agentsRunning':
      supervisor.paused = !value;
      supervisor.onChange?.();
      break;
    case 'sessionsAtOnce': {
      // THE MACHINE DOES NOT CLAMP THIS, and for one round it did. These are
      // developers using the tool as they want, so the range is the control's
      // own range, the same on every Mac. What the hardware does is SUGGEST a
      // starting number, one row up.
      const n = Math.max(1, Math.min(MAX_SLOTS, Math.round(Number(value) || 1)));
      saveConfig(config, { maxConcurrentSessions: n });
      // An explicit choice replaces the startup plan suggestion for BOTH
      // engines. Leaving this marker set makes Codex ignore the new number
      // until loadConfig runs again at restart. It is derived, not persisted.
      config.planSlotsFrom = null;
      // Fill newly available slots through the usual queue and its guards.
      // Lowering the cap leaves existing work running and gates new starts.
      supervisor.wake?.();
      break;
    }
    // Written as an opt-OUT (`diagnostics: false`) so that on is what a config
    // she has never touched means, and so that turning it off is a key she can
    // see in her own file. `saveConfig` mutates the live config too, and
    // main/analytics.mjs reads the switch at every send, so off takes effect
    // from the moment she moves it and not at the next launch.
    // HOLD HEAVY WORK WHEN MEMORY IS SHORT (w-3958c3753d). Takes effect now:
    // the coordinator starts or stops this moment, and workers spawned from
    // here on carry the check or do not. A worker already running keeps the
    // hooks it was started with; with the switch off its hook finds no socket
    // and lets every command straight through.
    case 'memoryGate':
      saveConfig(config, { memoryGate: !!value });
      supervisor.setMemoryGate?.(!!value)?.catch?.((e) => console.warn('zero: memory gate:', e.message));
      supervisor.onChange?.();
      break;
    // STOP WHAT FINISHED AGENTS LEAVE RUNNING (main/leftovers.mjs). Turning it
    // on records the moment, which is the earliest the clock may start from.
    case 'cleanupLeftovers':
      saveConfig(config, value ? { cleanupLeftovers: true, cleanupLeftoversSince: Date.now() } : { cleanupLeftovers: false });
      supervisor.setLeftoverCleanup?.(!!value)?.catch?.((e) => console.warn('zero: leftovers:', e.message));
      supervisor.onChange?.();
      break;
    case 'memoryGateSlots': {
      const n = value === null || value === undefined || value === 'auto'
        ? null
        : Math.max(1, Math.min(MAX_SLOTS, Math.round(Number(value) || 1)));
      saveConfig(config, { memoryGateSlots: n });
      if (config.memoryGate) supervisor.setMemoryGate?.(true)?.catch?.(() => {});
      supervisor.onChange?.();
      break;
    }
    case 'diagnostics':
      saveConfig(config, { diagnostics: !!value });
      break;
    // ADHD MODE (w-5737fe67cf). Off out of the box: the key appears in her file
    // only once she has touched the switch. The supervisor reads it at every
    // spawn, so it applies from the next task on.
    case 'adhdMode':
      saveConfig(config, { adhdMode: !!value });
      break;
    // WHICH ACCOUNT HER WORK RUNS ON.
    //
    // ONE KEY HOLDS BOTH ENGINES, because a profile word means different things
    // to each of them -- a Claude entry is a CLAUDE_CONFIG_DIR and a Codex entry
    // is a CODEX_HOME, and both call their first login 'default'. Keeping them
    // in one object keyed by engine is what stops a Codex pick being read as a
    // Claude one, which is the collision `_accountKey` exists to prevent.
    //
    // NULL CLEARS IT, and clearing means every account runs again, which is what
    // this machine did before she ever picked. `Supervisor#_narrowToChosen` also
    // ignores a name that no longer exists, so a login she removes cannot wedge
    // the fleet.
    case 'activeAccount': {
      const engineId = value?.engine;
      if (!isEngine(engineId)) throw new Error(`unknown coding agent: ${engineId}`);
      const profile = typeof value?.profile === 'string' && value.profile ? value.profile : null;
      saveConfig(config, { activeAccount: { ...(config.activeAccount ?? {}), [engineId]: profile } });
      supervisor.onChange?.();
      break;
    }
    // HER AGENTS, HOW MANY OF THEM INTERRUPT. Refused rather than coerced if it
    // is not one of the three: a mode nothing understands is an inbox that
    // silently shows her nothing, which is the failure mode this codebase cares
    // about most wearing different clothes.
    case 'outsideAgents': {
      if (!AGENT_MODES.includes(value)) throw new Error(`unknown agent mode: ${value}`);
      saveConfig(config, { outsideAgents: value });
      break;
    }
    case 'permission':
      if (!CLAUDE_MODES.includes(value)) throw new Error(`unknown permission mode: ${value}`);
      saveConfig(config, { sessionArgs: buildSessionArgs(config.sessionArgs ?? [], value) });
      break;
    // THE SAME QUESTION FOR THE OTHER ENGINE, and it is a separate key because
    // it is a separate answer: a Claude Code mode and a Codex mode are not
    // translations of each other and never round-trip. shared/codex-modes.mjs
    // holds the three and why there are three.
    case 'codexMode':
      if (!isCodexMode(value)) throw new Error(`unknown codex mode: ${value}`);
      saveConfig(config, { codexMode: value });
      break;
    // WHICH CODING AGENT PICKS A TASK UP when the task itself says nothing.
    // Refused rather than coerced if it is not one of the engines, for the same
    // reason `outsideAgents` is: a word nothing understands is a fleet running
    // somewhere she cannot see.
    //
    // THIS SETS THE DEFAULT AND IT DOES NOT OPEN THE GATE. `engineFor` still
    // needs the moment in `zero.config.json`, so writing `codex` here on a Mac
    // that has not opted in changes nothing about what runs -- which is also
    // why the row that writes it is not drawn there.
    //
    // AND IT WRITES WHEN, WHICH IS WHAT MAKES THE ROLLBACK LIFECYCLE HOLD
    // (2026-09-05). `engineChoice` means "Codex may be chosen FROM NOW ON", and
    // a workspace default with no date on it sat outside that promise: close the
    // gate, reopen it with a newer moment, and a `codex` default set weeks
    // earlier immediately routed every unmarked row to Codex again without her
    // saying so. `engineDefaultIsStale` in shared/engines.mjs is the check, and
    // says why an ABSENT stamp still means honoured. This is the only place in
    // the app that writes either key, so the pair cannot be written half way,
    // and both ride in one `saveConfig` patch rather than two.
    case 'engine': {
      if (!isEngine(value)) throw new Error(`unknown coding agent: ${value}`);
      saveConfig(config, { engine: value, engineAt: new Date().toISOString() });
      break;
    }
    // WHAT EVERY CODEX AGENT RUNS ON, which is a different setting living in a
    // different place, because `--model` is a Claude Code flag and Codex has no
    // argv at all: its model is a field on `thread/start`
    // (`Supervisor#codexThreadParamsFor`, which is the one place the two words
    // are resolved and says the precedence in full).
    //
    // "CODEX'S OWN" IS THE KEY BEING ABSENT, never an empty string in her file.
    // Her config is read by people, and a key that means nothing is a key that
    // gets asked about -- the rule `projectSessionArgs` already follows. It is
    // also what keeps a Mac nobody has opened this screen on behaving exactly as
    // it did: nothing set, nothing sent, `~/.codex/config.toml` decides.
    //
    // NOT VALIDATED AGAINST THE MODEL LIST HERE. The screen only offers slugs
    // read off this Mac, and the run refuses a word Codex does not know with a
    // sentence naming this setting, so a check here would be a second copy of
    // that rule that can disagree with it.
    case 'codexModel': {
      const model = value === null || value === undefined || String(value).trim() === ''
        ? undefined
        : String(value).trim();
      saveConfig(config, { codexModel: model });
      break;
    }
    // WHAT EVERY AGENT RUNS ON. One flag in one list, and the empty string and
    // null both mean the CLI's own default, which is the flag being absent.
    case 'model': {
      const model = value === null || value === undefined || value === '' ? null : String(value);
      saveConfig(config, { sessionArgs: setModelArg(config.sessionArgs ?? [], model) });
      break;
    }
    default:
      throw new Error(`unknown workspace setting: ${key}`);
  }
  return true;
}
