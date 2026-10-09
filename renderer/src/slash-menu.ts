// 2026-09-15: Codex now offers /compact through its own IPC operation.
// The historical notes below describe why the remaining Claude rows stay gated.
import { providerCommands } from '../../shared/provider-commands.mjs';
// THE ONE LIST BEHIND THE "/" MENU, NOW THAT IT HOLDS TWO DIFFERENT VERBS.
//
// Of three ways of doing that, the one chosen keeps the six modes at the top
// and adds only the commands that say something about how a message runs:
// /model, /effort, /fast, /goal, /context, /usage, /mcp, /compact.
//
// THE MENU HOLDS TWO KINDS OF ROW AND THEY DO NOT DO THE SAME THING, and that
// is the whole reason this file exists rather than the rows being appended to
// modeMatches:
//
//   A MODE ROW SETS A VALUE ON THE MESSAGE SHE IS WRITING. The box empties, the
//   toast says what this send will run as, and she carries on writing. Six of
//   them, plus the way back. modes.ts.
//
//   A COMMAND ROW IS A MESSAGE OF ITS OWN. It types `/context ` into the box
//   and stops. She presses Send, Claude Code runs it, and the answer comes back
//   in the thread.
//
// The second shape is not a design preference, it is the measurement. Taken
// 2026-08-27 against the installed 2.1.246: a prompt of `/context` followed by
// a blank line and a real question returned the context table and nothing else,
// 142 lines with zero mentions of the question. A command eats the message it
// is attached to, so it cannot be a modifier the way a permission mode is.
// shared/claude-commands.mjs carries that measurement in full.
//
// The mode rows lost their second column to get there, because a list cannot
// read as one list while half of it has three columns and half of it has two.
//
// The difference between the two verbs did not stop being real; it stopped
// being announced ahead of time. What tells her now is what happens when she
// picks one: a mode empties the box and raises the toast, a command fills the
// box and waits for Send. That is the cost of the flat list, it was chosen
// deliberately, and it is written here so nobody argues the headings back in.

import type { CodexModeId, PermissionMode } from './types';
import { CLEAR_COMMAND, CLEAR_HINT, MODE_COMMAND, MODE_HINT, menuRowsFor } from './modes';
import { CLAUDE_COMMANDS, commandHint, commandMatches } from '../../shared/claude-commands.mjs';
import { CODEX_MODE_COMMAND, CODEX_MODE_HINT, codexMenuRowsFor } from '../../shared/codex-modes.mjs';
import type { ClaudeCommand } from '../../shared/claude-commands.mjs';

export type CatalogEntry = {kind: string; name: string; description: string; insert: string; icon: string | null};
export type SlashRow =
  | {kind: 'reference'; entry: CatalogEntry}
  /**
   * One of Claude Code's six permission modes, or `null` for the way back to
   *  the project's own setting. Picking it sets a value and empties the box. */
  | { kind: 'mode'; mode: PermissionMode | null }
  /**
   * One of Codex's three, or `null` for the way back. A SEPARATE KIND rather
   *  than a wider `mode`, because the two vocabularies are not interchangeable
   *  and the row that picks one has to know which engine it is setting. `/auto`
   *  is on both lists and means each engine's own sensible default; a row has
   *  one engine, so only one of the two is ever on screen. */
  | { kind: 'codexMode'; mode: CodexModeId | null }
  /** One of the eight Claude Code commands. Picking it fills the box. */
  | { kind: 'command'; cmd: ClaudeCommand };

/** A stable key for React, and for a test that wants to name a row. */
export function rowKey(row: SlashRow): string {
  if (row.kind === 'reference') return `reference:${row.entry.insert}`;
  if (row.kind === 'mode') return `mode:${row.mode ?? 'clear'}`;
  if (row.kind === 'codexMode') return `codex:${row.mode ?? 'clear'}`;
  return `cmd:${row.cmd.name}`;
}

