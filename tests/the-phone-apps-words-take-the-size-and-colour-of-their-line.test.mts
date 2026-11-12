// The phone app drew an option's label at 15.5px in full white, where the phone
// website draws it at 14px in the dim grey (`.offer-opt`). The option passes
// that style to InlineMarkdown, but each run of words inside was a <T>, the
// app's text part, which puts its own size and colour back on every run. So a
// message's paragraphs were 15.5px, not the 16px the line was given, too.
// Measured on photographs of the preview build beside the phone website.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync('mobile/src/ui/Markdown.tsx', 'utf8');
const words = src.slice(src.indexOf('function Words('), src.indexOf('\n}\n', src.indexOf('function Words(')));

describe("the phone app's words take the size and colour of their line", () => {
  it('draws each run of words as plain nested text', () => {
    expect(words).toMatch(/<Text key=\{i\} style=\{style\}>/);
  });

  it('never gives a run the text part that sets its own size and colour', () => {
    expect(words).not.toMatch(/<T\b/);
  });

  it('still sets the type a code span or bold run needs', () => {
    expect(words).toMatch(/s\.code \? \{ fontSize: 13/);
    expect(words).toMatch(/font\.semibold/);
  });
});
