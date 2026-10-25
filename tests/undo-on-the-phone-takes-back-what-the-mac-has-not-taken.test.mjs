// UNDO ON THE PHONE TAKES BACK WHAT THE MAC HAS NOT TAKEN.
//
// What broke (found reading the code, 2026-10-19): only a close could be taken
// back on the hosted phone. Undoing a reply called Stop first, which the phone
// answers "Your computer does this", so she read "Could not undo that"; had it
// gone on, the window's withdrawal would have reached the agent as a reply
// saying "(withdrawn)". A new thread came back from the phone with no id, so
// it had no Undo and no Open at all.
//
// Now a reply, a close or a new thread her Mac has not claimed is taken back
// on the phone itself, and her Mac never sees it; once it is claimed, undo
// says so. A new thread answers with the row the inbox draws for it.
import { describe, it, expect } from 'vitest';
import { takeBack, phoneSlug } from '../renderer/src/cloud-bridge';
import { madeHere } from '../shared/phone-snapshot.mjs';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const cmd = (id, kind, extra = {}) => ({ id, device: DEV, project: 'alpha', item: 'w-1', kind, payload: {}, created_at: iso(NOW - 1000), taken_at: null, outcome: null, ...extra });
const rows = (commands) => ({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha' }], threads: [], commands });

describe('what Undo takes back', () => {
  it('a reply still waiting, when the window stops the agent to undo it', () => {
    const r = rows([cmd('c1', 'reply', { payload: { text: 'go' } }), cmd('c2', 'reply', { payload: { text: 'and this' } })]);
    expect(takeBack(r, 'zero:stop-session', { product: A, id: 'w-1', withdraw: true })?.id).toBe('c2');
  });

  it('not on a plain Stop, which goes to her Mac as a stop', () => {
    expect(takeBack(rows([cmd('c1', 'reply')]), 'zero:stop-session', { product: A, id: 'w-1' })).toBeNull();
  });

  it('not a reply her Mac has claimed or done, nor another thread\'s', () => {
    expect(takeBack(rows([cmd('c1', 'reply', { claimed_at: iso(NOW) })]), 'zero:stop-session', { product: A, id: 'w-1', withdraw: true })).toBeNull();
    expect(takeBack(rows([cmd('c1', 'reply', { taken_at: iso(NOW), outcome: 'done' })]), 'zero:stop-session', { product: A, id: 'w-1', withdraw: true })).toBeNull();
    expect(takeBack(rows([cmd('c1', 'reply')]), 'zero:stop-session', { product: A, id: 'w-2', withdraw: true })).toBeNull();
  });

  it('a new thread still waiting, closed by its stand-in id', () => {
    const made = cmd('c9', 'new', { item: null, payload: { title: 'T', body: '' } });
    expect(takeBack(rows([made]), 'zero:answer', { product: A, id: madeHere('c9'), status: 'done' })?.id).toBe('c9');
    expect(takeBack(rows([{ ...made, claimed_at: iso(NOW) }]), 'zero:answer', { product: A, id: madeHere('c9'), status: 'done' })).toBeNull();
  });

  it('a close still waiting, as before', () => {
    expect(takeBack(rows([cmd('c1', 'close')]), 'zero:answer', { product: A, id: 'w-1', status: 'open' })?.id).toBe('c1');
  });
});

// The sending path the site and the phone app share (phone-send.ts).
describe('the bridge', () => {
  const src = () => import('node:fs').then((fs) => fs.readFileSync(new URL('../renderer/src/phone-send.ts', import.meta.url), 'utf8'));
  it('answers a new thread with the row it draws for it, so it has Undo and Open', async () => {
    expect(await src()).toMatch(/kind === 'new'[\s\S]{0,200}id: madeHere\(row\.id\)/);
  });
  it('does not send the window\'s "(withdrawn)" for a reply it took back', async () => {
    expect(await src()).toMatch(/withdrawn\.get\(/);
  });
});
