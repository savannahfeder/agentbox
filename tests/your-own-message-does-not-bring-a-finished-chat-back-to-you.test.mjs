// YOUR OWN MESSAGE DOES NOT BRING A FINISHED CHAT BACK TO YOU (w-8a14927b21).
//
// Reported 2026-10-16: "This conversation was already done and then I sent a
// fresh message. It actually brought it into my inbox... I only need to see
// things that other people send."
//
// What happened, read off the screenshot and replayed below: a teammate
// answered one of your threads in the evening, you marked the chat done the
// next day, then wrote a new message in it. The reply reopened the row
// (`statusForReply`), and `whatWaits` still counted the teammate's evening reply
// as waiting on you, because nothing remembered that marking it done had dealt
// with it. Measured on the rule before the fix: `inMyInbox` answered true after
// your own message.
//
// The rule now: marking a chat done settles everything said in it before that
// moment, for you. Your own message reopening it keeps that. Undoing the close
// takes it back, and anything said after the close still counts.
import { describe, it, expect } from 'vitest';
import { foldWorkItems } from '../shared/work-items.mjs';
import { inMyInbox, iSpokeLast, whatWaits } from '../shared/team-rules.mjs';

const ID = 'w-0123456789';
const ME = 'p-me', MAYA = 'p-maya';
const DIRECT = { slug: 'direct-c0ffee02', name: 'Direct', team: { projectId: 'c0ffee02', teamId: 't1', people: [ME, MAYA], sharedBy: ME, direct: true } };

let clock = 1_000_000;
const tick = () => (clock += 60_000);
const line = (by, uid, patch) => ({ id: ID, ts: tick(), source: 'founder', by, uid, patch });
const open = () => line(MAYA, 'u-open', { title: 'Outreach', body: 'Setup notes.', status: 'open', kind: 'directive', people: [ME, MAYA] });
const say = (by, uid, text, extra = {}) => line(by, uid, { answer: text, ...extra });
const close = (by, uid) => line(by, uid, { status: 'done' });
const reopen = (by, uid) => line(by, uid, { status: 'open' });
const fold = (lines) => foldWorkItems(lines).get(ID);

// The screenshot: you asked in a thread, Maya answered it that evening, she
// sent her end-of-day note in the chat, you answered it, and then you closed it.
const HANDLED = () => [
  open(),
  say(ME, 'u-ask', 'Could you send the docs over?', { inReplyTo: 'u-open' }),
  say(MAYA, 'u-link', 'Here is the link.', { inReplyTo: 'u-open' }),
  say(MAYA, 'u-eod', 'Signing off for today.'),
  say(ME, 'u-ok', 'Approved.'),
  close(ME, 'u-done'),
];

describe('a chat you marked done, then wrote in again', () => {
  it('stays out of your inbox when your own message reopens it', () => {
    const item = fold([...HANDLED(), say(ME, 'u-new', 'One more idea for you.', { status: 'open' })]);
    expect(item.status).toBe('open');
    expect(inMyInbox(item, DIRECT, ME)).toBe(false);
    expect(whatWaits(item, ME)).toEqual({ chat: 0, threads: [] });
    expect(iSpokeLast(item, DIRECT, ME)).toBe(true);
  });

  it('still reaches the person you wrote to', () => {
    const item = fold([...HANDLED(), say(ME, 'u-new', 'One more idea for you.', { status: 'open' })]);
    expect(inMyInbox(item, DIRECT, MAYA)).toBe(true);
  });

  it('stays out when your message is a reply in a thread', () => {
    const item = fold([...HANDLED(), say(ME, 'u-new', 'Thanks!', { status: 'open', inReplyTo: 'u-open' })]);
    expect(inMyInbox(item, DIRECT, ME)).toBe(false);
  });

  it('comes back when the other person writes after you closed it', () => {
    const item = fold([...HANDLED(), say(MAYA, 'u-more', 'One question.', { status: 'open' })]);
    expect(inMyInbox(item, DIRECT, ME)).toBe(true);
    expect(whatWaits(item, ME).chat).toBe(1);
  });

  it('comes back when the other person answers a thread after you closed it', () => {
    const lines = [...HANDLED(), say(ME, 'u-new', 'Reopening.', { status: 'open' }), say(MAYA, 'u-r2', 'Got it.', { inReplyTo: 'u-open' })];
    const waits = whatWaits(fold(lines), ME);
    expect(waits.threads).toHaveLength(1);
    expect(waits.threads[0].fresh).toBe(1);
    expect(waits.threads[0].last).toBe('Got it.');
  });

  // Undo is not dealing with it: the close never happened, so what was
  // waiting waits again.
  it('counts the old replies again when you undo the close', () => {
    const item = fold([...HANDLED().slice(0, -2), close(ME, 'u-done'), reopen(ME, 'u-undo')]);
    expect(inMyInbox(item, DIRECT, ME)).toBe(true);
    expect(whatWaits(item, ME).threads).toHaveLength(1);
  });

  // Somebody else closing it settles nothing for you.
  it('does not settle anything for you when the other person closed it', () => {
    const lines = [open(), say(ME, 'u-ask', 'Docs?', { inReplyTo: 'u-open' }), say(MAYA, 'u-link', 'Link.', { inReplyTo: 'u-open' }), close(MAYA, 'u-done'), say(ME, 'u-new', 'Hi again.', { status: 'open' })];
    expect(inMyInbox(fold(lines), DIRECT, ME)).toBe(true);
  });

  // Lines pulled from the cloud are not promised in order, so a reply that
  // arrives on disk before the close still counts by when it was written.
  it('reads the close by its time, not by where the line sits', () => {
    const lines = [...HANDLED(), say(ME, 'u-new', 'Hello.', { status: 'open' })];
    const shuffled = [lines[0], lines.at(-2), lines.at(-1), ...lines.slice(1, -2)];
    expect(inMyInbox(fold(shuffled), DIRECT, ME)).toBe(false);
  });

  it('leaves a chat nobody closed reading as it always did', () => {
    const lines = HANDLED().slice(0, -2);
    expect(inMyInbox(fold(lines), DIRECT, ME)).toBe(true);
    expect(fold(lines).talk.settled).toBeUndefined();
  });
});
