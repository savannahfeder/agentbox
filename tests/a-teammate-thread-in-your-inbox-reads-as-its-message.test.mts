// "Juno keeps coming to me with the thread name 'Add new feature' even though
// she's not doing anything related to that. I would just expect it to be
// treated like a message where I can see some of her text." The namer that
// gives every new thread a short name read Juno's run, opened on "Also want
// to add this too:" and a long pasted list, and called it "Add new feature";
// her answer, a table of impressions, never showed. Now a teammate's thread is
// drawn by what it said to you, its answer's first line.
import { describe, it, expect } from 'vitest';
import { rowTitle } from '../renderer/src/list-rules.ts';
import { wantsName } from '../main/row-label.mts';

const run = (over = {}) => ({
  id: 'w-78c2bb668d9d', status: 'open', title: 'Also want to add this too:', label: 'Add new feature',
  labels: ['founder', 'teammate:t-27e51e1609', 'hop:0'], body: 'Also want to add this too:\n\nRelaunch names', ...over,
});

describe('a teammate\'s thread in your inbox', () => {
  it('is drawn by the first line of what it said to you, without its markdown', () => {
    const said = run({ result: "**On impressions it's a dead heat, two posts each.**\n\nFour of your five screenshots show the bar." });
    expect(rowTitle(said)).toBe("On impressions it's a dead heat, two posts each.");
    expect(rowTitle(run({ result: '## Three posts for Monday\n\n1. ...' }))).toBe('Three posts for Monday');
  });

  it('before it has said anything, is its own title, never the namer\'s guess', () => {
    expect(rowTitle(run())).toBe('Also want to add this too:');
  });

  it('leaves every other thread named as before', () => {
    const mine = { title: 'fix the login thing', label: 'Fix the login button', labels: ['founder'], result: '**Fixed.**' };
    expect(rowTitle(mine)).toBe('Fix the login button');
  });

  // The namer names it once for its header and page (a-teammate-threads-name-stays-put-as-answers-arrive);
  // the row never draws that name.
  it('is not drawn by the namer\'s name, though the namer gives it one', () => {
    expect(wantsName(run({ label: '' }))).toBe(true);
    expect(rowTitle(run({ result: '**Two posts each.**' }))).toBe('Two posts each.');
  });
});
