// THE DESIGN IS ROUNDED, AND SQUARE BOXES ONLY GO DOWN (w-fbe5e95dea, 2026-11-10).
//
// The founder, trying the new first run: "It's using a square button here on
// this page, which is not something we do anymore", and again in the
// walkthrough: "we're using these square components again. Our design system
// is rounded now ... I feel like agents make that mistake a lot." The welcome's
// Get started, its key caps, and the walkthrough's tip, glow and keys had a
// border and no border-radius. This counts every rule in the renderer's
// stylesheets that draws a border with no rounded corner (one it inherits from
// a rule for the same class counts as rounded). The first run, the setup, the
// walkthrough and the sign-in page may have none; everywhere else the count may
// only go down (tests/fixtures/square-boxes.json).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const NONE_ALLOWED = [
  'renderer/src/components/first-run.css',
  'renderer/src/components/setup-split.css',
  'renderer/src/components/tour.css',
  'renderer/src/team/sign-in.css',
];

const rounded = (d: string) => { const r = d.match(/border-radius\s*:\s*([^;]+)/); return !!r && !/^0(px)?$/.test(r[1].trim()); };
const lastCompound = (sel: string) => sel.trim().split(/[\s>+~]+/).pop() ?? '';
const classesOf = (compound: string) => [...compound.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);

/** The selectors in a stylesheet that draw a bordered box with square corners. */
export function squareBoxes(css: string): string[] {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), d: m[2] }));
  const roundClasses = rules.filter((r) => rounded(r.d)).flatMap((r) => r.sel.split(',').map((s) => classesOf(lastCompound(s))));
  const inherits = (sel: string) => sel.split(',').every((s) => {
    const mine = new Set(classesOf(lastCompound(s)));
    return roundClasses.some((c) => c.length > 0 && c.every((x) => mine.has(x)));
  });
  return rules
    .filter((r) => !r.sel.startsWith('@') && /(^|;|\s)border\s*:\s*(?!0\b|none\b)[^;]*\d+px/.test(r.d) && !rounded(r.d) && !inherits(r.sel))
    .map((r) => r.sel.replace(/\s+/g, ' '));
}

function cssFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    return e.isDirectory() ? cssFiles(p) : e.name.endsWith('.css') ? [p] : [];
  });
}

const counts = Object.fromEntries(cssFiles('renderer/src').map((f) => [f, squareBoxes(fs.readFileSync(path.join(root, f), 'utf8')).length]).filter(([, n]) => n));
const fixture = path.join(root, 'tests/fixtures/square-boxes.json');
if (process.env.WRITE_SQUARE_BOXES) fs.writeFileSync(fixture, `${JSON.stringify(counts, null, 2)}\n`);
const allowed: Record<string, number> = JSON.parse(fs.readFileSync(fixture, 'utf8'));

describe('squareBoxes', () => {
  it('finds a bordered box with no rounded corner', () => {
    expect(squareBoxes('.a { border: 1px solid red; }')).toEqual(['.a']);
    expect(squareBoxes('.a { border: 1px solid red; border-radius: 0; }')).toEqual(['.a']);
  });
  it('passes one that is rounded, here or by a rule for the same class', () => {
    expect(squareBoxes('.a { border: 1px solid red; border-radius: 8px; }')).toEqual([]);
    expect(squareBoxes('.x .a { border-radius: 50%; } .x .a.on { border: 1px solid red; }')).toEqual([]);
  });
  it('passes a line drawn on one side, or no border at all', () => {
    expect(squareBoxes('.a { border-top: 1px solid red; } .b { border: 0; } .c { border: none; }')).toEqual([]);
  });
});

describe('the renderer', () => {
  it('draws no square box in the first run, the setup, the walkthrough or the sign-in page', () => {
    for (const f of NONE_ALLOWED) expect(squareBoxes(fs.readFileSync(path.join(root, f), 'utf8')), f).toEqual([]);
  });
  it('draws no more square boxes anywhere than it did, file by file', () => {
    for (const [f, n] of Object.entries(counts)) expect(n, `${f} draws ${n} square boxes; round them (border-radius)`).toBeLessThanOrEqual(allowed[f] ?? 0);
  });
});
