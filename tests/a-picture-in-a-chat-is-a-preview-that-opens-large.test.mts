// A PICTURE IN A CHAT IS A PREVIEW THAT OPENS LARGE (w-286ad4e81c, 2026-10-20).
//
// "When I click Expand ... I just see the whole image and it's far too large.
// Think about what Slack does and copy it." A teammate attached a screenshot
// to a message, and the chat drew it at the full width of the column with no
// limit on its height (`.inline-image { max-width: 100% }`), so a screenshot
// from a Retina screen came out at twice its size and taller than the window.
//
// A first cut held it inside 480 by 360: "feels like images are still a little
// large", with two screenshots of Slack beside it. Measured off those at 1:1
// (a 22px line), one screenshot in Slack is 372 by 234 with its frame, and two
// sent together sit side by side at that size with 9px between them.
//
// Now a picture in a chat is held inside 360 by 240 at its own shape, pictures
// sent together sit in a row, and a click opens one large over the chat as
// before. The box it holds while it loads is the same size, so nothing under
// it jumps. A picture in a thread with an agent is left at the column's width:
// those are designs to judge, and a preview would hide them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const chat = strip(fs.readFileSync(new URL('../renderer/src/team/chat.css', import.meta.url), 'utf8'));
const app = strip(fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8'));
const rules = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sels: sel.split(',').map((s) => s.trim()), body }));
/** Every declaration of `prop` on a rule whose selector is exactly `sel`. */
const value = (css, sel, prop) => rules(css)
  .filter((r) => r.sels.includes(sel))
  .map((r) => r.body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))?.[1]?.trim())
  .filter(Boolean)
  .pop();
const px = (v) => Number(/^(\d+)px$/.exec(v ?? '')?.[1] ?? NaN);
const widest = (v) => Number(/^min\(100%,\s*(\d+)px\)$/.exec(v ?? '')?.[1] ?? NaN);

describe('a picture in a chat message', () => {
  it('is no taller than 240px', () => {
    expect(px(value(chat, '.chat-msg .inline-image', 'max-height'))).toBeLessThanOrEqual(240);
  });

  it('is no wider than 360px, and no wider than a narrow column', () => {
    expect(widest(value(chat, '.chat-msg .inline-image', 'max-width'))).toBeLessThanOrEqual(360);
  });

  // What a reply box sends is one picture per line in one paragraph
  // (attachments.ts), so the row is the paragraph that holds them.
  it('sits beside the others sent with it, wrapping when the column is narrow', () => {
    const row = ['.chat-msg .msg-body p:has(> .inline-image-open)', '.chat-msg .msg-body p:has(> .inline-image)'];
    for (const sel of row) {
      expect(value(chat, sel, 'display'), sel).toBe('flex');
      expect(value(chat, sel, 'flex-wrap'), sel).toBe('wrap');
    }
  });

  it('still opens large on a click, with the pointer saying so', () => {
    expect(value(app, '.inline-image-open', 'cursor')).toBe('zoom-in');
  });
});

describe('a picture in a chat, while it loads', () => {
  const loading = ':root:root:root:root .chat-msg .inline-image[data-phone-img="loading"]';
  const button = ':root:root:root:root .chat-msg .inline-image-open:has(> .inline-image[data-phone-img="loading"])';

  it('holds a box no larger than the preview, not the whole column', () => {
    expect(widest(value(chat, button, 'width'))).toBeLessThanOrEqual(360);
    expect(px(value(chat, loading, 'max-height'))).toBeLessThanOrEqual(240);
  });

  it('holds the same box before the app knows where the picture is', () => {
    expect(widest(value(chat, '.chat-msg .inline-image.arriving', 'width'))).toBeLessThanOrEqual(360);
    expect(px(value(chat, '.chat-msg .inline-image.arriving', 'max-height'))).toBeLessThanOrEqual(240);
  });
});

// THE CASE THAT MUST NOT CHANGE.
describe('a picture in a thread with an agent', () => {
  it('keeps the column’s width and no height limit', () => {
    expect(value(app, '.inline-image', 'max-width')).toBe('100%');
    expect(value(app, '.inline-image', 'max-height')).toBeUndefined();
  });
});
