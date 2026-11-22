// A HAND-OFF IS ONE MESSAGE WITH ITS PICTURES (2026-11-22).
//
// Theo asked the founder to review his thread. The page opened on a summary
// card whose files were name chips, then "Show 4 earlier messages", then the
// agent's last answer, and his ask came last: "I had to open more of the chat to
// see what they actually wanted me to review because I didn't really see images
// or anything." She asked for one message holding his words, what to look at and
// the artifacts, with the thread above it to scroll up through. Now the ask is
// that message: his words, what his agent did, every picture on the thread drawn,
// the other files, and the answers; the thread above it is drawn whole and the
// page lands on the message. Measured by drawing the message and reading the page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HandOffWhat } from '../renderer/src/team/HandOff.tsx';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
const open = () => {};
const pictures = [
  { src: 'attachments/1-before.png', name: '1-before.png', notes: 0, open },
  { src: 'attachments/2-after.png', name: '2-after.png', notes: 0, open },
];
const files = [{ src: 'attachments/SKILL.md', name: 'SKILL.md', notes: 2, open }];
const draw = (layout: 'grid' | 'dock', tried = ['Profile row opens the thread']) => renderToStaticMarkup(React.createElement(HandOffWhat, {
  owner: 'Theo', tried, pictures, files, roots: ['/shelf/theo/w-5c0ffee123'], layout,
}));

describe('a hand-off from a teammate', () => {
  it('draws every picture on the thread, not only its name', () => {
    const html = draw('grid');
    expect(html).toContain('handoff-pics-grid');
    expect(html.match(/inline-image/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('1-before.png');
    expect(html).toContain('2-after.png');
  });

  it('says what the agent did, and lists the files that are not pictures', () => {
    const html = draw('grid');
    expect(html).toMatch(/What Theo(&#x27;|')s agent did/);
    expect(html).toContain('Profile row opens the thread');
    expect(html).toContain('SKILL.md');
    expect(html).toContain('2 notes');
    expect(html).not.toMatch(/<span class="ts-tk-fname">1-before\.png/);
  });

  it('says nothing about the agent when it recorded no steps', () => {
    expect(draw('grid', [])).not.toContain("agent did");
  });

  it('is the ask itself, in place of the summary card, so it is said once', () => {
    expect(page).toContain('<HandOffWhat owner={owner} tried={doneSteps(card.progress)} pictures={pictures} files={otherFiles}');
    expect(page).toContain('{!asked && <TeammateSummary card={card} owner={owner} files={files} />}');
  });

  it('has the whole thread above it to scroll up through, and the page lands on it', () => {
    expect(page).toMatch(/\{unfolded && before\.length > 0 && <FileMarkOpener\.Provider value=\{openMark\}>\s*<Thread events=\{before\}/);
    expect(page).toContain('<div ref={handOffEl}>{handOff}</div>');
    expect(page).toContain('pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top - 24;');
  });
});
