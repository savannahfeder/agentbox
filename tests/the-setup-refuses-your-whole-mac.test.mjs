// THE REFUSAL, WHERE IT ACTUALLY HAS TO BE.
//
// The rule itself is tested in a-project-folder-is-not-your-whole-mac. These
// pin that it is WIRED: the picker, the store, both screens and the proposal.
// Every one of them was a separate live path to the same run of macOS panels a
// tester saw, and a rule nothing calls is worse than no rule, because it reads
// like the problem is solved.

import { describe, expect, it } from 'vitest';
import { Name } from '../shared/product-name.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProjectFolder } from '../shared/project-folder-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

describe('the picker turns it down before the renderer ever sees it', () => {
  const ipc = read('main/ipc.mjs');

  it('checks what the Mac dialog handed back', () => {
    expect(ipc).toMatch(/checkProjectFolder\(picked, \{ home: os\.homedir\(\) \}\)/);
  });

  it('sends back the sentence and NOT the path', () => {
    expect(ipc).toMatch(/if \(!verdict\.ok\) return \{ path: null, refused: verdict\.say \}/);
  });
});

describe('the store is the backstop', () => {
  const store = read('main/store.mjs');

  it('refuses a repoPath that is the whole Mac, before it makes anything', () => {
    expect(store).toMatch(/const verdict = checkProjectFolder\(repo, \{ home: os\.homedir\(\) \}\)/);
    expect(store).toMatch(/if \(!verdict\.ok\) throw new Error\(verdict\.say\)/);
  });

  it('checks BEFORE the mkdir, so a refusal leaves nothing on the disk', () => {
    const at = store.indexOf('if (!verdict.ok) throw new Error(verdict.say)');
    const mk = store.indexOf('fs.mkdirSync(repo, { recursive: true })');
    expect(at).toBeGreaterThan(0);
    expect(mk).toBeGreaterThan(at);
  });
});

describe('both screens say why', () => {
  it('the setup screen replaces its own sentence with the refusal', () => {
    const walk = read('renderer/src/components/Onboarding.tsx');
    expect(walk).toMatch(/if \(why\) \{ setRefused\(why\); return; \}/);
    expect(walk).toMatch(/fr-note fr-refused/);
  });

  it('the New Project card shows it under the sentence it is about', () => {
    const card = read('renderer/src/components/NewProject.tsx');
    expect(card).toMatch(/if \(why\) \{ setRefused\(why\); return; \}/);
    expect(card).toMatch(/np-refused/);
  });

  it('neither of them is a panel, a colour or an icon', () => {
    const css = read('renderer/src/styles.css');
    // Rule only, w-ec62ab6b38 (2026-09-28): the folder list CSS now sits between it and .fr-name.
    const at = css.indexOf('.fr-note.fr-refused');
    const block = css.slice(at, css.indexOf('}', at) + 1);
    expect(block).toContain('.fr-note.fr-refused {');
    expect(block).not.toMatch(/red|#e|crimson|background:/i);
  });
});

describe('nothing proposes a guarded folder any more', () => {
  it('~/Desktop/dev is gone from the proposal', () => {
    expect(read('renderer/src/project-folder.ts')).not.toMatch(/'~\/Desktop\/dev/);
  });

  it('and the app hands the card a parent learned from her own projects', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/parent=\{proposeParent\(/);
  });
});

describe('the panels macOS does show now say who is asking', () => {
  const pkg = JSON.parse(read('package.json'));

  it('carries a sentence for every folder the system guards by name', () => {
    const info = pkg.build.mac.extendInfo ?? {};
    for (const key of [
      'NSDesktopFolderUsageDescription',
      'NSDocumentsFolderUsageDescription',
      'NSDownloadsFolderUsageDescription',
      'NSRemovableVolumesUsageDescription',
    ]) {
      expect(typeof info[key], key).toBe('string');
      expect(info[key].length, key).toBeGreaterThan(20);
      // The sentence macOS shows opens with the app's name, so it takes the
      // sentence-start spelling whatever the name is lowercased to.
      expect(info[key], key).toContain(Name);
      expect(info[key], key).toMatch(new RegExp(`^${Name}\\b`));
    }
  });
});

describe('the real shape of it, run against a real home', () => {
  it('a home folder is refused and a project inside it is not', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-folder-check-'));
    try {
      expect(checkProjectFolder(home, { home }).ok).toBe(false);
      fs.mkdirSync(path.join(home, 'dev', 'thing'), { recursive: true });
      expect(checkProjectFolder(path.join(home, 'dev', 'thing'), { home }).ok).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
