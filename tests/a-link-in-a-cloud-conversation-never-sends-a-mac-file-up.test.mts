// Weekly security audit, 2026-11-16. A cloud run's conversation archive was
// unpacked into the Mac's Claude projects folder with a plain `tar -xzf`, which
// keeps symlinks. A cloud agent left memory/notes.md as a link to a Mac path
// (the sandbox mirrors the Mac's paths); the next plain cloud run packed that
// memory folder with `tar -h`, which follows links, and sent the Mac file's
// bytes up. Measured on dummy files: a dummy gh token and a dummy SSH key both
// reached the bucket, the second through a linked transcript on --resume.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { layConversationArchive } from '../main/cloud/run.mts';
import { sendConversation } from '../main/cloud/reuse.mts';

describe('a link in a cloud conversation never sends a Mac file up', () => {
  let tmp: string, secret: string, archive: string, mac: string;
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-links-')));
    secret = path.join(tmp, 'home', '.config', 'gh', 'hosts.yml');
    fs.mkdirSync(path.dirname(secret), { recursive: true });
    fs.writeFileSync(secret, 'oauth_token: dummy-token-123\n');
    const cloud = path.join(tmp, 'cloud-projects');
    fs.mkdirSync(path.join(cloud, 'memory', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(cloud, 'memory', 'MEMORY.md'), '- the plan\n');
    fs.writeFileSync(path.join(cloud, 'sess-1.jsonl'), '{"a":1}\n');
    fs.symlinkSync(secret, path.join(cloud, 'memory', 'notes.md'));
    fs.symlinkSync(secret, path.join(cloud, 'sess-2.jsonl'));
    fs.symlinkSync(path.dirname(secret), path.join(cloud, 'memory', 'deep', 'gh'));
    archive = path.join(tmp, 'projects.tgz');
    execFileSync('tar', ['-czf', archive, '-C', cloud, '.']);
    mac = path.join(tmp, 'mac-projects');
    fs.mkdirSync(path.join(mac, 'memory'), { recursive: true });
    fs.writeFileSync(path.join(mac, 'memory', 'mine.md'), 'kept\n');
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('lays the files and folders and leaves out every link', async () => {
    await layConversationArchive(archive, mac);
    expect(fs.readFileSync(path.join(mac, 'memory', 'MEMORY.md'), 'utf8')).toBe('- the plan\n');
    expect(fs.readFileSync(path.join(mac, 'sess-1.jsonl'), 'utf8')).toBe('{"a":1}\n');
    expect(fs.readFileSync(path.join(mac, 'memory', 'mine.md'), 'utf8')).toBe('kept\n');
    for (const rel of ['memory/notes.md', 'sess-2.jsonl', 'memory/deep/gh']) {
      expect(fs.existsSync(path.join(mac, rel)) || isLink(path.join(mac, rel)), rel).toBe(false);
    }
  });

  it('refuses to send a conversation that is a link', async () => {
    const link = path.join(tmp, 'linked.jsonl');
    fs.symlinkSync(secret, link);
    const put: Buffer[] = [];
    const storage = { exists: async () => false, put: async (_k: string, b: Buffer) => { put.push(b); } };
    await expect(sendConversation(storage as never, link)).rejects.toThrow();
    expect(put.join('')).not.toContain('dummy-token-123');
  });
});

function isLink(p: string) { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } }
