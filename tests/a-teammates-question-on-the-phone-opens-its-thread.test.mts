// A TEAMMATE'S QUESTION ON THE PHONE OPENS THE THREAD THAT ASKED IT (w-4be5a160c7).
//
// Reported from an iPhone on 2026-11-08 with a screenshot of a teammate's chat:
// its reply box sat on the home bar, and there was no Done or Later. Read
// against the desktop: there a teammate's question is answered inside the
// thread that asked it (App.tsx `ThreadQuestions`), which has Done, Later and
// the rest. The phone could only open the chat, because the computer never sent
// a chat line's `run`, and the chat's box had 10pt under it where the regular
// reply box has the home bar's room (`footRoom`).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneTeammatesOf } from '../shared/phone-snapshot.mts';
import { questionThread, questionsInThread } from '../mobile/src/lib/teammates';

const read = (p) => fs.readFileSync(p, 'utf8');
const mate = { id: 't-growth0001', name: 'Growth lead', waiting: [], paused: false };
const asked = { id: 'm-1', kind: 'msg', from: 't-growth0001', to: ['you'], text: 'Which account first?', options: ['The CEO', 'The brand'], run: 'w-run1', ts: 1000 };
const item = (id, mateId, product = 'dev1-alpha') => ({ id, product, labels: mateId ? [`teammate:${mateId}`] : [] });
const view = (chat) => ({ list: [mate], chat, runs: [] });

describe('the computer tells the phone which thread a question came from', () => {
  it('keeps a chat line\'s run', () => {
    expect(phoneTeammatesOf({ list: [mate], chat: [asked], runs: [] }).chat[0].run).toBe('w-run1');
  });
});

describe('the thread a question opens', () => {
  it('is the teammate\'s thread it was asked in, when the phone has it', () => {
    expect(questionThread(asked, [item('w-other', 't-growth0001'), item('w-run1', 't-growth0001')])).toEqual({ product: 'dev1-alpha', id: 'w-run1' });
  });
  it('is none when the phone does not have that thread', () => {
    expect(questionThread(asked, [item('w-other', 't-growth0001')])).toBeNull();
  });
  it('is none for a thread with that id that is not the asker\'s', () => {
    expect(questionThread(asked, [item('w-run1', null), item('w-run1', 't-someone001')])).toBeNull();
  });
  it('is none for a question asked in the chat itself, from an older computer too', () => {
    const { run, ...noRun } = asked;
    expect(questionThread(noRun, [item('w-run1', 't-growth0001')])).toBeNull();
  });
});

describe('the questions a thread shows', () => {
  it('are its teammate\'s open ones asked in it', () => {
    expect(questionsInThread(view([asked]), item('w-run1', 't-growth0001')).map((q) => q.id)).toEqual(['m-1']);
  });
  it('not one asked in another thread', () => {
    expect(questionsInThread(view([asked]), item('w-run2', 't-growth0001'))).toEqual([]);
  });
  it('not once it is answered, here or on the computer', () => {
    const answer = { id: 'm-2', kind: 'msg', from: 'you', to: ['t-growth0001'], text: 'The CEO', answers: { 'm-1': 'The CEO' }, ts: 2000 };
    expect(questionsInThread(view([asked, answer]), item('w-run1', 't-growth0001'))).toEqual([]);
    const pending = [{ ...answer, waiting: true, refused: null }];
    expect(questionsInThread(view([asked]), item('w-run1', 't-growth0001'), pending)).toEqual([]);
  });
  it('none on a thread that is not a teammate\'s', () => {
    expect(questionsInThread(view([asked]), item('w-run1', null))).toEqual([]);
  });
});

describe('the screens', () => {
  it('Needs you opens the thread for a question asked in one, and the chat otherwise', () => {
    const inbox = read('mobile/src/app/index.tsx');
    expect(inbox).toMatch(/questionThread\(q\.question, c\.view\.items\)/);
    expect(inbox).toMatch(/pathname: '\/thread\/\[product\]\/\[id\]'/);
  });
  it('the thread shows the teammate\'s questions to answer, over its reply box', () => {
    const thread = read('mobile/src/app/thread/[product]/[id].tsx');
    expect(thread).toMatch(/\{mate && <ThreadQuestions item=\{item\} \/>\}\s*<Dock /);
    expect(read('mobile/src/ui/Teammates.tsx')).toMatch(/questionsInThread\(c\.team\?\.view, item, c\.teamPending\)/);
  });
  it('the chat\'s reply box keeps the home bar free, as the thread\'s does', () => {
    const box = read('mobile/src/ui/Teammates.tsx');
    const composer = box.slice(box.indexOf('export function MateComposer'), box.indexOf('\n}\n', box.indexOf('export function MateComposer')));
    expect(composer).toMatch(/footRoom\(inset\)/);
    expect(composer).not.toMatch(/paddingBottom: 10 \}/);
  });
});
