// A CLOUD ASK IS ANSWERED ONCE, CHECKED, AND NOT LISTED AFTER IT IS GIVEN.
//
// What broke (power test round six, 2026-11-04, three testers on the stand-in
// cloud): a thread waiting on Supabase and Sentry still sat under "Connect
// Supabase" after Supabase was saved; GitHub never carried on after a reply was
// withdrawn with Z; an older copy of the same card took no typing; a card stayed
// open under "Do it from my computer."; a token pasted inside a sentence went to
// the thread as words; an account password was kept as the Vercel token and a
// five-digit npm code was sent; the toast read "Stripe connected saved."; search
// showed the raw ask line. Measured here on the functions the screens draw from.
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NEED, needsIn, needsLeft, needsWord, threadsKeysFree } from '../shared/cloud-needs.mts';
import { keyFromReply, keyLooksWrong, codeLooksWrong, keySavedWords } from '../renderer/src/key-asks.ts';
import { plainText, searchText } from '../renderer/src/format.ts';

const BOTH = `**I need two sign-ins.**\n\n${NEED} sign-in supabase | to apply the change\n${NEED} sign-in sentry | to read the errors`;
const row = (result, o = {}) => ({ id: 'w-1', product: 'web', title: 'Conferences', status: 'open', result, wrote: { result: { ts: 10 } }, ...o });

describe('what a thread still waits on', () => {
  it('leaves out what is saved, so the row names what is left', () => {
    expect(needsLeft(row(BOTH), []).map((n) => n.service.id)).toEqual(['supabase', 'sentry']);
    expect(needsLeft(row(BOTH), ['SUPABASE_ACCESS_TOKEN']).map((n) => n.service.id)).toEqual(['sentry']);
    expect(needsWord(needsLeft(row(BOTH), ['SUPABASE_ACCESS_TOKEN']))).toBe('Needs Sentry');
    expect(needsLeft(row(BOTH), ['SUPABASE_ACCESS_TOKEN', 'SENTRY_AUTH_TOKEN'])).toEqual([]);
  });
  it('waits on nothing once answered, or running, or closed', () => {
    expect(needsLeft(row(BOTH, { answer: 'Do it from my computer.', wrote: { result: { ts: 10 }, answer: { ts: 20 } } }))).toEqual([]);
    expect(needsLeft(row(BOTH, { status: 'claimed' }))).toEqual([]);
    expect(needsLeft(row(BOTH, { status: 'done' }))).toEqual([]);
  });
  it('still waits after a reply taken back', () => {
    expect(needsLeft(row(BOTH, { answer: '(withdrawn)', wrote: { result: { ts: 10 }, answer: { ts: 20 } } }))).toHaveLength(2);
  });
  it('lists only what is left at the top of Needs you', async () => {
    const { waitingRows } = await import('../renderer/src/threads/NeedsWaiting.tsx');
    expect(waitingRows([row(BOTH)], ['SUPABASE_ACCESS_TOKEN']).map((r) => r.title)).toEqual(['Connect Sentry']);
  });
});

describe('a saved sign-in after a withdrawn reply', () => {
  const gh = `${NEED} sign-in github | to open the pull request`;
  it('carries the thread on', () => {
    expect(threadsKeysFree([row(gh, { answer: '(withdrawn)', wrote: { result: { ts: 10 }, answer: { ts: 20 } } })], ['GH_TOKEN'])).toHaveLength(1);
  });
  it('but not after a reply that stands', () => {
    expect(threadsKeysFree([row(gh, { answer: 'wait', wrote: { result: { ts: 10 }, answer: { ts: 20 } } })], ['GH_TOKEN'])).toEqual([]);
  });
});

describe('a token pasted in a sentence', () => {
  const long = 'here you go sntrys_ana_test_44aa just use that, and dont forget the npm part after';
  it('is kept when it is marked as the asked key, and the words go on', () => {
    expect(keyFromReply(`${long} please and thanks a lot`, ['SUPABASE_ACCESS_TOKEN'], [])).toBeNull();
    expect(keyFromReply('here you go sbp_0123456789abcdef just use that, and dont forget the npm part after', ['SUPABASE_ACCESS_TOKEN'], []))
      .toEqual({ name: 'SUPABASE_ACCESS_TOKEN', value: 'sbp_0123456789abcdef', words: true });
  });
  it('is not taken from a long message when nothing marks it as that key', () => {
    expect(keyFromReply('here is the build id abc123def456ghi789 and a lot more words that are about other things', ['VERCEL_TOKEN'], [])).toBeNull();
  });
  it('a short reply still counts as before, with no words to send', () => {
    expect(keyFromReply('sbp_0123456789abcdef', ['SUPABASE_ACCESS_TOKEN'], [])).toEqual({ name: 'SUPABASE_ACCESS_TOKEN', value: 'sbp_0123456789abcdef', words: false });
  });
});

