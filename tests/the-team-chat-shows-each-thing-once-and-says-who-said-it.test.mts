// What the team chat draws (w-4bd7b5548b), from the first real power test:
// an answer typed in a teammate's thread never reached its page; a message
// right after an activity line lost its name, so Felix's words read as
// Hugo's; and on Ada's page a message to Ada and Hugo said only "to Hugo".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { answerTo, asksYou, chatEntries, heldFor, heldTitle, involves, queuedTeammateRun } from '../renderer/src/teammates/chat-lines.ts';

const ADA = 't-aaaaaaaaaa';
const HUGO = 't-hhhhhhhhhh';
const msg = (id, from, to, text, ts) => ({ id, kind: 'msg', from, to, text, ts });
const run = (id, verb, ts, extra = {}) => ({ id, kind: 'run', teammate: ADA, item: 'w-1', product: 'p', title: 'Onboarding', verb, ts, ...extra });

describe('the team chat', () => {
  it('shows an answer you typed in the thread, but not one the chat already shows', () => {
    const view = {
      list: [],
      chat: [msg('m-1', 'you', [ADA], 'Use Product instead', 10)],
      runs: [run('w-1:answered', 'answered', 11, { text: 'Use Product instead' }), run('w-2:answered', 'answered', 20, { text: 'Skip the FAQ' })],
    };
    const shown = chatEntries(view).map((e) => e.id);
    expect(shown).toEqual(['m-1', 'w-2:answered']);
  });

  it('leaves out a pass\'s own start line and the message that starts a teammate', () => {
    const view = { list: [], chat: [{ ...msg('m-s', 'you', [ADA], 'Introduce yourself', 1), start: true }], runs: [run('w-1:start', 'passed', 2), run('w-2:start', 'picked', 3)] };
    expect(chatEntries(view).map((e) => e.id)).toEqual(['w-2:start']);
  });

  // "Chat got busy though: 6 picked-up/finished lines for one small ask."
  it('the team chat leaves out picked up for a run that finished, and a teammate\'s page keeps it', () => {
    const view = { list: [], chat: [], runs: [run('w-1:start', 'picked', 1, { item: 'w-1' }), run('w-1:done', 'finished', 2, { item: 'w-1' }), run('w-2:start', 'picked', 3, { item: 'w-2' })] };
    expect(chatEntries(view).map((e) => e.id)).toEqual(['w-1:done', 'w-2:start']);
    expect(chatEntries(view, ADA).map((e) => e.id)).toEqual(['w-1:start', 'w-1:done', 'w-2:start']);
  });

  it('a teammate\'s page holds what it said, did, and what was said to it, and nothing else', () => {
    expect(involves(msg('m', 'you', [ADA, HUGO], 'x', 1), ADA)).toBe(true);
    expect(involves(msg('m', HUGO, [], 'x', 1), ADA)).toBe(false);
    expect(involves({ id: 'p', kind: 'pass', from: HUGO, to: ADA, title: 't', ts: 1 }, ADA)).toBe(true);
    expect(involves(run('w', 'picked', 1), ADA)).toBe(true);
  });

  // A new teammate asks its setup questions in the chat and stops; without
  // this nothing said it was waiting on you unless you opened its page.
  it('a question with answers to tap waits on you until you write to that teammate', () => {
    const ask = { ...msg('m-q', ADA, [], 'Which project?', 10), options: ['Product', 'Website'] };
    expect(asksYou({ list: [], runs: [], chat: [ask] }, ADA)).toBe(true);
    expect(asksYou({ list: [], runs: [], chat: [ask, msg('m-a', 'you', [ADA], 'Product', 11)] }, ADA)).toBe(false);
    // Your words to someone else, or before the question, do not answer it.
    expect(asksYou({ list: [], runs: [], chat: [msg('m-0', 'you', [ADA], 'hi', 9), ask, msg('m-h', 'you', [HUGO], 'x', 12)] }, ADA)).toBe(true);
    // An answer typed in one of its threads counts too (third power test).
    expect(asksYou({ list: [], chat: [ask], runs: [run('w-1:answered', 'answered', 11, { text: 'Product' })] }, ADA)).toBe(false);
    expect(asksYou({ list: [], chat: [ask], runs: [run('w-1:answered', 'answered', 9, { text: 'old' })] }, ADA)).toBe(true);
    // Plain talk with no answers to tap is not a question waiting on you.
    expect(asksYou({ list: [], runs: [], chat: [msg('m-p', ADA, [], 'Done for today.', 10)] }, ADA)).toBe(false);
  });

  it('a question knows your answer to it, so its choices cannot be tapped twice', () => {
    const ask = { ...msg('m-q', ADA, [], 'Which project?', 10), options: ['Product', 'Website'] };
    const view = (chat) => ({ list: [], runs: [], chat });
    expect(answerTo(view([ask]), ask)).toBeNull();
    expect(answerTo(view([ask, msg('m-a', 'you', [ADA], 'Product', 11)]), ask)).toBe('Product');
    expect(answerTo(view([ask, msg('m-h', 'you', [HUGO], 'Product', 11)]), ask)).toBeNull();
    expect(answerTo(view([msg('m-p', ADA, [], 'plain', 10)]), msg('m-p', ADA, [], 'plain', 10))).toBeNull();
  });

  it('signs a message after an activity line, and names every person it went to', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/<Activity [^\n]*\/>\);\n\s*\/\/[^\n]*\n\s*prevFrom = '';/);
    expect(page).not.toMatch(/filter\(\(x\) => x !== only\?\.id\)/);
  });
});

