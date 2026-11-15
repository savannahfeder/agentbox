// THE CHATS STEP ASKS IN ONE SHORT LINE (w-fbe5e95dea, 2026-11-10).
//
// The founder on the setup's chats step: "too much text, rows go over etc
// looks messy". The heading ran over four lines at 1440 by 900 ("Add the
// agents already on this computer." and a grey "What they send you lands in
// your inbox."), and every row carried its project as well as its age. Now
// the heading is one line with no second one, and a row says only how long ago.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
const firstRun = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');

describe('the chats step in the setup', () => {
  it('has a heading short enough for one line, and no second line', () => {
    const head = split.match(/if \(step === 'chats'\) \{\n\s+head = \['([^']*)', '([^']*)'\];/);
    expect(head).not.toBeNull();
    expect(head![1]).toBe('Add your recent agents.');
    expect(head![1].length).toBeLessThanOrEqual(26);
    expect(head![2]).toBe('');
  });
  it('says only how long ago beside each chat', () => {
    expect(split).toMatch(/<span className="ss-meta">\{said\(t\.when\)\}<\/span>/);
    expect(split).not.toMatch(/ss-meta">[^<]*nameOf/);
  });
  it('no longer takes a project namer it does not use', () => {
    expect(split).not.toMatch(/nameOf: \(folder: string\) => string;/);
    expect(firstRun).not.toMatch(/<SetupSplit [^>]*nameOf=/);
  });
});
