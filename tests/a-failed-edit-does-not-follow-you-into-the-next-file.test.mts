// A FAILED EDIT DOES NOT FOLLOW YOU INTO THE NEXT FILE.
//
// A designer: after "Not saved" she closed the document and opened a film, and
// the film's window drew the document's words with "Not saved" over them until a
// reload. Maya's first Done looked saved for the same reason: her words were still
// on the page when she came back. Measured from the code: Back did nothing after a
// failed save, and the big view in Files stayed mounted across files, so its editing
// state carried over. Rendering needs real React, which a symlinked node_modules
// breaks, so these read the source; the round on screen is the proof of the look.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src', f), 'utf8');

describe('leaving a document that did not save', () => {
  const view = read('components/ArtifactView.tsx');
  it('a new file in Files is a new view', () => {
    expect(read('files/FilesPlace.tsx')).toContain('<OpenFile key={openKey} fileKey={openKey}');
  });
  it('a second press of Back leaves, keeping the draft', () => {
    const leave = view.slice(view.indexOf('const leave = ()'), view.indexOf('const liveQuotes'));
    expect(leave).toContain("editWord === 'Not saved'");
    expect(leave).toContain('onClose()');
    expect(leave).not.toMatch(/localStorage\.removeItem/);
  });
  it('Escape goes the way Close does, so after a failed save it leaves rather than try again', () => {
    expect(view).toMatch(/else if \(draftPlace\) setDraftPlace\(null\);\s*else leave\(\);/);
  });
  it('the failure says what the next press does', () => {
    expect(view).toContain('Close it again to leave');
  });
  it('stepping to another file or version after a failed save goes, keeping the draft', () => {
    const away = view.slice(view.indexOf('const away = '), view.indexOf('const leave = ()'));
    expect(away).toMatch(/editWord === 'Not saved'\) \{ dropSitting\(\); go\(\);/);
    const drop = view.slice(view.indexOf('const dropSitting = '), view.indexOf('const away = '));
    expect(drop).toMatch(/localStorage\.setItem/);
  });
});
