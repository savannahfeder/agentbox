// A NEW THREAD LEAVES THE CARD THE MOMENT YOU PRESS SEND (w-461fbd8d2d).
//
// Reported from the web and the phone: "Immediately when I send a message
// there's a delay of about half a second where it looks like the message
// doesn't go through." The card waited for the computer to answer before it
// closed, with the words still in it and Send barely dimmed, and the new row
// waited for a second whole fetch before it reached the list. On the desktop
// both are a few milliseconds; across a phone's relay each is a round trip.
//
// Measured on the browser copy with every request held 250 ms (a phone-like
// link), before this change: the card closed 255 ms after ⌘↵, nothing said
// "sending" in between, and the row reached the list at 565 ms. With no delay
// at all, 35 ms for both.
//
// What is pinned here:
//   - the card hands over (onSending) before its first await, on a task and on
//     a message to a person, so nothing waits on the computer to close it;
//   - the words are taken off the card at that moment and travel with the
//     send, so Z and a failed send both still have them, and a second card
//     opened in the meantime is not emptied by the first send landing;
//   - a failed send puts the words back and says so;
//   - the toast says it is on its way at once, in words that say where;
//   - the row the computer hands back is in the list straight away, and is
//     worn only until a snapshot carries it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wearJustMade, JUST_MADE_MS } from '../renderer/src/just-made';
import { sendingLine } from '../renderer/src/compose-says';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');

const row = (id, product = 'sandbox', extra = {}) => ({ id, product, productName: 'Sandbox', title: `Row ${id}`, status: 'open', ...extra });

describe('the row the computer hands back is in the list at once', () => {
  const now = 1_800_000_000_000;

  it('adds a just-made row the snapshot does not carry yet', () => {
    const { items, held } = wearJustMade([row('w-1')], [{ item: row('w-2'), at: now }], now);
    expect(items.map((i) => i.id)).toEqual(['w-2', 'w-1']);
    expect(held).toHaveLength(1);
  });

  it('lets go of it once a snapshot carries it, and never draws it twice', () => {
    const fresh = row('w-2', 'sandbox', { status: 'claimed' });
    const { items, held } = wearJustMade([fresh, row('w-1')], [{ item: row('w-2'), at: now }], now);
    expect(items.filter((i) => i.id === 'w-2')).toEqual([fresh]);
    expect(held).toEqual([]);
  });

  it('the same id in another project is a different row, so it is still worn', () => {
    const { items } = wearJustMade([row('w-2', 'other')], [{ item: row('w-2'), at: now }], now);
    expect(items.filter((i) => i.id === 'w-2')).toHaveLength(2);
  });

  it('is worn up to its limit and not a moment past it', () => {
    const made = [{ item: row('w-2'), at: now }];
    expect(wearJustMade([], made, now + JUST_MADE_MS - 1).items).toHaveLength(1);
    const late = wearJustMade([], made, now + JUST_MADE_MS);
    expect(late.items).toEqual([]);
    expect(late.held).toEqual([]);
  });

  it('nothing just made leaves the snapshot exactly as it came', () => {
    const items = [row('w-1')];
    expect(wearJustMade(items, [], now).items).toBe(items);
  });
});

describe('the toast says it is on its way, at once', () => {
  it('a task says the project it is starting in', () => {
    expect(sendingLine({ kind: 'task', to: 'Sandbox' })).toBe('Starting in Sandbox…');
  });
  it('a task for later, or for a moment, does not say it is starting', () => {
    expect(sendingLine({ kind: 'task', to: 'Sandbox', held: true })).toBe('Adding to Later in Sandbox…');
    expect(sendingLine({ kind: 'task', to: 'Sandbox', scheduled: true })).toBe('Scheduling in Sandbox…');
    expect(sendingLine({ kind: 'repeat', to: 'Sandbox' })).toBe('Scheduling in Sandbox…');
  });
  it('a message says who it is going to', () => {
    expect(sendingLine({ kind: 'message', to: 'Maya' })).toBe('Sending to Maya…');
    expect(sendingLine({ kind: 'message', to: '' })).toBe('Sending…');
  });
});

describe('the card hands over before it waits on anything', () => {
  const card = src('threads/ThreadComposer.tsx');
  const body = (name) => {
    const from = card.indexOf(`const ${name} = async`);
    return card.slice(from, card.indexOf('\n  };\n', from));
  };

  for (const name of ['sendTask', 'sendMessage']) {
    it(`${name}: onSending comes before the first await`, () => {
      const send = body(name);
      expect(send).toMatch(/onSending\?\.\(/);
      expect(send.indexOf('onSending?.(')).toBeLessThan(send.indexOf('await '));
    });

    it(`${name}: the draft is taken off the card before the first await, and put back on a failure`, () => {
      const send = body(name);
      expect(send.indexOf('const taken =')).toBeGreaterThan(-1);
      expect(send.indexOf('const taken =')).toBeLessThan(send.indexOf('await '));
      expect(send).toContain('takeComposeDraft()');
      if (name === 'sendTask') expect(send).toContain('const taken = background ?');
      expect(send).toMatch(/saveComposeDraft\(taken\)/);
      // Nothing clears the draft after the send lands: by then it may be a
      // second card's words.
      expect(send).not.toMatch(/clearComposeDraft\(\)/);
    });
  }

  it('the words ride with the send, so Z puts back what was sent', () => {
    expect(card).toMatch(/onSent\(made, \{[^\n]*draft: taken/);
  });
});

describe('the app closes the card on the hand-over, not on the answer', () => {
  const app = src('App.tsx');
  const at = app.indexOf('<ThreadComposer');
  const wiring = app.slice(at, app.indexOf('/>\n      )}', at));

  it('closes it and says Sending in onSending, except in the tutorial, which waits as before', () => {
    expect(wiring).toMatch(/onSending=\{walkCard \? undefined : /);
    const sending = wiring.slice(wiring.indexOf('onSending='));
    expect(sending).toMatch(/setModal\(null\)/);
    expect(sending).toMatch(/showToast\(sendingLine\(/);
  });

  it('the answer arriving does not close whatever she opened since', () => {
    const sent = wiring.slice(wiring.indexOf('onSent='));
    // The one close left in onSent is the tutorial's, whose card is still up.
    expect(sent).toMatch(/if \(walkCard\) \{ setComposeInitial\(null\); setModal\(null\); \}/);
    expect(sent.match(/setModal\(null\)/g)).toHaveLength(1);
    expect(sent.match(/setComposeInitial\(null\)/g)).toHaveLength(1);
  });

  it('puts the made row in the list before the snapshot comes back', () => {
    const sent = wiring.slice(wiring.indexOf('onSent='));
    expect(sent).toMatch(/showJustMade\(made[,)]/);
    expect(sent.indexOf('showJustMade(')).toBeLessThan(sent.indexOf('await refresh()', sent.indexOf('showJustMade(')));
    expect(app).toMatch(/wearJustMade\(/);
  });

  it('a failed send says so and gives the words back', () => {
    expect(wiring).toMatch(/onFailed=\{/);
  });
});
