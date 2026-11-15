// The reply dock folds shut. Her sentence must fold with it, not disappear.
//
// In the first she is mid-sentence in the box. In the second the box is a pill
// reading "Reply…", which is the same pill a thread she has never typed a word
// into draws.
//
// Nothing was lost: `drafts.ts` writes her words on every keystroke and the box
// reopens on them. What the app could not tell her is that it had them. These
// pin the property the fix holds: WHAT THE FOLDED PILL SAYS IS WHAT IS UNDER
// IT. They run against the function the pill is drawn from
// (renderer/src/components/Focus.tsx computes `folded` and renders its text).
import { describe, it, expect } from 'vitest';
import { foldedReply, FOLDED_BUDGET } from '../renderer/src/folded-reply';

const pasted = (name) => ({ name, image: true });
const dropped = (name) => ({ name, image: false });

describe('a reply box she never typed in', () => {
  it('still invites her to reply', () => {
    expect(foldedReply('', [])).toEqual({ draft: false, text: 'Reply…', files: '' });
  });

  it('names the agent when the thread has one', () => {
    expect(foldedReply('', [], 'Claude Code').text).toBe('Reply to Claude Code…');
  });

  it('is not a draft when the box held only spaces', () => {
    expect(foldedReply('   \n\n  ', []).draft).toBe(false);
  });
});

describe('a reply box she was part way through', () => {
  const HERS = 'Great. Now our code viewer has really bad UX. I just am not sure how to use it.';

  it('says her own words back instead of the invitation', () => {
    const folded = foldedReply(HERS, []);
    expect(folded.draft).toBe(true);
    expect(folded.text).toBe(HERS);
  });

  it('ignores the agent name, because her sentence is what she came back for', () => {
    expect(foldedReply(HERS, [], 'Claude Code').text).toBe(HERS);
  });

  it('is one line however many paragraphs she wrote', () => {
    const folded = foldedReply('First thought.\n\nSecond thought.', []);
    expect(folded.text).toBe('First thought. Second thought.');
    expect(folded.text).not.toContain('\n');
  });

  it('trails off on a word, never mid-word', () => {
    const long = 'sentence '.repeat(40).trim();
    const { text } = foldedReply(long, []);
    expect(text.length).toBeLessThanOrEqual(FOLDED_BUDGET + 1);
    expect(text.endsWith('…')).toBe(true);
    // Everything before the ellipsis is whole words of hers.
    expect(text.slice(0, -1).split(' ').every((w) => w === 'sentence')).toBe(true);
  });

  it('keeps a sentence that fits exactly as she typed it', () => {
    const fits = 'x'.repeat(FOLDED_BUDGET);
    expect(foldedReply(fits, []).text).toBe(fits);
  });

  it('never cuts a long unbroken word to almost nothing', () => {
    // A pasted URL has no spaces in it. Cutting at the last space would leave
    // three characters and an ellipsis, which says less than nothing.
    const url = `https://example.com/${'a'.repeat(200)}`;
    const { text } = foldedReply(`See ${url}`, []);
    expect(text.length).toBeGreaterThan(FOLDED_BUDGET * 0.9);
  });
});

describe('the screenshots she pasted and did not type over', () => {
  it('are the message when there are no words', () => {
    expect(foldedReply('', [pasted('pasted-35385.png')])).toEqual({
      draft: true, text: '1 image', files: '',
    });
  });

  it('are counted in the plural', () => {
    expect(foldedReply('', [pasted('one.png'), pasted('two.png')]).text).toBe('2 images');
  });

  it('are files, not images, when she dragged in something else', () => {
    expect(foldedReply('', [dropped('notes.pdf')]).text).toBe('1 file');
    expect(foldedReply('', [pasted('shot.png'), dropped('notes.pdf')]).text).toBe('2 files');
  });

  it('ride beside her sentence when she typed one too', () => {
    const folded = foldedReply('Here is the screen.', [pasted('shot.png')]);
    expect(folded.text).toBe('Here is the screen.');
    expect(folded.files).toBe('1 image');
  });

  it('do not count a nameless attachment the box could not draw anyway', () => {
    expect(foldedReply('', [{ name: '', image: true }]).draft).toBe(false);
  });
});
