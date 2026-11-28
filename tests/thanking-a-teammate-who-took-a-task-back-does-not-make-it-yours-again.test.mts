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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { foldWorkItems, takenBack } from '../shared/work-items.mts';
import { heldRowStarts, statusForReply } from '../renderer/src/list-rules.ts';

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

// The second rerun still saw it: the app's write path (`answerItem`) turns a
// reply with no status on a closed row into a reopen of its own.
describe("through the app's own write path", () => {
  let root: string;
  let store: Store;
  let dir: string;
  const SLUG = 'direct-c0ffee03';
  const team = { projectId: 'c0ffee03', teamId: 't1', people: [SAM, LENA], sharedBy: LENA, direct: true };
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'took-back-'));
    dir = path.join(root, SLUG);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: SLUG, name: 'Direct', team }));
    store = await new Store({ accountRoot: root, products: [] }).init();
    disk.setLineAuthor(SAM);
  });
  afterEach(() => {
    disk.setLineAuthor(null);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const statusAfter = (closer: string) => {
    const now = Date.now();
    disk.appendForeignLines(dir, [
      { id: ID, ts: now - 3000, source: 'system', by: LENA, uid: 'f-0', patch: { title: 'Web app dark mode spec', status: 'open', priority: 5, labels: ['given-task'] } },
      { id: ID, ts: now - 2000, source: 'founder', by: LENA, uid: 'f-1', patch: { assignee: SAM, body: 'Could you take ownership of the dark mode spec?', people: [LENA, SAM] } },
      { id: ID, ts: now - 1000, source: 'founder', by: closer, uid: 'f-2', patch: { status: 'done' } },
    ]);
    store.answerItem(SLUG, ID, { answer: 'Thanks for taking it back, Lena!' });
    return { written: store.readHistory(SLUG, ID).slice(-1)[0].patch, status: fold(store.readHistory(SLUG, ID)).status };
  };

  it('a thank-you on a task its giver took back writes no reopen', () => {
    expect(statusAfter(LENA)).toEqual({ written: { answer: 'Thanks for taking it back, Lena!' }, status: 'done' });
  });
  it('a reply on a task you closed yourself still reopens it', () => {
    expect(statusAfter(SAM).status).toBe('open');
  });
});

// The final rerun: it stayed closed, but for the few seconds a sent reply can be
// undone the header said In progress (10 sightings), because a reply held for
// Z is drawn there as starting an agent (`heldRowStarts`).
describe('while the reply can still be undone', () => {
  it('a reply on a taken-back task is not drawn as starting anything', () => {
    const item = { ...fold([...given, line(LENA, 200, 'u-2', { status: 'done' })]), product: 'direct-c0ffee03' };
    expect(heldRowStarts(item, { product: item.product, id: ID })).toBe(false);
  });
  it('a reply on any other row still is', () => {
    const item = { ...fold([...given, line(SAM, 200, 'u-2', { status: 'done' })]), product: 'direct-c0ffee03' };
    expect(heldRowStarts(item, { product: item.product, id: ID })).toBe(true);
  });
});

describe('both ways of replying read it', () => {
  it('a typed reply and a picked option', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    expect(app.match(/statusForReply\(item\.status, takenBack\(item\)\)/g)?.length).toBe(2);
  });
});
