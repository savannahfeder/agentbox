// The reply box wears the new thread card's bar (w-54cdf7c768).
//
// The founder found the reply box weaker than the new thread card and asked
// for the card's field and Send, "but not the distracting orange". Five looks
// were drawn in the built renderer; the first was picked: the card's chips for
// priority, mode and model under a hairline, its paperclip, and its split Send
// with Send later on the arrow half. One note came with the pick: no icons on
// the Auto and model chips. Priority keeps its bars, as on the card.
//
// These read the source, because the look is the markup and the stylesheet.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const focus = read('renderer/src/components/Focus.tsx');
const dock = focus.slice(focus.indexOf('function DockComposer'));
const cardCss = read('renderer/src/threads/thread-composer.css');
const ruleOf = (css, sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('the reply box wears the new thread card\'s bar', () => {
  it('draws priority, mode and model as the card\'s chips', () => {
    expect(dock).toMatch(/<PriorityPicker variant="chip"/);
    expect(dock).toMatch(/<ModePicker\s+chip\b/);
    expect(dock).toMatch(/<ReplyModel\s+chip\b/);
    expect(focus).toMatch(/className=\{`\$\{chip \? 'tc-chip' : 'compose-word set'\}/);
  });

  it('puts no icon on the mode chip or the model chip', () => {
    // The pick came with "i dont like the icons of auto and the model".
    expect(focus).not.toMatch(/ModeGlyph|ModelGlyph/);
    expect(read('renderer/src/components/ReplyModel.tsx')).toMatch(/chip\?: boolean/);
    expect(focus).toMatch(/chip\?: boolean/);
  });

  it('keeps the bars on the priority chip, as the card has them', () => {
    expect(read('renderer/src/components/Priority.tsx')).toMatch(/asChip \? <span className="tc-prio"><PriorityIcon id=\{value\} \/><\/span>/);
  });

  it('has the card\'s paperclip and its split Send, with Send later on the arrow half', () => {
    expect(dock).toMatch(/className="tc-icon dock-clip"[^>]*onClick=\{pickFiles\}/);
    expect(dock).toMatch(/className=\{`dock-send-pair\$\{canWait \? '' : ' solo'\}`\}/);
    expect(dock).toMatch(/\{canWait && <ReplyLater at=\{sendAt\}/);
  });

  it('draws Send in grey on both boxes, never the accent', () => {
    for (const sel of ['.tc-send > button', '.dock-send-pair > .dock-send, .dock-send-pair .dock-send-later']) {
      const rule = ruleOf(cardCss, sel);
      expect(rule, `${sel} has no rule`).toBeTruthy();
      expect(rule).toMatch(/background: var\(--send-fill\)/);
      expect(rule).not.toMatch(/--accent/);
    }
    expect(ruleOf(cardCss, '.dock-send-pair, .tc-send')).toMatch(/--send-fill: color-mix\(in srgb, var\(--text\) 15%, transparent\)/);
  });

  it('is one look, with no review switch left in the box', () => {
    expect(focus).not.toMatch(/replyLook|REPLY_LOOK|look-[2-5]/);
    expect(cardCss).not.toMatch(/look-[2-5]|dock-head/);
  });
});
