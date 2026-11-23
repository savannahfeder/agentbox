// "I often have trouble identifying tasks from agent teammates because it
// shows me what the agent said rather than a nice summary, like other threads
// do." The founder's screenshot: In progress, three rows with short names and
// one reading "Head of Marketing  I added one line right where you said the
// question comes up: ..." A teammate's row took the first line of its latest
// answer (rowTitle), so it changed with every answer and read like no other
// row. Now it is named the way its open page already was: the namer's short
// name, or its own words cut to a few. The teammate's face and name still lead
// the row, and the answer is still on the page.
import { describe, it, expect } from 'vitest';
import { rowTitle } from '../renderer/src/list-rules.ts';
import { pageTitle } from '../renderer/src/one-thing-at-a-time.ts';
import { wantsName } from '../main/row-label.mts';

const run = (over = {}) => ({
  id: 'w-78c2bb668d9d', status: 'open', title: 'Add a line about using the tools you already have',
  labels: ['founder', 'teammate:t-27e51e1609', 'hop:0', 'from-chat'], ...over,
});
const said = '**I added one line right where you said the question comes up.**\n\nIt reads...';

describe("a teammate's thread in your inbox", () => {
  it('is drawn by the short name the namer gave it, not by what the teammate said', () => {
    const named = run({ label: 'Landing page tools line', wrote: { label: { ts: 1, source: 'agent' } }, result: said });
    expect(rowTitle(named)).toBe('Landing page tools line');
  });

  it('before it is named, is its own words cut to a few', () => {
    const name = rowTitle(run({ result: said }));
    expect(name).not.toMatch(/I added one line/);
    expect('Add a line about using the tools you already have'.toLowerCase()).toContain(name.toLowerCase());
  });

  it('keeps its name as answers arrive', () => {
    const before = rowTitle(run());
    expect(rowTitle(run({ result: said }))).toBe(before);
    expect(rowTitle(run({ result: '**Done, the page is live.**' }))).toBe(before);
  });

  it('is called in the inbox what it is called when opened', () => {
    for (const r of [run(), run({ result: said }), run({ label: 'Landing page tools line', result: said })]) {
      expect(rowTitle(r)).toBe(pageTitle(r));
    }
  });

  it('with no title at all, still falls back to the first line it said', () => {
    expect(rowTitle(run({ title: '', result: said }))).toBe('I added one line right where you said the question comes up.');
  });

  it('a rename wins', () => {
    const renamed = run({ label: 'Tools line', wrote: { label: { ts: 2, source: 'founder' } }, result: said });
    expect(rowTitle(renamed)).toBe('Tools line');
  });

  it('leaves every other thread named as before', () => {
    const mine = { title: 'fix the login thing', label: 'Fix the login button', labels: ['founder'], result: '**Fixed.**' };
    expect(rowTitle(mine)).toBe('Fix the login button');
  });

  it('is named by the namer like any other thread', () => {
    expect(wantsName(run({ label: '' }))).toBe(true);
  });
});
