// A thread was a 916pt column in a 1340pt pane, measured in the audit shots, and a
// document in it was a card whose one control unfolded it inside that column. Now
// the column is wider and the card opens the document in the big view with a click.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src', f), 'utf8');
const nav = read('workspace-navigation.css');
const widths = (sel) => [...nav.matchAll(new RegExp(String.raw`\[data-reading-width="balanced"\] \.${sel} \{ max-width:(\d+)px; \}`, 'g'))].map((m) => Number(m[1]));

describe('the reading column', () => {
  it('fills most of a 1440 window', () => {
    expect(widths('focus')[0]).toBeGreaterThanOrEqual(1160);
  });
  it('and a big display, without running edge to edge', () => {
    expect(nav).toMatch(/@media \(min-width: ?1800px\) \{[^}]*balanced[^}]*max-width:1360px/);
    expect(Math.max(...widths('focus'))).toBeLessThanOrEqual(1360);
  });
  it('the reply box stays lined up with the words: always 64 narrower', () => {
    const sheets = widths('focus');
    const boxes = widths('focus-dock-inner');
    expect(boxes).toEqual(sheets.map((w) => w - 64));
  });
});

describe('a document on a thread', () => {
  const one = read('components/OneThingAtATime.tsx');
  const preview = read('components/DocumentPreview.tsx');
  it('opens big, with the button and with a click on the page', () => {
    expect(one).toMatch(/<DocumentPreview[^>]*onOpen=\{onOpen\}/);
    expect(preview).toContain('Open full size');
    expect(preview).toMatch(/onClick=\{onOpen \? /);
  });
  it('a selection in the preview is not a click that takes you away', () => {
    expect(preview).toContain('getSelection');
  });
  it('a web page keeps its own unfolding, which nothing replaces', () => {
    expect(read('components/HtmlPreview.tsx')).toContain('alwaysExpandable');
    expect(preview).toContain('Show full document');
  });
  it('gets a real look before the fold', () => {
    expect(read('document-preview.css')).toMatch(/\.document-preview-frame \{ max-height: min\(720px, 66vh\)/);
  });
  it('shows the newest version once somebody edited it', () => {
    expect(read('components/Focus.tsx')).toContain('newestOfFamily(');
  });
});
