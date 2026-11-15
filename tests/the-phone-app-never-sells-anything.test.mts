// THE PHONE APP NEVER SELLS ANYTHING.
//
// The founder, 2026-10-24: "they should do all the payments and setup, etc.,
// on their computer. The mobile app is more like a company tool so we should
// never run into a situation where the app store tries to take a cut." Apple
// lets an app use what an account already has (App Review 3.1.3(b)) so long as
// the app itself offers nothing to buy and points nowhere to buy it. The cloud
// plans are sold on the desktop (renderer/src/components/Settings.tsx
// CloudPlansPage); this keeps every word of that out of the phone app.
//
// Read off the phone app's source: every quoted string and every run of text
// between JSX tags, so a word in a comment or a variable name never trips it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mobile', 'src');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.(tsx?|mjs)$/.test(d.name) ? [path.join(dir, d.name)] : []));

const SELLING = /\b(upgrade|subscribe|subscription|per month|a month|choose a plan|pick a plan|your plan|pricing|price|checkout|billing|buy|purchase|pay(?:ment)?|trial)\b|\$\s?\d|\d\s?\/\s?mo\b/i;

// What a person could read: quoted strings and the text between tags.
export function shownWords(source) {
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const out = [];
  for (const m of noComments.matchAll(/'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g)) out.push(m[1] ?? m[2] ?? m[3]);
  for (const m of noComments.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) out.push(m[1]);
  return out.map((s) => s.trim()).filter((s) => /[A-Za-z]{3,}\s+[A-Za-z]/.test(s));
}

describe('the phone app', () => {
  it('reads its own words, and finds some (the check is looking at something)', () => {
    const all = files(root).flatMap((f) => shownWords(fs.readFileSync(f, 'utf8')));
    expect(all).toContain('Where your messages go');
  });

  it('offers nothing to buy and points nowhere to buy it', () => {
    const found = [];
    for (const f of files(root)) {
      for (const words of shownWords(fs.readFileSync(f, 'utf8'))) if (SELLING.test(words)) found.push(`${path.relative(root, f)}: ${words}`);
    }
    expect(found).toEqual([]);
  });
});

describe('the check', () => {
  it('catches selling words in a string or between tags, and not in a comment or a name', () => {
    expect(shownWords(`const a = 'Upgrade to Pro now';`).some((w) => SELLING.test(w))).toBe(true);
    expect(shownWords(`<T>Choose a plan to keep going</T>`).some((w) => SELLING.test(w))).toBe(true);
    expect(shownWords(`<T>Only $20 for everything</T>`).some((w) => SELLING.test(w))).toBe(true);
    expect(shownWords(`// upgrade the parser later\nconst billingKey = useBilling();`).some((w) => SELLING.test(w))).toBe(false);
  });
});
