// CLOSING TICKED THREADS NAMES WHAT IT CLOSED (w-8b637c7802).
//
// A tester ticked one thread and pressed E; the toast said "Done: 1 items",
// which named nothing, so she could not tell at a glance she had closed the
// right one. E on an unticked row already says "Done: <its name>", and Later
// says "Later: <name>" for one and "Later: N threads" for more. Measured by
// reading the toast the bulk close builds.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { manyOrOne } from '../renderer/src/done-word.ts';

describe('what a bulk close says it closed', () => {
  it('one thread, by its name', () => {
    expect(manyOrOne(['Write release notes'])).toBe('Write release notes');
  });
  it('two or more, as a count of threads', () => {
    expect(manyOrOne(['a', 'b'])).toBe('2 threads');
    expect(manyOrOne(['a', 'b', 'c'])).toBe('3 threads');
  });
  it('never says items', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    const close = app.slice(app.indexOf('const batchDone = '), app.indexOf('const batchDone = ') + 4000);
    expect(close).not.toMatch(/\$\{targets\.length\} items/);
    expect(close).toMatch(/manyOrOne\(/);
  });
});
