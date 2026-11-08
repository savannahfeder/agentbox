// THE APPROVAL CORNER HOLDS ONLY QUICK APPROVALS (w-f214f6824b).
//
// A cloud thread that needed a key, a sign-in, a file or a code put a card in
// the approval corner of the inbox ("Connect Expo", Connect / Later). The person
// could not tell how to get rid of it, and said the corner is for quick
// Allow / Deny answers: a key or a login is not one. Measured on App.tsx, which
// drew <AskCard> there whenever no approval was up. The ask stays in its thread
// (NeedCard), and the thread stays in Needs you.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { keyWords } from '../shared/cloud-keys.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));

describe('the approval corner', () => {
  it('draws no card for a key, a sign-in, a file or a code', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).not.toMatch(/<AskCard\b/);
    expect(app).not.toMatch(/inboxAsks\(/);
    expect(exists('renderer/src/threads/AskCard.tsx')).toBe(false);
    expect(exists('renderer/src/threads/inbox-asks.ts')).toBe(false);
  });

  it('is up only while an approval is', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/const cardOnScreen = !!stage\.card;/);
  });

  it('still asks inside the thread, where the key or sign-in is given', () => {
    const thread = read('renderer/src/components/NeedCard.tsx');
    expect(thread).toMatch(/export function NeedCard\(/);
  });
});

describe('the name of a key', () => {
  it('stops at the end of the first sentence', () => {
    expect(keyWords('the PostHog personal API key the daily report reads. It\'s in your Mac Keychain as "posthog"')).toBe('PostHog personal API key the daily report reads');
  });
  it('still stops at "from" and a bracket, and keeps a dotted name whole', () => {
    expect(keyWords('your Stripe secret key, from dashboard.stripe.com/apikeys')).toBe('Stripe secret key');
    expect(keyWords('the Sentry auth token (org scope)')).toBe('Sentry auth token');
    expect(keyWords('the Fly.io token')).toBe('Fly.io token');
  });
});
