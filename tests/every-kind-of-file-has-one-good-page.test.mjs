// EVERY KIND OF FILE HAS ONE GOOD PAGE.
//
// A page and a script had no big view at all, so they could take no
// comment; hello.py pressed in a thread went to the operating system, which on a
// browser copy shows nothing; a script in the pane was a bare <pre>; only a
// landscape PDF had a thumbnail strip; and a PDF tile drew its first page 220 px
// wide in a 124 px face, so most tiles were white with nothing legible on them.
// v6-card3-v5-vs-v6.png, about 4:1, kept a quarter of itself under object-fit
// cover and read as a slice of two headlines.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { otherFilesInLines, viewKind } from '../shared/artifact-marks.mjs';
import { coverFit, coverPageWidth, marksOnPages, otherFilesOpen, stripFor } from '../renderer/src/artifact-pins.ts';
import { whereALinkGoes } from '../renderer/src/link-click.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('which page a file gets', () => {
  it.each([['a.png', 'image'], ['a.mp4', 'film'], ['a.pdf', 'pdf'], ['a.pptx', 'deck'], ['a.md', 'markdown'], ['a.html', 'page'], ['a.HTM', 'page'], ['hello.py', 'code'], ['a.json', 'code']])('%s is a %s', (file, kind) => {
    expect(viewKind(file)).toBe(kind);
  });
  it('has none for what it cannot draw', () => {
    expect(viewKind('sheet.xlsx')).toBeNull();
    expect(viewKind('voice.mp3')).toBeNull();
    expect(viewKind(null)).toBeNull();
  });
});

describe('a script pressed in a thread', () => {
  it('opens in the pane', () => {
    expect(whereALinkGoes('hello.py')).toBe('pane');
    expect(whereALinkGoes('src/cart.mjs')).toBe('pane');
  });
  it('still goes outside with the new-tab key, or with no pane', () => {
    expect(whereALinkGoes('hello.py', { metaKey: true })).toBe('outside');
    expect(whereALinkGoes('hello.py', {}, { pane: false })).toBe('outside');
  });
  it('leaves what nothing here can draw outside', () => {
    expect(whereALinkGoes('sheet.xlsx')).toBe('outside');
  });
  it('colours its lines and numbers them, in the pane as on the big page', () => {
    expect(read('renderer/src/components/DocPane.tsx')).toMatch(/<CodeFile /);
    expect(read('renderer/src/components/ArtifactStage.tsx')).toMatch(/<CodeFile /);
    const code = read('renderer/src/components/CodeFile.tsx');
    expect(code).toMatch(/tokenize\(/);
    expect(code).toMatch(/code-file-n/);
  });
});

describe('a page', () => {
  it('is framed in a sandbox, and takes no top-level navigation or popups', () => {
    const stage = read('renderer/src/components/ArtifactStage.tsx');
    const frames = stage.match(/<iframe[^>]*>/g) ?? [];
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame).toMatch(/sandbox=/);
      expect(frame).not.toMatch(/top-navigation|allow-popups/);
    }
    // Words with no address of their own run with no origin at all.
    expect(stage).toMatch(/srcDoc=\{text[^}]*\} sandbox="allow-scripts"/);
  });
  it('opens big from Files, not in the pane that takes no comments', () => {
    expect(read('renderer/src/files/FilesPlace.tsx')).not.toMatch(/f\.kind === 'page' \|\| f\.kind === 'code'/);
  });
  it('is in Files when a person attached it, not when a person only named it', () => {
    const lines = [{ source: 'founder', patch: { body: 'See [hello.py](attachments/x-hello.py) and `other.py`.' } }];
    expect(otherFilesInLines(lines).map((f) => f.path)).toEqual(['attachments/x-hello.py']);
  });
  it('joins the view only when it is the one opened or has comments on it', () => {
    const lines = [{ source: 'agent', patch: { note: 'See `page.html`, `hello.py` and `nope.py`.' } }];
    const others = otherFilesInLines(lines);
    expect(otherFilesOpen(others, 'hello.py', []).map((f) => f.path)).toEqual(['hello.py']);
    expect(otherFilesOpen(others, null, [{ file: 'page.html' }]).map((f) => f.path)).toEqual(['page.html']);
    expect(otherFilesOpen(others, null, [])).toEqual([]);
  });
});

describe('the strip of thumbnails', () => {
  it('is on every PDF of more than one page, whichever way it stands', () => {
    expect(stripFor({ fit: true, landscape: true, count: 2 })).toBe(true);
    expect(stripFor({ fit: true, landscape: false, count: 2 })).toBe(true);
  });
  it('is not on one page, nor where pages scroll in a narrow pane', () => {
    expect(stripFor({ fit: true, landscape: false, count: 1 })).toBe(false);
    expect(stripFor({ fit: false, landscape: true, count: 9 })).toBe(false);
  });
  it('marks the slides that have comments, and not resolved ones', () => {
    const notes = [{ place: { kind: 'page', n: 2 } }, { place: { kind: 'page', n: 2 } }, { place: { kind: 'page', n: 5 }, resolved: true }, { place: { kind: 'whole' } }];
    expect(marksOnPages(notes)).toEqual(new Map([[2, 2]]));
  });
});

describe('a tile', () => {
  it('shows a PDF as a whole small page, with air round it', () => {
    expect(coverPageWidth({ w: 220, h: 124 }, 0.77)).toBeCloseTo((124 - 16) * 0.77);
    expect(coverPageWidth({ w: 300, h: 225 }, 0.77)).toBeLessThan(200);
  });
  it('fits a wide page by its width', () => {
    expect(coverPageWidth({ w: 220, h: 124 }, 16 / 9)).toBeCloseTo(220 * 0.84);
  });
  it('draws nothing before it is measured', () => {
    expect(coverPageWidth({ w: 0, h: 0 }, 1)).toBe(0);
  });
  it('crops an ordinary picture to fill', () => {
    expect(coverFit({ w: 1600, h: 1000 }, { w: 300, h: 200 })).toBe('cover');
    expect(coverFit({ w: 1000, h: 1000 }, { w: 300, h: 200 })).toBe('cover');
  });
  it('shows a whole picture when a crop would lose over 40% of it', () => {
    expect(coverFit({ w: 2500, h: 1000 }, { w: 300, h: 200 })).toBe('cover');
    expect(coverFit({ w: 2600, h: 1000 }, { w: 300, h: 200 })).toBe('contain');
    expect(coverFit({ w: 4000, h: 1000 }, { w: 300, h: 200 })).toBe('contain');
    expect(coverFit({ w: 1000, h: 3000 }, { w: 300, h: 200 })).toBe('contain');
  });
  it('crops before the picture is measured', () => {
    expect(coverFit({ w: 0, h: 0 }, { w: 300, h: 200 })).toBe('cover');
  });
});
