// The power test of 2026-10-25: with two agents already busy, a new
// teammate's Log said "Picked up Set up its job 9:25pm" while In progress
// showed that run Queued and the chat under it said "Waiting for a free
// agent". The line was drawn from the run having been let go by the
// teammate's own queue, not from an agent having it. Now it says the run is
// waiting to start until a session for it exists.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const { startWord } = await import('../renderer/src/teammates/chat-lines.ts');

const ADA = { id: 't-aaaaaaaaaa', running: { id: 'w-1', product: 'p' } };
const run = (item, verb = 'picked') => ({ id: `${item}:start`, kind: 'run', teammate: ADA.id, item, product: 'p', title: 'Set up its job', verb, ts: 1 });

describe('the line a teammate\'s run starts with', () => {
  it('says it is waiting to start while no agent has it yet', () => {
    expect(startWord(run('w-1'), [ADA], new Map())).toBe('Waiting to start');
    expect(startWord(run('w-1', 'passed'), [ADA], new Map())).toBe('Waiting to start');
  });

  it('says picked up once an agent has it, and for runs that are not its current one', () => {
    expect(startWord(run('w-1'), [ADA], new Map([['w-1', { startedAt: 1 }]]))).toBe('Picked up');
    expect(startWord(run('w-0'), [ADA], new Map())).toBe('Picked up');
    expect(startWord(run('w-1'), [{ ...ADA, running: null }], new Map())).toBe('Picked up');
  });

  it('is drawn in the chat and the Log from what is running', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/<span className="v">\{startWord\(r, team, sessions\)\}<\/span>/);
    expect(page.match(/<Activity [^\n]*sessions=\{sessions\}/g)).toHaveLength(2);
  });
});
