// THE PAGE LEADS WITH THE AGENT'S ANSWER, NOT THE APP'S SHIPPED NOTE (w-65bcefb857).
//
// The founder's screenshot of "Plan screen copy and messaging bugs": the page's
// whole answer read "Shipped to main as 14c45bfb.", with the choices "Close
// this task" and "Also stop the composer sending while no plan is set up"
// under it, which that line does not ask. The ship queue writes that line on
// the row as a note, by the app (`wrote.note.source` is "system"), after the
// agent's own answer; the page took the newest note as the answer to lead with.
// Now the app's note is a quiet line under the agent's answer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appWrote } from '../renderer/src/one-thing-at-a-time.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const thread = fs.readFileSync(path.join(root, 'renderer/src/components/ItemThread.tsx'), 'utf8');
const shipped = { at: 9, text: 'Shipped to main as 14c45bfb.', field: 'note' };

describe('a note the app wrote', () => {
  it('is not the answer the page leads with', () => {
    expect(appWrote(shipped, { note: { ts: 9, source: 'system' } })).toBe(true);
  });
  it('but an agent\'s own checkpoint still is', () => {
    expect(appWrote({ ...shipped, text: 'Halfway: the tests pass.' }, { note: { ts: 9, source: 'agent' } })).toBe(false);
  });
  it('and so is any result', () => {
    expect(appWrote({ ...shipped, field: 'result' }, { note: { ts: 9, source: 'system' } })).toBe(false);
    expect(appWrote(null, { note: { ts: 9, source: 'system' } })).toBe(false);
  });
});

describe('the page', () => {
  it('leads with the agent\'s last answer instead', () => {
    expect(thread).toMatch(/const byApp = !!queue && appWrote\(outcome, item\.wrote\);/);
    expect(thread).toMatch(/newestAnswer\(events, byApp \? null : outcome\)/);
  });
  it('and says what the app did on a quiet line under it', () => {
    expect(thread).toMatch(/\{byApp && outcome && <p className="one-app-note">\{clean\(outcome\.text\)\}<\/p>\}/);
  });
});
