// A HELPER'S VIEW OF A TEAMMATE'S THREAD READS AS A THREAD OF YOUR OWN (2026-11-21).
//
// Lena, asked by Theo to help, opened his thread from her Inbox. Under the same
// crumb as any thread, the page was a layout of its own: the agent's options as
// a plain numbered list under a "Result" label, the table unstyled, and a box
// with its own "Send to the agent" button. The founder: "It should be really
// similar to the structure of our other page." Now its name heads it with what
// came before folded, the newest answer is the headline, the step's options sit
// on the reply box as the owner's picker, and the reply box is the thread's own.
// Measured by reading the page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');

describe("a helper's view of a teammate's thread", () => {
  it('is set in the thread page\'s column with its markdown styles', () => {
    expect(page).toContain('<div className="focus-body markdown agent-thread" aria-label="The conversation">');
    expect(page).toContain('<QueueSummary title={title}');
    expect(page).toContain('<QueueAnswer text={options.length ? stripOptionsSection(newest.text) : newest.text}');
    expect(page).not.toContain('appendix-label');
  });
  it('offers the step\'s options on the reply box, not as a list in the answer', () => {
    expect(page).toMatch(/<div className="focus-dock-inner">[\s\S]{0,200}<div className="one-choices">\s*<OptionsOffer/);
    expect(page.indexOf('<OptionsOffer')).toBeLessThan(page.indexOf('<div className="dock-card">'));
    expect(page).toContain('const options = helping && newest ? parseOptions(newest.text) : [];');
  });
  it('uses the thread\'s own reply box and Send', () => {
    expect(page).toContain('<textarea className="dock-input"');
    expect(page).toContain('<button type="submit" className="dock-send" disabled={!draft.trim() || sending}>Send <kbd>↵</kbd></button>');
    expect(page).not.toContain('Send to the agent</button>');
  });
});
