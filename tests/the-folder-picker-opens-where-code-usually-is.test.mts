// THE FOLDER PICKER OPENS WHERE CODE USUALLY IS (w-fbe5e95dea, 2026-11-10).
//
// Both round-six testers opened Choose a folder and pressed Use this folder
// straight away. The picker had opened on the home folder, which it refuses,
// and the code folder was one level down. With no folder asked for, it now
// opens in the first usual code folder the home has, and on the home only when
// there is none.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { startFolder } from '../main/folders.mts';

const home = '/Users/someone';
const has = (...dirs: string[]) => (p: string) => dirs.map((d) => `${home}/${d}`).includes(p);

describe('startFolder', () => {
  it('opens in a usual code folder the home has', () => {
    expect(startFolder(home, has('code'))).toBe(`${home}/code`);
    expect(startFolder(home, has('Developer'))).toBe(`${home}/Developer`);
    expect(startFolder(home, has('Desktop', 'Desktop/dev'))).toBe(`${home}/Desktop/dev`);
  });
  it('takes the first of them when there are several', () => {
    expect(startFolder(home, has('Projects', 'code'))).toBe(`${home}/code`);
  });
  it('opens on the home when there is none', () => {
    expect(startFolder(home, has('Music', 'Desktop'))).toBe(home);
  });
  it('is what the picker asks with no folder', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    expect(ipc).toMatch(/at: at \?\? startFolder\(home\)/);
  });
});
