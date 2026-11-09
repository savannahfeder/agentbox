// THE LIST DID NOT SAY WHAT IT WAS SHOWING (w-93b3a1a796, 2026-10-23). Once
// the tray counted only threads that started waiting after you last left the
// app, the founder pointed at it and read a short list beside a Needs you of
// 25, and did not see why: "when i hover it should be clearer it's showing the
// new stuff". Of five wordings drawn on her screens she picked a heading,
// "New since you left", above the new threads.
//
// Measured against the tray page itself: the heading sits first in the list,
// only when there is something new to head, and in the quiet grey of the
// list's other secondary lines.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');
const body = page.slice(page.indexOf('function CardBody'), page.indexOf('function Card('));

describe('the list heads what is new', () => {
  it('says "New since you left", in her words', () => {
    expect(body).toContain('New since you left');
  });

  it('puts the heading before the new threads', () => {
    expect(body.indexOf('New since you left')).toBeLessThan(body.indexOf('lines.map('));
  });

  it('heads only a list that has something new in it', () => {
    expect(body).toMatch(/lines\.length > 0 && <div className="ct-quiet ct-static ct-head">New since you left<\/div>/);
  });

  it('draws the heading in the quiet grey, a little tighter to the rows it heads', () => {
    const rule = css.match(/\.ct-head\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/padding-top/);
    expect(rule).toMatch(/padding-bottom/);
    expect(rule).not.toMatch(/color/);
  });

  it('keeps the line for what was already waiting', () => {
    expect(body).toMatch(/and \{state\.before\} from before/);
  });
});
