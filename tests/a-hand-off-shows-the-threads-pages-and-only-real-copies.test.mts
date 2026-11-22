// A HAND-OFF SHOWS THE THREAD'S PAGES, AND DRAWS EACH FILE FROM A REAL COPY (2026-11-22).
//
// Found by a power test of the review hand-off, three testers on one team.
// Lena asked Dana to "open the checkout HTML from this review", and the review
// listed only a Markdown file: pages and tables were never among a teammate's
// thread's files. And a second review of Lena's bookings mockups drew
// "missing image: could-you-mock-up-an-option-2.png": Priya's first reply named
// that picture in plain words ("Notes on could-you-mock-up-an-option-2.png:"),
// and the bare name was taken as the picture's newest copy, which no folder
// holds. Measured by listing a thread's files from its lines.
import { describe, it, expect } from 'vitest';
import { filesOnThread } from '../renderer/src/threads/teammate-thread';

const result = (text: string) => ({ source: 'agent', patch: { result: text } });
const handBack = (text: string) => ({ source: 'system', patch: { answer: text, from: { teammate: 'priya', name: 'Priya Shah' } } });

describe("a teammate's thread's files", () => {
  it('keep the copy a picture was sent as when a reply names it in words', () => {
    const lines = [
      result('Two options.\n\n![option-1.png](attachments/d528996ca4f3-option-1.png)\n![option-2.png](attachments/9e3396a6b403-option-2.png)'),
      handBack('Priya reviewed this.\n\nNotes on option-2.png:\n- Pin 1: Make the button say New booking.'),
    ];
    expect(filesOnThread(lines as never, []).map((f) => f.src)).toEqual(['attachments/d528996ca4f3-option-1.png', 'attachments/9e3396a6b403-option-2.png']);
  });

  it('still take a newer copy of a picture when one is sent', () => {
    const lines = [
      result('![option-1.png](attachments/d528996ca4f3-option-1.png)'),
      result('Refreshed.\n\n![option-1-v2.png](attachments/16981587677b-option-1-v2.png)'),
    ];
    expect(filesOnThread(lines as never, []).map((f) => f.src)).toEqual(['attachments/16981587677b-option-1-v2.png']);
  });

  it('include a page and a table the agent made', () => {
    const lines = [result('The prototype: [checkout.html](attachments/1a2b3c4d5e6f-checkout.html) and the numbers in [visits.csv](attachments/6f5e4d3c2b1a-visits.csv).')];
    expect(filesOnThread(lines as never, []).map((f) => f.name)).toEqual(['checkout.html', 'visits.csv']);
  });

  it('leave out the code a message names', () => {
    const lines = [result('The bug is in `src/store.js`, fixed in [store.js](attachments/aaaaaaaaaaaa-store.js).')];
    expect(filesOnThread(lines as never, [])).toEqual([]);
  });
});
