// A SEND THE APP HAS NOT TAKEN KEEPS YOUR WORDS.
//
// What broke (power test 2, issue 2). The new task card takes the words off
// itself the moment Send is pressed, so the card can close before the computer
// answers. That answer is milliseconds away on this computer, which is what
// made it safe, and the app's own process was then frozen for 135 seconds with
// the window still drawing. For those minutes the sentence existed in one
// place: a local variable inside a call that had not returned. The tester
// pressed N, got an empty box, and wrote the whole task again; both copies ran
// when the app came back.
//
// So the words stay written down until the send actually lands. They are still
// HANDED to the send at once, for Z and for a failure, and the card still goes
// without waiting. What changed is that the copy in storage is dropped on the
// answer rather than on the press, and only if it is still the one that was
// sent: a card opened and typed into in the meantime is not emptied by an
// older send landing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dropComposeDraft, readComposeDraft, saveComposeDraft, EMPTY_COMPOSE_DRAFT,
} from '../renderer/src/drafts';

const here = path.dirname(fileURLToPath(import.meta.url));
const composer = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'threads', 'ThreadComposer.tsx'), 'utf8');

const store = () => {
  const held = new Map();
  return {
    getItem: (k) => (held.has(k) ? held.get(k) : null),
    setItem: (k, v) => { held.set(k, String(v)); },
    removeItem: (k) => { held.delete(k); },
  };
};
const draft = (text, extra = {}) => ({ ...EMPTY_COMPOSE_DRAFT, text, ...extra });

describe('the words while the send is in the air', () => {
  it('are still there to be read back', () => {
    const s = store();
    saveComposeDraft(draft('[codex] same as this morning'), s);
    // The send has been handed over; nothing has answered yet.
    expect(readComposeDraft(s).text).toBe('[codex] same as this morning');
  });

  it('go when the send lands', () => {
    const s = store();
    const sent = saveComposeDraft(draft('[codex] same as this morning'), s);
    dropComposeDraft(sent, s);
    expect(readComposeDraft(s).text).toBe('');
  });

  it('stay when the one in the box is no longer the one that was sent', () => {
    const s = store();
    const sent = saveComposeDraft(draft('[codex] same as this morning'), s);
    saveComposeDraft(draft('a different task, typed while it hung'), s);
    dropComposeDraft(sent, s);
    expect(readComposeDraft(s).text).toBe('a different task, typed while it hung');
  });

  it('stay when a screenshot has been pasted into the box since', () => {
    const s = store();
    const sent = saveComposeDraft(draft('look at this'), s);
    saveComposeDraft(draft('look at this', {
      attachments: [{ name: 'shot.png', dataBase64: 'aaaa', image: true }],
    }), s);
    dropComposeDraft(sent, s);
    expect(readComposeDraft(s).attachments).toHaveLength(1);
  });

  it('drop an empty box with no fuss, and never throw on a dead storage', () => {
    const s = store();
    expect(() => dropComposeDraft(draft('nothing was ever saved'), s)).not.toThrow();
    const dead = { getItem: () => { throw new Error('gone'); }, setItem: () => {}, removeItem: () => {} };
    expect(() => dropComposeDraft(draft('x'), dead)).not.toThrow();
  });
});

describe('the card is wired to it', () => {
  for (const [name, mark] of [['a task', 'const sendTask'], ['a message to a person', 'const sendMessage']]) {
    it(`${name}: hands the words over before the first await, and keeps the copy`, () => {
      const send = composer.slice(composer.indexOf(mark), composer.indexOf('\n  };', composer.indexOf(mark)));
      // Stamped as sending, still not taken
      // (tests/a-new-thread-box-opened-right-after-send-starts-empty).
      expect(send).toMatch(/const taken = markComposeDraftSending\(\);/);
      expect(send.indexOf('const taken = markComposeDraftSending()')).toBeLessThan(send.indexOf('await '));
      expect(send).toMatch(/dropComposeDraft\(taken\)/);
      // The copy is dropped only after something has answered, which is the
      // whole of the change: a `dropComposeDraft` before the first await would
      // be the old behaviour under a new name.
      expect(send.indexOf('dropComposeDraft(taken)')).toBeGreaterThan(send.indexOf('await '));
    });
  }

  it('a failed send leaves whatever is in the box rather than overwriting it', () => {
    expect(composer).not.toMatch(/saveComposeDraft\(taken\)/);
    expect(composer).toMatch(/restoreComposeDraft\(taken\)/);
  });
});
