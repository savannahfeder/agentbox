// WHAT YOU MADE PUBLIC IS ONE LIST IN SETTINGS.
//
// Two sharers in the power test (2026-11-04, round 3) had shared an investor
// update and a roadmap and had no one place to see or stop what was public:
// "to audit what's public I'd have to reopen each file's Share panel".
// Measured on the Settings group's markup and its words.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicLinks, publicLinkLine } from '../renderer/src/components/Settings.tsx';

const now = Date.parse('2026-11-04T12:00:00Z');
const link = (extra) => ({ token: 't1', url: 'https://app.agentbox.ac/f/t1', source: 'p/w-1/a', name: 'q1-roadmap.md', kind: 'markdown', createdAt: now - 3_600_000, updatedAt: now - 3_600_000, comments: 0, ...extra });
const never = () => new Promise(() => {});

describe('the list', () => {
  it('names each live file, says when it went up, and offers Copy link and Stop sharing on each', () => {
    const html = renderToStaticMarkup(React.createElement(PublicLinks, { load: never, now, first: [link(), link({ token: 't2', name: 'pricing.html', comments: 2 })] }));
    expect(html).toContain('Public links');
    expect(html).toContain('q1-roadmap.md');
    expect(html).toContain('pricing.html');
    expect(html.match(/>Copy link</g)).toHaveLength(2);
    expect(html.match(/>Stop sharing</g)).toHaveLength(2);
  });
  it('is not there at all when nothing is public', () => {
    expect(renderToStaticMarkup(React.createElement(PublicLinks, { load: never, now, first: [] }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(PublicLinks, { load: never, now }))).toBe('');
  });
  it('says shared or updated, and how many comments', () => {
    expect(publicLinkLine(link(), now)).toMatch(/^Shared today at /);
    expect(publicLinkLine(link({ updatedAt: now - 60_000, comments: 1 }), now)).toMatch(/^Updated today at .* · 1 comment$/);
  });
});

// Share's Sign in stayed asked for after signing in some other way, so the next
// sign-out put the sign-in page straight up (found reading a tester's freeze, 2026-11-04).
describe('Share\'s sign-in', () => {
  it('is let go once anyone is signed in, as the phone\'s is', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('useEffect(() => { if (snap?.team?.signedIn) { setPhoneSignInOpen(false); setShareSignInOpen(false); } }, [snap?.team?.signedIn]);');
  });
});

// A sharer clicked Connections looking for their public links: both drew the
// same chain (power test, round 3, 2026-11-04). Share draws a globe.
describe('the Share mark', () => {
  it('is a globe, not the chain Connections wears', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../renderer/src/components/ShareLink.tsx', import.meta.url), 'utf8');
    expect(src.match(/<NoteGlyph name="globe" \/>/g)).toHaveLength(2);
    expect(src).not.toContain('<NoteGlyph name="link" />');
  });
});
