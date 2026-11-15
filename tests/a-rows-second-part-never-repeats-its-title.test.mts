// A ROW'S SECOND PART NEVER REPEATS ITS TITLE.
//
// A row read "Jordan Lee's open threads | Jordan Lee's open
// threads": the list a leaver's work was handed over in stored its own title as
// what it said, and the row printed that beside the title. The words were fixed
// for new lists, but a list made before keeps them, and nothing on the drawing
// side stopped any second part from saying the title again.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { asideBesides } from '../renderer/src/list-rules.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('the second part of a row', () => {
  it('is dropped when it says the title again', () => {
    expect(asideBesides("Jordan Lee's open threads", "Jordan Lee's open threads")).toBeNull();
  });
  it('is dropped whatever its case, spacing or last stop', () => {
    expect(asideBesides("Jordan Lee's open threads", "  jordan lee's  open threads. ")).toBeNull();
  });
  it('is dropped when it only adds to a title of three words or more', () => {
    expect(asideBesides('Fix the refund wording', 'Fix the refund wording before Friday')).toBeNull();
  });
  it('stays when it says something else', () => {
    expect(asideBesides("Jordan Lee's open threads", 'Jordan Lee left the team. This is what was open.')).toBe('Jordan Lee left the team. This is what was open.');
  });
  it('stays when a short title is only a word inside it', () => {
    expect(asideBesides('Deck', 'Maya commented on deck.png: slide 3')).toBe('Maya commented on deck.png: slide 3');
  });
  it('is nothing when there is none', () => {
    expect(asideBesides('Anything', undefined)).toBeNull();
  });
});

describe('the wiring', () => {
  it('the row and the open thread both ask it', () => {
    expect(read('renderer/src/threads/Pages.tsx')).toMatch(/asideBesides\(/);
    expect(read('renderer/src/App.tsx')).toMatch(/waitEndedWords=\{asideBesides\(/);
  });
});
