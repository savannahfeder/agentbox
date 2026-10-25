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
//
// Node's own modules only: live.mjs copies this beside the stand-in it runs.
import fs from 'node:fs';

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
