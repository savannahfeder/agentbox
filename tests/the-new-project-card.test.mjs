// THE NEW PROJECT CARD, hers and approved verbatim. The card she rejected
// asked three things in sixty words. This one is the new-task card's shape:
// one line typed, one sentence under it, one button, eleven words.
//
// What is pinned here is the SENTENCE, because the sentence is the whole card.
// It has to be true in every state: a folder that will be made says so, a
// folder that is already there does not claim to be new, and cleared words
// promise no folder at all.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSlug, proposedFolder, shortFolder } from '../renderer/src/project-folder';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const card = fs.readFileSync(path.join(root, 'renderer/src/components/NewProject.tsx'), 'utf8');

describe('the folder proposed from the name', () => {
  it('proposes <parent>/<name>, and no longer inside the guarded Desktop', () => {
    // It was `~/Desktop/dev/homebase` until 2026-08-24, and Desktop is one of
    // the seven folders macOS guards: the first project anybody made through
    // this card asked the system for their Desktop.
    expect(proposedFolder('Homebase')).toBe('~/dev/homebase');
    expect(proposedFolder('Homebase')).not.toContain('Desktop');
  });

  it('puts it beside the projects they already have, when they have some', () => {
    expect(proposedFolder('Homebase', '~/code')).toBe('~/code/homebase');
    expect(proposedFolder('Homebase', '/Users/esther/work/')).toBe('/Users/esther/work/homebase');
  });

  it('slugs a name exactly the way the store slugs the project directory', () => {
    // Both sides must run the SAME expression; if they drift, the code folder
    // ends up named one thing and the project another. This is the store's
    // copy, read out of main/store.mjs and run here.
    const src = fs.readFileSync(path.join(root, 'main/store.mjs'), 'utf8');
    const line = src.match(/const slug = name\.toLowerCase\(\)([^;]*);/)[0];
    // eslint-disable-next-line no-new-func
    const storeSlug = new Function('name', `${line} return slug;`);
    for (const name of ['Homebase', 'The Frontier', 'Harbour (2)', '  spaced  out  ', 'Zero!!']) {
      expect(proposedFolder(name)).toBe(`~/dev/${storeSlug(name)}`);
    }
  });

  it('proposes nothing at all for a name with no letters in it', () => {
    expect(proposedFolder('')).toBe(null);
    expect(proposedFolder('   ')).toBe(null);
    expect(proposedFolder('!!!')).toBe(null);
  });
});

describe('a path a person can read', () => {
  it('writes the home directory as ~, the way the rail and Settings already do', () => {
    expect(shortFolder('/Users/you/Desktop/dev/house')).toBe('~/Desktop/dev/house');
    expect(shortFolder('/opt/elsewhere')).toBe('/opt/elsewhere');
  });

  it('exports the slug the card and the store share', () => {
    expect(projectSlug('The Frontier')).toBe('the-frontier');
  });
});

describe('the one sentence on the card', () => {
  it('says "a new folder" only when the folder is not there yet', () => {
    expect(card).toContain("exists ? '.' : ', a new folder.'");
  });

  it('never calls a folder chosen by hand a new one, because the chooser listed it', () => {
    expect(card).toContain('if (chosen) { setExists(true); return; }');
  });

  it('offers the empty clause when there is no folder, which is also the cleared state', () => {
    expect(card).toContain('a folder you choose');
  });
});

describe('nothing on this card is pasted', () => {
  it('has exactly one control besides the button, and it opens the Mac chooser', () => {
    expect(card).toContain('api.chooseFolder');
    // So there is no text field for a path anywhere on the card; the only
    // input is the name.
    expect(card.match(/<input/g)?.length).toBe(1);
    expect(card).toContain('placeholder="What is the project called?"');
  });

  it('treats a cancelled chooser as no answer, changing nothing', () => {
    expect(card).toContain('if (!picked) return;');
  });

  it('sends the folder it is showing, so what she read is what gets made', () => {
    expect(card).toContain('onCreate({ name: name.trim(), repoPath: folder })');
  });
});
