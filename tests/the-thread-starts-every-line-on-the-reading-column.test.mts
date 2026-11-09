// EVERY WORK LINE STARTS ITS OWN INK WHERE HER WORDS START —, hers, 2026-08-25,
// on a shot of one of her own live rows:
//
// She is pointing at the chevron. It sat OUT in the margin, because the whole
// line was pulled 16px left so that the words after the mark landed on the
// message column. That hang was, 2026-08-23, answering her other complaint on
// the same machinery:
//
// ONE RULE SATISFIES BOTH SENTENCES AND IT IS NOT THE HANG. The first ink on a
// line goes on the reading column, whatever that ink is. A line that opens
// starts with its chevron, so the chevron is on the column. A line that does
// not open starts with its verb, so the verb is on the column and no empty box
// holds an indent open in front of it. Nothing hangs and nothing is indented.
//
// This file pins the three ways that can come apart, and the last of them is
// the one that is invisible on screen until she reports it again:
//
//   1. The hang is one number, said once, and no `.did` rule states 16 by hand.
//   2. NOTHING in the thread pulls itself left by it. The negative margin is
//      the fault she reported, so its absence is the test.
//   3. The mark box is not drawn on a line that cannot open. The old CSS could
//      be perfect and an always-rendered empty span would still put every
//      no-chevron verb 16px in, which is all over again.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'renderer', 'src');
const CSS = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const THREAD_TSX = fs.readFileSync(path.join(SRC, 'components', 'Thread.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// Every rule in the sheet, in source order, as selector plus body.
function rules() {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(CSS))) {
    for (const sel of m[1].split(',')) {
      const s = sel.trim();
      if (!s || s.startsWith('@')) continue;
      out.push({ selector: s, body: m[2], at: m.index });
    }
  }
  return out;
}

describe('every line in the thread starts on the reading column', () => {
  it('says the hang, the mark and the gap as one number', () => {
    const thread = rules().find((r) => r.selector === '.thread' && r.body.includes('--did-hang'));
    expect(thread, 'the thread owns the three lengths').toBeTruthy();
    // The hang IS the box plus the gap. Written as the sum rather than as 16px,
    // so widening the mark cannot leave the nested lines behind.
    expect(thread.body.replace(/\s+/g, ' ')).toContain(
      '--did-hang: calc(var(--did-mark) + var(--did-gap))',
    );
    // And nothing in the thread's machinery states the 16 by hand.
    const byHand = rules().filter((r) => /^\.did/.test(r.selector)
      && /margin-left:\s*-?16px|padding-left:\s*16px/.test(r.body));
    expect(byHand.map((r) => r.selector)).toEqual([]);
  });

  it('pulls nothing left, which is the thing she reported', () => {
    // The old rule was `.did-line, .did-head.did-run-head { margin-left:
    // calc(-1 * var(--did-hang)) }`. Any negative left margin anywhere in the
    // thread puts the mark back out in the margin, on one family or on both.
    const pulled = rules().filter((r) => /(^|[\s>.])(did|thread|msg)/.test(r.selector)
      && /margin(-left)?\s*:[^;]*(-1 \* var\(--did-hang\)|-\s*var\(--did-hang\)|-1[0-9]px)/.test(r.body));
    expect(pulled.map((r) => r.selector)).toEqual([]);
  });

  it('leaves the lines inside an opened fold indented by exactly one hang', () => {
    // A fold that opens onto a flat list is not a fold. Its children step in by
    // one hang, so the nested marks land on the column the fold's own verb is
    // on. This is the only thing the hang is still used for.
    const body = rules().find((r) => r.selector === '.did-run-body');
    expect(body, '.did-run-body is still in the sheet').toBeTruthy();
    expect(body.body).toContain('var(--did-hang)');
  });

  it('draws no mark box at all on a line that cannot open', () => {
    // `<span className="did-mark">{canOpen ? chevron: null}</span>` is the
    // shape that broke it: the box is 8px wide and the gap after it is 8px
    // whether or not there is a chevron inside, so half her lines started 16px
    // in behind nothing. The span itself has to be conditional.
    expect(THREAD_TSX, 'the mark is drawn only when the line opens')
      .toContain('{canOpen && <span className="did-mark">{chevron}</span>}');
    expect(THREAD_TSX, 'the empty-box shape is gone')
      .not.toContain('{canOpen ? chevron : null}');
  });
});
