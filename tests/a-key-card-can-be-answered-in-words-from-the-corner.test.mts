// A KEY CARD CAN BE ANSWERED IN WORDS FROM THE CORNER.
//
// Asked for on w-c07d8993c4 (2026-11-10): the card a cloud run raises to ask
// this computer for a key looked exactly like every other approval card and
// offered only Allow and Deny. "Something people really see and don't just
// auto approve", and "a way to respond to it". Picked from drawings on the
// real card: the same corner card, Send the key ⌘1, Deny ⌘2, Reply ⌘3, with
// Reply drawn apart from Deny ("I'd often mix them up"). Reply opens a box
// whose words go back to the run (tests/a-key-card-answered-in-words-reaches-the-run).
import { describe, it, expect, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cardReplyChord } from '../renderer/src/approval-stage.ts';
import { KeyCardActions } from '../renderer/src/components/KeyCardActions.tsx';

const press = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = { metaKey: true }) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

describe('⌘3 on a key card', () => {
  it('opens the reply box on the key card in front', () => {
    expect(cardReplyChord(press('3'), 'c1', true, 0, 5_000)).toBe('c1');
    expect(cardReplyChord(press('3', { ctrlKey: true }), 'c1', true, 0, 5_000)).toBe('c1');
  });

  it('does nothing on any other card, with no card, or in the card\'s first moment', () => {
    expect(cardReplyChord(press('3'), 'c1', false, 0, 5_000)).toBeNull();
    expect(cardReplyChord(press('3'), null, true, 0, 5_000)).toBeNull();
    expect(cardReplyChord(press('3'), 'c1', true, 4_900, 5_000)).toBeNull();
  });

  it('is not ⌘⇧3, ⌘2 or a plain 3', () => {
    expect(cardReplyChord(press('3', { metaKey: true, shiftKey: true }), 'c1', true, 0, 5_000)).toBeNull();
    expect(cardReplyChord(press('2'), 'c1', true, 0, 5_000)).toBeNull();
    expect(cardReplyChord(press('3', {}), 'c1', true, 0, 5_000)).toBeNull();
  });
});

describe('the key card\'s buttons', () => {
  const chord = (k: string) => k;
  const row = (replying: boolean) => renderToStaticMarkup(h(KeyCardActions, {
    send: h('button', { className: 'approval-allow' }, 'Send the key'),
    deny: h('button', { className: 'approval-deny' }, 'Deny'),
    chord, replying, onReplying: vi.fn(), onReply: vi.fn(),
  }));

  it('offers Send the key, Deny and Reply ⌘3, with Reply drawn unlike Deny', () => {
    const html = row(false);
    expect(html.indexOf('Send the key')).toBeLessThan(html.indexOf('Deny'));
    expect(html.indexOf('Deny')).toBeLessThan(html.indexOf('Reply'));
    expect(html).toMatch(/class="approval-reply"[^>]*>.*Reply<span class="approval-key"><svg class="key-mark".*<\/svg>3/);
    expect(html).not.toMatch(/class="approval-deny"[^>]*>Reply/);
  });

  it('swaps the buttons for a box, Send reply and Back while replying', () => {
    const html = row(true);
    expect(html).toContain('<input');
    expect(html).toContain('Send reply');
    expect(html).toContain('Back');
    expect(html).not.toContain('Send the key');
    expect(html).not.toContain('Deny');
  });
});
