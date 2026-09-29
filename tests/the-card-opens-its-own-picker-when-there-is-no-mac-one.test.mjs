// THE TWO SCREENS THAT ASK "WHERE IS ITS CODE?" HAVE TO WORK IN A TAB.
//
// tests/a-browser-tab-can-choose-a-folder.test.mjs proves the disk can be read
// and the channel answers. That is worth nothing on its own: if the card still
// shows a sentence saying the desktop app is needed, the browser route is still
// broken and the plumbing underneath it is decoration.
//
// So this is about the screens. The new project card and the first run's folder
// step both call `api.chooseFolder`. When there is no Mac chooser, that comes
// back `{ browse: true }`, and both have to open <FolderPicker> on that rather
// than treat it as a refusal or as a cancel.
//
// Rendered with react-dom/server, the way the other component tests here work.
// That draws one frame, which is enough: what is being asked is what the card
// puts on the screen when `browsing` is true, and whether the two call sites
// read `browse` at all.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import FolderPicker from '../renderer/src/components/FolderPicker.tsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');

describe('the picker the app draws itself', () => {
  const drawn = renderToStaticMarkup(
    createElement(FolderPicker, { startIn: '~', onPick: () => {}, onClose: () => {} }),
  );

  it('draws a way up, a path to type and a button to take the folder', () => {
    expect(drawn).toContain('fp-up');
    expect(drawn).toContain('fp-path');
    expect(drawn).toContain('Use this folder');
  });

  it('will not let a folder be taken before one has been read', () => {
    // The first frame has no listing yet, so the button has to be dead. A card
    // that offers "Use this folder" before it knows which folder is a card that
    // can hand back an empty path.
    expect(drawn).toMatch(/class="fp-use"[^>]*disabled/);
  });

  it('says nothing about needing the desktop app', () => {
    const source = read('renderer', 'src', 'components', 'FolderPicker.tsx');
    expect(drawn).not.toMatch(/desktop app/i);
    expect(source).not.toMatch(/Type or paste the path instead/);
  });
});

describe('the two screens that ask where the code is', () => {
  for (const [what, file] of [
    ['the new project card', ['renderer', 'src', 'components', 'NewProject.tsx']],
    ['the first run', ['renderer', 'src', 'components', 'Onboarding.tsx']],
  ]) {
    const source = read(...file);

    it(`${what} reads browse off the answer`, () => {
      expect(source).toMatch(/browse\s*\}\s*=\s*await api\.chooseFolder/);
    });

    it(`${what} opens the picker on it rather than treating it as a refusal`, () => {
      // The order matters. `browse` has to be handled BEFORE the refusal
      // branch, or a tab shows a sentence and never sees the picker.
      const atBrowse = source.indexOf('if (browse)');
      const atRefusal = source.indexOf('if (why)');
      expect(atBrowse).toBeGreaterThan(-1);
      expect(atRefusal).toBeGreaterThan(atBrowse);
      expect(source).toContain('FolderPicker');
    });
  }
});

describe('the answer the screen is reading', () => {
  it('is passed through by api.chooseFolder instead of being dropped', () => {
    const api = read('renderer', 'src', 'api.ts');
    expect(api).toMatch(/browse:\s*r\?\.browse === true/);
  });

  it('is on both doors, because the map both doors read has the channel', async () => {
    const { REQUEST_CHANNELS } = await import('../shared/bridge-map.mjs');
    expect(REQUEST_CHANNELS.listFolders).toBe('zero:list-folders');
  });
});