describe('what is pasted or typed is checked', () => {
  it.each([
    ['VERCEL_TOKEN', 'hunter2!', 'too short'],
    ['VERCEL_TOKEN', 'my password is long enough', 'has spaces'],
    ['SUPABASE_ACCESS_TOKEN', 'q1w2e3r4t5y6u7i8o9p0', 'lacks sbp_'],
    ['GH_TOKEN', 'q1w2e3r4t5y6u7i8o9p0', 'lacks ghp_'],
  ])('warns on %s %s (%s)', (name, value) => {
    expect(keyLooksWrong(name, value)).toMatch(/^That does not look like .* Press Save again to keep it anyway\.$/);
  });
  it.each([
    ['VERCEL_TOKEN', 'q1w2e3r4t5y6u7i8o9p0abcd'],
    ['GH_TOKEN', 'github_pat_11ABCDEFG0123456789'],
    ['SENTRY_AUTH_TOKEN', 'sntrys_eyJpYXQiOjE3MDAwMDAwMDB9'],
  ])('lets %s through when it fits', (name, value) => {
    expect(keyLooksWrong(name, value)).toBeNull();
  });
  it('asks twice before sending a code that is not six digits', () => {
    expect(codeLooksWrong('482139')).toBeNull();
    expect(codeLooksWrong('48213')).toBe('That is 5 digits; these codes are 6. Press Send again to send it anyway.');
    expect(codeLooksWrong('4821390')).toMatch(/^That is 7 digits/);
    expect(codeLooksWrong('abc-def')).toBe('These codes are 6 digits. Press Send again to send it anyway.');
  });
});

describe('what the screen says', () => {
  it('says a sign-in is connected, once', () => {
    expect(keySavedWords('Stripe', { asks: ['STRIPE_SECRET_KEY'], saved: ['STRIPE_SECRET_KEY'], freed: ['w-1'], thread: 'w-1', done: 'connected' })).toBe('Stripe connected. This thread carries on.');
    expect(keySavedWords('Sentry auth token', { asks: [], saved: [], freed: [], thread: 'w-1' })).toBe('Sentry auth token saved.');
  });
  it('reads no ask line in a preview or a search', () => {
    expect(plainText(BOTH)).toBe('I need two sign-ins.');
    expect(searchText(BOTH)).not.toMatch(/AGENTBOX|sign-in supabase/);
  });
});

describe('a card that has been answered', async () => {
  const { NeedCard, NeedPlace, NeedOlder } = await import('../renderer/src/components/NeedCard.tsx');
  const [need] = needsIn(`${NEED} sign-in sentry | to read the errors`);
  const place = { saved: [], live: true, needs: [need], saveKeys: async () => null, sendFile: async () => null, sendCode: async () => null, onComputer: () => {}, openLink: () => {} };
  const draw = (older, live = true) => renderToStaticMarkup(h(NeedPlace.Provider, { value: { ...place, live } }, h(NeedOlder.Provider, { value: older }, h(NeedCard, { source: JSON.stringify(need), fallback: null }))));

  it('takes a token only on the newest unanswered ask', () => {
    expect(draw(false)).toContain('<input');
    expect(draw(false)).toContain('Get an auth token from');
  });
  it('is quiet when an older copy, or answered since', () => {
    for (const html of [draw(true), draw(false, false)]) {
      expect(html).not.toContain('<input');
      expect(html).toContain('Answered below.');
    }
  });
});

