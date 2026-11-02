// AN OLDER VERSION OF A DOCUMENT CAN BE RESTORED.
//
// Maya: she botched the Waitlist line of the investor update and it saved as v5
// for the whole team. Going back to v4 showed only Approve and Open outside, so
// there was no way back. Measured from the code: an older version offered no
// action that makes it the newest. An older document now offers "Restore this
// version", which saves its words as the next version so nothing is rewritten.
// Since documents save as you type, this is how an edit is taken back
// (a-document-saves-as-you-type-with-no-edit-or-done.test.mjs).
// Rendering needs real React, which a symlinked node_modules breaks, so these
// read the source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const view = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ArtifactView.tsx'), 'utf8');
const between = (a, b) => view.slice(view.indexOf(a), view.indexOf(b, view.indexOf(a)));

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
