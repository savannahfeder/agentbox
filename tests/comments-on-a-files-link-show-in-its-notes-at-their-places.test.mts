// Two testers on 2026-11-11 found comments on a shared link only inside the
// Share popover: "Jordan public comment hidden in sharing menu rather than
// Notes", and "Public review comment is missing inside the same file". The
// file's Notes now has a section, On the link, with each comment at its place,
// and a reply goes to the link page. They are never sent to the agent.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LinkNotes } from '../renderer/src/components/LinkNotes.tsx';

const c = (id: string, extra = {}) => ({ id, byName: 'Jun', byAvatar: null, text: `words ${id}`, at: Date.parse('2026-11-11T10:00:00Z'), mine: false, byOwner: false, ...extra });
const draw = (comments) => renderToStaticMarkup(h(LinkNotes, { comments, onGo() {}, reply: async () => true }));

describe('On the link, in the file\'s Notes', () => {
  it('is nothing at all when the link has no comments', () => {
    expect(draw([])).toBe('');
  });
  it('names who wrote each one and where it points, in the app\'s words', () => {
    const html = draw([
      c('a', { place: { kind: 'time', s: 3.2 } }),
      c('b', { place: { kind: 'time', s: 6.5, x: 0.5, y: 0.45 } }),
      c('c', { place: { kind: 'quote', text: 'starting the 17th' } }),
      c('d', { byOwner: true, byName: 'Maya' }),
    ]);
    expect(html).toContain('On the link');
    expect(html).toContain('>at 0:03<');
    expect(html).toContain('>Pin 1 at 0:06<');
    expect(html).toContain('“starting the 17th”');
    expect(html).toContain('>You<');
    expect(html).toContain('Reply on the link page');
  });
  it('is never offered to the agent', () => {
    const html = draw([c('a', { place: { kind: 'time', s: 1 } })]);
    expect(html).not.toMatch(/Sent to the agent|Send|Resolve/);
    const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
    expect(view).toMatch(/<LinkNotes comments=\{linkNotes\.comments\}/);
    expect(view).not.toMatch(/linkNotes\.comments[^;\n]*(send|toAgent|pressSend)/i);
  });
});
