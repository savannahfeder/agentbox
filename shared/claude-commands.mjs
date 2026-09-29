// 2026-09-16: generated headless commands plus names advertised by the current
// native session. The eight-command notes below describe the original design.
// WHAT "/" MEANS IN AGENTBOX, NOW THAT IT MEANS TWO THINGS.
//
// She was then given three ways to do it and picked the middle one: "Keep the
// six modes at the top and add only the ones that say something about how a
// message runs: /model, /effort, /fast, /goal, /context, /usage, /mcp,
// /compact. Read them out of the installed binary at build time rather than
// typing them into a file, so the list cannot rot quietly."
//
// THE READING HALF IS scripts/read-claude-commands.mjs AND THE TABLE IT WRITES.
// This file is the thinking on top of it, and it is short on purpose.
//
// THE ONE MEASUREMENT THAT SHAPED EVERYTHING HERE, taken on 2026-08-27 against
// the installed 2.1.246, because the obvious design does not work:
//
//   claude -p '/context
//
//   Then in one short sentence say what file is in this directory.'
//
//   returned the context table and NOTHING ELSE. 142 lines, zero mentions of
//   the file and zero mentions of the word directory. The command ate the
//   message.
//
// SO A COMMAND CANNOT RIDE ALONG WITH HER REPLY. It is not a modifier on a
// message the way a permission mode is; it is a turn of its own, exactly as it
// is in Claude Code, where typing /context does not also send whatever you had
// half-written. That is why picking one of these eight from the menu TYPES it
// into the box instead of setting a hidden value on the send: what she is about
// to do is send a command, and the box should say so before she presses Send.
//
// AND WHAT COMES BACK IS THE CONFIRMATION SHE ASKED FOR. Agentbox's trace
// already renders assistant text into the thread, so the answer arrives on the
// row by itself. Nothing had to be invented to show it.
//
// THE SIX MODES ARE NOT IN HERE and must not move into it. They are ours, they
// set a value on a message she is still writing, and five of the six are not
// Claude Code commands at all. modes.ts says all of that at length. The menu
// draws both lists; they are two different verbs and the menu labels them so.

import { CLAUDE_COMMANDS, READ_FROM, READ_AT } from './claude-commands.generated.mjs';

export { CLAUDE_COMMANDS, READ_FROM, READ_AT };

/**
 * Every spelling that reaches a command: its own name and the aliases Claude
 *  Code registers for it. `/cost` and `/stats` are theirs, for `/usage`. */
export function commandWords(cmd) {
  return [cmd.name, ...(cmd.aliases ?? [])];
}

/**
 * The line the menu prints beside the command. Claude Code's own shorter
 *  sentence where they wrote one for a menu, otherwise their full one.
 *
 * WITH THE EM DASHES TAKEN OUT, and that has to happen here rather than in the
 * generated file. One of the eight carries one today: `/goal` reads "Set a goal
 * — keep working until the condition is met", and that sentence is Claude
 * Code's, read out of the installed binary at build time. Editing it where it
 * lands would be undone by the next `npm run build` and would make the file
 * stop matching the binary, which is the whole reason it is generated. So the
 * record stays faithful and the MENU does the spelling. A comma, because these
 * are all one short sentence with a pause in it. */
export function commandHint(cmd) {
  return (cmd.menuDescription || cmd.description).replace(/\s*—\s*/g, ', ');
}

/**
 * The rows the menu draws for what has been typed so far, in her order.
 *
 *  Prefix on the name first and on an alias second, which is the same rule
 *  modeMatches follows and for the same reason: a word appearing inside a
 *  longer word is a coincidence, and a menu that moves its cursor on a
 *  coincidence feels random. */
export function commandMatches(query) {
  if (query === null || query === undefined) return [];
  if (query === '') return [...CLAUDE_COMMANDS];
  const first = CLAUDE_COMMANDS.filter((c) => c.name.startsWith(query));
  const alias = CLAUDE_COMMANDS.filter(
    (c) => !first.includes(c) && commandWords(c).some((w) => w.startsWith(query)),
  );
  return [...first, ...alias];
}

/**
 * What picking a row puts in the box. A trailing space, always, because every
 *  one of the eight either takes an argument or is harmless with none, and a
 *  caret sitting after the space is what tells somebody there is more to type.
 *  It is never sent by the pick: she presses Send, the same as any message. */
export function commandDraft(cmd) {
  return `/${cmd.name} `;
}

/* --------------------- and the other end, in the run ---------------------- */

/**
 * WHETHER A REPLY IS ONE OF THE EIGHT, asked by the supervisor at the moment it
 * decides what to hand the CLI.
 *
 * Returns the prompt to send verbatim, or null for an ordinary message. Null is
 * the answer for everything that is not exactly one of these commands, because
 * this decides whether a message SKIPS the brief, and a brief skipped by
 * accident is a worker that does not know which row it is on.
 *
 * THE RULES, AND EACH ONE IS A THING THAT WOULD OTHERWISE GO WRONG:
 *
 *   - The slash is the first character. A slash mid-sentence is a path or a
 *     date. Same rule as slashQuery in modes.ts.
 *   - The word after it is one of the eight, or one of their aliases. Not any
 *     command Claude Code has: the other 94 are not on the menu, so a person
 *     typing one has not been told it would run, and 70 of them cannot run
 *     outside an interactive session at all.
 *   - Everything after the word is the argument and is passed through
 *     untouched, including newlines, because `/goal <condition>` and
 *     `/compact <instructions>` are sentences.
 *   - The name is normalised to the command's own name, so `/cost` reaches the
 *     CLI as `/usage`. An alias is a spelling for us; the CLI takes both, and
 *     sending its own word is one less thing to be wrong about.
 */
export function commandPrompt(reply, nativeNames = []) {
  if (typeof reply !== 'string') return null;
  if (!reply.startsWith('/')) return null;
  const m = reply.match(/^\/([a-z][a-z0-9:_-]*)(?:(\s[\s\S]*))?$/i);
  if (!m) return null;
  const typed = m[1].toLowerCase();
  const word = typed === 'review' && nativeNames.includes('code-review') ? 'code-review' : typed;
  const cmd = CLAUDE_COMMANDS.find((c) => commandWords(c).includes(word)) ?? (nativeNames.includes(word) ? { name: word } : null);
  if (!cmd) return null;
  const rest = (m[2] ?? '').trim();
  return rest ? `/${cmd.name} ${rest}` : `/${cmd.name}`;
}
