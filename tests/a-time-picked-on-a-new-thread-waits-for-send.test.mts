// A TIME PICKED ON A NEW THREAD WAITS FOR SEND, AND Z BRINGS IT BACK.
//
// What broke (w-54cdf7c768, read in ThreadComposer.tsx on 2026-10-28): every
// row of the Send later menu called `sendTask` itself, so picking "Tomorrow
// morning" sent the thread there and then, with no chance to add a line. And
// the card wrote `when: { runAt: 0, repeat: null }` into its draft whatever was
// picked, so the Z that put the words back to add that line put them back with
// no time, and the time had to be picked again.
//
// Measured by reading the menu rows (each was `onClick={() => sendTask(...)}`)
// and the draft effect (a constant `when`), and by the rules below, which did
// not exist: the card had nowhere to hold a picked time.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  laterHint, startingWhen, whenOnDraft, whenToSend, whenWords,
} from '../renderer/src/threads/composer-rules.ts';
import {
  EMPTY_COMPOSE_DRAFT, composeDraftIsEmpty, readComposeDraft, restoreComposeDraft, saveComposeDraft,
} from '../renderer/src/drafts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', p), 'utf8');

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 28, 15, 0);
const TOMORROW = at(2026, 10, 29, 8, 0);
const WEEKDAYS = { every: 'weekday', at: '09:00' };

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('what the card holds once a time is picked', () => {
  it('opens on the time a saved card carried', () => {
    expect(startingWhen({ runAt: TOMORROW, repeat: null }, NOW)).toEqual({ runAt: TOMORROW });
    expect(startingWhen({ runAt: 0, repeat: null, later: true }, NOW)).toEqual({ start: 'later' });
    expect(startingWhen({ runAt: 0, repeat: WEEKDAYS }, NOW)).toEqual({ repeat: WEEKDAYS });
  });

  it('opens on nothing when nothing was picked', () => {
    expect(startingWhen({ runAt: 0, repeat: null }, NOW)).toBeNull();
    expect(startingWhen(undefined, NOW)).toBeNull();
  });

  it('drops a time that has gone by while the card was closed, rather than starting it at once', () => {
    expect(startingWhen({ runAt: NOW - 60_000, repeat: null }, NOW)).toBeNull();
    expect(startingWhen({ runAt: NOW, repeat: null }, NOW)).toBeNull();
    expect(startingWhen({ runAt: NOW + 60_000, repeat: null }, NOW)).toEqual({ runAt: NOW + 60_000 });
  });

  it('writes each pick into the draft the card already keeps', () => {
    expect(whenOnDraft({ runAt: TOMORROW })).toEqual({ runAt: TOMORROW, repeat: null });
    expect(whenOnDraft({ start: 'later' })).toEqual({ runAt: 0, repeat: null, later: true });
    expect(whenOnDraft({ repeat: WEEKDAYS })).toEqual({ runAt: 0, repeat: WEEKDAYS });
    expect(whenOnDraft(null)).toEqual({ runAt: 0, repeat: null });
  });

  it('says the pick in the words the menu uses', () => {
    expect(whenWords({ runAt: TOMORROW })).toBe(laterHint(TOMORROW));
    expect(whenWords({ start: 'later' })).toBe('Later');
    expect(whenWords({ repeat: WEEKDAYS })).toMatch(/^Weekdays at 9:00/i);
    expect(whenWords(null)).toBeNull();
  });
});

describe('what Send sends', () => {
  it('sends the picked time with the thread', () => {
    expect(whenToSend({ runAt: TOMORROW }, NOW)).toEqual({ runAt: TOMORROW });
    expect(whenToSend({ start: 'later' }, NOW)).toEqual({ start: 'later' });
    expect(whenToSend({ repeat: WEEKDAYS }, NOW)).toEqual({ repeat: WEEKDAYS });
  });

  it('sends a plain thread when nothing is picked', () => {
    expect(whenToSend(null, NOW)).toEqual({});
  });

  it('starts it now if the picked time went by while the card sat open', () => {
    expect(whenToSend({ runAt: NOW - 1 }, NOW)).toEqual({});
  });
});

describe('the draft keeps the pick, so Z puts it back', () => {
  it('reads Later back off a saved card', () => {
    const store = memoryStore();
    saveComposeDraft({ ...EMPTY_COMPOSE_DRAFT, text: 'Fix the pricing page', when: { runAt: 0, repeat: null, later: true } }, store);
    expect(readComposeDraft(store).when).toEqual({ runAt: 0, repeat: null, later: true });
  });

  it('counts Later alone as something worth keeping', () => {
    expect(composeDraftIsEmpty({ ...EMPTY_COMPOSE_DRAFT, when: { runAt: 0, repeat: null, later: true } })).toBe(false);
  });

  it('a thread sent for tomorrow and taken back with Z comes back set for tomorrow', () => {
    const store = memoryStore();
    const sent = saveComposeDraft({ ...EMPTY_COMPOSE_DRAFT, text: 'Fix the pricing page', when: whenOnDraft({ runAt: TOMORROW }) }, store);
    store.removeItem('zero.draft.compose');
    expect(restoreComposeDraft(sent, store)).toBe(true);
    expect(startingWhen(readComposeDraft(store).when, NOW)).toEqual({ runAt: TOMORROW });
  });
});

describe('the card', () => {
  const card = read('threads/ThreadComposer.tsx');
  const menu = card.slice(card.indexOf('const laterMenu'), card.indexOf('/* ------------------------------- card'));

  it('no row of Send later sends the thread', () => {
    expect(menu.length).toBeGreaterThan(0);
    expect(menu).not.toMatch(/sendTask\(/);
    expect(menu).toMatch(/pickWhen\(\{ runAt: tomorrow \}\)/);
    expect(menu).toMatch(/pickWhen\(\{ start: 'later' \}\)/);
  });

  it('Send carries what was picked', () => {
    expect(card).toMatch(/const send = \(\) => \([^\n]*sendTask\(when \? whenToSend\(when\) :/);
  });

  // A power tester picked a time, then "Send now" to change her mind, and
  // waited for a send that never came: the row only cleared the time.
  it('the row that clears a picked time says so, on the card and on the reply box', () => {
    const reply = read('components/ReplyLater.tsx');
    for (const box of [menu, reply]) {
      expect(box).toMatch(/<span className="tc-row-label">Remove the time<\/span>/);
      expect(box).not.toMatch(/tc-row-label">Send now</);
    }
  });

  it('writes the pick into the draft and opens on it', () => {
    expect(card).toMatch(/when: whenOnDraft\(when\)/);
    expect(card).toMatch(/useState<SendWhen>\(\(\) => startingWhen\(opened\.current\.when\)\)/);
  });

  // Seen driving the page on 2026-10-28: Z in the list inside the undo window
  // reopened the card, and the card took the keyboard before the key was done,
  // so the words came back as "...the active task.z".
  it('Z in the list does not type a z into the card it brings back', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/case 'z': case 'Z': e\.preventDefault\(\); undo\(\); break;/);
    expect(app).not.toMatch(/case 'z': case 'Z': undo\(\);/);
  });

  it('the draft takes a pick on its own, so a card with only a time still comes back', () => {
    const draft = card.slice(card.indexOf('/* ------------------------------ draft'), card.indexOf('A LAYOUT EFFECT'));
    expect(draft).toMatch(/\}, \[text, attachments, prio, when\]\);/);
  });
});
