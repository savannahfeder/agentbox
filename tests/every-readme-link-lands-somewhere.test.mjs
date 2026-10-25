// THE README'S OWN NAV POINTED AT A HEADING THAT DOES NOT EXIST.
//
// Measured on 2026-10-16 while auditing how the project is found: the nav row at
// the top of README.md linked `#get-it`, and the README has no `get-it` anchor —
// the section is `## Install`. Clicking "Get it" on the repo page scrolled
// nowhere. The sibling link `#what-this-sends` is fine, because that one is a
// real `<details id="what-this-sends">`, which is why only one of the five was
// broken and why eyeballing the list missed it.
//
// GitHub builds a heading's anchor by lowercasing it, dropping anything that is
// not a letter, number, space or hyphen, then turning spaces into hyphens. So a
// link resolves if it matches a heading slugged that way OR an explicit id="".
// This pins all of it: the real links, the one that was broken, and the slug
// rule itself.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

// GitHub's heading-to-anchor rule.
const slug = (heading) =>
  heading
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ +/g, '-');

const anchorsIn = (text) => {
  const targets = new Set();
  for (const m of text.matchAll(/^#{1,6} +(.+)$/gm)) targets.add(slug(m[1]));
  for (const m of text.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis)) targets.add(slug(m[1]));
  for (const m of text.matchAll(/id="([^"]+)"/g)) targets.add(m[1]);
  return targets;
};

const linksIn = (text) => [...text.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);

describe('every in-page README link lands somewhere', () => {
  it('resolves all of them', () => {
    const targets = anchorsIn(readme);
    const dead = linksIn(readme).filter((l) => !targets.has(l));
    expect(dead).toEqual([]);
  });

  it('still has the nav links the page is built around', () => {
    // If someone renames a section, this says which promise broke.
    for (const link of ['#how-it-works', '#what-matters-most-goes-first', '#built-for-the-keyboard']) {
      expect(readme).toContain(`href="${link}"`);
    }
  });

  it('points "Get it" at the install section, not the anchor that never existed', () => {
    expect(readme).toContain('href="#install">Get it<');
    expect(readme).not.toContain('href="#get-it"');
  });
});

describe('the anchor rule itself', () => {
  it('matches a heading, an explicit id, and a details id', () => {
    const targets = anchorsIn(
      ['## Install', '<details id="what-this-sends">', '# Two Words Here'].join('\n'),
    );
    expect(targets.has('install')).toBe(true);
    expect(targets.has('what-this-sends')).toBe(true);
    expect(targets.has('two-words-here')).toBe(true);
  });

  it('does NOT invent an anchor a heading never made', () => {
    // The exact bug: "## Install" does not answer to "get-it".
    const targets = anchorsIn('## Install');
    expect(targets.has('get-it')).toBe(false);
  });

  it('drops punctuation the way GitHub does', () => {
    expect(slug("What's sent, really?")).toBe('whats-sent-really');
    expect(slug('1. File the work')).toBe('1-file-the-work');
  });
});