/**
 * The rows for what has been typed so far.
 *
 * @param query      what follows the slash, lowercased, or null for no menu
 * @param modeSet    whether a mode is set on this message, which is what puts
 *                   the way back in the list
 * @param claudeCode whether this row will really reach Claude Code. FALSE ON A
 *                   CODEX ROW, and that is the whole point of the parameter.
 *
 * EVERYTHING IN THIS MENU IS CLAUDE CODE'S, WHICH IS WHY ONE BOOLEAN COVERS
 * BOTH HALVES OF IT (restored 2026-09-04; it was here from 08-27 and came out
 * in 258d71d, which removed the second engine and said so in its message).
 *
 * The eight commands are Claude Code's BY NAME. `/context` is not a word the
 * Codex CLI knows, `commandPrompt` would make it the whole prompt, and
 * `_spawnCodexWorker` sends that prompt as the turn's input. Offering one on a
 * Codex row is the menu lying about what pressing Enter does.
 *
 * The six modes are Claude Code's BY VALUE. Each is a word `claude
 * --permission-mode` takes, and the only thing this app does with one is rewrite
 * that flag inside the Claude argv (`spawnPlan`'s `oneOff`). The Codex path
 * never reads that argv: `_spawnCodexWorker` takes the prompt, the system block,
 * the model and the resume id. Meanwhile `spawnWorker` clears the one-off on
 * `spawn` whatever the engine, so a mode picked on a Codex row is spent, has no
 * effect on the run, and nothing says so. That is the quieter of the two
 * failures and the worse one.
 *
 * AND NO CODEX EQUIVALENT IS INVENTED FOR EITHER. A Codex worker runs on one
 * posture, `untrusted` + `workspace-write`, chosen by measurement and held
 * deliberately (main/codex-session.mjs); the other two approval policies were
 * measured the same day and neither gates anything, so there is nothing on this
 * engine for six choices to choose between. Which of the six would stand for
 * which Codex setting is a judgement about what an agent may do on the user's
 * Mac, and it is the user's to make with an approval path built for it. Until then the honest
 * menu on a Codex row is no menu: `slashOpen` is `menuRows.length > 0`, so "/"
 * stays a typed character. One line here reverses it the day either half
 * gets built.
 *
 * Not merely on the empty one. `/c` matches nothing in the modes and three
 * commands, and `/a` matches two modes and nothing else; in both cases the
 * order is the same and the cursor starts on the first mode when there is one.
 */
export function slashRows(
  query: string | null,
  modeSet: boolean,
  claudeCode: boolean,
  nativeNames: string[] = [],
): SlashRow[] {
  if (query === null) return [];
  const commands = commandsFor(claudeCode, nativeNames).filter(c => [c.name, ...c.aliases].some(w => w.startsWith(query.toLowerCase())));
  if (!claudeCode) {
    // CODEX HAS ITS OWN THREE NOW (2026-09-23). The paragraph above used to end
    // "the honest menu on a Codex row is no menu... one line here reverses it
    // the day either half gets built". Both halves are built: the modes are
    // real settings in shared/codex-modes.mjs and they reach `thread/start`.
    const codexModes: SlashRow[] = codexMenuRowsFor(query, modeSet).map((mode: CodexModeId | null) => ({ kind: 'codexMode', mode }));
    return [...codexModes, ...commands.map((cmd) => ({ kind: 'command', cmd } as SlashRow))];
  }
  const modes: SlashRow[] = menuRowsFor(query, modeSet).map((mode) => ({ kind: 'mode', mode }));
  const cmds: SlashRow[] = commands.map((cmd) => ({ kind: 'command', cmd }));
  return [...modes, ...cmds];
}

/** Every command a row can run: the session's own first, then ours. */
function commandsFor(claudeCode: boolean, nativeNames: string[]): ClaudeCommand[] {
  const native = claudeCode ? nativeNames.filter(name => !providerCommands('claude-code').some(c => c.name === name || c.aliases.includes(name))).map(name => ({name, description: NATIVE_DESCRIPTION, menuDescription: null, whole: true, argumentHint: '[arguments]', aliases: []})) : [];
  return [...native, ...providerCommands(claudeCode ? 'claude-code' : 'codex')];
}
const NATIVE_DESCRIPTION = 'Run this Claude Code command';

