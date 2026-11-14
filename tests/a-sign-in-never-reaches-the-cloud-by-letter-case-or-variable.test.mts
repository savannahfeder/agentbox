// A SIGN-IN NEVER REACHES THE CLOUD BY LETTER CASE OR BY A VARIABLE'S NAME.
//
// What was wrong (2026-11-14, daily security review): the places that hold a
// sign-in were matched case by case, and a Mac's disk is not. `file
// ~/.SSH/id_ed25519` or `~/.Codex/auth.json` passed the check and opened the
// real file after one press. And a key could come from `shell
// CLAUDE_CODE_OAUTH_TOKEN` or an .env line `ANTHROPIC_API_KEY=` and be saved
// under a harmless name, though the same login in its file was refused.
// Measured with a stand-in home: a `.SSH` folder was read, and a stubbed shell
// handed over CLAUDE_CODE_OAUTH_TOKEN.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readKeyFrom } from '../main/cloud/key-source.mts';
import { keySource, keySourceFromWords } from '../shared/cloud-key-sources.mts';
import { pathHoldsSignIns } from '../shared/sign-in-places.mts';
import { fileToSend } from '../shared/cloud-sent-files.mts';

let tmp: string; let home: string;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sign-in-case-')));
  home = path.join(tmp, 'home');
  fs.mkdirSync(path.join(home, '.SSH'), { recursive: true });
  fs.writeFileSync(path.join(home, '.SSH', 'id_ed25519'), 'stand-in-private-key');
  fs.mkdirSync(path.join(home, 'app'), { recursive: true });
  fs.writeFileSync(path.join(home, 'app', '.env'), 'ANTHROPIC_API_KEY=sk-stand-in\nPOSTHOG_KEY=phx_stand-in\n');
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('a sign-in folder in other letters is still a sign-in folder', () => {
  it.each(['~/.SSH/id_ed25519', '~/.Codex/auth.json', '~/.Claude/.credentials.json', '~/.AWS/credentials', '~/.Config/GH/hosts.yml', '~/Library/keychains/login.keychain-db'])('%s is refused', (from) => {
    expect(pathHoldsSignIns(from.slice(2))).toBe(true);
    expect(keySource({ place: 'file', from })).toBeNull();
    expect(keySourceFromWords(`file ${from}`)).toBeNull();
  });

  it('and is not read, though the disk would open it', async () => {
    const read = await readKeyFrom({ place: 'file', from: '~/.SSH/id_ed25519' }, { home, platform: 'darwin' });
    expect(read).not.toHaveProperty('value');
  });

  it('nor sent as a file to a cloud thread', () => {
    expect(fileToSend(path.join(home, '.SSH', 'id_ed25519'), { home })).not.toHaveProperty('path');
  });

  it('while a folder that only looks like one still gives its key', async () => {
    fs.mkdirSync(path.join(home, 'notes-ssh'), { recursive: true });
    fs.writeFileSync(path.join(home, 'notes-ssh', 'key.txt'), 'phx_ok');
    expect(await readKeyFrom({ place: 'file', from: '~/notes-ssh/key.txt' }, { home, platform: 'darwin' })).toEqual({ value: 'phx_ok' });
  });
});

describe("Claude Code's or Codex's own sign-in is not a key, wherever it is kept", () => {
  it.each(['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CODEX_API_KEY', 'OPENAI_API_KEY'])('shell %s is refused', (name) => {
    expect(keySource({ place: 'shell', from: name })).toBeNull();
    expect(keySourceFromWords(`shell ${name}`)).toBeNull();
  });

  it('nor one line of an .env file under that name', async () => {
    expect(keySource({ place: 'file', from: '~/app/.env', entry: 'ANTHROPIC_API_KEY' })).toBeNull();
    expect(keySourceFromWords('file ~/app/.env ANTHROPIC_API_KEY')).toBeNull();
    expect(await readKeyFrom({ place: 'file', from: '~/app/.env', entry: 'ANTHROPIC_API_KEY' }, { home, platform: 'darwin' })).not.toHaveProperty('value');
  });

  it('while any other variable still comes from either place', async () => {
    expect(keySource({ place: 'shell', from: 'POSTHOG_KEY' })).toEqual({ place: 'shell', from: 'POSTHOG_KEY' });
    expect(keySource({ place: 'shell', from: 'GH_TOKEN' })).toEqual({ place: 'shell', from: 'GH_TOKEN' });
    expect(await readKeyFrom({ place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' }, { home, platform: 'darwin' })).toEqual({ value: 'phx_stand-in' });
  });
});
