// THE EMPTY COLUMN DOWN THE RIGHT OF THE OPTIONS BLOCK.
//
// Said 2026-10-05 on w-2e13752a85, the moment the chevron came off: "actually
// the spacing feels weird because there's too much white space on the top right
// side which looks weird because of the recommended. maybe we need it back?"
//
// What the chevron had been doing, besides folding, was holding the top right
// corner. `.opt-text` was `flex: 1`, so it ate the leftover room and pushed
// "recommended" to the far edge; the heading above it then ended in air, and
// the one word floating at the end of a stripe of nothing is what read as
// broken. Putting the fold back would have fixed the look by restoring a
// control that had just been removed for doing nothing.
//
// SO THE COLUMN GOES INSTEAD OF COMING BACK. The words take the room they need
// and no more, "recommended" follows them, and with nothing right-aligned
// anywhere in the block there is no column left to look empty. Measured at
// 1440 on a long option too: the label stays on the last line of the words
// rather than wrapping away from them.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const offer = readFileSync(new URL('../renderer/src/components/OptionsOffer.tsx', import.meta.url), 'utf8');
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('the option rows', () => {
  it('let the words take the room they need and no more', () => {
    expect(rule('.opt-text')).toMatch(/flex: 0 1 auto/);
  });

  it('so the words do not eat the leftover room and push the label away', () => {
    expect(rule('.opt-text')).not.toMatch(/flex: 1[;\s]/);
  });

  it('and the label follows the words rather than being shoved to the edge', () => {
    expect(rule('.opt-rec')).not.toMatch(/margin-left: auto/);
    expect(rule('.opt-rec')).not.toMatch(/text-align: right/);
  });

  it('keeps the label after the words in the markup, which is what makes that read', () => {
    const row = offer.slice(offer.indexOf('className={`opt-row'), offer.indexOf('</button>', offer.indexOf('className={`opt-row')));
    expect(row.indexOf('opt-text')).toBeLessThan(row.indexOf('opt-rec'));
  });
});

describe('the heading above them', () => {
  it('holds nothing but the question, so there is no corner left standing empty', () => {
    const head = offer.slice(offer.indexOf('className={`opt-head'), offer.indexOf('{/* The card'));
    expect(head).toContain("{ask || 'Their options · pick or write your own'}");
    expect(head).not.toContain('<button');
    expect(head).not.toContain('<svg');
  });

  it('and ends where the rows end, not short of them', () => {
    const pad = (sel) => (rule(sel).match(/padding: ([^;]+)/) ?? [])[1] ?? '';
    const right = (p) => p.trim().split(/\s+/)[1];
    expect(right(pad('.opt-head-ask'))).toBe(right(pad('.opt-row')));
  });
});
