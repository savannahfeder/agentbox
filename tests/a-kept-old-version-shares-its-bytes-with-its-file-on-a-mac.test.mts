// A KEPT OLD VERSION SHARES ITS BYTES WITH ITS FILE ON A MAC.
//
// The version line keeps a copy of each version so a write over its path can
// be the next version. It asked for a clone ("so keeping a film costs no
// space") with COPYFILE_FICLONE, but on a Mac Node writes a full copy: on
// 2026-11-22 a 50 MB file copied that way took 50 MB of new space under both
// Node 22.14 and Electron's Node 24.22, while `cp -c` took none. The
// founder's 8,855 kept copies held 9.8 GB that were the same bytes as files
// beside them. Measured on the real version line, with the clone stood in
// for here because this disk cannot clone.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloneFile } from '../main/clone-file.mts';
import { versionLine } from '../main/version-line.mts';

const sha = (b: string) => crypto.createHash('sha256').update(b).digest('hex');
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-clone-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('copying a file to keep it', () => {
  it('on a Mac asks cp to clone it rather than writing the bytes again', async () => {
    const asked: string[][] = [];
    const src = path.join(root, 'a.mp4');
    fs.writeFileSync(src, 'film');
    await cloneFile(src, path.join(root, 'b.mp4'), { platform: 'darwin', run: async (cmd, args) => { asked.push([cmd, ...args]); fs.copyFileSync(src, path.join(root, 'b.mp4')); } });
    expect(asked).toEqual([['/bin/cp', '-c', src, path.join(root, 'b.mp4')]]);
  });

  it('on a Mac disk that cannot clone, still makes the copy', async () => {
    const src = path.join(root, 'a.mp4');
    fs.writeFileSync(src, 'film');
    await cloneFile(src, path.join(root, 'b.mp4'), { platform: 'darwin', run: async () => { throw new Error('clonefile failed'); } });
    expect(fs.readFileSync(path.join(root, 'b.mp4'), 'utf8')).toBe('film');
  });

  it('elsewhere copies without asking cp', async () => {
    const src = path.join(root, 'a.mp4');
    fs.writeFileSync(src, 'film');
    let asked = 0;
    await cloneFile(src, path.join(root, 'b.mp4'), { platform: 'linux', run: async () => { asked += 1; } });
    expect(asked).toBe(0);
    expect(fs.readFileSync(path.join(root, 'b.mp4'), 'utf8')).toBe('film');
  });
});

function cloningLine(platform: NodeJS.Platform = 'darwin') {
  const clones: string[] = [];
  const clone = async (src: string, to: string) => { clones.push(src); fs.copyFileSync(src, to); };
  const line = versionLine({ dir: path.join(root, 'versions'), clone, platform });
  return { line, clones };
}
const keptPath = (body: string, name: string) => path.join(root, 'versions', 'version-bytes', sha(body), name);

describe('the version line', () => {
  it('keeps a new version as a clone of its file', async () => {
    const { line, clones } = cloningLine();
    const src = path.join(root, 'docs', 'cut.mp4');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'first cut');
    const v = await line.add({ file: 'cut', src, name: 'cut.mp4', shared: false });
    expect(clones).toEqual([src]);
    expect(fs.readFileSync(v!.kept!, 'utf8')).toBe('first cut');
  });

  it('makes each kept copy that was a full copy again as a clone of its file, once', async () => {
    const src = path.join(root, 'docs', 'cut.mp4');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'first cut');
    const old = versionLine({ dir: path.join(root, 'versions'), clone: async (a, b) => { fs.copyFileSync(a, b); }, platform: 'linux' });
    await old.add({ file: 'cut', src, name: 'cut.mp4', shared: false });
    await new Promise((r) => setTimeout(r, 2200));

    const { line, clones } = cloningLine();
    expect(await line.shareKeptCopies()).toBe(1);
    expect(clones).toEqual([src]);
    expect(fs.readFileSync(keptPath('first cut', 'cut.mp4'), 'utf8')).toBe('first cut');
    expect(await cloningLine().line.shareKeptCopies()).toBe(0);
  });

  it('leaves a kept copy as it is when its file has since been written over', async () => {
    const src = path.join(root, 'docs', 'cut.mp4');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'first cut');
    const old = versionLine({ dir: path.join(root, 'versions'), clone: async (a, b) => { fs.copyFileSync(a, b); }, platform: 'linux' });
    await old.add({ file: 'cut', src, name: 'cut.mp4', shared: false });
    await new Promise((r) => setTimeout(r, 2200));
    fs.writeFileSync(src, 'second cut, longer');

    const { line } = cloningLine();
    expect(await line.shareKeptCopies()).toBe(0);
    expect(fs.readFileSync(keptPath('first cut', 'cut.mp4'), 'utf8')).toBe('first cut');
  });

  it('does nothing off a Mac, where a kept copy was never a missed clone', async () => {
    const src = path.join(root, 'docs', 'cut.mp4');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, 'first cut');
    const { line, clones } = cloningLine('linux');
    await line.add({ file: 'cut', src, name: 'cut.mp4', shared: false });
    clones.length = 0;
    expect(await line.shareKeptCopies()).toBe(0);
    expect(clones).toEqual([]);
  });
});
