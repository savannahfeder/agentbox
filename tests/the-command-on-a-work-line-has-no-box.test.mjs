// Measured in the built renderer over her own two imported sessions before
// anything was touched: on session-30, 13 closed work lines carried 122,029
// square pixels of filled chip and the median chip was 89% of the text column
// wide, so a run of them read as a stack of grey bars with a ragged right edge.
// Opened, the same thread's fold carried 31 chips and 309,131 square pixels.
// Afterwards: 0 and 0 in both states (the harness, its `ink`
// probe, which counts the drawn boxes and not the stylesheet).
//
// THIS TEST EXISTS BECAUSE THE FILL HAS COME BACK BY ACCIDENT THREE TIMES, and
// every time for the same reason: `.markdown code` and
// `.agent-thread.markdown :not(pre) > code` are more specific than anything
// anyone reaches for first, so the rule taking the box off is written, is
// correct, and loses. `:not(pre)` is the trap inside the trap — it carries the
// weight of `pre`, which is what makes that selector 0,2,2 rather than 0,2,1.
//
// So this does not test that a property is set. It tests that the rule setting
// it WINS, which is the thing that was actually broken.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src', 'styles.css'),
  'utf8',
// Comments come off first: they sit between a `}` and the next selector, so a
// naive rule split hands you half a paragraph of English as a selector.
).replace(/\/\*[\s\S]*?\*\//g, '');

// a,b,c — ids, then classes/attributes/pseudo-classes, then elements. `:not`
// and `:is` contribute the specificity of their heaviest argument, which is
// the whole reason the third selector below beats the second.
function specificity(selector) {
  let s = selector.trim();
  let inner = [0, 0, 0];
  s = s.replace(/:(?:not|is|has)\(([^()]*)\)/g, (_, args) => {
    for (const arg of args.split(',')) {
      const w = specificity(arg);
      if (w[0] > inner[0] || (w[0] === inner[0] && w[1] > inner[1])
        || (w[0] === inner[0] && w[1] === inner[1] && w[2] > inner[2])) inner = w;
    }
    return ' ';
  });
  const ids = s.match(/#[\w-]+/g) ?? [];
  const classes = s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? [];
  const elements = s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+/g, ' ')
    .match(/[a-zA-Z][\w-]*/g) ?? [];
  return [ids.length + inner[0], classes.length + inner[1], elements.length + inner[2]];
}

const rank = (w) => w[0] * 10000 + w[1] * 100 + w[2];

// Every rule in the sheet that both could paint a background on the command
// chip of a closed work line and actually sets one.
function fillRules() {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(CSS))) {
    const body = m[2];
    if (!/(^|[;\s])background(-color)?\s*:/.test(body)) continue;
    for (const sel of m[1].split(',')) {
      const s = sel.trim();
      if (!s || s.startsWith('@') || s.startsWith('/*')) continue;
      // The chain a closed command sits in:
      //   .agent-thread.markdown … .did .did-head > code.did-cmd
      // so a rule reaches it only if its subject is that `code`.
      const subject = s.split(/\s+|>/).filter(Boolean).pop() ?? '';
      const hitsCode = /(^|[.:\[])?code/.test(subject) || subject.includes('.did-cmd');
      if (!hitsCode) continue;
      if (subject.includes('pre') || subject.includes('.did-out') || subject.includes('.did-full')) continue;
      const value = (body.match(/(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/) ?? [])[1] ?? '';
      out.push({ selector: s, value: value.trim(), weight: specificity(s) });
    }
  }
  return out;
}

describe('the command on a closed work line', () => {
  it('is typography and not a filled box, and the rule that says so wins', () => {
    const rules = fillRules();
    // The three that have fought over this element, all still in the sheet.
    expect(rules.map((r) => r.selector)).toEqual(
      expect.arrayContaining(['.markdown code.did-cmd', '.agent-thread.markdown :not(pre) > code']),
    );

    // THE COMMAND SITS IN TWO PLACES NOW, and both of them have to win.,
    // 2026-08-24: a path the run CHANGED is a chip she can press into the code,
    // so it moved out of the fold's own button and into a control beside it
    // (`.did-file`). The fill would have come back on exactly the lines she is
    // meant to press, which is the fourth version of this same regression and
    // the reason the assertion is now per-surface rather than on one winner.
    const top = rank(rules.reduce((best, r) => (rank(r.weight) >= rank(best.weight) ? r : best)).weight);
    const winners = rules.filter((r) => rank(r.weight) === top);
    for (const w of winners) expect(w.value).toBe('none');
    expect(winners.some((w) => w.selector.includes('.did-head'))).toBe(true);
    expect(winners.some((w) => w.selector.includes('.did-file'))).toBe(true);
  });

  it('knows why :not(pre) is the heavy one', () => {
    // 0,2,2 rather than 0,2,1: the `pre` inside :not counts. This is the fact
    // two earlier cuts got wrong, so it is asserted rather than commented.
    expect(specificity('.agent-thread.markdown :not(pre) > code')).toEqual([0, 2, 2]);
    expect(specificity('.markdown code.did-cmd')).toEqual([0, 2, 1]);
    expect(specificity('.agent-thread.markdown .did-head code.did-cmd')).toEqual([0, 4, 1]);
  });

  it('leaves the fill on the block the line opens into, and on code inside prose', () => {
    // Nothing shortened is lost and nothing quiet is made loud: the whole
    // command and its output still open into real blocks, which is the "code
    // blocks" half of what she asked for.
    expect(CSS).toMatch(/\.markdown pre\.did-full\s*\{[^}]*background:\s*var\(--work-chip\)/);
    expect(CSS).toMatch(/\.markdown pre\.did-out\s*\{[^}]*background:\s*var\(--work-fill\)/);
  });
});
