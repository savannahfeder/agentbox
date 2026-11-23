// A HANDED-OVER THREAD'S LINK READS AS ITS NAME, NOT AS MARKDOWN.
//
// In a power test Sam handed Lena a thread and she carried it on with an agent.
// Her new thread's first message, read from her copy's ledger, is the app's own
// "Sam wrote: [Failing test fix and purpose](https://app.agentbox.ac/t/<uuid>/w-20d4d3f433)"
// then his words. A person's message is drawn as typed, and only a line that is
// nothing but a thread's link is drawn as the link, so the "Sam wrote: " the
// app puts in front left the brackets and the ids on her screen. Sam saw the
// same on her thread's page: its summary line is the first sentence of that
// message, and that sentence kept its markdown link.
import { describe, it, expect } from 'vitest';
import { typedParts } from '../renderer/src/typed-message';
import { firstSentence } from '../shared/thread-cards.mts';

const LINK = '[Failing test fix and purpose](https://app.agentbox.ac/t/c433f9a5-2776-40d5-b71e-e6172d47ee55/w-20d4d3f433)';

describe('the message a carried-on hand-over opens with', () => {
  it('draws the thread link after "Sam wrote:" as the link', () => {
    expect(typedParts(`Sam wrote: ${LINK}\n\nCould you take ownership of this overlap fix?`)).toEqual([
      { text: 'Sam wrote:' },
      { embed: LINK },
      { text: 'Could you take ownership of this overlap fix?' },
    ]);
  });
  it('still keeps a thread link inside a sentence a person typed as typed', () => {
    const typed = `I think ${LINK} is the one.`;
    expect(typedParts(typed)).toEqual([{ text: typed }]);
  });
  it('keeps any other web link after "wrote:" as typed', () => {
    const typed = 'Sam wrote: [the doc](https://example.com/a)';
    expect(typedParts(typed)).toEqual([{ text: typed }]);
  });
});

describe('a thread’s summary line', () => {
  it('shows a markdown link as its words', () => {
    expect(firstSentence(`Sam wrote: ${LINK}\n\nCould you take ownership of this overlap fix and carry it forward? Please ask Codex.`))
      .toBe('Sam wrote: Failing test fix and purpose Could you take ownership of this overlap fix and carry it forward?');
  });
  it('leaves brackets that are not a link alone', () => {
    expect(firstSentence('Run it with [--watch] on.')).toBe('Run it with [--watch] on.');
  });
});
