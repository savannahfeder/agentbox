// CTRL+ENTER SENDS THE EMPTY INBOX'S BOX WITH NOTHING FOCUSED.
//
// QA batch 013 (F-200): on the first-run empty inbox a tester typed a task into
// the box drawn on the page, the box lost the keyboard, and the first
// Ctrl+Enter did nothing. The tour was showing "Press Ctrl ↵ to send it".
// The card's window listener for ⌘↵ returned early for the box on the page
// (`if (inline) return;`), so only the box's own onKeyDown could send, and that
// hears nothing once focus has gone back to the page.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { modEnterSendsTheCard } from '../renderer/src/threads/composer-rules';

describe('the box on the empty inbox', () => {
  it('the reported case: words in the box, nothing focused, Ctrl+Enter sends', () => {
    expect(modEnterSendsTheCard({ inline: true, on: 'nothing', hasWords: true })).toBe(true);
  });

  it('an empty box with nothing focused is not sent', () => {
    expect(modEnterSendsTheCard({ inline: true, on: 'nothing', hasWords: false })).toBe(false);
  });

  it('a key pressed in another field on the page is not the box’s', () => {
    expect(modEnterSendsTheCard({ inline: true, on: 'away', hasWords: true })).toBe(false);
    expect(modEnterSendsTheCard({ inline: true, on: 'a field', hasWords: true })).toBe(false);
  });
});

describe('the New thread dialog', () => {
  it('still sends wherever the keyboard sits', () => {
    for (const on of ['nothing', 'the card', 'away', 'a field']) {
      expect(modEnterSendsTheCard({ inline: false, on, hasWords: false })).toBe(true);
    }
  });
});

describe('the card listens for it on the page too', () => {
  const box = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
  const listener = box.slice(box.indexOf('const sendRef = useRef(send);'), box.indexOf('const addFiles = async'));

  it('asks the rule instead of leaving the page box out', () => {
    expect(listener).toContain('modEnterSendsTheCard(');
    expect(listener).not.toMatch(/if \(inline\) return;/);
  });
});
