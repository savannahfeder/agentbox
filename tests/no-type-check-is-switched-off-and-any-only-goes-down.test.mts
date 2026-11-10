// NO TYPE CHECK IS SWITCHED OFF, AND `any` ONLY GOES DOWN (2026-11-07).
//
// The back end was renamed .mjs to .mts on 2026-11-06 with 5,650 strict tsc
// errors left in it, and the screens and the phone carried about 300 `any`s.
// Every one was typed by hand. The cheapest way to turn a red type check green
// again is a `@ts-ignore` or an `any`, and either one hides exactly the mistake
// the check is for, so this holds both lines:
//
// - No `@ts-ignore`, `@ts-nocheck` or `@ts-expect-error` in the app's source.
// - `any` written as a type stays at CEILING, which reached 0 on 2026-11-08.
//   Use a real type, a union, or `unknown` and narrow it.
//
// Measured by running this file before the typing (310 `any`, red) and after.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const AREAS = ['main', 'shared', 'mcp', 'renderer/src', 'mobile/src'];
const CEILING = 0;

const HATCH = /@ts-(?:ignore|nocheck|expect-error)\b/;
const ANY = /(?::|\bas|<|\||&)\s*any\b|,\s*any>/g;

function sources(): string[] {
  const out = execFileSync('git', ['ls-files', '--', ...AREAS], { cwd: root, encoding: 'utf8' });
  return out.split('\n').filter((f) => /\.(mts|ts|tsx)$/.test(f) && !f.endsWith('.d.mts') && fs.existsSync(path.join(root, f)));
}

const codeOnly = (line: string) => (/^\s*(?:\/?\*)/.test(line) ? '' : line).replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");

export function anysIn(text: string): number {
  return text.split('\n').reduce((n, line) => n + (codeOnly(line).match(ANY)?.length ?? 0), 0);
}

describe('no type check is switched off, and any only goes down', () => {
  const files = sources();

  it('reads the app source', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('switches the type check off nowhere', () => {
    const off = files.flatMap((f) => fs.readFileSync(path.join(root, f), 'utf8').split('\n')
      .map((line, i) => (HATCH.test(line) ? `${f}:${i + 1}` : null))
      .filter((x): x is string => x !== null));
    expect(off).toEqual([]);
  });

  it(`writes any as a type at most ${CEILING} times`, () => {
    const counts = files.map((f) => [f, anysIn(fs.readFileSync(path.join(root, f), 'utf8'))] as const).filter(([, n]) => n > 0);
    const total = counts.reduce((n, [, c]) => n + c, 0);
    expect(total, counts.map(([f, n]) => `${f}: ${n}`).join('\n')).toBeLessThanOrEqual(CEILING);
  });

  it('counts the any it should and not the word in prose or strings', () => {
    expect(anysIn('function f(x: any, y: any[]): Record<string, any> {}')).toBe(3);
    expect(anysIn('const v = w as any;')).toBe(1);
    expect(anysIn('let m: Map<string, any>;')).toBe(1);
    expect(anysIn('// is there any way')).toBe(0);
    expect(anysIn(' *  the same as | any message. */')).toBe(0);
    expect(anysIn("const s = 'any: thing';")).toBe(0);
    expect(anysIn('const company = anyone;')).toBe(0);
    expect(anysIn("window.addEventListener('keydown', any, true);")).toBe(0);
  });
});
