// A THREAD DESCRIBED IN A SENTENCE IS FOUND BY AN AGENT.
//
// The owner, 2026-11-13: "I'm not sure if there is a way for me to describe a
// thread so a small agent can find it. Yes I'm willing to wait up to 10
// seconds for that kind of thing." Search needed the thread's own words; a
// description in other words ("the one where the agent's browser kept taking
// over my screen") found nothing. ⌘K now offers to ask a small model, which
// reads a list of the threads and names the ones that fit.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { candidatesFor, describePrompt, findByDescription, readPicks, FIND_MOST, type FindCandidate } from '../shared/find-by-description.mts';
import { agentRow, offersAgent } from '../renderer/src/components/Palette.tsx';

const thread = (n: number, title: string, about = '', at = n): FindCandidate => ({
  key: `p/w-${n}`, product: 'p', title, about, where: 'Done', at, project: 'Agentbox',
});

describe('the list the agent reads', () => {
  it('puts the threads that share words with the description first, then the newest', () => {
    const all = [thread(1, 'Pricing page'), thread(2, 'Chrome focus hijacking', 'An agent browser took focus'), thread(3, 'Weekly report')];
    expect(candidatesFor(all, 'the browser that kept taking focus').map((c) => c.key)).toEqual(['p/w-2', 'p/w-3', 'p/w-1']);
  });

  it('reads at most FIND_MOST threads, and the prompt stays under the 128 KB one argument may carry', () => {
    const many = Array.from({ length: 900 }, (_, i) => thread(i, 'x'.repeat(200), 'y'.repeat(400)));
    const shown = candidatesFor(many, 'anything');
    expect(shown).toHaveLength(FIND_MOST);
    expect(Buffer.byteLength(describePrompt('anything', shown, 0))).toBeLessThan(128 * 1024);
  });

  it('tells the agent where each thread is and when it last moved', () => {
    const prompt = describePrompt('the chrome one', [{ ...thread(1, 'Chrome not opening'), where: 'Needs you', at: Date.UTC(2026, 10, 13) }], Date.UTC(2026, 10, 13, 12));
    expect(prompt).toContain('1. [Needs you, today, Agentbox] Chrome not opening');
  });
});

describe('reading the answer', () => {
  const shown = [thread(1, 'a'), thread(2, 'b'), thread(3, 'c')];

  it('keeps the threads named, in order, with the reason', () => {
    expect(readPicks('2 | the browser one\n1 | also about Chrome.', shown)).toEqual([
      { key: 'p/w-2', why: 'the browser one' }, { key: 'p/w-1', why: 'also about Chrome' },
    ]);
  });

  it('drops a number it was not shown, a repeat, and anything that is not a pick', () => {
    expect(readPicks('Here you go:\n9 | no such\n3 | yes\n3 | again\nnone', shown).map((p) => p.key)).toEqual(['p/w-3']);
  });

  it('says so when no agent answered, and says nothing fits when none fits', async () => {
    expect(await findByDescription({ description: 'x', candidates: shown, ask: async () => '' })).toEqual({ ok: false, error: 'No agent answered in time.' });
    expect(await findByDescription({ description: 'x', candidates: shown, ask: async () => 'none' })).toEqual({ ok: true, picks: [], read: 3 });
  });
});

describe('⌘K offers it', () => {
  it('when the words read as a description, or found no thread', () => {
    expect(offersAgent('browser kept stealing focus', 4)).toBe(true);
    expect(offersAgent('quokka', 0)).toBe(true);
    expect(offersAgent('chrome', 5)).toBe(false);
    expect(offersAgent('chrome focus', 2)).toBe(false);
    expect(offersAgent('', 0)).toBe(false);
  });

  it('says it is looking, and for how long, then what went wrong if it did', () => {
    const ask = () => {};
    expect(agentRow(null, 0, ask).label).toBe('Ask an agent to find it');
    expect(agentRow({ query: 'q', at: 1000, state: 'looking' }, 4500, ask).hint).toBe('3s');
    expect(agentRow({ query: 'q', at: 0, state: 'failed', error: 'No agent answered in time.' }, 0, ask)).toMatchObject({ label: 'No agent answered in time.', hint: 'Try again' });
  });

  it('runs on an account a project tied to one account cannot be shown to', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    const handler = ipc.slice(ipc.indexOf("'zero:find-by-description'"), ipc.indexOf("'zero:find-by-description'") + 900);
    expect(handler).toMatch(/_projectProfile\(c\.product\)/);
    expect(handler).toMatch(/_askSmall\(/);
    expect(handler).toMatch(/timeoutMs: left/);
  });
});