describe('the line under a teammate in the sidebar', async () => {
  const { nowLine } = await import('../renderer/src/teammates/TeammatesRail.tsx');
  const base = { status: 'active', paused: false, running: null, waiting: [], now: null };
  it('says Paused even while something waits on you, and what it is on when it works anyway', () => {
    expect(nowLine({ ...base, paused: true, waiting: [{ id: 'w', product: 'p', title: 't' }], now: 'Waiting on you' })).toBe('Paused, waiting on you');
    expect(nowLine({ ...base, paused: true })).toBe('Paused');
    expect(nowLine({ ...base, paused: true, running: { id: 'w', product: 'p' }, now: 'Draft the intro emails' })).toBe('Draft the intro emails');
    expect(nowLine({ ...base, question: true })).toBe('Has a question for you');
    expect(nowLine({ ...base, status: 'draft' })).toBe('Setting up');
    expect(nowLine(base)).toBe('Idle');
  });
});

describe('a teammate\'s queue', () => {
  it('is not in your Later list, where only what you put off belongs', () => {
    expect(queuedTeammateRun({ start: 'later', labels: ['founder', 'teammate:t-aaaaaaaaaa', 'hop:1'] })).toBe(true);
    expect(queuedTeammateRun({ start: 'later', labels: ['founder'] })).toBe(false);
    expect(queuedTeammateRun({ start: 'now', labels: ['founder', 'teammate:t-aaaaaaaaaa'] })).toBe(false);
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/const snoozed = useMemo\(\(\) => \[[\s\S]{0,200}items\.filter\(\(i\) => !queuedTeammateRun\(i\) && /);
  });
});

describe('work held after too many hand-offs', () => {
  it('waits on you, by its title, until you write or pass to that teammate', () => {
    const pass = { id: 'm-p', kind: 'pass', from: HUGO, to: ADA, title: 'Every booking is lost', ts: 1 };
    const stop = { id: 'm-s', kind: 'act', from: ADA, verb: 'hops', ref: 'm-p', ts: 2 };
    const view = (chat) => ({ list: [], runs: [], chat });
    expect(heldFor(view([pass, stop]), ADA)?.id).toBe('m-s');
    expect(heldTitle(view([pass, stop]), stop)).toBe('Every booking is lost');
    expect(heldFor(view([pass, stop, { id: 'm-g', kind: 'pass', from: 'you', to: ADA, title: 'Every booking is lost', ts: 3 }]), ADA)).toBeNull();
    expect(heldFor(view([pass, stop, msg('m-y', 'you', [ADA], 'go', 3)]), ADA)).toBeNull();
    expect(heldFor(view([pass, stop, msg('m-o', 'you', [HUGO], 'go', 3)]), ADA)?.id).toBe('m-s');
    expect(heldFor(view([pass]), ADA)).toBeNull();
  });
});
