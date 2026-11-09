// AN OPEN FILE HAS BACK TOP LEFT AND "BESIDE THE CHAT" TOP RIGHT.
//
// A picture opened big showed, in one bar: the thread's name as a hidden way
// back, the file name, a PICTURE tag, the version arrows, "Side by side",
// "Approved by Jo", Approve, "Open outside" and "Back". Read off a 1440x900
// shot of the viewer with three versions and a teammate's approval
// (2026-11-08). The person picked a layout with a way back at the top left,
// Approve in the notes column, and, in place of a second close, the side
// pane's own full-screen toggle at the top right, which puts the file beside
// the chat. Documents already had that toggle; pictures and tables did not.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const src = read('renderer/src/components/ArtifactView.tsx');
const header = src.slice(src.indexOf('<header className="av-top">'), src.indexOf('</header>', src.indexOf('<header className="av-top">')));
const side = src.slice(src.indexOf('<aside className="av-side"'), src.indexOf('</aside>', src.indexOf('<aside className="av-side"')));
const buttons = header.match(/<button[\s\S]*?<\/button>/g) ?? [];

describe('the open file header', () => {
  it('starts with a back arrow that leaves the file', () => {
    const first = buttons[0] ?? '';
    expect(header.indexOf(first)).toBeLessThan(header.indexOf('className="av-name"'));
    expect(first).toMatch(/className="doc-mark av-back"/);
    expect(first).toMatch(/onClick=\{leave\}/);
    expect(first).toMatch(/aria-label="Back"/);
    expect(first).toMatch(/title="Back to the thread \(esc\)"/);
  });

  it('has no second way out: no cross and no Back word', () => {
    expect(header).not.toMatch(/kind="close"/);
    expect(header).not.toMatch(/>Back</);
  });

  it('ends with the side pane\'s full-screen toggle, which puts the file beside the chat', () => {
    expect(header).toMatch(/onBeside && version && <FocusControl style="corners-bare" focused onClick=\{\(\) => onBeside\(version\.path\)\} \/>/);
    expect(header.lastIndexOf('<FocusControl')).toBeGreaterThan(header.indexOf('aria-label="Open outside"'));
  });

  it('offers Open outside and Share as icons alone', () => {
    const outside = buttons.find((b) => b.includes('aria-label="Open outside"')) ?? '';
    expect(outside).toMatch(/className="doc-mark"/);
    expect(outside).not.toMatch(/>Open outside</);
    expect(header).toMatch(/<ShareLink icon /);
  });

  it('keeps the version arrows, and leaves Approve to the notes column', () => {
    expect(header).toMatch(/aria-label="Older version"/);
    expect(header).toMatch(/aria-label="Newer version"/);
    expect(header).not.toMatch(/Approve/);
    expect(side).toMatch(/className="av-verdict"/);
    expect(side).toMatch(/'Approved' : 'Approve'/);
  });

  it('has no Side by side, thread-name link or kind tag', () => {
    expect(src).not.toMatch(/Side by side/);
    expect(src).not.toMatch(/setCompare|av-split|av-compare/);
    expect(header).not.toMatch(/av-thread|className="av-kind"/);
    expect(read('renderer/src/components/artifact-view.css')).not.toMatch(/\.av-(split|compare|pane-head|pane-v|pane-name)\b/);
  });
});

describe('beside the chat', () => {
  it('a thread\'s file goes beside the chat, where its own toggle brings it back full screen', () => {
    expect(read('renderer/src/components/ThreadArtifacts.tsx')).toMatch(/onBeside=\{onBeside\}/);
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/onBeside=\{onOpenArtifact \? \(path\) => \{ setArtifact\(null\); onOpenArtifact\(path, 'beside'\); \} : undefined\}/);
  });
});
