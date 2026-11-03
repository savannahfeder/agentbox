// AN OPEN FILE HAS A BACK BUTTON IN ITS TOP RIGHT CORNER.
//
// A picture opened from a thread showed Approve, Open outside and a bare ×
// in the top right, and the only arrow back sat in the top-left corner beside
// the Mac window's buttons. Read off a screenshot of the real app (2026-11-03):
// nobody saw a way back. The header's last control is now a button that says
// Back, drawn like Approve and Open outside, and the thread's name on the left
// stays a way back without a second arrow.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ArtifactView.tsx'), 'utf8');
const header = src.slice(src.indexOf('<header className="av-top">'), src.indexOf('</header>', src.indexOf('<header className="av-top">')));
const buttons = header.match(/<button[^>]*>.*?<\/button>/g) ?? [];

describe('the open file header', () => {
  it('ends with a button that says Back and leaves the file', () => {
    const last = buttons.at(-1) ?? '';
    expect(last).toMatch(/className="av-btn av-leave"/);
    expect(last).toMatch(/onClick=\{leave\}/);
    expect(last).toMatch(/>Back</);
    expect(last).toMatch(/title="Back \(esc\)"/);
  });

  it('draws Back with an arrow, like the other buttons carry a glyph', () => {
    expect(buttons.at(-1)).toMatch(/<NoteGlyph name="back" \/>/);
    expect(fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/NoteGlyphs.tsx'), 'utf8')).toMatch(/^\s*back: /m);
  });

  it('has no bare × in the corner any more', () => {
    expect(header).not.toMatch(/av-close/);
    expect(header).not.toMatch(/<CrossIcon/);
  });

  it('keeps the thread name as a way back, without a second arrow', () => {
    const crumb = buttons.find((b) => b.includes('className="av-back"')) ?? '';
    expect(crumb).toMatch(/onClick=\{leave\}/);
    expect(crumb).toMatch(/av-thread/);
    expect(crumb).not.toMatch(/←/);
  });

  it('sits after Open outside, at the far right', () => {
    expect(header.indexOf('Open outside')).toBeGreaterThan(-1);
    expect(header.indexOf('>Back<')).toBeGreaterThan(header.indexOf('Open outside'));
  });
});
