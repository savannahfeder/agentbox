// TYPING ONE WORD INTO A DOCUMENT CHANGES ONE LINE OF IT.
//
// The files this pane opens are not files this editor wrote. They are markdown
// an agent wrote, and a rich editor does not hold markdown, it holds a
// document: saving means writing that document back out, and the output is
// NORMALISED. Measured on her own store, 2026-08-21: `decisions.md` is 31,273
// lines and a round trip through the editor changes 28,770 of them, none of it
// content. Without the two pieces this file guards, typing one word into it
// would rewrite all 28,770, on the document that is how every session on the
// product stays in agreement.
//
// The two pieces:
//   1. `editor/patch-md.ts` puts her edit back into the ORIGINAL bytes.
//   2. `editor/markdown.ts` serialises a mark across the whole run of nodes
//      that share it, so a bold sentence with code in it does not grow a new
//      pair of asterisks every time it is saved.
import { describe, it, expect } from 'vitest';
import { editHunk, mapLine, patchOriginal } from '../renderer/src/editor/patch-md.ts';
import { mdToPmDoc, pmDocToMd } from '../renderer/src/editor/markdown.ts';

const roundTrip = (md) => pmDocToMd(mdToPmDoc(md));

describe('her edit, and nothing else, reaches the file', () => {
  it('writes the editor straight through when the file survives it unchanged', () => {
    // The ordinary case: 641 of her 1,400 markdown files round trip
    // byte-identical, so there is nothing to map and the editor IS the file.
    const original = 'One line.\nAnother line.\n';
    expect(patchOriginal(original, original, 'One line.\nAnother line, edited.\n'))
      .toBe('One line.\nAnother line, edited.\n');
  });

  it('leaves every byte she did not touch exactly as it was', () => {
    // `original` uses underscores and a padded table; the editor prefers
    // asterisks and tight pipes. Both spellings mean the same thing and only
    // one of them is what an agent wrote.
    const original = [
      '# Notes',
      '',
      'A line with _emphasis_ in it.',
      '',
      'The line she is about to type into.',
      '',
      'A closing line with _more_ of it.',
      '',
    ].join('\n');
    const base = roundTrip(original);
    expect(base).not.toBe(original); // the editor really does normalise this one

    const next = base.replace('The line she is about to type into.', 'The line she typed into.');
    const saved = patchOriginal(original, base, next);

    expect(saved).toBe(original.replace('The line she is about to type into.', 'The line she typed into.'));
    expect(saved).toContain('_emphasis_'); // untouched line keeps her spelling
    expect(saved).toContain('_more_');
  });

  it('keeps a table she never touched spelled the way an agent spelled it', () => {
    // The editor pads a table's dashes; the file does not have to learn that.
    const original = '| a | b |\n|---|---|\n| 1 | 2 |\n\nThe line to type into.\n';
    const base = roundTrip(original);
    expect(base).toContain('| --- | --- |');
    const saved = patchOriginal(original, base, base.replace('to type into', 'typed into'));
    expect(saved).toBe('| a | b |\n|---|---|\n| 1 | 2 |\n\nThe line typed into.\n');
  });

  it('says nothing rather than guessing when the edit cannot be placed', () => {
    // A list written loose comes back tight, so the blank lines vanish from
    // between the items and the line she typed into has drifted with no
    // unchanged line between it and the drift. There is no honest place to put
    // the boundary. The caller then writes the editor's own markdown and TELLS
    // her the file was reformatted; what it never does is invent a position or
    // drop what she typed.
    //
    // THIS USED TO BE THE BLANK-LINE CASE, and it is not any more: a run of
    // blank lines survives the editor now, because she was losing the gaps she
    // typed in the sidebar note. Measured across the 1,403 markdown files under
    // her account on 2026-08-21, one word changed in each: 151 refuse before
    // the change and the same 151 refuse after, so nothing the doc pane does to
    // her files moved. What changed is that one shape stopped needing to be
    // refused, and the test below is that shape.
    const original = '- one\n\n- The line to type into.\n\n- two\n';
    const base = roundTrip(original);
    expect(base).toBe('- one\n- The line to type into.\n- two\n');
    expect(patchOriginal(original, base, base.replace('to type into', 'typed into'))).toBeNull();
  });

  it('now splices into a file with blank lines in it instead of refusing', () => {
    // The same file the case above used to be. Her gaps come back byte for
    // byte, so the edit lines up and lands without reformatting anything.
    const original = 'a\n\n\n\nThe line to type into.\n\n\n\nb\n';
    const base = roundTrip(original);
    expect(base).toBe(original);
    expect(patchOriginal(original, base, base.replace('to type into', 'typed into')))
      .toBe('a\n\n\n\nThe line typed into.\n\n\n\nb\n');
  });

  it('returns the file untouched when she changed nothing', () => {
    expect(patchOriginal('x\n', 'y\n', 'y\n')).toBe('x\n');
  });

  it('takes her edit as one range, however many lines it covers', () => {
    expect(editHunk('a\nb\nc\nd\n', 'a\nB\nC\nd\n')).toEqual({ from: 1, to: 3, insert: ['B', 'C'] });
    expect(editHunk('a\nb\n', 'a\nb\n')).toBeNull();
    // An insertion is an empty range with lines in it.
    expect(editHunk('a\nc\n', 'a\nb\nc\n')).toEqual({ from: 1, to: 1, insert: ['b'] });
  });

  it('maps a line only when the two sides line up one for one', () => {
    const pairs = [[2, 5], [8, 11]];
    expect(mapLine(4, pairs, 20, 23)).toBe(7);   // inside a gap of equal length
    expect(mapLine(9, pairs, 20, 22)).toBeNull(); // the tail drifts by one
  });
});

