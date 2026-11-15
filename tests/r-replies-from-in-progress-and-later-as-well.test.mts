// R REPLIES FROM IN PROGRESS AND LATER AS WELL (w-4465054f04).
//
// In the cloud power test the app moved to In progress after each send, and
// R did nothing there: it worked only in the inbox. Whatever the tester typed
// next ran as shortcuts. Reproduced on a throwaway copy: on In progress, R and
// then "also do the tests" opened Later for the running thread on the "l" and
// put "so do the tests" in its box; one Enter more would have put the running
// thread off. L already worked on In progress and Later; R now works on the
// same tabs. Closed threads still open with Enter first.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replyKeyWorksIn } from '../renderer/src/list-rules';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const listSwitch = app.slice(app.indexOf('      switch (e.key) {'));
const rLine = listSwitch.split('\n').find((l) => l.includes("case 'r': case 'R':"));
const lBranch = listSwitch.slice(listSwitch.indexOf("case 'l': case 'L':"), listSwitch.indexOf('break;', listSwitch.indexOf("case 'l': case 'L':")));

describe('R on a row in the list', () => {
  it('opens the reply box in the inbox, In progress and Later', () => {
    for (const view of ['inbox', 'progress', 'snoozed']) expect(replyKeyWorksIn(view)).toBe(true);
  });

  it('does not on a closed thread, or anywhere else', () => {
    for (const view of ['done', 'board', 'list', '']) expect(replyKeyWorksIn(view)).toBe(false);
  });

  it('works on the same tabs as L', () => {
    const lViews = [...lBranch.matchAll(/view === '(\w+)'/g)].map((m) => m[1]);
    expect(lViews.sort()).toEqual(['inbox', 'progress', 'snoozed']);
    for (const view of lViews) expect(replyKeyWorksIn(view)).toBe(true);
  });

  it('is asked of that rule by the key handler, and opens the row it is on', () => {
    expect(rLine).toContain('replyKeyWorksIn(view)');
    expect(rLine).toContain('setFocused(pointed)');
    expect(rLine).toContain("setModal('reply')");
  });
});
