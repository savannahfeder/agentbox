// A REPLY YOU HAVE NOT READ REACHES NEEDS YOU, EVEN IF ITS AUTHOR THEN CLOSED THE THREAD.
//
// Dev replied in a task thread at 6:36 and 6:43, then marked
// it Done. Jordan's Needs you never showed either; he found them 25 to 30 minutes
// later by opening Done threads, and one answer sat out for 37 minutes. A close is
// one shared status, so the author's Done took the words off the reader's list too.
import { describe, it, expect } from 'vitest';
import { closedOverWords, inMyInbox, GIVEN_TASK } from '../shared/team-rules.mjs';
import { taskWords } from '../renderer/src/team/company.ts';
import fs from 'node:fs';

const ME = 'jordan';
const DEV = 'dev';
const direct = { slug: 'dm', team: { projectId: 'x', direct: true, sharedBy: ME, people: [DEV] } };
const shared = { slug: 'work', team: { projectId: 'y' } };

const task = (o = {}) => ({
  id: 't1', status: 'done', labels: [GIVEN_TASK], assignee: DEV, people: [ME, DEV], createdBy: ME,
  wrote: { status: { ts: 300, by: DEV } },
  talk: { chat: [{ by: ME, ts: 100, text: 'Is it live?' }, { by: DEV, ts: 200, text: 'No.' }], threads: {} },
  ...o,
});

describe('an answer and then a close by its author', () => {
  it('is in the reader\'s Needs you', () => {
    expect(closedOverWords(task(), direct, ME, 0)).toBe(true);
  });
  it('is there for words just after you last looked', () => {
    expect(closedOverWords(task(), direct, ME, 199)).toBe(true);
  });
  it('a message, not only a task, is the same', () => {
    expect(closedOverWords(task({ labels: [], assignee: undefined }), direct, ME, 0)).toBe(true);
  });
  it('a reply inside a thread of the chat counts', () => {
    const talk = { chat: [{ by: ME, ts: 100, text: 'Is it live?' }], threads: { u1: { by: ME, text: 'Is it live?', replies: [{ by: DEV, ts: 200, text: 'No.' }] } } };
    expect(closedOverWords(task({ talk }), direct, ME, 150)).toBe(true);
  });
  it('and the row says who closed it, not a bare Done', () => {
    expect(taskWords(task(), direct, ME, () => 'Dev', true).word).toBe('Dev marked it done');
    expect(taskWords(task(), direct, ME, () => 'Dev').word).toBe('Done');
  });
});

describe('what must not come back', () => {
  it('words you have read, opened after they came', () => {
    expect(closedOverWords(task(), direct, ME, 200)).toBe(false);
    expect(closedOverWords(task(), direct, ME, 250)).toBe(false);
  });
  it('a thread you closed yourself', () => {
    expect(closedOverWords(task({ wrote: { status: { ts: 300, by: ME } } }), direct, ME, 0)).toBe(false);
  });
  it('words you answered', () => {
    const talk = { chat: [{ by: DEV, ts: 200, text: 'No.' }, { by: ME, ts: 250, text: 'Thanks' }], threads: {} };
    expect(closedOverWords(task({ talk }), direct, ME, 0)).toBe(false);
  });
  it('words you dealt with by pressing Done', () => {
    expect(closedOverWords(task({ talk: { ...task().talk, settled: { [ME]: 220 } } }), direct, ME, 0)).toBe(false);
  });
  it('a close with nothing said for you', () => {
    const talk = { chat: [{ by: ME, ts: 100, text: 'Is it live?' }], threads: {} };
    expect(closedOverWords(task({ talk }), direct, ME, 0)).toBe(false);
  });
  it('an open row: the ordinary rule has it', () => {
    expect(closedOverWords(task({ status: 'open' }), direct, ME, 0)).toBe(false);
  });
  it('a shared work thread, a Mac nobody is signed in on, a close by nobody named', () => {
    expect(closedOverWords(task(), shared, ME, 0)).toBe(false);
    expect(closedOverWords(task(), direct, null, 0)).toBe(false);
    expect(closedOverWords(task({ wrote: {} }), direct, ME, 0)).toBe(false);
  });
  it('the ordinary rule still has a closed row out', () => {
    expect(inMyInbox(task(), direct, ME)).toBe(false);
  });
});

it('the inbox asks it, with when you last opened the thread', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const inbox = app.slice(app.indexOf('fileNewsFor(i, team?.me ?? null, { myName }).length) return true;'), app.indexOf('const shared = teamInbox(i);'));
  expect(inbox).toMatch(/closedOverWords\(i, team\.products\.get\(i\.product\), team\.me, seenAt\[i\.id\] \?\? unreadSince\)/);
});
