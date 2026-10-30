// A teammate's thread page drew its answer's bold first line as the page's big
// name and left it out under the Context, so it read nothing like any other
// thread (name, Context, bold answer line, body). The page took its name from
// rowTitle, which names a teammate's thread after that same line, and
// QueueAnswer drops a headline equal to the name. Measured with the founder's
// screenshot of a Launch lead setup run beside an analytics report.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pageTitle } from '../renderer/src/one-thing-at-a-time.ts';
import { rowTitle } from '../renderer/src/list-rules.ts';
import { QueueAnswer } from '../renderer/src/components/OneThingAtATime.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const thread = fs.readFileSync(path.join(root, 'renderer/src/components/ItemThread.tsx'), 'utf8');
const md = (t) => h('div', null, t);

const answer = "**Four questions are in the team chat; answer them and I'm set up as Launch lead.**\n\nI read all four threads in full.";
const run = (over = {}) => ({
  id: 'w-1', status: 'open', title: 'Set up its job', labels: ['founder', 'teammate:t-1', 'hop:0'], result: answer, ...over,
});

describe("a teammate's thread page", () => {
  it('is named after the teammate and what woke it, not its answer', () => {
    expect(pageTitle(run(), 'Launch lead')).toBe('Launch lead · Set up its job');
  });

  it('so the answer keeps its bold line under the Context', () => {
    const html = renderToStaticMarkup(h(QueueAnswer, { text: answer, md, name: pageTitle(run(), 'Launch lead') }));
    expect(html).toContain("<h1 class=\"one-q\">Four questions are in the team chat; answer them and I&#x27;m set up as Launch lead.</h1>");
  });

  it('with no teammate to name, is its own title', () => {
    expect(pageTitle(run(), null)).toBe('Set up its job');
  });

  it('with no title, falls back to the name the list gives it', () => {
    expect(pageTitle(run({ title: '  ' }), 'Launch lead')).toBe(rowTitle(run({ title: '' })));
  });

  it('leaves the list row reading as its message', () => {
    expect(rowTitle(run())).toBe("Four questions are in the team chat; answer them and I'm set up as Launch lead.");
  });

  it('leaves every other thread named as the list names it', () => {
    const plain = { id: 'w-2', title: 'Daily Agentbox analytics report', labels: ['founder'], result: '**Under the old definition, 16%.**' };
    expect(pageTitle(plain, 'Launch lead')).toBe('Daily Agentbox analytics report');
    expect(pageTitle({ ...plain, label: 'Analytics' }, null)).toBe('Analytics');
  });

  it('the page hands both its name and its answer the same name', () => {
    expect(thread).toMatch(/title=\{pageTitle\(item, teammate\?\.name\)\}/);
    expect(thread).toMatch(/<QueueAnswer text=\{clean\(newest\.text\)\} md=\{md\} name=\{pageTitle\(item, teammate\?\.name\)\} \/>/);
  });
});
