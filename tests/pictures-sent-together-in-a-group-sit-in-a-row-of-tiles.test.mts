// Two pictures Sofia attached to one message in the Lumen group stacked one
// under the other at full size, so the message filled the screen.
// Measured in rooms.css: a group's paragraph kept `pre-line`, so
// the line break between two pictures stayed, and each picture was a block.
// The direct-message chat already set the paragraph as a row; the group did
// not. Now both do, and two or more pictures share the row as smaller tiles.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (p) => strip(fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8'));
const rooms = read('team/rooms/rooms.css');
const chat = read('team/chat.css');
const rules = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sels: sel.split(',').map((s) => s.trim()), body }));
const value = (css, sel, prop) => rules(css)
  .filter((r) => r.sels.includes(sel))
  .map((r) => r.body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))?.[1]?.trim())
  .filter(Boolean)
  .pop();
const px = (v) => Number(/(\d+)px/.exec(v ?? '')?.[1] ?? NaN);

describe('pictures in a group message', () => {
  const row = '.rm-cm .tx p:has(> .inline-image-open)';
  it('sit in a row that wraps, with no line break between them', () => {
    expect(value(rooms, row, 'display')).toBe('flex');
    expect(value(rooms, row, 'flex-wrap')).toBe('wrap');
    expect(value(rooms, row, 'white-space')).toBe('normal');
  });

  it('hold a loading box no bigger than one preview', () => {
    const button = ':root:root:root:root .rm-cm .inline-image-open:has(> .inline-image[data-phone-img="loading"])';
    expect(px(value(rooms, button, 'width'))).toBeLessThanOrEqual(360);
  });
});

describe('two or more pictures in one message', () => {
  const several = (scope) => `${scope} p:has(> .inline-image-open ~ .inline-image-open) .inline-image`;
  it('are smaller tiles in a group, so two fit side by side', () => {
    expect(px(value(rooms, several('.rm-cm .tx'), 'max-height'))).toBeLessThanOrEqual(180);
    expect(value(rooms, `.rm-cm .tx p:has(> .inline-image-open ~ .inline-image-open) > .inline-image-open`, 'max-width')).toBe('calc(50% - 4px)');
  });

  it('are the same tiles in a direct message', () => {
    expect(px(value(chat, several('.chat-msg .msg-body'), 'max-height'))).toBeLessThanOrEqual(180);
    expect(value(chat, `.chat-msg .msg-body p:has(> .inline-image-open ~ .inline-image-open) > .inline-image-open`, 'max-width')).toBe('calc(50% - 4px)');
  });

  it('leave one picture alone at its preview size', () => {
    expect(px(value(rooms, '.rm-cm .tx .inline-image', 'max-height'))).toBe(240);
  });
});
