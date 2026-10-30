// A teammate's thread page drew its answer's bold first line as the page's big
// name and left it out under the Context, so it read nothing like any other
// thread (name, Context, bold answer line, body). The page took its name from
// rowTitle, which names a teammate's row after that same line, and QueueAnswer
// drops a headline equal to the name. Measured with the founder's screenshot of
// a Launch lead setup run beside an analytics report.
//
// Of five drawn ways to say who sent it, the founder picked the signed answer:
// the page is named after the run, and the teammate's mark, name and time sit
// above the bold line.
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
const by = { t: { name: 'Launch lead', letter: 'L' }, at: new Date(2026, 9, 30, 14, 5).getTime() };

describe("a teammate's thread page", () => {
  it('is named after what woke the teammate, not its answer', () => {
    expect(pageTitle(run())).toBe('Set up its job');
  });

  it('with no title, falls back to the name the list gives it', () => {
    expect(pageTitle(run({ title: '  ' }))).toBe(rowTitle(run({ title: '' })));
  });

  it('leaves the list row reading as its message', () => {
    expect(rowTitle(run())).toBe("Four questions are in the team chat; answer them and I'm set up as Launch lead.");
  });

  it('leaves every other thread named as the list names it', () => {
    const plain = { id: 'w-2', title: 'Daily Agentbox analytics report', labels: ['founder'], result: '**Under the old definition, 16%.**' };
    expect(pageTitle(plain)).toBe('Daily Agentbox analytics report');
    expect(pageTitle({ ...plain, label: 'Analytics' })).toBe('Analytics');
  });
});

describe("a teammate's answer", () => {
  const html = renderToStaticMarkup(h(QueueAnswer, { text: answer, md, name: pageTitle(run()), by }));

  it('keeps its bold line under the Context', () => {
    expect(html).toContain('<h1 class="one-q">Four questions are in the team chat; answer them and I&#x27;m set up as Launch lead.</h1>');
  });

  it("is signed with the teammate's mark, name and time, above the bold line", () => {
    const sign = html.indexOf('one-by');
    expect(sign).toBeGreaterThan(-1);
    expect(sign).toBeLessThan(html.indexOf('one-q'));
    expect(html).toMatch(/class="one-by"><i class="tq tq-hd"[^>]*>L<\/i><span>Launch lead<\/span><em>[^<]*2:05pm<\/em>/);
  });

  it('and an answer nobody signs has no signature', () => {
    expect(renderToStaticMarkup(h(QueueAnswer, { text: answer, md, name: 'Daily report' }))).not.toContain('one-by');
  });

  it('the page hands the summary and the answer the run name, and signs only a teammate run', () => {
    expect(thread).toMatch(/title=\{pageTitle\(item\)\}/);
    expect(thread).toMatch(/<QueueAnswer text=\{clean\(newest\.text\)\} md=\{md\} name=\{pageTitle\(item\)\} by=\{signer \? \{ t: signer, at: newest\.at \} : null\} \/>/);
    expect(thread).toMatch(/const signer = teammateId \? teammates\.get\(teammateId\) \?\? null : null;/);
  });
});
