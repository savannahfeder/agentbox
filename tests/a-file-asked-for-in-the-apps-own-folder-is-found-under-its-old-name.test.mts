// A FILE ASKED FOR IN THE APP'S OWN FOLDER IS FOUND UNDER THAT FOLDER'S OLD NAME.
//
// What broke (2026-11-13): a cloud thread looking into freezes asked for
// ~/Library/Application Support/Agentbox/memory-log/memory-2026-11-12.jsonl.
// The app's data folder on a Mac that ran it before the rename still has its
// old name (Zero, Astral or Powerup; main/main.mts keeps reading it), so the
// card said the file was not on this computer and offered only "Choose the
// file". Measured with fileToSend on a fake home whose data folder is Zero.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileToSend } from '../shared/cloud-sent-files.mts';
import { Supervisor } from '../main/supervisor.mts';

let tmp: string; let home: string; let appData: string; let log: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-folder-')));
  home = path.join(tmp, 'home');
  appData = path.join(home, 'Library', 'Application Support', 'Zero');
  log = path.join(appData, 'memory-log', 'memory-2026-11-12.jsonl');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, '{"heap":1}\n');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('a file in the app folder under its current name', () => {
  it('is found in the folder the app really uses', () => {
    expect(fileToSend('~/Library/Application Support/Agentbox/memory-log/memory-2026-11-12.jsonl', { home, appData })).toEqual({ path: log, size: 11 });
  });

  it('is found from a full path, and from the Linux folder name', () => {
    expect(fileToSend(path.join(home, 'Library/Application Support/Agentbox/memory-log/memory-2026-11-12.jsonl'), { home, appData }).path).toBe(log);
    expect(fileToSend('~/.config/Agentbox/memory-log/memory-2026-11-12.jsonl', { home, appData }).path).toBe(log);
  });

  it('is found under any older name too', () => {
    expect(fileToSend('~/Library/Application Support/Powerup/memory-log/memory-2026-11-12.jsonl', { home, appData }).path).toBe(log);
  });

  it('still says when the file is in neither folder', () => {
    expect(fileToSend('~/Library/Application Support/Agentbox/memory-log/memory-2026-11-01.jsonl', { home, appData }).error)
      .toBe('~/Library/Application Support/Agentbox/memory-log/memory-2026-11-01.jsonl is not on this computer.');
  });

  it('keeps a file that is really at the asked path', () => {
    const real = path.join(home, 'Library', 'Application Support', 'Agentbox', 'memory-log', 'memory-2026-11-12.jsonl');
    fs.mkdirSync(path.dirname(real), { recursive: true });
    fs.writeFileSync(real, 'x');
    expect(fileToSend('~/Library/Application Support/Agentbox/memory-log/memory-2026-11-12.jsonl', { home, appData }).path).toBe(real);
  });

  it('is what the card is told, and what Send sends', () => {
    const sup = new Supervisor({ storeRoot: tmp, home, authProfiles: ['default'], cloudRuns: 'full' }, { listItems: () => [], listProducts: () => [], isDue: () => true }, tmp, tmp, appData);
    const asked = '~/Library/Application Support/Agentbox/memory-log/memory-2026-11-12.jsonl';
    expect(sup.cloudFileInfo(asked)).toEqual({ ok: true, size: 11 });
    expect(sup.cloudSendFile('w-1', asked)).toEqual({ path: log, size: 11 });
  });

  it('leaves other apps\' folders alone', () => {
    expect(fileToSend('~/Library/Application Support/Slack/memory-log/memory-2026-11-12.jsonl', { home, appData }).error).toMatch(/not on this computer/);
  });
});