/**
 * WHETHER PICKING THIS ROW WAITS FOR SEND rather than running it. Every
 *  command does, and no mode does (a mode is a value, not a message).
 *
 *  Typing /loop and pressing Return used to start a loop with nothing to loop
 *  on (w-2c8ef9ed9e). The first fix sorted commands into ones that want words
 *  and ones that do not, and asked to be "a generalist solution for all
 *  commands" instead. Sorting cannot be made general: the session's own
 *  commands arrive as bare names, so which of them want words is not something
 *  this app can read, and a guess that is wrong once starts an agent. So one
 *  rule, the terminal's: picking a command puts it in the box, she writes
 *  whatever it takes, and Send runs it. What answers the old "Enter on /usage
 *  did nothing" (w-5d1ad29efa) is the box saying it is holding the command and
 *  that Send runs it (`commandBeingWritten`, drawn in Focus.tsx). */
export function enterWaitsForWords(row: SlashRow): boolean {
  return row.kind === 'command';
}

/**
 * THE COMMAND THE BOX IS HOLDING while she writes its words, or null.
 *
 *  Only once she has typed past the word: until the space, the menu is open and
 *  says it. */
export function commandBeingWritten(text: string, claudeCode: boolean, nativeNames: string[]): ClaudeCommand | null {
  const m = text.match(/^\/([a-z][a-z0-9:_-]*)\s/i);
  if (!m) return null;
  const word = m[1].toLowerCase();
  return commandsFor(claudeCode, nativeNames).find(c => c.name === word || c.aliases.includes(word)) ?? null;
}

/**
 * WHAT THE BOX SAYS FAINTLY AFTER A COMMAND before she has written anything:
 *  what it takes, if it takes anything, and that Send runs it. */
export function holdingHint(cmd: ClaudeCommand): string {
  if (cmd.description === NATIVE_DESCRIPTION) return 'what it should do, then ⌘↵';
  const hint = cmd.argumentHint?.replace(/^[<[]|[>\]]$/g, '');
  return hint ? `${hint}, then ⌘↵` : '⌘↵ to run';
}

/**
 * WHAT ONE ROW SAYS, and there is only one answer to that question now.
 *
 *  Two fields, the same two for every row in the list: the word she types, and
 *  one sentence saying what it does. The menu draws exactly this and nothing
 *  else, which is what makes it one list rather than two lists stacked.
 *
 *  A MODE ROW USED TO CARRY A THIRD FIELD, its name: `/manual` then `Manual`
 *  then `runs reads only`. Four of the six names were the command word in title
 *  case, so the column mostly repeated the column beside it, and because
 *  `/bypass-permissions` is three times the width of `/plan` the names did not
 *  line up under each other either. That is what made the list look a little ugly, and
 *  MODE_WORDS is still exported and still used by the toast, where the name is
 *  the whole of what there is room to say. */
export function rowSays(row: SlashRow): { typed: string; says: string } {
  if (row.kind === 'reference') return { typed: row.entry.name, says: `${row.entry.kind === 'skill' ? 'Skill' : row.entry.kind === 'plugin' ? 'Plugin' : row.entry.kind === 'page' ? 'Page' : row.entry.kind === 'tab' ? 'Tab' : 'App'} · ${row.entry.description}` };
  if (row.kind === 'command') return { typed: `/${row.cmd.name}`, says: commandHint(row.cmd) };
  if (row.mode === null) return { typed: CLEAR_COMMAND, says: CLEAR_HINT };
  if (row.kind === 'codexMode') return { typed: CODEX_MODE_COMMAND[row.mode], says: CODEX_MODE_HINT[row.mode] };
  return { typed: MODE_COMMAND[row.mode], says: MODE_HINT[row.mode] };
}

/**
 * Whether there is anything of Claude Code's to draw at all. Read by the menu
 *  so a build that somehow shipped an empty table is still a menu of six
 *  modes rather than a menu of nothing. */
export const HAS_COMMANDS = CLAUDE_COMMANDS.length > 0;
