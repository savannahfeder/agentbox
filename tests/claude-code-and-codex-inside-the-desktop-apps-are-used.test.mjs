// SOMEBODY WHO ONLY EVER USED THE CLAUDE APP OR THE CHATGPT APP HAS THE TOOL
// ALREADY, and Agentbox told them it was missing.
//
// Both desktop apps carry a working copy of the command line tool inside them.
// Measured 2026-10-05 on a Mac with both apps (w-9f6975906c):
//
//   ~/Library/Application Support/Claude/claude-code/2.1.209/claude.app/Contents/MacOS/claude
//     --version  ->  2.1.209 (Claude Code)      auth status  ->  loggedIn: true
//   /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
//     --version  ->  codex-cli 0.158.0-alpha.2  login status ->  Logged in using ChatGPT
//
// Neither finder looked there, so a person whose only Claude Code was the one
// the Claude app keeps was sent to an install page for a thing they had. The
// founder, the same day: "if we can detect it, we should just use it straight up".
//
// THE APP COPY COMES LAST. It updates when its app does, not on its own (the
// Claude copy above was three months old beside a 2.1.289 install), so a real
// install anywhere on the Mac, including one only the shell can find, wins.

import { describe, it, expect } from 'vitest';
import { findClaudeBin, appCopyPaths as claudeAppCopies } from '../main/claude-bin.mjs';
import { findCodexBin, appCopyPaths as codexAppCopies } from '../main/codex-bin.mjs';

const HOME = '/Users/stranger';
const SUPPORT = `${HOME}/Library/Application Support/Claude/claude-code`;
const copy = (v) => `${SUPPORT}/${v}/claude.app/Contents/MacOS/claude`;
const CHATGPT = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
const only = (...paths) => (p) => paths.includes(p);
const noShell = () => ({ path: null, answered: true });
const listing = (map) => (dir) => map[dir] ?? [];

describe('Claude Code inside the Claude app', () => {
  it('is used when it is the only Claude Code on the Mac', () => {
    const found = findClaudeBin({
      home: HOME, shellLookup: noShell,
      readdir: listing({ [SUPPORT]: ['2.1.209'] }),
      exists: only(copy('2.1.209')),
    });
    expect(found).toMatchObject({ path: copy('2.1.209'), found: true, certain: true, from: 'app' });
  });

  it('takes the newest version the app has kept, by number and not by spelling', () => {
    expect(claudeAppCopies(HOME, listing({ [SUPPORT]: ['2.1.30', '.verified', '2.1.209', '2.0.99'] })))
      .toEqual([copy('2.1.209'), copy('2.1.30'), copy('2.0.99')]);
  });

  it('skips a version folder whose binary is not there', () => {
    const found = findClaudeBin({
      home: HOME, shellLookup: noShell,
      readdir: listing({ [SUPPORT]: ['2.1.300', '2.1.209'] }),
      exists: only(copy('2.1.209')),
    });
    expect(found.path).toBe(copy('2.1.209'));
  });

  it('loses to a real install', () => {
    const found = findClaudeBin({
      home: HOME, shellLookup: noShell,
      readdir: listing({ [SUPPORT]: ['2.1.209'] }),
      exists: only(copy('2.1.209'), `${HOME}/.local/bin/claude`),
    });
    expect(found).toMatchObject({ path: `${HOME}/.local/bin/claude`, from: 'disk' });
  });

  it('loses to one only the shell can find', () => {
    const volta = `${HOME}/somewhere/odd/claude`;
    const found = findClaudeBin({
      home: HOME, shellLookup: () => ({ path: volta, answered: true }),
      readdir: listing({ [SUPPORT]: ['2.1.209'] }),
      exists: only(copy('2.1.209'), volta),
    });
    expect(found).toMatchObject({ path: volta, from: 'shell' });
  });

  it('finds nothing on a Mac with no Claude app and no install', () => {
    const found = findClaudeBin({ home: HOME, shellLookup: noShell, readdir: () => [], exists: () => false });
    expect(found).toMatchObject({ path: null, found: false });
  });
});

describe('Codex inside the ChatGPT app', () => {
  it('is used when it is the only Codex on the Mac', () => {
    const found = findCodexBin({ home: HOME, env: {}, shellLookup: noShell, readdir: () => [], exists: only(CHATGPT) });
    expect(found).toMatchObject({ path: CHATGPT, found: true, certain: true, from: 'app' });
  });

  it('is found in a ChatGPT app kept in the home Applications folder too', () => {
    const mine = `${HOME}/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`;
    expect(codexAppCopies(HOME)).toContain(mine);
    const found = findCodexBin({ home: HOME, env: {}, shellLookup: noShell, readdir: () => [], exists: only(mine) });
    expect(found).toMatchObject({ path: mine, from: 'app' });
  });

  it('is preferred to an automatically discovered standalone install', () => {
    const found = findCodexBin({
      home: HOME, env: {}, shellLookup: noShell, readdir: () => [],
      exists: only(CHATGPT, `${HOME}/.local/bin/codex`),
    });
    expect(found).toMatchObject({ path: CHATGPT, from: 'app' });
  });

  it('does not take the ChatGPT app itself for Codex', () => {
    const found = findCodexBin({
      home: HOME, env: {}, shellLookup: noShell, readdir: () => [],
      exists: only('/Applications/ChatGPT.app'),
    });
    expect(found.found).toBe(false);
  });
});
