// THANKING A TEAMMATE WHO TOOK A TASK BACK DOES NOT MAKE IT YOURS AGAIN.
//
// In the 2026-11-27 collaboration test Lena handed Sam a thread, then took it
// back. Sam replied "Thanks for taking it back", and the task came back as his:
// In progress, "You have this", under his Working on in the standup. Seen 12
// times across three testers. Measured from his copy's ledger: Lena's status
// done, then Sam's reply. A reply reopens a done row in two places: the reply
// writes status open (`statusForReply`), and reading the ledger back reopens a
// closed row anyone else wrote on after the close (`reopenIfWrittenPastTheClose`).
// The first attempt fixed only the first, and the rerun showed no change.
// A hand-back already stays handed back after a thank-you; a take-back now does too.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { foldWorkItems, takenBack } from '../shared/work-items.mts';
import { statusForReply } from '../renderer/src/list-rules.ts';

const ID = 'w-046afaf5e0';
const LENA = 'p-lena', SAM = 'p-sam';
const line = (by: string, ts: number, uid: string, patch: object, source = 'founder') => ({ id: ID, ts, source, by, uid, patch });
const given = [
  line(LENA, 100, 'u-0', { title: 'Web app dark mode spec', status: 'open', priority: 5, labels: ['given-task'] }, 'system'),
  line(LENA, 101, 'u-1', { assignee: SAM, title: 'Web app dark mode spec', body: 'Could you take ownership of the dark mode spec?', people: [LENA, SAM] }),
];
const fold = (lines: object[]) => foldWorkItems(lines).get(ID)!;

describe('a task its giver took back', () => {
  const tookBack = [...given, line(LENA, 200, 'u-2', { status: 'done' })];

  it('reads as taken back', () => {
    expect(takenBack(fold(tookBack))).toBe(true);
  });
  it('stays closed when the person it was given to replies', () => {
    expect(fold([...tookBack, line(SAM, 300, 'u-3', { answer: 'Thanks for taking it back, Lena!' })]).status).toBe('done');
  });
  it('stays closed on a reply that crossed the take-back', () => {
    expect(fold([...given, line(SAM, 190, 'u-3', { answer: 'On it.' }), line(LENA, 200, 'u-2', { status: 'done' })]).status).toBe('done');
  });
  it('is not reopened by the reply box', () => {
    expect(statusForReply('done', takenBack(fold(tookBack)))).toBeUndefined();
  });
});

describe('what stays as it was', () => {
  it('a task the person it was given to finished is reopened by the giver writing again', () => {
    const finished = [...given, line(SAM, 200, 'u-2', { status: 'done' })];
    expect(takenBack(fold(finished))).toBe(false);
    expect(fold([...finished, line(LENA, 300, 'u-3', { answer: 'One more thing: the toggle.' })]).status).toBe('open');
  });
  it('a conversation closed by one person is reopened by the other writing', () => {
    const chat = [line(LENA, 100, 'u-0', { title: 'Bookings', body: 'Is the fix live?', status: 'open', kind: 'directive', people: [LENA, SAM] }), line(SAM, 200, 'u-2', { status: 'done' })];
    expect(fold([...chat, line(LENA, 300, 'u-3', { answer: 'Does it cover groups?' })]).status).toBe('open');
  });
  it('a reply on any other closed or stopped row still reopens it', () => {
    expect(statusForReply('done')).toBe('open');
    expect(statusForReply('blocked')).toBe('open');
    expect(statusForReply('open')).toBeUndefined();
  });
});

describe('both ways of replying read it', () => {
  it('a typed reply and a picked option', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    expect(app.match(/statusForReply\(item\.status, takenBack\(item\)\)/g)?.length).toBe(2);
  });
});
