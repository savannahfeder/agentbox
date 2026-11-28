// SOMEBODY WHO RUNS CLAUDE CODE ONLY FROM VS CODE OR CURSOR WAS LEFT WITH CODEX.
//
// On the Nov 23 and Nov 24 onboarding calls, two people who drive Claude Code
// every day could only use Codex in Agentbox. PostHog showed the same on 6 of
// the 42 Macs that finished setup since Nov 1: a Claude Code session running
// (`agent_seen`), and every Agentbox run on Codex.
//
// Claude Code's editor extension carries a whole Claude Code of its own, and
// the finder never looked there. Measured 2026-11-24 on the extension's real
// package from open-vsx (Anthropic.claude-code 2.1.331, darwin-arm64 and
// linux-arm64): the binary is `extension/resources/native-binary/claude`, which
// an editor unpacks to `<editor>/extensions/anthropic.claude-code-<version>-<platform>/
// resources/native-binary/claude`. Run, it says `2.1.331 (Claude Code)` and
// answers `auth status --json` the way an installed one does.
//
// Like the Claude app's copy, it comes after any real install.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findClaudeBin, appCopyPaths } from '../main/claude-bin.mts';
import { findEngine } from '../main/engine-bin.mts';

const HOME = '/Users/stranger';
const ext = (editor: string, folder: string) => `${HOME}/${editor}/extensions/${folder}/resources/native-binary/claude`;
const only = (...paths: string[]) => (p: string) => paths.includes(p);
const noShell = () => ({ path: null, answered: true });
const listing = (map: Record<string, string[]>) => (dir: string) => map[dir] ?? [];

describe('Claude Code inside an editor extension', () => {
  it('is used when VS Code\'s is the only Claude Code on the Mac', () => {
    const bin = ext('.vscode', 'anthropic.claude-code-2.1.331-darwin-arm64');
    const found = findClaudeBin({
      home: HOME, env: {}, shellLookup: noShell,
      readdir: listing({ [`${HOME}/.vscode/extensions`]: ['anthropic.claude-code-2.1.331-darwin-arm64', 'ms-python.python-2026.1.0'] }),
      exists: only(bin),
    });
    expect(found).toMatchObject({ path: bin, found: true, certain: true, from: 'app' });
  });

  it('is found in Cursor, Windsurf, VS Code Insiders and VSCodium too', () => {
    for (const editor of ['.cursor', '.windsurf', '.vscode-insiders', '.vscode-oss']) {
      const bin = ext(editor, 'anthropic.claude-code-2.1.300-darwin-x64');
      expect(appCopyPaths(HOME, listing({ [`${HOME}/${editor}/extensions`]: ['anthropic.claude-code-2.1.300-darwin-x64'] }))).toContain(bin);
    }
  });

  it('takes the newest version an editor kept, by number and not by spelling', () => {
    const dir = `${HOME}/.vscode/extensions`;
    const paths = appCopyPaths(HOME, listing({ [dir]: ['anthropic.claude-code-2.1.99-darwin-arm64', 'anthropic.claude-code-2.1.331-darwin-arm64', 'anthropic.claude-code-2.1.300'] }));
    expect(paths).toEqual([
      ext('.vscode', 'anthropic.claude-code-2.1.331-darwin-arm64'),
      ext('.vscode', 'anthropic.claude-code-2.1.300'),
      ext('.vscode', 'anthropic.claude-code-2.1.99-darwin-arm64'),
    ]);
  });

  it('does not take another publisher\'s extension, or one with a longer name', () => {
    const dir = `${HOME}/.vscode/extensions`;
    expect(appCopyPaths(HOME, listing({ [dir]: ['someone.claude-code-1.0.0', 'anthropic.claude-code-tools-1.0.0', 'anthropic.claude-code', '.obsolete'] }))).toEqual([]);
  });

  it('loses to a real install, and to the Claude app\'s copy', () => {
    const bin = ext('.vscode', 'anthropic.claude-code-2.1.331-darwin-arm64');
    const appCopy = `${HOME}/Library/Application Support/Claude/claude-code/2.1.209/claude.app/Contents/MacOS/claude`;
    const readdir = listing({
      [`${HOME}/.vscode/extensions`]: ['anthropic.claude-code-2.1.331-darwin-arm64'],
      [`${HOME}/Library/Application Support/Claude/claude-code`]: ['2.1.209'],
    });
    expect(findClaudeBin({ home: HOME, env: {}, shellLookup: noShell, readdir, exists: only(bin, `${HOME}/.local/bin/claude`) }))
      .toMatchObject({ path: `${HOME}/.local/bin/claude`, from: 'disk' });
    expect(findClaudeBin({ home: HOME, env: {}, shellLookup: noShell, readdir, exists: only(bin, appCopy) }))
      .toMatchObject({ path: appCopy, from: 'app' });
  });

  it('skips a version folder whose binary is gone', () => {
    const older = ext('.vscode', 'anthropic.claude-code-2.1.300-darwin-arm64');
    const found = findClaudeBin({
      home: HOME, env: {}, shellLookup: noShell,
      readdir: listing({ [`${HOME}/.vscode/extensions`]: ['anthropic.claude-code-2.1.331-darwin-arm64', 'anthropic.claude-code-2.1.300-darwin-arm64'] }),
      exists: only(older),
    });
    expect(found.path).toBe(older);
  });
});

describe('on a real disk', () => {
  const made: string[] = [];
  afterAll(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

  it('finds the extension\'s copy in a home that has nothing else', () => {
    const h = fs.mkdtempSync(path.join(os.tmpdir(), 'finder-ext-'));
    made.push(h);
    const bin = path.join(h, '.cursor/extensions/anthropic.claude-code-2.1.331-darwin-arm64/resources/native-binary/claude');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, '#!/bin/sh\n');
    const seen = (p: string) => p.startsWith(h) && fs.existsSync(p);
    expect(findEngine('claude', { home: h, env: {}, exists: seen, shellLookup: noShell })).toMatchObject({ path: bin, from: 'app' });
  });
});
