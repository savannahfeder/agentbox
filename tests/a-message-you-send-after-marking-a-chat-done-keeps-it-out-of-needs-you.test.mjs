// A MESSAGE YOU SEND AFTER MARKING A CHAT DONE KEEPS IT OUT OF NEEDS YOU
// (w-f53d9c472f).
//
// Reported 2026-10-20: "sending messages to margarette and for some reason it
// ends up in my needs review after i've sent it, but i shouldn't need to
// review a message i've sent or processed". The screenshot: the chat marked
// done at 9:22, a new message at 9:44 drawn with "Sent it back" under it, and
// the row in Needs you reading "Margarette in your thread: ..." over a reply
// from the day before.
//
// w-8a14927b21 fixed this case on 2026-10-16, but its test wrote the message
// and the reopen as ONE line. The app writes them as two (`answerItem`, main/
// store.mjs): the words, then a status line with no words. `settledBy` read
// that wordless reopen as pressing Z on the close, dropped the settle, and the
// old thread reply waited on you again. Measured before the fix through the
// real write path below: `inMyInbox` answered true after your own message.
//
// The rule now: a reopen takes the close back only when you have said nothing
// since you closed it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { inMyInbox, iSpokeLast, whatWaits } from '../shared/team-rules.mjs';

const ID = 'w-0123456789';
const ME = 'p-me', MAYA = 'p-maya';
const DIRECT = { slug: 'direct-c0ffee03', name: 'Direct', team: { projectId: 'c0ffee03', teamId: 't1', people: [ME, MAYA], sharedBy: ME, direct: true } };

let clock = 1_000_000;
const tick = () => (clock += 60_000);
const line = (by, uid, patch) => ({ id: ID, ts: tick(), source: 'founder', by, uid, patch });
const open = () => line(ME, 'u-open', { title: 'Comms', body: 'How do we make this as good as Slack?', status: 'open', kind: 'directive', people: [ME, MAYA] });
const say = (by, uid, text, extra = {}) => line(by, uid, { answer: text, ...extra });
const status = (by, uid, s) => line(by, uid, { status: s });
// What `answerItem` writes when you send on a chat you marked done.
const send = (uid, text) => [say(ME, uid, text), status(ME, `${uid}-s`, 'open')];
const fold = (lines) => foldWorkItems(lines).get(ID);

// The screenshot: Maya answered your thread, sent her end-of-day note, you
// answered it and marked the chat done.
const HANDLED = () => [
  open(),
  say(MAYA, 'u-gaps', 'Thanks, two things come to mind first.', { inReplyTo: 'u-open' }),
  say(MAYA, 'u-eod', 'Signing off for today.'),
  say(ME, 'u-thanks', 'Thanks for the progress!'),
  status(ME, 'u-done', 'done'),
];

describe('a chat you marked done, then sent a message in', () => {
  it('stays out of Needs you when the reopen is its own line', () => {
    const item = fold([...HANDLED(), ...send('u-new', 'Heads up: Slack goes away soon.')]);
    expect(item.status).toBe('open');
    expect(whatWaits(item, ME)).toEqual({ chat: 0, threads: [] });
    expect(inMyInbox(item, DIRECT, ME)).toBe(false);
    expect(iSpokeLast(item, DIRECT, ME)).toBe(true);
  });

  it('stays out when the message is a reply in a thread', () => {
    const [words, reopen] = send('u-new', 'Thanks!');
    words.patch.inReplyTo = 'u-open';
    expect(inMyInbox(fold([...HANDLED(), words, reopen]), DIRECT, ME)).toBe(false);
  });

  it('still reaches the person you wrote to', () => {
    const item = fold([...HANDLED(), ...send('u-new', 'Heads up.')]);
    expect(inMyInbox(item, DIRECT, MAYA)).toBe(true);
  });

  it('comes back when the other person writes after you closed it', () => {
    const lines = [...HANDLED(), ...send('u-new', 'Heads up.'), say(MAYA, 'u-r2', 'Got it.', { inReplyTo: 'u-open' })];
    const waits = whatWaits(fold(lines), ME);
    expect(waits.threads).toHaveLength(1);
    expect(waits.threads[0].last).toBe('Got it.');
  });

  // Z on the close writes a reopen with no words, and that is not dealing
  // with anything.
  it('counts the old replies again when you undo the close', () => {
    const item = fold([...HANDLED(), status(ME, 'u-undo', 'open')]);
    expect(inMyInbox(item, DIRECT, ME)).toBe(true);
    expect(whatWaits(item, ME).threads).toHaveLength(1);
  });

  // THE CASE THAT MUST NOT MATCH: words from before the close do not turn a
  // later undo into speaking.
  it('counts an undo as an undo even though you spoke before closing', () => {
    const lines = [...HANDLED().slice(0, -1), ...send('u-early', 'One more thing.'), status(ME, 'u-done', 'done'), status(ME, 'u-undo', 'open')];
    expect(inMyInbox(fold(lines), DIRECT, ME)).toBe(true);
  });

  it('counts an undo after you sent, withdrew and then undid the close', () => {
    const lines = [
      ...HANDLED(), ...send('u-new', 'Heads up.'),
      say(ME, 'u-wd', '(withdrawn)'), status(ME, 'u-wd-s', 'done'),
      status(ME, 'u-undo', 'open'),
    ];
    expect(inMyInbox(fold(lines), DIRECT, ME)).toBe(true);
  });
});

describe('the same, through the app\'s own write path', () => {
  let root, store, dir;
  const SLUG = 'direct-c0ffee03';
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 19, 16, 0));
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sent-'));
    dir = path.join(root, SLUG);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: SLUG, name: 'Direct', team: DIRECT.team }));
    store = await new Store({ accountRoot: root, products: [] }).init();
    disk.setLineAuthor(ME);
  });
  afterEach(() => {
    disk.setLineAuthor(null);
    vi.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const later = (min) => vi.setSystemTime(Date.now() + min * 60_000);

  const handled = () => {
    const made = store.composeItem(SLUG, { title: 'Comms', body: 'How do we make this as good as Slack?', people: [ME, MAYA] });
    const opening = store.readHistory(SLUG, made.id).find((l) => l.patch?.body).uid;
    later(30);
    disk.appendForeignLines(dir, [{ id: made.id, ts: Date.now(), source: 'founder', by: MAYA, uid: 'u-gaps', patch: { answer: 'Thanks, two things come to mind first.', inReplyTo: opening } }]);
    later(60 * 17);
    store.answerItem(SLUG, made.id, { status: 'done' });
    return made.id;
  };

  it('writes the message and the reopen as two lines', () => {
    const id = handled();
    later(22);
    store.answerItem(SLUG, id, { answer: 'Heads up: Slack goes away soon.' });
    const mine = store.readHistory(SLUG, id).slice(-2).map((l) => l.patch);
    expect(mine).toEqual([{ answer: 'Heads up: Slack goes away soon.' }, { status: 'open' }]);
  });

  it('keeps the chat out of Needs you after you send', () => {
    const id = handled();
    later(22);
    store.answerItem(SLUG, id, { answer: 'Heads up: Slack goes away soon.' });
    const item = store.readItem(SLUG, id);
    expect(item.status).toBe('open');
    expect(inMyInbox(item, DIRECT, ME)).toBe(false);
  });

  it('brings it back when you undo the close instead', () => {
    const id = handled();
    later(1);
    store.answerItem(SLUG, id, { status: 'open' });
    expect(inMyInbox(store.readItem(SLUG, id), DIRECT, ME)).toBe(true);
  });
});
