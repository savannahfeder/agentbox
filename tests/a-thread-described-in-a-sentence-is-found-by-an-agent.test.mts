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
import { aboutThread, candidatesFor, describePrompt, findByDescription, readPicks, FIND_MOST, FIND_BUDGET_MS, type FindCandidate } from '../shared/find-by-description.mts';
import { agentRow, offersAgent, paletteOrder } from '../renderer/src/components/Palette.tsx';

const thread = (n: number, title: string, about = '', at = n): FindCandidate => ({
  key: `p/w-${n}`, product: 'p', title, about, where: 'Done', at, project: 'Agentbox',
});

describe('the wait', () => {
  // They said they would wait up to ten seconds. On their Mac the answer took
  // 4 to 6.4 s over their real threads, but a power tester asking while the
  // Mac was at its busiest got "No agent answered in time" twice at a 10 s
  // stop: an answer at 12 s beats none. 20 s was longer than anyone waits.
  it('stops a little past the ten seconds they said they would wait, never at twenty', () => {
    expect(FIND_BUDGET_MS).toBeGreaterThan(10_000);
    expect(FIND_BUDGET_MS).toBeLessThanOrEqual(15_000);
  });
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

  // A tester asked for "the thread where we named the rollback owner": the
  // owner was named in the answer, the agent read only the ask, and it said
  // no thread fits right under the thread the words had found.
  it('tells the agent the start of each answer as well as the ask', () => {
    expect(aboutThread({ problem: 'Plan the launch', result: 'Dana owns the rollback.' })).toBe('Plan the launch Answer: Dana owns the rollback.');
    expect(aboutThread({ body: 'Plan the launch' })).toBe('Plan the launch');
    expect(aboutThread({ problem: ' ', body: 'From the body', result: '' })).toBe('From the body');
    const prompt = describePrompt('rollback owner', [thread(1, 'Launch plan', aboutThread({ problem: 'p'.repeat(160), result: 'Dana owns the rollback.' }))], 0);
    expect(prompt).toContain('Dana owns the rollback.');
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

  // A power tester typed a model command in words, pressed Enter, and an agent
  // started looking through their threads: with no thread found, the ask row
  // was the only "thread" and sat above every command the words only touched.
  it('below every command the words found, so Enter runs the command', () => {
    const ask = agentRow(null, 0, () => {});
    const cmd = (id: string, label: string) => ({ id, label, run: () => {} });
    const commands = [cmd('model', 'Choose a model'), cmd('effort', 'Thinking effort')];
    const { rows, labels } = paletteOrder(commands, [ask], false, 'switch to a faster model');
    expect(rows.map((r) => r.id)).toEqual(['model', 'effort', 'find-by-description']);
    expect(labels.get(2)).toBe('Threads');
    // With nothing else found, it is the first row and Enter asks.
    expect(paletteOrder([], [ask], false, 'the one about the camera').rows[0].id).toBe('find-by-description');
    // Threads found still come before it.
    const t = cmd('thread-p/w-1', 'Camera crash');
    expect(paletteOrder(commands, [t, ask], false, 'android camera crash thread').rows.map((r) => r.id).indexOf('thread-p/w-1')).toBe(0);
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
