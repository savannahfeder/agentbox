// A CLOUD ASK WAITS ON THE INBOX LIKE AN APPROVAL (w-78be9e67e8).
//
// A cloud thread that needs a key, a sign-in, a file or a code used to put a
// box of large rows above the Needs you list. It was never approved. The
// person asked for these to be treated like approvals instead: one card in
// the approval corner, on the inbox, with a Later that puts it away so nobody
// is stuck. Measured on the functions the card draws from, and on the box the
// screenshot showed: "Add the PostHog personal API key the daily report reads.
// It's in your Mac Keychain as "p" (cut at 80 characters, mid-quote).
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NEED } from '../shared/cloud-needs.mjs';
import { keyWords } from '../shared/cloud-keys.mjs';
import { inboxAsks, putOffKeys } from '../renderer/src/threads/inbox-asks.ts';
import { HELD } from '../renderer/src/components/NeedCard.tsx';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const KEY = `${NEED} key ELEVENLABS_API_KEY | the ElevenLabs API key, from elevenlabs.io/app/settings/api-keys`;
const thread = (id, result, ts, o = {}) => ({ id, title: `Thread ${id}`, status: 'open', result, wrote: { result: { ts } }, ...o });

describe('which asks get a card', () => {
  beforeEach(() => HELD.clear());

  it('one card per key, however many threads wait on it, oldest ask first', () => {
    const asks = inboxAsks([thread('b', `${NEED} sign-in vercel | to deploy`, 20), thread('a', KEY, 10), thread('c', KEY, 30)]);
    expect(asks.map((a) => [a.title, a.act, a.items.map((i) => i.id)])).toEqual([
      ['Add the ElevenLabs API key', 'Add', ['a', 'c']],
      ['Connect Vercel', 'Connect', ['b']],
    ]);
  });

  it('none for a key already saved, a thread answered since, or one that is running', () => {
    expect(inboxAsks([thread('a', KEY, 10)], ['ELEVENLABS_API_KEY'])).toEqual([]);
    expect(inboxAsks([thread('a', KEY, 10, { answer: 'Later', wrote: { result: { ts: 10 }, answer: { ts: 11 } } })])).toEqual([]);
    expect(inboxAsks([thread('a', KEY, 10, { status: 'claimed' })])).toEqual([]);
    expect(inboxAsks([thread('a', 'Done.', 10)])).toEqual([]);
  });

  it('none for a file already held for its sign-in', () => {
    const film = thread('f', `${NEED} sign-in vercel | to deploy\n${NEED} file ~/Movies/cut.mov | the hero`, 5);
    expect(inboxAsks([film]).map((a) => a.title)).toEqual(['Connect Vercel', 'Send cut.mov']);
    HELD.set('f', [{ need: 'file:~/Movies/cut.mov', words: 'I sent it.' }]);
    expect(inboxAsks([film]).map((a) => a.title)).toEqual(['Connect Vercel']);
  });
});

describe('Later', () => {
  it('puts the card away for every thread on it, and the next card comes forward', () => {
    const items = [thread('a', KEY, 10), thread('c', KEY, 30), thread('b', `${NEED} code npm | to publish`, 20)];
    const [first] = inboxAsks(items);
    const later = new Set(putOffKeys(first));
    expect(inboxAsks(items, [], later).map((a) => a.title)).toEqual(['Enter the npm code']);
  });

  it('brings the card back when the thread asks again', () => {
    const later = new Set(putOffKeys(inboxAsks([thread('a', KEY, 10)])[0]));
    expect(inboxAsks([thread('a', KEY, 10)], [], later)).toEqual([]);
    expect(inboxAsks([thread('a', KEY, 99)], [], later).map((a) => a.title)).toEqual(['Add the ElevenLabs API key']);
  });

  it('leaves a different thread asking for the same key its card', () => {
    const later = new Set(putOffKeys(inboxAsks([thread('a', KEY, 10)])[0]));
    expect(inboxAsks([thread('a', KEY, 10), thread('z', KEY, 40)], [], later)[0].items.map((i) => i.id)).toEqual(['z']);
  });
});

describe('the name on the card', () => {
  it('stops at the end of the first sentence', () => {
    expect(keyWords('the PostHog personal API key the daily report reads. It\'s in your Mac Keychain as "posthog"')).toBe('PostHog personal API key the daily report reads');
  });
  it('still stops at "from" and a bracket, and keeps a dotted name whole', () => {
    expect(keyWords('your Stripe secret key, from dashboard.stripe.com/apikeys')).toBe('Stripe secret key');
    expect(keyWords('the Sentry auth token (org scope)')).toBe('Sentry auth token');
    expect(keyWords('the Fly.io token')).toBe('Fly.io token');
  });
});

describe('where it is drawn', () => {
  it('in the approval card\'s corner and dress, with Later beside the button', () => {
    const card = read('renderer/src/threads/AskCard.tsx');
    expect(card).toMatch(/className="approvals ask-cards"/);
    expect(card).toMatch(/className="approval-card"/);
    expect(card).toMatch(/>Later</);
  });
  it('only when no approval is up, and only on the inbox', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/const asksShown = !stage\.card && !signInGate && onTheInbox \?/);
    expect(app).toMatch(/const onTheInbox = !focused && /);
    expect(app).toMatch(/const cardOnScreen = !!stage\.card \|\| asksShown\.length > 0;/);
  });
});
