// Clicking the select box selects. It never opens the message.
//
// The check was drawn into the unread-dot slot with no hit area of its own, so
// the click belonged to the row, and the row opens. These pin the grammar the
// box and the row now share.
import { describe, it, expect } from 'vitest';
import { clickIntent } from '../renderer/src/list-rules';

describe('the box', () => {
  it('selects, and cannot open the message', () => {
    expect(clickIntent('box')).toBe('toggle');
    expect(clickIntent('box', { meta: true })).toBe('toggle');
    expect(clickIntent('box', { ctrl: true })).toBe('toggle');
  });

  it('extends a range on shift, the way the row does', () => {
    expect(clickIntent('box', { shift: true })).toBe('range');
  });
});

describe('the row', () => {
  it('opens the message', () => {
    expect(clickIntent('row')).toBe('open');
  });

  it('keeps the modifier selection it always had', () => {
    expect(clickIntent('row', { shift: true })).toBe('range');
    expect(clickIntent('row', { meta: true })).toBe('toggle');
    expect(clickIntent('row', { ctrl: true })).toBe('toggle');
  });
});
