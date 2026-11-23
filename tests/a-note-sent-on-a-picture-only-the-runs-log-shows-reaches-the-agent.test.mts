// A note sent on a picture only the run's log shows reaches the agent.
//
// What broke (2026-11-21, w-05897f8e46): a note on an agent's -v2 picture,
// sent with ⌘↵, never reached the agent, and ⌘↵ again did nothing. The note's
// record had the Send (`toAgent`) and no `sent`: main never handed it over.
// The thread and the big view read a thread's files from the row's history and
// what its runs said (withRunsSaid, since 2026-11-10), but main read only the
// row's last 400 lines, where the -v2 never appeared, because the agent said
// it in its run's log. With no version to put the note on, main
// sent nothing and answered the window as if it had. Approving such a picture
// and a reply carrying waiting notes went the same way.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { machineryPath } from '../main/store/home.mts';
import { noteToItsAgent, replyWithWaitingNotes } from '../main/notes-wake.mts';

let store, dir, thread, woke, D;
const supervisor = { sessions: new Map(), wake: () => { woke++; } };
const mark = (m) => { store.fileMark('website', thread.id, m); return noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark: m, nameOf: () => 'Sam' }); };
const note = (id, file, v, text = 'Less space under the headline') => ({ do: 'note', id, file, v, place: { kind: 'whole' }, text, wait: true });
const row = () => store.readItem('website', thread.id);
const clock = (ms) => new Date(ms).toISOString().slice(11, 19);

beforeEach(async () => {
  disk._internals.forgetFolds();
  woke = 0;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-log-picture-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Pricing page', body: 'Redo the pricing hero.' });
  D = `designs/${thread.id}/round-two`;
  // The row's history names the first version, in an earlier answer.
  disk.updateWorkItem(dir, thread.id, { result: `Two ways:\n\n${D}/pricing-hero.png\n\n${D}/plans-table.png` }, { source: 'agent' });
  // The run that answered said the next version only in its log, and only read the moodboard.
  const startedAt = Date.now() + 1_000;
  const logs = machineryPath(dir, path.join('sessions', thread.id));
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(logs, `${startedAt}.log`), [
    '# Pricing page',
    '',
    `${clock(startedAt + 1_000)}  [Read] ${D}/moodboard.png`,
    '#id t1',
    `${clock(startedAt + 9_000)}  The next version, with the tighter gap under the headline:`,
    `${D}/pricing-hero-v2.png`,
    '',
    '# exited (0)',
    '',
  ].join('\n'));
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('a picture only the run\'s log shows', () => {
  it('Send hands the agent the note on it, as the next version to make', async () => {
    store.fileMark('website', thread.id, note('n2', 'pricing-hero-v2.png', 2));
    expect(await mark({ do: 'toagent', on: ['n2'] })).toBe(true);
    const item = row();
    expect(item.answer).toContain(`Notes on ${D}/pricing-hero-v2.png:`);
    expect(item.answer).toContain('Less space under the headline');
    expect(item.answer).toContain('pricing-hero-v3.png');
    expect(item.status).toBe('open');
    expect(item.artifacts.notes.find((n) => n.id === 'n2').sent).toBe(true);
    expect(woke).toBe(1);
  });

  it('a reply typed in the thread takes the note waiting on it along', () => {
    store.fileMark('website', thread.id, note('n2', 'pricing-hero-v2.png', 2));
    const out = replyWithWaitingNotes({ store, product: 'website', id: thread.id, answer: 'And make it bluer', nameOf: () => 'Sam' });
    expect(out?.fromNotes).toEqual(['n2']);
    expect(out?.answer).toContain('Less space under the headline');
    expect(out?.answer).toMatch(/And make it bluer$/);
  });

  it('approving it sends the thread back to work', async () => {
    expect(await mark({ do: 'approve', file: 'pricing-hero-v2.png' })).toBe(true);
    expect(row().answer).toBe(`Approved ${D}/pricing-hero-v2.png. Proceed as you proposed.`);
  });
});

describe('the row\'s own history', () => {
  it('a picture it named before its last 400 lines still takes a note', async () => {
    for (let i = 0; i < 420; i++) disk.updateWorkItem(dir, thread.id, { note: `Checkpoint ${i}` }, { source: 'agent' });
    store.fileMark('website', thread.id, note('n1', 'pricing-hero.png', 1, 'Darker cream'));
    expect(await mark({ do: 'toagent', on: ['n1'] })).toBe(true);
    expect(row().answer).toContain(`Notes on ${D}/pricing-hero.png:`);
  });
});

describe('what is not the agent\'s picture', () => {
  it('one its run only read', async () => {
    store.fileMark('website', thread.id, note('n3', 'moodboard.png', 1));
    expect(await mark({ do: 'toagent', on: ['n3'] })).toBe(false);
    expect(row().answer ?? null).toBe(null);
    expect(woke).toBe(0);
  });
});
