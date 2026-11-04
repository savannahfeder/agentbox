// Every comment on an agent's file started the agent, even one written to a
// person. Maya approved launch posts v4, then wrote a
// whole-file comment "Sofia, approved v4: all four of your points are in": it
// read "Sent to the agent", and within a minute the agent saved a v5 identical
// to v4 that recorded the approval, so the newest version was one nobody had
// approved. Measured: noteToItsAgent sent every open note on an agent's file.
//
// Now a note addressed to a teammate ("Sofia, ...", "Hey Sofia:", "@Sofia")
// goes to that person, and a bare thank-you or approval goes to nobody; a pin
// or a comment that asks for something still starts the agent, and "Send to
// the agent" (a `toagent` mark) sends a held one anyway.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mjs';
import { cleanMark, marksOf, noteGoesTo, notesForItsAgent } from '../shared/artifact-marks.mjs';

const SOFIA = 'p-sofia';
const MAYA = 'p-maya';
const people = [{ id: SOFIA, name: 'Sofia Reyes' }, { id: MAYA, name: 'Maya Chen' }];
const goes = (text, extra = {}) => noteGoesTo({ text, place: { kind: 'whole' }, ...extra }, people);

describe('who a note on an agent\'s file is for', () => {
  it('a note that opens with a teammate\'s name is for them', () => {
    expect(goes('Sofia, approved v4: all four of your points are in')).toEqual({ to: 'person', person: SOFIA });
    expect(goes('Hey Sofia: can you check the copy?')).toEqual({ to: 'person', person: SOFIA });
    expect(goes('sofia - your call on the colour')).toEqual({ to: 'person', person: SOFIA });
    expect(goes('@Sofia does this read right?')).toEqual({ to: 'person', person: SOFIA });
  });

  it('one naming a teammate with @ anywhere, or picked from the list, is for them', () => {
    expect(goes('Tighter gap here, then @Sofia should look')).toEqual({ to: 'person', person: SOFIA });
    expect(goes('Looks off', { mentions: [MAYA] })).toEqual({ to: 'person', person: MAYA });
  });

  it('a thank-you or an approval with nothing asked is for nobody', () => {
    for (const t of ['Thanks!', 'Thank you, this is it', 'Approved', 'Approved v4.', 'Looks good', 'LGTM', 'Love it', 'Perfect']) {
      expect(goes(t), t).toEqual({ to: 'nobody' });
    }
  });

  it('a note that asks for a change goes to the agent', () => {
    expect(goes('Make the header darker')).toEqual({ to: 'agent' });
    expect(goes('Looks good, but make the button copper')).toEqual({ to: 'agent' });
    expect(goes('Thanks, can you tighten the gap?')).toEqual({ to: 'agent' });
    expect(goes('Darker cream', { place: { kind: 'pin', x: 0.4, y: 0.6 } })).toEqual({ to: 'agent' });
  });

  it('a name that is only mentioned, or only starts like one, is not an addressee', () => {
    // Dev's comment on his agent's page, which had to reach the agent.
    expect(goes("Sofia's v4 pin: the card has a dead bottom third under Book 8 seats. Tighten it")).toEqual({ to: 'agent' });
    expect(goes('Sofian, tighten the gap')).toEqual({ to: 'agent' });
    expect(goes('Ask Sofia, then tighten the gap')).toEqual({ to: 'agent' });
    // Nobody on the team is named Sam.
    expect(goes('Sam, approved')).toEqual({ to: 'nobody' });
  });

  it('a held note pressed "Send to the agent" goes to the agent', () => {
    expect(goes('Sofia, approved v4', { toAgent: true })).toEqual({ to: 'agent' });
    expect(cleanMark({ do: 'toagent', on: ['n1'] })).toEqual({ do: 'toagent', on: ['n1'] });
    const marks = marksOf([
      { do: 'note', id: 'n1', file: 'a.md', place: { kind: 'whole' }, text: 'Sofia, approved', ts: 1 },
      { do: 'toagent', on: ['n1'], ts: 2 },
    ]);
    expect(marks.notes[0].toAgent).toBe(true);
  });
});

let store, dir, thread, woke;
const supervisor = { sessions: new Map(), wake: () => { woke++; } };
const hear = (mark) => noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark, nameOf: () => 'Maya', people });
const note = (mark) => { store.fileMark('website', thread.id, mark); return hear(mark); };
const whole = (id, text) => ({ do: 'note', id, file: 'lumen-launch-posts-v4.md', place: { kind: 'whole' }, text });
const row = () => store.readItem('website', thread.id);

beforeEach(async () => {
  disk._internals.forgetFolds();
  woke = 0;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'note-to-a-person-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Launch posts', body: 'Write the launch posts.' });
  disk.updateWorkItem(dir, thread.id, { result: `v4 is ready: designs/${thread.id}/lumen-launch-posts-v4.md` }, { source: 'agent' });
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe("the owner's note on her agent's file", () => {
  it('"Sofia, approved v4" starts nothing and stays unsent', async () => {
    expect(await note(whole('n1', 'Sofia, approved v4: all four of your points are in'))).toBe(false);
    expect(row().status).toBe('blocked');
    expect(row().answer ?? null).toBe(null);
    expect(row().artifacts.notes[0].sent).toBeUndefined();
    expect(woke).toBe(0);
  });

  it('a thank-you starts nothing', async () => {
    expect(await note(whole('n1', 'Thanks, approved'))).toBe(false);
    expect(row().answer ?? null).toBe(null);
  });

  it('"Send to the agent" on the held note starts it, once', async () => {
    await note(whole('n1', 'Sofia, approved v4'));
    expect(await note({ do: 'toagent', on: ['n1'] })).toBe(true);
    expect(row().status).toBe('open');
    expect(row().answer).toContain('Sofia, approved v4');
    expect(row().artifacts.notes[0].sent).toBe(true);
    expect(woke).toBe(1);
    expect(await hear({ do: 'toagent', on: ['n1'] })).toBe(false);
  });

  it('a note asking for a change still starts it', async () => {
    expect(await note(whole('n1', 'Drop the stale teaser bullet'))).toBe(true);
    expect(row().answer).toContain('Drop the stale teaser bullet');
  });
});

describe("a teammate's note on an agent's file", () => {
  const lines = [{ source: 'agent', patch: { result: 'Here: designs/w/seat.png' }, ts: 1 }];
  const marks = (text, extra = {}) => ({ notes: [{ id: 'n1', file: 'seat.png', place: { kind: 'whole' }, text, by: SOFIA, ts: 2, mentions: [], ...extra }] });

  it('is told to the agent when it asks for something', () => {
    expect(notesForItsAgent(lines, marks('Tighter gap'), { me: MAYA, people })).toHaveLength(1);
  });

  it('is not when it is written to the owner or is a thank-you', () => {
    expect(notesForItsAgent(lines, marks('Maya, this one is ready for you'), { me: MAYA, people })).toHaveLength(0);
    expect(notesForItsAgent(lines, marks('Love it'), { me: MAYA, people })).toHaveLength(0);
  });

  it('is, once the owner or the teammate presses Send to the agent', () => {
    expect(notesForItsAgent(lines, marks('Love it', { toAgent: true }), { me: MAYA, people })).toHaveLength(1);
  });
});

it('both doors pass the team\'s people to the rule', () => {
  const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
  expect(ipc.match(/noteToItsAgent\(\{[^}]*people/g)?.length).toBe(2);
});
