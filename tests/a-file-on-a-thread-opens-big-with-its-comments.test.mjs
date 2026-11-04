// A FILE ON A THREAD OPENS BIG, WITH ITS COMMENTS.
//
// Three things broke on the first look at the screen, none of them visible to a
// test of the rules: Enter did nothing in the comment box, because every key was
// taken at the window before React heard it; the browser copy had no way to save
// a comment, because the bridge did not name the call; and a document's words
// could not be selected, because the app turns selection off on the body. These
// read the wiring, since a window cannot be drawn here.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { reviewKind } from '../shared/artifact-marks.mjs';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mjs';

const root = path.join(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

describe('what opens big', () => {
  it('takes a picture, a film, a document, a pdf and a deck', () => {
    for (const f of ['a.png', 'a.mp4', 'a.md', 'a.pdf', 'a.pptx']) expect(reviewKind(`attachments/${f}`)).toBeTruthy();
  });
  it('leaves a page, a sheet and source code where they went', () => {
    for (const f of ['a.html', 'a.xlsx', 'a.mjs', 'a.docx']) expect(reviewKind(f)).toBeNull();
  });
});

describe('the wiring', () => {
  it('names the calls in the preload and on the browser bridge', () => {
    const preload = read('preload.cjs');
    for (const [name, channel] of [['fileMark', 'zero:file-mark'], ['teamMarkFile', 'zero:team-mark-file']]) {
      expect(preload).toContain(channel);
      expect(REQUEST_CHANNELS[name]).toBe(channel);
    }
  });
  it('lets keys reach the comment box, and only Escape is taken first', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toContain("window.addEventListener('keydown', escape, true)");
    expect(view).toContain("document.addEventListener('keydown', rest)");
    expect(view.match(/stopImmediatePropagation/g)).toHaveLength(1);
  });
  it('lets a document\'s words be selected', () => {
    expect(read('renderer/src/components/artifact-view.css')).toMatch(/\.av-doc \{[^}]*user-select: text/);
  });
  it('offers the agent only on your own computer: a teammate\'s copy has no way to send', () => {
    expect(read('renderer/src/threads/TeammateThread.tsx')).not.toContain('onSendToAgent');
  });
  it('keeps a phone on the picture view its fingers know', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/opensBig = \(path[^\n]*!onPhone\(\)/);
  });
});
