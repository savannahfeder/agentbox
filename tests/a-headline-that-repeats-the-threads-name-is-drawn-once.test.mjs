// A HEADLINE THAT REPEATS THE THREAD'S NAME IS DRAWN ONCE (w-65bcefb857).
//
// The founder's screenshot of a teammate's thread: "The dust is in — watch the
// opening and tell me if it lands." as the page's name, then the same sentence
// in bold as the answer's headline straight under the Context. A teammate's
// thread is named after the first line of its message to you (rowTitle,
// list-rules.ts), and that line is the answer's bold headline, so the page
// said it twice. Now the headline is left out when it is the name.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueueAnswer } from '../renderer/src/components/OneThingAtATime.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const thread = fs.readFileSync(path.join(root, 'renderer/src/components/ItemThread.tsx'), 'utf8');
const md = (t) => h('div', null, t);
const text = '**The dust is in — watch the opening and tell me if it lands.**\n\nFour seconds before anything else.';

describe('the answer\'s headline', () => {
  it('is left out when it is the thread\'s name', () => {
    const html = renderToStaticMarkup(h(QueueAnswer, { text, md, name: 'The dust is in — watch the opening and tell me if it lands.' }));
    expect(html).not.toContain('one-q');
    expect(html).toContain('Four seconds before anything else.');
  });
  it('whatever its spacing or capitals', () => {
    const html = renderToStaticMarkup(h(QueueAnswer, { text, md, name: '  the dust is in —  watch the opening and tell me if it lands. ' }));
    expect(html).not.toContain('one-q');
  });
  it('and drawn when the name is something else', () => {
    const html = renderToStaticMarkup(h(QueueAnswer, { text, md, name: 'Cloud launch video' }));
    expect(html).toContain('<h1 class="one-q">The dust is in — watch the opening and tell me if it lands.</h1>');
  });
  it('the page hands the answer its name', () => {
    expect(thread).toMatch(/<QueueAnswer text=\{clean\(newest\.text\)\} md=\{md\} name=\{pageTitle\(item, teammate\?\.name\)\} \/>/);
  });
});
