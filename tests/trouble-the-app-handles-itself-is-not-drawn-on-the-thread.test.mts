// TROUBLE THE APP HANDLES ITSELF IS NOT DRAWN ON THE THREAD (w-abab5aca62).
//
// A cloud run's machine stopped two minutes in, and the app wrote why on the
// row and started the run again. Drawn as a quiet grey line at the foot of the
// thread, under the person's own message and over the agent already working
// again, it was still a paragraph about machinery they had nothing to do with:
// "super cluttered and visually unappealing. I actually don't really love when
// the app does stuff like this." The same goes for the ship that waits for
// memory and the cause that cleared, which the app also sees to by itself.
//
// Those notes stay on the row, so the next run is told why the last one
// stopped and the record keeps every machine that died (5f42f2f99), but no
// thread draws them. Every other note the app writes is still its quiet line.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { itemThread } from '../renderer/src/item-thread.ts';
import { appWrote, footOf } from '../renderer/src/one-thing-at-a-time.ts';
import { MACHINE_STOPPED, causeCleared, forTheAgent, waitingForMemory } from '../shared/notes-for-the-agent.mts';
import { SHIP_FAILED } from '../shared/not-shipped.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const T0 = Date.parse('2026-11-21T04:00:00Z');
const line = (ts: number, source: string, patch: Record<string, unknown>) => ({ id: 'w-0a1b2c3d4e', ts, source, patch });
const STOPPED = `${MACHINE_STOPPED} 2 minutes into its run, before it finished, so the run never sent its work back. The thread picks up from where it was before that run.`;
const born = [
  line(T0, 'system', { title: 'Plan the garden', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }),
  line(T0 + 4, 'founder', { title: 'Plan the garden', body: 'Which beds get the tomatoes?', model: 'opus' }),
  line(T0 + 60_000, 'agent', { result: 'The two south beds.' }),
  line(T0 + 120_000, 'founder', { answer: 'And the herbs?' }),
];
const notesIn = (lines: unknown[]) => threadEvents(lines as never).filter((e) => e.field === 'note').map((e) => e.words);

describe('a note about trouble the app is handling itself', () => {
  for (const [what, note] of [
    ['a cloud machine that stopped', STOPPED],
    ['a ship waiting for memory', waitingForMemory('shipping')],
    ['a push waiting for memory', waitingForMemory('pushing')],
    ['a cause that cleared', causeCleared('Your Mac cannot push to GitHub')],
  ] as const) {
    it(`is not drawn on the thread: ${what}`, () => {
      expect(forTheAgent(note)).toBe(true);
      expect(notesIn([...born, line(T0 + 240_000, 'system', { note })])).toEqual([]);
    });
  }

  it('leaves your message as the last thing on the page, with nothing at the foot', () => {
    const built = itemThread([...born, line(T0 + 240_000, 'system', { note: STOPPED })] as never, []);
    expect(built.outcome).toBeNull();
    expect(built.events.at(-1)).toMatchObject({ who: 'you', text: 'And the herbs?' });
  });

  it("leaves an agent's checkpoint written before it as the agent's own, at the foot", () => {
    const lines = [...born, line(T0 + 180_000, 'agent', { note: 'Halfway: the herbs go by the door.' }), line(T0 + 240_000, 'system', { note: STOPPED })];
    const { outcome } = itemThread(lines as never, []);
    expect(outcome?.text).toBe('Halfway: the herbs go by the door.');
    const item = { note: STOPPED, wrote: { note: { ts: T0 + 240_000, source: 'system' } } };
    expect(appWrote(outcome, item.wrote)).toBe(false);
    expect(footOf(outcome, item)).toBe('agent');
  });
});

describe('what is still drawn', () => {
  it('the same words from the agent itself', () => {
    expect(notesIn([...born, line(T0 + 240_000, 'agent', { note: waitingForMemory('shipping') })])).toEqual([waitingForMemory('shipping')]);
  });

  it("every other note the app writes, as its quiet line", () => {
    for (const note of ['Shipped to main as 14c45bfb.', `${SHIP_FAILED}a test is red.`, "This run was stopped at the cloud's time limit of 7 hours 45 minutes so that its work could be saved."]) {
      expect(forTheAgent(note)).toBe(false);
      expect(notesIn([...born, line(T0 + 240_000, 'system', { note })])).toEqual([note]);
    }
  });
});

describe('the writers', () => {
  it('build these notes from the same words the thread reads', () => {
    expect(read('main/cloud/run.mts')).toMatch(/`\$\{MACHINE_STOPPED\} \$\{howLongWords\(/);
    expect(read('main/ship-queue.mts')).toMatch(/waitingForMemory\('shipping'\)/);
    expect(read('main/supervisor.mts')).toMatch(/waitingForMemory\('pushing'\)/);
    expect(read('main/supervisor.mts')).toMatch(/causeCleared\(b!\.title\)/);
  });
});
