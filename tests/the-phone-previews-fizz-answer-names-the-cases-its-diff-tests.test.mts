// The phone preview's "Make fizz(15) say FizzBuzz" answer said it added "a test
// for 3, 5 and 15", while the diff it ships tests 15, 9 and 7. A tester reviewing
// the change on 2026-11-20 logged it as a wrong answer. Measured by reading both
// fixtures: every number the answer names must be a case the test file checks.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const preview = readFileSync(new URL('../mobile/src/lib/preview.ts', import.meta.url), 'utf8');
const files = readFileSync(new URL('../mobile/src/lib/preview-files.mjs', import.meta.url), 'utf8');

const answer = preview.match(/const fizzResult = '([^']*)'/)?.[1] ?? '';
const named = (answer.match(/tests? for ([\d, and]+)\./)?.[1] ?? '').match(/\d+/g) ?? [];
const tested = new Set([...files.matchAll(/expect\(fizz\((\d+)\)\)/g)].map((m) => m[1]));

test('the answer names the cases it tested', () => {
  expect(named.length).toBeGreaterThan(0);
  expect(tested.size).toBeGreaterThan(0);
  for (const n of named) expect(tested, `the answer names ${n}`).toContain(n);
});

test('a case the diff does not test is not named', () => {
  expect(named).not.toContain('5');
  expect(named).not.toContain('3');
});
