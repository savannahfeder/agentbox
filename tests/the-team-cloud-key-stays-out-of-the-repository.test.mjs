// THE TEAM CLOUD'S ADDRESS AND KEY STAY OUT OF THE REPOSITORY (2026-10-01).
//
// The team version was merged into the public repository with its history.
// cloud/team.config.json, the hosted project's address and sign-in key, had
// been committed once (the commit that added the shared database) and rode in
// every commit after it: 87 of the 90 commits the merge brought. It was cut
// out of all of them before the push. The rule now: the file lives only on the
// machines that run the team version. Without it the app is the single-person
// app (loadCloudConfig returns null), which is what a public checkout should
// get. cloud/team.config.example.json shows its shape.
import { it, expect, describe } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCloudConfig } from '../main/team/session.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const ignored = (file) => {
  try { git('check-ignore', '-q', '--no-index', file); return true; } catch { return false; }
};

describe('the team cloud config', () => {
  it('is never tracked', () => {
    expect(git('ls-files', 'cloud/team.config.json').trim()).toBe('');
  });

  it('is ignored, so a copy on disk cannot be committed by accident', () => {
    expect(ignored('cloud/team.config.json')).toBe(true);
  });

  it('ignores only that file: the database migrations and the example still go in', () => {
    expect(ignored('cloud/team.config.example.json')).toBe(false);
    expect(ignored('cloud/supabase/config.toml')).toBe(false);
  });

  it('ships an example with the shape the app reads, and no real address', () => {
    const example = JSON.parse(fs.readFileSync(path.join(root, 'cloud', 'team.config.example.json'), 'utf8'));
    expect(typeof example.url).toBe('string');
    expect(typeof example.anonKey).toBe('string');
    expect(example.url).not.toMatch(/\.supabase\.co/);
  });

  // A MAC WITH NO KEY ON IT EITHER, which is what a stranger cloning this has.
  // Since 2026-10-04 the key may also live on the Mac rather than in the folder
  // (main/team/session.mjs teamConfigOnThisMac), so the home is a throwaway
  // here: reading the real one would make this test pass or fail depending on
  // whether whoever ran it is on a team.
  it('leaves a checkout without the file as the single-person app', () => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-team-config-'));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'no-team-mac-'));
    expect(loadCloudConfig(appDir, { packaged: true, home })).toBeNull();
  });
});
