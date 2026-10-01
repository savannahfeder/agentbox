// HOW THE NAME IS WRITTEN IN THE README, WHICH IS ALSO THE NPM PAGE.
//
// Her rule, w-5a90aa1ea4 on 2026-09-29: "Agentbox should be capitalized when
// it's the first thing in the sentence or naturally capitalized. Only not
// capitalized in the middle of a sentence."
//
// The brand mark is lowercase, which is why shared/product-name.mjs exports
// both NAME and Name, and the app already obeys this everywhere because it
// picks between the two. The README is the one place the name is TYPED, so it
// is the one place the rule can rot, and it rots in public: this file is what
// npmjs.com renders on the package page.
//
// What is deliberately out of scope: code, urls and inline code spans. `cd
// agentbox` is a directory, the clone url is a url, `mcp__agentbox` is a tool
// id, and "Open agentbox as a new user" is a menu label quoted from the app,
// where NAME is lowercase and mid-sentence anyway. None of those are prose and
// none of them may be capitalised.
//
// THE TITLE MAY BE CENTRED (w-96babd2cfc, 2026-09-30). The README became a
// landing page with the icon, the title and the pitch centred over the hero,
// the way most app READMEs on GitHub open. GitHub cannot centre a `#` heading,
// so a centred title is an `<h1 align="center">` under the icon, and the first
// line of the file is the icon's paragraph. The rule this file guards was never
// "line one is markdown"; it is that the title is the capitalised name. So the
// check reads the FIRST HEADING, either kind, and a lowercase one still fails.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME, Name } from '../shared/product-name.mjs';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readme = fs.readFileSync(path.join(here, 'README.md'), 'utf8');

/** Only the prose. Fenced blocks, inline code and urls are not sentences. */
function prose(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s{4,}.*$/gm, '');
}

/** The text of the first heading, markdown `#` or an html `<h1>`, centred or not. */
function firstHeading(text) {
  const m = text.match(/^#\s+(.+)$|<h1(?:\s[^>]*)?>([^<]*)<\/h1>/m);
  return m ? (m[1] ?? m[2]).trim() : null;
}

describe('finding the title', () => {
  it('reads a markdown title', () => {
    expect(firstHeading(`# ${Name}\n\nSome words.`)).toBe(Name);
  });

  it('reads a centred html title under an icon', () => {
    expect(firstHeading(`<p align="center">\n  <img src="x.svg">\n</p>\n\n<h1 align="center">${Name}</h1>`)).toBe(Name);
  });

  it('reports a lowercase title as lowercase, so the check below fails it', () => {
    expect(firstHeading(`<h1>${NAME}</h1>`)).toBe(NAME);
    expect(firstHeading(`<h1>${NAME}</h1>`)).not.toBe(Name);
  });

  it('takes the first heading, not a later one', () => {
    expect(firstHeading(`<h1 align="center">${Name}</h1>\n\n## Get it`)).toBe(Name);
  });
});

describe('the README, which npm shows on the package page', () => {
  const body = prose(readme);
  const found = [...body.matchAll(new RegExp(`\\b${NAME}\\b`, 'gi'))];

  it('mentions the app at all, or this file is checking nothing', () => {
    expect(found.length).toBeGreaterThan(0);
  });

  it('capitalises it where a sentence or a heading starts, and nowhere else', () => {
    const wrong = [];
    for (const m of found) {
      const before = body.slice(0, m.index);
      // A heading, the start of a paragraph, or straight after a full stop,
      // a question mark or an exclamation mark.
      const opens = /(^|\n)\s*(#*|<h[1-6](\s[^>]*)?>)\s*$/.test(before) || /[.!?]\s+$/.test(before);
      const want = opens ? Name : NAME;
      if (m[0] !== want) {
        const line = before.split('\n').length;
        wrong.push(`line ${line}: "${m[0]}" should be "${want}"`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('opens with the capitalised name, because a title is a title', () => {
    expect(firstHeading(readme)).toBe(Name);
  });
});