// Round seven (same three testers, after the fixes above): the film went back
// alone while Stripe was still open and the thread asked for Stripe again; the
// way out vanished once the first of two sign-ins was saved; a live Stripe key
// was kept for every cloud thread; search's lines still showed the ask line.
describe('round seven', async () => {
  const { NeedCard, NeedPlace } = await import('../renderer/src/components/NeedCard.tsx');
  const { messagesOf } = await import('../main/everything-found.mts');
  const { needId } = await import('../shared/cloud-needs.mts');
  const needs = needsIn(`${NEED} sign-in stripe | to read the MRR\n${NEED} file ~/Movies/launch-film-original.mov | to attach it\n${NEED} code npm | to publish`);
  const base = { itemId: 'w-1', saved: [], given: [], live: true, needs, saveKeys: async () => null, sendFile: async () => null, sendCode: async () => null, onComputer: () => {}, openLink: () => {} };
  const draw = (n, o = {}) => renderToStaticMarkup(h(NeedPlace.Provider, { value: { ...base, ...o } }, h(NeedCard, { source: JSON.stringify(needs[n]), fallback: null })));

  it('names each need once, the same everywhere', () => {
    expect(needs.map(needId)).toEqual(['sign-in:stripe', 'file:~/Movies/launch-film-original.mov', 'code:npm']);
  });
  it('says a file sent before the sign-in waits for it', () => {
    const html = draw(1, { given: ['file:~/Movies/launch-film-original.mov'] });
    expect(html).toContain('launch-film-original.mov is ready');
    expect(html).toContain('It goes with Stripe and the npm code.');
  });
  // Round eight: a disabled code box sent the digits typed at it to the reply box. It takes them, and says to wait.
  it('takes a code typed before the sign-ins, and says they come first since codes run out', () => {
    expect(draw(2)).not.toMatch(/<input[^>]*disabled/);
    expect(draw(2)).toContain('Enter it once Stripe is in');
    expect(draw(2, { saved: ['STRIPE_SECRET_KEY'] })).not.toContain('Enter it once');
  });
  it('keeps the way out under the last ask still open', () => {
    expect(draw(2)).toContain('Do it on my computer instead');
    expect(draw(0)).not.toContain('Do it on my computer instead');
    const two = needsIn(`${NEED} sign-in sentry | a\n${NEED} sign-in aws | b`);
    const one = (n, saved) => renderToStaticMarkup(h(NeedPlace.Provider, { value: { ...base, needs: two, saved } }, h(NeedCard, { source: JSON.stringify(two[n]), fallback: null })));
    expect(one(0, ['SENTRY_AUTH_TOKEN'])).not.toContain('Do it on my computer instead');
    expect(one(1, ['SENTRY_AUTH_TOKEN'])).toContain('Do it on my computer instead');
    expect(one(1, ['SENTRY_AUTH_TOKEN'])).toContain('Kept encrypted in your Agentbox Cloud');
  });
  it('warns before keeping a live Stripe key, not a test one', () => {
    expect(keyLooksWrong('STRIPE_SECRET_KEY', 'sk_live_51Habcdef0123456789')).toMatch(/^That is a live Stripe key/);
    expect(keyLooksWrong('STRIPE_SECRET_KEY', 'sk_test_51Habcdef0123456789')).toBeNull();
  });
  it('reads no ask line in a search over what was said', () => {
    const [m] = messagesOf([{ ts: 5, source: 'agent', patch: { result: `I need the npm code.\n${NEED} code npm | to publish` } }]);
    expect(m.text).not.toMatch(/AGENTBOX/);
  });
});

// Round eight: the toast said "One more key to go" with a film still to send; the
// banner still offered to send a film already held; the oldest stuck thread was
// folded under "more".
describe('round eight', async () => {
  const { waitingRows } = await import('../renderer/src/threads/NeedsWaiting.tsx');
  const { HELD } = await import('../renderer/src/components/NeedCard.tsx');
  it('says everything still to give, files and codes too', () => {
    expect(keySavedWords('Stripe', { asks: [], saved: [], freed: [], thread: 'w-1', done: 'connected', left: ['launch-film-original.mov'] })).toBe('Stripe connected. Still to give: launch-film-original.mov.');
    expect(keySavedWords('Stripe', { asks: [], saved: [], freed: [], thread: 'w-1', done: 'connected', left: ['GitHub', 'a.mov', 'the npm code'] })).toBe('Stripe connected. Still to give: GitHub, a.mov and the npm code.');
    expect(keySavedWords('Stripe', { asks: [], saved: [], freed: ['w-1'], thread: 'w-1', done: 'connected', left: [] })).toBe('Stripe connected. This thread carries on.');
  });
  const film = `${NEED} sign-in vercel | to deploy\n${NEED} file ~/Movies/launch-film-original.mov | the hero`;
  it('offers no file in Needs you that is already held for its sign-in', () => {
    const item = { id: 'w-9', title: 'Post the film', status: 'open', result: film, wrote: { result: { ts: 5 } } };
    expect(waitingRows([item]).map((r) => r.title)).toEqual(['Connect Vercel', 'Send launch-film-original.mov']);
    HELD.set('w-9', [{ need: 'file:~/Movies/launch-film-original.mov', words: 'I sent it.' }]);
    expect(waitingRows([item]).map((r) => r.title)).toEqual(['Connect Vercel']);
    HELD.delete('w-9');
  });
  it('puts the longest-waiting ask first', () => {
    const at = (id, ts, svc) => ({ id, title: id, status: 'open', result: `${NEED} sign-in ${svc} | x`, wrote: { result: { ts } } });
    expect(waitingRows([at('new', 30, 'stripe'), at('old', 10, 'supabase')]).map((r) => r.title)).toEqual(['Connect Supabase', 'Connect Stripe']);
  });
});

