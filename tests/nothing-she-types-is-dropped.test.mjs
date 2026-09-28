// The compose box used to delete her words.
//
// `title = firstLine.trim.slice(0, 180)` and `body = the lines after the
// first`. Written as one paragraph, which is how she writes, a message lost
// everything past character 180 and no copy of it existed anywhere: not in the
// title, not in the body, not in a draft (Compose holds no draft). Eleven of
// the twenty-five directives in her store hit that cap and nine are cut
// mid-word. One of the nine is her asking where her own message went.
//
// These pin the property that failure needs: WHATEVER SHE TYPES COMES BACK,
// either as the title or inside the body, character for character.

import { describe, expect, it } from 'vitest';
import { splitMessage, TITLE_BUDGET } from '../renderer/src/message-split.ts';

// A message of the shape and the length that reported the bug. It has to run
// past the title budget and keep going, because what the bug destroyed was
// everything after the cut.
const kept = "How does somebody read a previous message back? Clicking the part "
  + "that shows the message does not show what was sent. It was meant to expand, "
  + "or to open a thread, or something. Giv";

const hers = `${kept}e me a way to read it back.`;

describe('splitMessage', () => {
  it('keeps every word of a long single paragraph', () => {
    const { title, body } = splitMessage(hers);
    expect(body).toBe(hers);
    expect(hers.startsWith(title.replace(/…$/, ''))).toBe(true);
  });

  it('titles that paragraph with its first sentence, not a slice of it', () => {
    const { title } = splitMessage(hers);
    expect(title).toBe('How does somebody read a previous message back?');
  });

  it('never lets the title run past the budget', () => {
    const wall = `${'word '.repeat(200)}end`;
    const { title, body } = splitMessage(wall);
    expect(title.length).toBeLessThanOrEqual(TITLE_BUDGET + 1); // +1 for the ellipsis
    expect(title.endsWith('…')).toBe(true);
    expect(body).toBe(wall.trim());
  });

  it('leaves a short message exactly as it always worked: title only, no body', () => {
    expect(splitMessage('Fix the login bug')).toEqual({ title: 'Fix the login bug', body: '' });
  });

  it('leaves a short first line as the title and the rest as detail', () => {
    const { title, body } = splitMessage('Fix the login bug\n\nIt 500s on a wrong password.');
    expect(title).toBe('Fix the login bug');
    expect(body).toBe('It 500s on a wrong password.');
  });

  it('loses nothing to whitespace, whatever she pasted', () => {
    const messy = '  \n\nSell the coins.\n\n   One 1882-O, one 1921.  \n\n';
    const { title, body } = splitMessage(messy);
    expect(title).toBe('Sell the coins.');
    expect(body).toBe('One 1882-O, one 1921.');
  });

  // The old code path, run over the same input, to record what it did.
  it('is not the old slice', () => {
    const old = hers.split('\n')[0].trim().slice(0, 180);
    expect(old).toBe(kept);        // exactly what the store has for w-933c5a071f
    expect(old.endsWith('Giv')).toBe(true);
    expect(splitMessage(hers).body).toContain('e me a way to read it back.');
  });
});
