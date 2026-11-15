// "In light mode the code syntax highlighting doesn't work. It's pretty much
// all gray ... there are variables being instantiated and functions being run,
// and yet we're not highlighting those." (2026-10-05, with two screenshots of
// a change to CodeArtifact.tsx.)
//
// Measured on the line in her screenshot,
//   const [drawn, setDrawn] = useState<ReadonlySet<number>>(() => {
// the colouring gave 2 of its 9 words a colour (`const`, `ReadonlySet`): the
// call, the two names being made and `number` were ink. And in light mode a
// string was the same green as an added line (#2f7d4e both), so on every added
// line the strings vanished into the band.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { tokenize } from '../renderer/src/code-artifact.ts';

const kinds = (line) => tokenize(line).filter((t) => t.c).map((t) => `${t.c}:${t.s}`);
const kindOf = (line, word) => tokenize(line).find((t) => t.s === word)?.c || null;

describe('a function being run is coloured', () => {
  it('a call, a method call and a call with a type argument', () => {
    expect(kindOf('const plan = fillNext(files, drawn)', 'fillNext')).toBe('fn');
    expect(kindOf('files.findIndex((f) => f.path === startAt)', 'findIndex')).toBe('fn');
    expect(kindOf('useState<ReadonlySet<number>>(() => {', 'useState')).toBe('fn');
    expect(kindOf('setDrawn ((n) => n + 1)', 'setDrawn')).toBe('fn');
  });

  it('a function being defined, in JavaScript and in Python', () => {
    expect(kinds('export function hunkView(rows) {')).toEqual(['kw:export', 'kw:function', 'fn:hunkView']);
    expect(kinds('def run(self, n):')).toEqual(['kw:def', 'fn:run']);
  });

  it('a keyword followed by a bracket stays a keyword', () => {
    expect(kinds('if (drawn >= files.length) return;')).toEqual(['kw:if', 'kw:return']);
    expect(kindOf('while (i < n) {', 'while')).toBe('kw');
  });

  it('a comparison is not a type argument', () => {
    // `a < b && c > (d)` reads like `a<...>(` to a careless scan.
    expect(kindOf('if (a < b && c > (d)) x();', 'a')).toBe(null);
    expect(kindOf('if (a < b && c > (d)) x();', 'c')).toBe(null);
  });

  it('a property that is read, not run, keeps its ink', () => {
    expect(kindOf('files.findIndex((f) => f.path === startAt)', 'path')).toBe(null);
    expect(kindOf('if (drawn.size >= files.length) return;', 'size')).toBe(null);
  });
});

describe('a name being made is coloured', () => {
  it('const, let and var', () => {
    expect(kindOf('const plan = fillNext(files)', 'plan')).toBe('def');
    expect(kindOf('  let state = { ...EMPTY };', 'state')).toBe('def');
    expect(kindOf('var n = 1', 'n')).toBe('def');
  });

  it('every name in an array or object pattern, and the new name when one is renamed', () => {
    const line = 'const [drawn, setDrawn] = useState<ReadonlySet<number>>(() => {';
    expect(kinds(line)).toEqual(['kw:const', 'def:drawn', 'def:setDrawn', 'fn:useState', 'typ:ReadonlySet', 'typ:number', 'kw:=>']);
    expect(kinds('const { a: renamed, b } = x;')).toEqual(['kw:const', 'def:renamed', 'def:b']);
  });

  it('a name that is only used, not made, keeps its ink', () => {
    expect(kindOf('plan = fillNext(files)', 'plan')).toBe(null);
    expect(kindOf('const plan = files', 'files')).toBe(null);
  });
});

describe('the rest of what was grey', () => {
  it('a constant in capitals, and the built-in types', () => {
    expect(kindOf('fillNext(files, drawn, BATCH_ROWS)', 'BATCH_ROWS')).toBe('con');
    expect(kindOf('(h: number) => void', 'number')).toBe('typ');
    expect(kindOf('let s: string = ""', 'string')).toBe('typ');
    // One capital letter is a type parameter or a class, not a constant.
    expect(kindOf('function id<T>(x: T): T', 'T')).toBe('typ');
  });

  it('the inside lines of a /** */ comment are comment, not capitals and calls', () => {
    // Measured in the first picture of this fix: ` * A Z ON A TASK SHOWS IN ITS
    // THREAD (w-c78d1e1607). One mark` drew eight words as constants and types.
    expect(kinds('   * A Z ON A TASK SHOWS IN ITS THREAD (w-c78d1e1607). One')).toEqual(['com:* A Z ON A TASK SHOWS IN ITS THREAD (w-c78d1e1607). One']);
    expect(kinds('   */')).toEqual(['com:*/']);
    expect(kinds(' *')).toEqual(['com:*']);
    // A pointer, and a multiplication in the middle of a line, are not comments.
    expect(kinds('*ptr = 1;').some((k) => k.startsWith('com:'))).toBe(false);
    expect(kinds('const area = w * h').some((k) => k.startsWith('com:'))).toBe(false);
  });

  it('never loses a character of a line', () => {
    for (const line of [
      'const [drawn, setDrawn] = useState<ReadonlySet<number>>(() => {',
      "const { a: renamed, b } = x; // done",
      'if (a < b && c > (d)) x();',
      'def run(self, n):',
      '',
    ]) expect(tokenize(line).map((t) => t.s).join('')).toBe(line);
  });
});

describe('a string stays readable on an added line', () => {
  const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
  // Every block that sets the code colours: the light root and the dark one.
  const blocks = [...css.matchAll(/--code-plus:\s*([^;]+);[\s\S]*?--code-str:\s*([^;]+);/g)];

  it('is not the colour of the added line under it, in light or in dark', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const [, plus, str] of blocks) expect(str.trim().toLowerCase()).not.toBe(plus.trim().toLowerCase());
  });

  it('every new kind has a colour in the stylesheet', () => {
    for (const c of ['fn', 'def', 'con']) {
      expect(css).toMatch(new RegExp(`\\.t-${c}\\s*\\{\\s*color:\\s*var\\(--code-${c}\\)`));
      expect((css.match(new RegExp(`--code-${c}:`, 'g')) ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });
});
