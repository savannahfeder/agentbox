// A FILE THAT CANNOT BE FOUND OFFERS NO APPROVE AND NO COMMENT BOX.
//
// launch-film-shot-list.md "could not be found" for its owner, and
// the viewer still offered Approve and "Write a comment" beside the message. A
// press on Approve recorded an approval of a file nobody had seen. Measured in
// ArtifactView: Approve showed whenever there was a version and someone signed
// in, and the comment box always; what the stage found never reached them.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { viewOffers } from '../renderer/src/artifact-pins.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('what the view offers', () => {
  it('Approve and a comment for a file on screen', () => {
    expect(viewOffers('open', true)).toEqual({ approve: true, comment: true });
  });
  it('neither for a file that could not be found or opened', () => {
    expect(viewOffers('gone', true)).toEqual({ approve: false, comment: false });
  });
  it('neither while the file is still on its way or being looked for', () => {
    expect(viewOffers('coming', true)).toEqual({ approve: false, comment: false });
    expect(viewOffers('looking', true)).toEqual({ approve: false, comment: false });
  });
  it('a comment but no Approve with nobody signed in', () => {
    expect(viewOffers('open', false)).toEqual({ approve: false, comment: true });
  });
});

describe('the wiring', () => {
  it('the stage says what it found, and the view hides what it cannot offer', () => {
    const stage = read('renderer/src/components/ArtifactStage.tsx');
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(stage).toMatch(/onFound\?\.\('gone'\)/);
    expect(view).toMatch(/offers\.approve &&/);
    expect(view).toMatch(/offers\.comment &&/);
    expect(view).toMatch(/onOutside && version && found === 'open'/);
  });
});