describe('a mark is one pair of asterisks, however many pieces the editor keeps it in', () => {
  it('does not grow a bold sentence every time a file with code in it is saved', () => {
    // ProseMirror splits this into three text nodes: bold, bold+code, bold.
    // Wrapping each on its own emitted five pairs of asterisks for one, and the
    // line got LONGER on every save. Measured on her STATE.md, 2026-08-21: two
    // of its 130 lines rewrote themselves this way, on the one document in the
    // store with a hard 8,000-character budget.
    const line = '**NEVER `git add -A`, A 2ND SESSION IS OFTEN IN `dev.html`.**';
    expect(roundTrip(line)).toBe(line + '\n');
    // And it is stable: saving twice does not change it again.
    expect(roundTrip(roundTrip(line))).toBe(line + '\n');
  });

  it('keeps a link inside a bold sentence rather than bolding the link', () => {
    const line = '**Read [the doc](https://x.test) before you start.**';
    expect(roundTrip(line)).toBe(line + '\n');
  });

  it('keeps a code span that is not bold to itself', () => {
    const line = 'Run `npx vitest run` and read the tail.';
    expect(roundTrip(line)).toBe(line + '\n');
  });
});

describe('a numbered list that starts at four still starts at four', () => {
  it('does not renumber an option set on a keystroke', () => {
    // This product has a standing rule against renumbering an option set. An
    // editor that quietly did it on save would break that rule silently.
    expect(roundTrip('4. four\n5. five\n6. six')).toBe('4. four\n5. five\n6. six\n');
    expect(roundTrip('1. one\n2. two')).toBe('1. one\n2. two\n');
  });
});

describe('a bold sentence written across four lines is bold, not asterisks', () => {
  // How the bullets in this store's own STATE.md are written: the `**` opens on
  // one line and closes several lines later. Markdown reads those lines as one
  // paragraph and bolds the lot; parsed line by line, neither `**` ever finds
  // its partner and both stay on the screen as characters. 24 lines of her
  // STATE.md drew raw asterisks in the pane before this (measured 2026-08-21).
  const bullet = [
    '- **THE DEV TOOL SHIPS FIRST: w-4b18412c42, HERS, PRIORITY 9, VERBATIM IN',
    '  `decisions.md` 08-18.** self-serve.',
  ].join('\n');

  it('reads the whole run as one mark', () => {
    const doc = mdToPmDoc(bullet);
    const text = JSON.stringify(doc);
    expect(text).not.toContain('**');
    expect(text).toContain('"bold"');
  });

  it('writes it back the way it was written', () => {
    expect(roundTrip(bullet)).toBe(bullet + '\n');
    expect(roundTrip('**one line\nand the next**')).toBe('**one line\nand the next**\n');
  });

  it('leaves a break that is outside the mark outside it', () => {
    expect(roundTrip('**bold**\nplain')).toBe('**bold**\nplain\n');
  });
});