// Round nine: a file the agent named that was not on the computer said so only
// after Send; Enter on a card's button did nothing; the stand-in cloud was a
// zombie and two testers' threads never reached it.
describe('round nine', async () => {
  const { fileWhy } = await import('../renderer/src/components/NeedCard.tsx');
  const fs = await import('node:fs');
  it('says where the file is and how big, before Send', () => {
    expect(fileWhy('~/Downloads/signed-baa.pdf', 'to attach it', { ok: true, size: 3 * 1024 * 1024 })).toBe('In Downloads on this computer, 3 MB. To attach it.');
    expect(fileWhy('~/Downloads/signed-baa.pdf', 'to attach it', null)).toBe('In Downloads on this computer. To attach it.');
  });
  it('says the file is missing up front', () => {
    expect(fileWhy('~/Downloads/signed-baa.pdf', 'to attach it', { ok: false, error: '~/Downloads/signed-baa.pdf is not on this computer.' })).toBe('~/Downloads/signed-baa.pdf is not on this computer. To attach it.');
  });
  it('offers to choose a missing file instead of sending it', () => {
    expect(fs.readFileSync('renderer/src/components/NeedCard.tsx', 'utf8')).toMatch(/info && !info\.ok\s*\?[^\n]*'Choose the file'/);
  });
  it('keeps Enter on its own buttons', () => {
    expect(fs.readFileSync('renderer/src/components/NeedCard.tsx', 'utf8').match(/onKeyDown=\{keepKeys\}/g)).toHaveLength(5);
  });
  it('starts a fresh stand-in cloud unless the old one answers', () => {
    expect(fs.readFileSync('.claude/skills/verify-agentbox/scripts/live.mjs', 'utf8')).toMatch(/alive\(was\.pid\) && await fetch\(was\.url/);
  });
});

// Round ten: a held file was forgotten on reload; a second Save kept a token it
// had called wrong with nothing on the button saying so; a focused token box ate
// the thread's shortcut keys.
describe('round ten', async () => {
  const store = new Map();
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const { setHeld, HELD } = await import('../renderer/src/components/NeedCard.tsx');
  const fs = await import('node:fs');
  it('keeps what is held where a reload finds it, and lets it go', () => {
    setHeld('w-7', [{ need: 'file:~/a.pdf', words: 'I sent ~/a.pdf.' }]);
    expect(JSON.parse(store.get('agentbox.cloudHeld'))).toEqual([['w-7', [{ need: 'file:~/a.pdf', words: 'I sent ~/a.pdf.' }]]]);
    setHeld('w-7', null);
    expect(HELD.has('w-7')).toBe(false);
    expect(JSON.parse(store.get('agentbox.cloudHeld'))).toEqual([]);
  });
  it('names the second Save after a warning, and gives Escape back from a field', () => {
    const src = fs.readFileSync('renderer/src/components/NeedCard.tsx', 'utf8');
    expect(src).toMatch(/anyway \? 'Save anyway' : 'Save'/);
    expect(src.match(/onKeyDown=\{giveBackKeys\}/g)).toHaveLength(2);
  });
});

// Round eleven: on an ask for Sentry, a file and a code, the held file said
// "Sent." with the code still to give.
describe('round eleven', async () => {
  const { NeedCard, NeedPlace } = await import('../renderer/src/components/NeedCard.tsx');
  const three = needsIn(`${NEED} sign-in sentry | a\n${NEED} file ~/Downloads/replies.csv | b\n${NEED} code npm | c`);
  const draw = (o) => renderToStaticMarkup(h(NeedPlace.Provider, { value: { itemId: 'w-1', saved: [], given: [], live: true, needs: three, saveKeys: async () => null, sendFile: async () => null, sendCode: async () => null, onComputer: () => {}, openLink: () => {}, ...o } }, h(NeedCard, { source: JSON.stringify(three[1]), fallback: null })));
  it('says a held file goes with what is still open, not that it is sent', () => {
    expect(draw({ saved: ['SENTRY_AUTH_TOKEN'], given: ['file:~/Downloads/replies.csv'] })).toContain('Ready. It goes with the npm code.');
    expect(draw({ given: ['file:~/Downloads/replies.csv'] })).toContain('Ready. It goes with Sentry and the npm code.');
  });
});
