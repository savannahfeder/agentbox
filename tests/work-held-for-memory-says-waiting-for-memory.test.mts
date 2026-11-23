// WORK HELD FOR MEMORY SAYS WAITING FOR MEMORY (w-34443a206b).
//
// Seen 14 times by testers on 2026-11-22. With the computer short of memory,
// a running agent's heavy command waits in the memory gate, and its thread
// read "Running npm test" for 3 to 9 minutes: the command had been asked for,
// so its step said Running, and nothing told the window the gate held it.
// Threads waiting to start for the same reason read "Not started", with the
// reason only in the hover. Measured on the supervisor's status, the step the
// live line draws, and the words a waiting row wears.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cannotStartWord, liveLine } from '../renderer/src/live-line.ts';
import { heldStepWord } from '../renderer/src/components/Live.tsx';
import { MEMORY_HELD_LINE, statusCell } from '../renderer/src/status-word.ts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('a running agent whose command the memory gate holds', () => {
  it('is named in the status the window reads, with how long it has waited', () => {
    const sup = read('main/supervisor.mts');
    expect(sup).toMatch(/memoryHeldMs: heldForMemory\.get\(s\.itemId\)/);
    expect(sup).toMatch(/snapshot\?\.\(\)\.waiting/);
  });

  it('draws its step as waiting for memory, not as running', () => {
    expect(heldStepWord({ label: 'Running npm test' }, 240_000)).toBe('Waiting for memory to run npm test');
    expect(heldStepWord({ label: 'Running' }, 240_000)).toBe('Waiting for memory');
    expect(heldStepWord(undefined, 240_000)).toBe('Waiting for memory');
  });

  it('wears Waiting for memory in the status column, with the reason on hover', () => {
    const item = { id: 'w-1', product: 'p', status: 'claimed', labels: ['founder'], title: 'x' };
    const session = { itemId: 'w-1', product: 'p', startedAt: Date.now() - 300_000, memoryHeldMs: 240_000 };
    const cell = statusCell(item as never, { session, queued: [] } as never);
    expect(cell.word).toBe('Waiting for memory');
    expect(cell.title).toBe(MEMORY_HELD_LINE);
    const free = statusCell(item as never, { session: { ...session, memoryHeldMs: undefined }, queued: [] } as never);
    expect(free.word).toBe('Working');
  });

  it('draws its step as it was once the gate lets it go', () => {
    expect(heldStepWord({ label: 'Running npm test' }, undefined)).toBe('Running npm test');
    expect(heldStepWord(undefined, undefined)).toBe('Thinking');
  });
});

describe('a thread waiting to start until there is memory', () => {
  const item = { id: 'w-1', status: 'open', labels: ['founder'], title: 'x' };
  const facts = { queued: ['w-1'], inProgress: true, cannotStart: { 'w-1': { why: 'memory', tool: 'Claude Code' } } };

  it('says Waiting for memory, not Not started', () => {
    expect(cannotStartWord({ why: 'memory', tool: 'Claude Code' })).toBe('Waiting for memory');
    expect(liveLine(item as never, facts as never)).toMatchObject({ state: 'cannot', word: 'Waiting for memory' });
  });

  it('every other reason still says Not started', () => {
    expect(cannotStartWord({ why: 'engine', tool: 'Codex' })).toBe('Not started');
    expect(cannotStartWord({ why: 'login', tool: 'Codex' })).toBe('Not started');
  });

  it('is the word the list and the status column draw', () => {
    expect(read('renderer/src/components/List.tsx')).toMatch(/cannotStartWord\(cannotStart\[item\.id\]\)\.toLowerCase\(\)/);
    expect(read('renderer/src/status-word.ts')).toMatch(/says\(live\.word \?\? shortWord\(live\.state\)/);
  });
});
