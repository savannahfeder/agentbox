// CLOSE ASKS BEFORE IT KEEPS AN EDIT, AND AN OLDER VERSION CAN BE RESTORED.
//
// Maya: she botched the Waitlist line of the investor update, pressed
// Close to throw it away, and it saved as v5 for the whole team. Going back to v4
// showed only Approve and Open outside, so there was no way back. Measured from
// the code: Back, Close and Escape all ran finishEdit, which posts the words, and
// an older version offered no action that makes it the newest. Close with unsaved
// changes now asks Save or Discard, and an older document offers "Restore this
// version", which saves its words as the next version so nothing is rewritten.
// Rendering needs real React, which a symlinked node_modules breaks, so these
// read the source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const view = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ArtifactView.tsx'), 'utf8');
const between = (a, b) => view.slice(view.indexOf(a), view.indexOf(b, view.indexOf(a)));

describe('leaving a document with changes', () => {
  const leave = between('const leave = ()', 'const liveQuotes');
  it('Close, Back and Escape ask when there are changes, rather than save', () => {
    expect(leave).toContain('setLeaveAsked(true)');
    expect(leave).not.toMatch(/void finishEdit\(\)\.then/);
  });
  it('with nothing changed, Close just leaves', () => {
    expect(leave).toMatch(/if \(!unsaved\(\)\)/);
  });
  it('Escape goes the same way as Close', () => {
    expect(view).toMatch(/else if \(editing\) leave\(\);/);
    expect(view).not.toMatch(/else if \(editing\) void finishEdit\(\);/);
  });
  it('the question offers Save and Discard, and Discard drops the draft', () => {
    expect(view).toContain('>Save as v{');
    expect(view).toContain('>Discard</button>');
    const discard = between('const discardEdit = ', 'const leave = ()');
    expect(discard).toMatch(/localStorage\.removeItem/);
    expect(discard).toContain('onClose()');
  });
  it('Done still saves', () => {
    expect(view).toMatch(/onClick=\{\(\) => void finishEdit\(\)\}>Done</);
  });
});

describe('restoring an older version', () => {
  const restore = between('const restore = async', 'const postNow');
  it('is offered on an older document only', () => {
    expect(view).toMatch(/const canRestore = !!\(onNewVersion && kind === 'markdown' && version && !isNewest && found === 'open'\)/);
    expect(view).toContain('Restore this version</button>');
  });
  it("saves the old words as the next version, on top of the newest, so history stays", () => {
    expect(restore).toMatch(/onNewVersion!?\(newest.name, text, newest.path, newest.id\)/);
    expect(restore).toContain('setSavedIn(');
  });
  it('says what it did, naming the version that is kept', () => {
    expect(restore).toMatch(/Restored v\$\{/);
  });
});
