// THE WORLD AROUND THE STAND-IN AGENTS, WHICH A POWER TEST CHANGES AS IT RUNS.
//
// A task's own words ([[stub:limit]] and the rest) steer one task. A power
// tester types what a person types, so what goes wrong around them comes from
// <instance>/world.json instead, rewritten by power-test.mjs as its clock
// moves and read on every start:
//
//   out      logins out of usage: "default", ".claude-second", … and "codex"
//   pace     { minMs, maxMs }: how long an answer takes
//   hang     share of tasks that never answer
//   die      share that start work and die with no answer
//   options  share of answers that end with an Options list
//   edits    a task asking for a code change commits one small file
//
// Node's own modules only: live.mjs copies this beside the stand-in it runs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const CHANGE = /\b(fix|add|change|update|write|rename|refactor|remove|build|make|implement)\b/i;

/** Whether a task's words ask for code to change, rather than for an answer. */
export function asksForAChange(title) {
  return CHANGE.test(String(title ?? ''));
}

/** Commit one file named after the task in `cwd`; its path, or null outside a git folder. */
export function standInEdit(cwd, title) {
  const git = (...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  try { git('rev-parse', '--is-inside-work-tree'); } catch { return null; }
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'change';
  const file = `stand-in-changes/${slug}.md`;
  fs.mkdirSync(path.join(cwd, 'stand-in-changes'), { recursive: true });
  fs.appendFileSync(path.join(cwd, file), `${title}\n`);
  git('add', file);
  git('-c', 'user.name=Stand-in agent', '-c', 'user.email=stand-in@example.invalid', 'commit', '-q', '-m', String(title).slice(0, 72));
  return file;
}

export function readWorld(file) {
  if (!file) return {};
  try {
    const world = JSON.parse(fs.readFileSync(file, 'utf8'));
    return world && typeof world === 'object' ? world : {};
  } catch { return {}; }
}

/** What happens to one start on `login` ("default", a login folder's name, or "codex"). */
export function worldTurn(world, login, rand = Math.random) {
  const share = (p) => Number(p) > 0 && rand() < Number(p);
  const minMs = Math.max(0, Number(world.pace?.minMs) || 0);
  const maxMs = Math.max(minMs, Number(world.pace?.maxMs) || minMs);
  return {
    limit: Array.isArray(world.out) && world.out.includes(login),
    hang: share(world.hang),
    die: share(world.die),
    delayMs: Math.round(minMs + (maxMs - minMs) * rand()),
    options: share(world.options),
  };
}

/** How often a stand-in waiting out the world's pace writes a step, in ms; 0 for never. */
export function stepEvery(world) {
  if (!world.pace) return 0;
  const every = Number(world.pace.stepMs ?? 4000);
  return Number.isFinite(every) && every > 0 ? every : 0;
}

/** Step `n` of the work, as Claude Code streams it: odd steps read a file, even ones say what was found. */
export function workStep(n, title) {
  const what = title ? String(title).slice(0, 80) : 'the task';
  return n % 2 === 1
    ? { type: 'tool_use', id: `toolu_step_${n}`, name: 'Read', input: { file_path: `src/part-${(n + 1) / 2}.js` } }
    : { type: 'text', text: `Read part ${n / 2} for "${what}"; moving on to the next.` };
}

const OPTIONS = '\n\n## Options\n1. Ship it (recommended)\n2. Change something first\n3. Throw it away';

/**
 * The answer, naming the task the brief gave (`Title: …`) so a tester can tell
 * which answer is whose, and numbered, so a second answer on a thread never
 * reads as the first one still sitting there.
 */
export function worldAnswer(said, turn, title, n = 1) {
  const named = title ? `Worked on "${String(title).slice(0, 80)}". ${said}` : said;
  return `${named}${n > 1 ? ` This is answer ${n} on this thread.` : ''}${turn.options ? OPTIONS : ''}`;
}

export const titleIn = (prompt) => String(prompt ?? '').match(/^Title: (.+)$/m)?.[1]?.trim() ?? null;
