// ATTACH OFFERS "FROM FILES", WITH THE SEARCH FILES HAS.
//
// Dev: his agent made cancel-1-before.png and cancel-2-after.png for
// Maya's task, and the only attach in her thread opened the Mac's file picker,
// so he retyped the result and wrote "Pictures are in Files (I could not attach
// them here from the app)". Measured by reading the reply boxes: FormatBar's
// clip called one onAttach, the disk picker, in the chat with a person, a group
// and a thread panel alike. Now the clip offers "From this computer" and "From
// Files", and From Files searches with filesShown, the rule Files itself uses.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { filesToAttach, attachmentOf } from '../renderer/src/files/from-files.ts';

const file = (name, over = {}) => ({ key: `k-${name}`, project: 'Lumen app', name, kind: /\.png$/.test(name) ? 'image' : 'markdown', versions: 1, at: 10, by: null, open: 0, approvedBy: [], sentIn: [], opened: `/store/lumen/${name}`, ...over });

describe('what From Files lists', () => {
  const files = [
    file('cancel-1-before.png', { at: 30 }),
    file('cancel-2-after.png', { at: 40 }),
    file('group-seat-picker.png', { at: 50 }),
    file('notes.md', { at: 20, project: 'Cancel flow' }),
  ];
  it('everything, newest first, before anything is typed', () => {
    expect(filesToAttach(files, '').map((f) => f.name)).toEqual(['group-seat-picker.png', 'cancel-2-after.png', 'cancel-1-before.png', 'notes.md']);
  });
  it('a word finds the files named for it, as Files finds them', () => {
    expect(filesToAttach(files, 'cancel').map((f) => f.name)).toEqual(['cancel-2-after.png', 'cancel-1-before.png']);
  });
  it('a word inside another word finds nothing', () => {
    expect(filesToAttach(files, 'ancel')).toEqual([]);
  });
  it('at most eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => file(`shot-${i}.png`, { at: i }));
    expect(filesToAttach(many, '')).toHaveLength(8);
  });
});

describe('what a pick attaches', () => {
  it('the newest version on this computer, as a picture when it is one', () => {
    expect(attachmentOf(file('cancel-2-after.png'))).toEqual({ name: 'cancel-2-after.png', srcPath: '/store/lumen/cancel-2-after.png', image: true });
    expect(attachmentOf(file('notes.md')).image).toBe(false);
  });
  it('a file not on this computer yet attaches nothing', () => {
    expect(attachmentOf(file('cancel-2-after.png', { opened: null }))).toBe(null);
  });
});

describe('the wiring', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('the clip offers both, and From Files opens the search', () => {
    const bar = read('renderer/src/team/FormatBar.tsx');
    expect(bar).toContain('From this computer');
    expect(bar).toContain('From Files');
    expect(bar).toMatch(/<FromFiles /);
  });
  it('a chat with a person, a group and a thread panel all offer it', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/<FormatBar [^>]*onFromFiles=/);
    expect(read('renderer/src/team/rooms/RoomChat.tsx')).toMatch(/onFromFiles=\{onPutFile \?/);
    expect(read('renderer/src/team/ThreadPanel.tsx')).toMatch(/onFromFiles=/);
  });
  it('the search is Files\' own', () => {
    expect(read('renderer/src/files/from-files.ts')).toMatch(/filesShown\(/);
  });
});
