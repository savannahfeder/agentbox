// AN OPEN FILE CLOSES WITH A SMALL CROSS, LIKE THE SIDE PANE.
//
// A picture opened big showed, in one bar: the thread's name as a hidden way
// back, the file name, a PICTURE tag, the version arrows, "Side by side",
// "Approved by Jo", Approve, "Open outside" and "Back". Read off a 1440x900
// shot of the viewer with three versions and a teammate's approval
// (2026-11-08). The person asked for Back to be a small ×, Open outside to be
// its icon, and Side by side to go. The pane beside the chat already had those
// two marks, so the big viewer now uses the same ones.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const src = read('renderer/src/components/ArtifactView.tsx');
const header = src.slice(src.indexOf('<header className="av-top">'), src.indexOf('</header>', src.indexOf('<header className="av-top">')));
const buttons = header.match(/<button[\s\S]*?<\/button>/g) ?? [];

describe('the open file header', () => {
  it('ends with a cross that closes the file, drawn like the side pane\'s', () => {
    const last = buttons.at(-1) ?? '';
    expect(last).toMatch(/className="doc-mark"/);
    expect(last).toMatch(/onClick=\{leave\}/);
    expect(last).toMatch(/aria-label="Close"/);
    expect(last).toMatch(/title="Close \(esc\)"/);
    expect(last).toMatch(/<ArtifactControlGlyph kind="close" \/>/);
  });

  it('says no Back anywhere', () => {
    expect(header).not.toMatch(/>Back</);
    expect(header).not.toMatch(/av-leave/);
  });

  it('offers Open outside as its icon alone, just before the cross', () => {
    const outside = buttons.at(-2) ?? '';
    expect(outside).toMatch(/className="doc-mark"/);
    expect(outside).toMatch(/<ArtifactControlGlyph kind="open" \/>/);
    expect(outside).toMatch(/aria-label="Open outside"/);
    expect(outside).not.toMatch(/>Open outside</);
  });

  it('draws Share as the side pane\'s icon, not a labelled button', () => {
    expect(header).toMatch(/<ShareLink icon /);
  });

  it('has no Side by side', () => {
    expect(src).not.toMatch(/Side by side/);
    expect(src).not.toMatch(/setCompare|av-split|av-compare/);
    expect(read('renderer/src/components/artifact-view.css')).not.toMatch(/\.av-(split|compare|pane-head|pane-v|pane-name)\b/);
  });

  it('leaves out the thread-name link and the kind tag, so the name leads', () => {
    expect(header).not.toMatch(/className="av-back"/);
    expect(header).not.toMatch(/className="av-kind"/);
    expect(header.indexOf('className="av-name"')).toBeLessThan(header.indexOf('<button'));
  });

  it('keeps the version arrows and Approve', () => {
    expect(header).toMatch(/aria-label="Older version"/);
    expect(header).toMatch(/aria-label="Newer version"/);
    expect(header).toMatch(/'Approved' : 'Approve'/);
  });
});
