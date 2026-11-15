// Skill uploads must arrive as regular files. Reject hostile archive entries
// before replacing a previous installation, including on a retried delivery.
import { beforeEach, afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { unpackSkillArchive, unpackFileArchive } from '../cloud/sandbox/server.mjs';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-archive-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
function archive(name, type = 'file') {
  const file = path.join(dir, 'skills.tgz');
  execFileSync('python3', ['-c', `import io, sys, tarfile
with tarfile.open(sys.argv[1], 'w:gz') as t:
 m = tarfile.TarInfo(sys.argv[2]); m.mode = 0o755
 kind = sys.argv[3]
 if kind == 'file':
  m.size = 4; t.addfile(m, io.BytesIO(b'test'))
 else:
  m.type = {'symlink':tarfile.SYMTYPE, 'hardlink':tarfile.LNKTYPE, 'device':tarfile.CHRTYPE}[kind]
  m.linkname = '../outside'; t.addfile(m)
`, file, name, type]);
  return file;
}

it('preserves executable files and replaces a previous complete installation on retry', async () => {
  const dest = path.join(dir, 'skills');
  await unpackSkillArchive(archive('taste/check.sh'), dest);
  expect(fs.readFileSync(path.join(dest, 'taste/check.sh'), 'utf8')).toBe('test');
  expect(fs.statSync(path.join(dest, 'taste/check.sh')).mode & 0o111).toBe(0o111);
  expect(fs.statSync(dest).mode & 0o777).toBe(0o755);
  await unpackSkillArchive(archive('taste/reference.md'), dest);
  expect(fs.existsSync(path.join(dest, 'taste/check.sh'))).toBe(false);
  expect(fs.readFileSync(path.join(dest, 'taste/reference.md'), 'utf8')).toBe('test');
});

it('keeps legacy phone checkpoints with hard-linked skill files readable', async () => {
  const source = path.join(dir, 'old'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'SKILL.md'), 'legacy'); fs.linkSync(path.join(source, 'SKILL.md'), path.join(source, 'reference.md'));
  const file = path.join(dir, '.skills.tgz'); execFileSync('tar', ['-czf', file, '-C', source, '-h', '.']);
  const dest = path.join(dir, 'skills');
  await unpackFileArchive(file, dest);
  expect(fs.readFileSync(path.join(dest, 'reference.md'), 'utf8')).toBe('legacy');
});

it('refuses traversal, absolute paths, links, and devices without touching the existing installation', async () => {
  const dest = path.join(dir, 'skills'); fs.mkdirSync(dest); fs.writeFileSync(path.join(dest, 'kept'), 'unchanged');
  for (const [name, type] of [['../outside', 'file'], [path.join(dir, 'absolute'), 'file'], ['alias', 'symlink'], ['alias', 'hardlink'], ['device', 'device']]) {
    await expect(unpackSkillArchive(archive(name, type), dest)).rejects.toThrow();
    expect(fs.readFileSync(path.join(dest, 'kept'), 'utf8')).toBe('unchanged');
  }
  expect(fs.existsSync(path.join(dir, 'outside'))).toBe(false);
  expect(fs.existsSync(path.join(dir, 'absolute'))).toBe(false);
});
