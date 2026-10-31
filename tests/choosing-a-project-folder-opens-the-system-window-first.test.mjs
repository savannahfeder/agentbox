// Onboarding drew the app's own folder picker on every computer, Mac included,
// so a new user met a bare list instead of the system's folder window. The
// drawn picker also opened on the home folder with "That is your whole home
// folder" already showing, and "Use this folder" ignored a path typed into the
// field but not yet entered. Measured on a fresh-user copy, 2026-10-29.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { folderToUse, pickerNote } from '../renderer/src/components/FolderPicker.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('onboarding', () => {
  const source = read('renderer/src/components/FirstRun.tsx');

  it('asks for the system folder window before drawing its own', () => {
    expect(source).toMatch(/browse\s*\}\s*=\s*await api\.chooseFolder/);
  });

  it('draws its own only when there is no system window, and before reading a refusal', () => {
    const atBrowse = source.indexOf('if (browse)');
    const atRefusal = source.indexOf('if (why)');
    expect(atBrowse).toBeGreaterThan(-1);
    expect(atRefusal).toBeGreaterThan(atBrowse);
    expect(source).toContain('<FolderPicker');
  });
});

describe('the note under the drawn picker', () => {
  const home = { at: '/home/you', home: '/home/you', refused: 'That is your whole home folder.' };

  it('does not warn about the folder it opened on', () => {
    expect(pickerNote(home, false)).toEqual({ refused: null, hint: 'Open the folder your project’s code is in.' });
  });

  it('warns once you walk into a folder that would be turned down', () => {
    expect(pickerNote(home, true)).toEqual({ refused: 'That is your whole home folder.', hint: null });
  });

  it('says nothing on a folder that can be used', () => {
    expect(pickerNote({ at: '/home/you/dev/shop', home: '/home/you', refused: null }, false)).toEqual({ refused: null, hint: null });
    expect(pickerNote({ at: '/home/you/dev/shop', home: '/home/you', refused: null }, true)).toEqual({ refused: null, hint: null });
  });

  it('says nothing before the first folder has been read', () => {
    expect(pickerNote(null, false)).toEqual({ refused: null, hint: null });
  });
});

describe('the folder "Use this folder" takes', () => {
  it('is a path typed in the field but not yet entered', () => {
    expect(folderToUse('/home/you/dev/shop', '/home/you')).toBe('/home/you/dev/shop');
  });

  it('is the folder shown when the field still names it', () => {
    expect(folderToUse('/home/you', '/home/you')).toBe('/home/you');
    expect(folderToUse('  /home/you ', '/home/you')).toBe('/home/you');
  });

  it('is the folder shown when the field was emptied', () => {
    expect(folderToUse('', '/home/you')).toBe('/home/you');
    expect(folderToUse('   ', '/home/you')).toBe('/home/you');
  });
});
