// NOTHING PEOPLE ACTUALLY READ LINKED TO AGENTBOX.AC, SO SEARCH NEVER FOUND IT.
//
// w-32efa85cd6, 2026-11-04. Stars went from 97 to 345 on the launch videos, and
// agentbox.ac still did not show up in search or in AI answers. Counted that
// day: the README had 0 links to agentbox.ac, the npm page's homepage was the
// GitHub README, and the one listing checked (skillsllm) had 21 GitHub links
// and none to the site. The only link was the repo's "website" field. Search
// engines and models find a site through links from pages they already trust,
// and every launch visitor landed on a page that never named the site.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const SITE = 'https://agentbox.ac';
const linksToSite = (text) => [...text.matchAll(/href="https:\/\/agentbox\.ac\/?"/g)].length;

describe('the README links the website', () => {
  it('links it before the first section, where a launch visitor is still reading', () => {
    const top = readme.split(/^## /m)[0];
    expect(linksToSite(top)).toBeGreaterThan(0);
  });

  it('does not count a mention that is not a link', () => {
    expect(linksToSite('Visit agentbox.ac today')).toBe(0);
    expect(linksToSite('<a href="https://agentbox.ac">agentbox.ac</a>')).toBe(1);
  });

  it('does not count a look-alike domain', () => {
    expect(linksToSite('<a href="https://agentbox.ac.example.com">x</a>')).toBe(0);
  });
});

describe('the npm page sends people to the website', () => {
  it('uses agentbox.ac as the homepage, not the GitHub README', () => {
    expect(pkg.homepage).toBe(SITE);
    expect(pkg.homepage).not.toMatch(/github\.com/);
  });
});
