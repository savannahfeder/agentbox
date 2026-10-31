// Codex cloud runs omitted installed skills. Exercise the real snapshotter,
// including linked installations, changed bytes, and files that must stay local.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotSkills } from '../main/cloud/skills.mjs';

let home; let snapshots;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-skills-')); snapshots = []; });
afterEach(() => { for (const s of snapshots) s.close(); fs.rmSync(home, { recursive: true, force: true }); });
const put = (rel, body = 'reference', mode = 0o644) => {
  const p = path.join(home, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, { mode }); return p;
};
const skill = (root, name, text = '# Skill') => put(`${root}/${name}/SKILL.md`, text);
const take = async (engine = 'codex', limits) => {
  const s = await snapshotSkills({ engine, homeDir: home, configDir: path.join(home, '.claude-2'), codexHome: path.join(home, '.codex-2'), limits });
  snapshots.push(s); return s;
};
const bundle = (s, rel) => s.bundles.find((b) => b.path === path.join(home, rel));
const read = (b, rel) => fs.readFileSync(path.join(b.dir, rel), 'utf8');

describe('installed skills in cloud checkpoints', () => {
  it('puts shared skills and their executable scripts into both engines and preserves their original paths', async () => {
    skill('.agents/skills', 'taste'); put('.agents/skills/taste/references/layout.md'); put('.agents/skills/taste/scripts/check.sh', '#!/bin/sh\nexit 0\n', 0o755);
    for (const [engine, target] of [['codex', '.codex-2/skills'], ['claude', '.claude-2/skills']]) {
      const s = await take(engine); const b = bundle(s, target);
      expect(read(b, 'taste/references/layout.md')).toBe('reference');
      expect(fs.statSync(path.join(b.dir, 'taste/scripts/check.sh')).mode & 0o111).toBe(0o111);
      expect(bundle(s, '.agents/skills').hash).toBe(b.hash);
    }
  });

  it('follows an installed skill link but rejects inner escapes and cycles without losing safe skills', async () => {
    skill('.agents/skills', 'taste'); fs.mkdirSync(path.join(home, '.codex-2/skills'), { recursive: true });
    fs.symlinkSync(path.join(home, '.agents/skills/taste'), path.join(home, '.codex-2/skills/taste'));
    skill('.codex-2/skills', 'escape'); const privateFile = put('private/account.txt', 'private');
    fs.symlinkSync(privateFile, path.join(home, '.codex-2/skills/escape/leak'));
    skill('.codex-2/skills', 'cycle'); fs.symlinkSync('.', path.join(home, '.codex-2/skills/cycle/again'));
    const s = await take(); const b = bundle(s, '.codex-2/skills');
    expect(read(b, 'taste/SKILL.md')).toBe('# Skill');
    expect(fs.existsSync(path.join(b.dir, 'escape'))).toBe(false);
    expect(fs.existsSync(path.join(b.dir, 'cycle'))).toBe(false);
    expect(s.skipped.map((v) => v.reason).join(' ')).toMatch(/escape/);
    expect(s.skipped.map((v) => v.reason).join(' ')).toMatch(/cycle/);
  });

  it('hashes bytes and executable modes rather than size or modification time', async () => {
    const f = skill('.codex-2/skills', 'taste', 'one'); const old = fs.statSync(f);
    const a = bundle(await take(), '.codex-2/skills'); fs.writeFileSync(f, 'two'); fs.utimesSync(f, old.atime, old.mtime);
    const b = bundle(await take(), '.codex-2/skills'); expect(a.hash).not.toBe(b.hash);
    fs.chmodSync(f, 0o755); const c = bundle(await take(), '.codex-2/skills'); expect(b.hash).not.toBe(c.hash);
    expect(read(a, 'taste/SKILL.md')).toBe('one');
  });

  it('keeps account skill precedence without collapsing same names with different contents', async () => {
    skill('.agents/skills', 'taste', 'shared'); skill('.codex-2/skills', 'taste', 'account');
    const s = await take(); expect(read(bundle(s, '.codex-2/skills'), 'taste/SKILL.md')).toBe('account');
    expect(read(bundle(s, '.agents/skills'), 'taste/SKILL.md')).toBe('shared');
  });

  it('accepts symlinked roots and system skills but excludes credential files and real tokens', async () => {
    skill('installed', 'taste'); fs.mkdirSync(path.join(home, '.codex-2'), { recursive: true });
    fs.symlinkSync(path.join(home, 'installed'), path.join(home, '.codex-2/skills'));
    skill('installed/.system', 'helper'); skill('installed', 'secret'); put('installed/secret/auth.json', '{}');
    skill('installed', 'token'); put('installed/token/key.txt', 'sk-' + 'a'.repeat(40));
    const s = await take(); const b = bundle(s, '.codex-2/skills');
    expect(read(b, '.system/helper/SKILL.md')).toBe('# Skill');
    expect(fs.existsSync(path.join(b.dir, 'secret'))).toBe(false); expect(fs.existsSync(path.join(b.dir, 'token'))).toBe(false);
    expect(s.skipped).toHaveLength(2);
  });

  it('bounds individual files, whole skills, file counts, and traversal depth', async () => {
    skill('.codex-2/skills', 'small', 'ok'); skill('.codex-2/skills', 'large', '12345');
    let s = await take('codex', { file: 4 }); expect(read(bundle(s, '.codex-2/skills'), 'small/SKILL.md')).toBe('ok'); expect(s.skipped).toHaveLength(1);
    put('.codex-2/skills/small/a', 'ok'); s = await take('codex', { skill: 3 }); expect(s.bundles).toHaveLength(0);
    s = await take('codex', { files: 1 }); expect(s.skipped.some((v) => /count/.test(v.reason))).toBe(true);
    put('.codex-2/skills/small/a-dir/b/c', 'ok'); s = await take('codex', { depth: 1 }); expect(s.skipped.some((v) => /depth/.test(v.reason))).toBe(true);
  });

  it('starts unchanged when there are no installed skills', async () => {
    const s = await take(); expect(s.bundles).toEqual([]); expect(s.skipped).toEqual([]);
  });

  it('does not re-enable a skill disabled in the selected Codex account', async () => {
    const file = skill('.agents/skills', 'disabled'); skill('.agents/skills', 'enabled');
    put('.codex-2/config.toml', `[[skills.config]]\npath = ${JSON.stringify(file)}\nenabled = false\n`);
    const s = await take(); const b = bundle(s, '.codex-2/skills');
    expect(fs.existsSync(path.join(b.dir, 'disabled'))).toBe(false);
    expect(read(b, 'enabled/SKILL.md')).toBe('# Skill');
  });

  it('bounds group cycles and the whole bundle rather than just each individual skill', async () => {
    skill('.codex-2/skills', 'safe', 'one'); skill('.codex-2/skills', 'extra', 'two');
    fs.symlinkSync('.', path.join(home, '.codex-2/skills/.system'));
    const s = await take('codex', { total: 3 });
    expect(s.skipped.some((v) => /cycle/.test(v.reason))).toBe(true);
    expect(s.skipped.some((v) => /bundle size/.test(v.reason))).toBe(true);
    expect(bundle(s, '.codex-2/skills')).toBeTruthy();
  });

  it('counts materialized aliases against each archive limit even when their contents are deduplicated', async () => {
    skill('.codex-2/skills', 'taste', 'one');
    fs.symlinkSync('taste', path.join(home, '.codex-2/skills/alias'));
    for (const limits of [{ files: 1 }, { total: 3 }]) {
      const s = await take('codex', limits); const b = bundle(s, '.codex-2/skills');
      expect(fs.readdirSync(b.dir)).toHaveLength(1);
      expect(s.skipped.some((v) => /archive/.test(v.reason))).toBe(true);
    }
  });

  it('skips an unsafe installed directory name instead of poisoning the complete archive', async () => {
    skill('.codex-2/skills', 'safe'); skill('.codex-2/skills', 'bad\nname');
    skill('.codex-2/skills/.system', 'also\nbad');
    const s = await take(); const b = bundle(s, '.codex-2/skills');
    expect(fs.readdirSync(b.dir)).toEqual(['safe']);
    expect(s.skipped).toHaveLength(2);
  });
});
