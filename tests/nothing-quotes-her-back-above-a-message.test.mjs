// THE BOX ABOVE AN AGENT'S MESSAGE USED TO READ THE USER'S OWN WORDS BACK. It
// had three shapes over its life and two of them did this:
//
//   `replied`  her answer to THIS row. Removed on, because the
// ledger already carries a "You replied" line at its own time.
//   `said`     her answer to the PARENT row, or, when the parent was a
// directive she composed, the parent's WHOLE BODY. Drawn under the
// parent shrunk to a footnote under it. This is the main offender.
//   `origin`   the parent's TITLE, one line. Not the user's words. Survives.
//
// The claim read as a rule and the code kept breaking it, so the rule is a
// test now.
//
// That is a conversation's opening line, which is where it belongs, and it is
// not a quotation over somebody else's message.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recapFor } from '../renderer/src/recap.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');

/**
 * The Recap component on its own, with comments stripped: they describe the
 *  rule and quote the deleted copy, so a check that read them would fail on
 *  the very file that obeys the rule. */
const recapBox = focus
  .slice(focus.indexOf('function Recap('), focus.indexOf('/** THE SLASH MENU'))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const parent = {
  id: 'w-parent', title: 'Take the landing page from idea to launch',
  kind: 'directive', body: 'Here is a long paragraph of mine that used to be printed back at me in full.',
  createdAt: 1000, updatedAt: 2000, answer: null, wrote: {},
};
const child = { id: 'w-child', title: 'Eleven of your edits are live', kind: 'task', createdAt: 3000, updatedAt: 4000, wrote: {} };

describe('the box above a message never quotes her back', () => {
  it('has no "You said" heading left in it', () => {
    expect(recapBox).not.toMatch(/You said/);
  });

  it('draws no text body, only a label and a title', () => {
    expect(recapBox).not.toMatch(/origin-answer/);
    expect(recapBox).not.toMatch(/origin-body/);
    expect(recapBox).not.toMatch(/recap\.text/);
  });

  it('still returns nothing at all for a row she has answered herself', () => {
    expect(recapBox).toMatch(/recap\.kind === 'replied'\) return null/);
  });

  /*
   * AND THE WORD "thread" IS NOT PUT IN FRONT OF HER HERE. It said "open
     thread" and carried "Open the full thread" as a tooltip, and this box was
     the only place the pane used the word at her. The click opens the parent
     row, which is an ordinary row in her inbox. */
  it('does not offer her a "thread" to open', () => {
    expect(recapBox).not.toMatch(/open thread/i);
    expect(recapBox).not.toMatch(/full thread/i);
  });

  /*
   * NAMING THE PARENT SURVIVES FOR BOTH SHAPES. `said` used to carry the parent
     title in `on:` under her quoted words; now that the quotation is gone, that
     title is the whole line, so a row whose parent she answered still says what
     it is answering instead of losing its context with the quote. */
  it('names the parent for a said shape as well as an origin one', () => {
    expect(recapBox).toMatch(/recap\.kind === 'said' \? recap\.on : recap\.title/);
  });
});

describe('her words still open the thread, which is not what she asked to remove', () => {
  it('still builds the said shape from a parent she answered', () => {
    const r = recapFor(child, { ...parent, answer: 'Option 1: merge it' });
    expect(r.kind).toBe('said');
    expect(r.text).toBe('Option 1: merge it');
    expect(r.on).toBe(parent.title);
  });

  it('still builds it from a directive she composed but never answered', () => {
    const r = recapFor(child, parent);
    expect(r.kind).toBe('said');
    expect(r.text).toBe(parent.body);
  });

  it('says nothing when there is no parent to name', () => {
    expect(recapFor(child, null)).toBe(null);
  });

  it('leads with her being finished when she has answered this row', () => {
    expect(recapFor({ ...child, answer: 'done' }, parent).kind).toBe('replied');
  });
});
