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
