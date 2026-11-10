// Approval padding on the shared pane shrank opened threads whenever a card
// appeared. Keep the inbox's last rows reachable with trailing scroll space,
// without reserving any of the opened thread's viewport for the overlay.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('renderer/src/styles.css');
const app = read('renderer/src/App.tsx');
const room = read('renderer/src/room-for-the-card.ts');

describe('the inbox while an approval is waiting', () => {
  const rule = css.match(/\n\.app\.asking \.list-pane:not\(\.pinned\)::after \{[^}]*\}/)?.[0] ?? '';

  it('adds scrollable room after the inbox without resizing its content', () => {
    expect(rule).toMatch(/content:\s*''/);
    expect(rule).toMatch(/display:\s*block/);
    expect(rule).toMatch(/height:\s*calc\(var\(--approval-room/);
  });

  it('never reserves pane padding that shrinks an opened thread', () => {
    expect(/\.app\.asking \.list-pane\s*\{[^}]*padding/.test(css)).toBe(false);
    expect(rule).not.toMatch(/padding/);
  });

  it('is told how tall the card really is, not a number in the stylesheet', () => {
    expect(room).toMatch(/const ROOM = '--approval-room';/);
    expect(room).toMatch(/getBoundingClientRect\(\)\.height/);
    // The card grows with a long description and with the queue behind it.
    expect(room).toMatch(/new ResizeObserver\(write\)/);
    // And the card is the element measured.
    expect(app).toMatch(/<div className="approvals" ref=\{cardRoom\}>/);
  });

  it('keeps a fallback for a card that has not been measured yet', () => {
    // The default is a card carrying nothing but a command, which is the
    // shortest one there is: the first frame can leave too much room, never too
    // little.
    expect(rule).toMatch(/--approval-room,\s*149px/);
  });

  it('takes the room back when the card goes', () => {
    expect(room).toMatch(/root\.style\.removeProperty\(ROOM\)/);
    expect(app).toMatch(/cardRoomUndo\.current\?\.\(\);/);
  });
});
