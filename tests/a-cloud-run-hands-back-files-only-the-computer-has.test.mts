// A CLOUD RUN HANDS BACK FILES ONLY THE COMPUTER HAS (w-17eef890be, 2026-11-02).
//
// A teammate asked in a conversation for the original intro film, the
// Superhuman film, the agent tray clip, inbox screenshots and the logo. The run
// was in the cloud. It found the Superhuman film's path on the Desktop, never
// asked for it, linked public copies of the rest and told the person to send
// the videos by hand. Measured on w-cbccd05081's answer: no hand-back line.
// The brief told it to: "Do not transfer the whole thread solely for a missing
// skill or file the request does not name", and the request named the films by
// what they were, not by a path. Asking for the Desktop path would not have
// helped either: the fetch answered "denied" with no word about handing back,
// and a 596 MB film is over the 25 MB cap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLOUD_NOTE, PLAIN_CLOUD_NOTE } from '../main/cloud/run.mts';
import { createResourceRequests } from '../main/cloud/resources.mts';
import { HAND_BACK } from '../shared/cloud-hand-back.mts';

describe('what a cloud run is told about files only the computer has', () => {
  for (const [name, note] of [['with a repository', CLOUD_NOTE], ['with none', PLAIN_CLOUD_NOTE]]) {
    it(`hands back a request for their own files, named only by what they are, ${name}`, () => {
      expect(note).toMatch(/only on their computer/);
      expect(note).toMatch(/whether it gives their path or only says what they are/);
      expect(note).toMatch(/hand it back as below rather than answering in part/);
    });

    it(`no longer refuses to move for a file the request does not name by path, ${name}`, () => {
      expect(note).not.toMatch(/Do not transfer the whole thread/);
    });

    it(`still works around something the work can do without, ${name}`, () => {
      expect(note).toMatch(/something the work can do without[^.]*finish the rest and say exactly what is missing/);
    });
  }
});

describe('what the computer answers when a file cannot come up', () => {
  let root; let options;
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-only-here-')));
    for (const dir of ['task', 'docs', 'home/Desktop']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, 'home/Desktop/agentbox-launch.mp4'), 'film');
    fs.writeFileSync(path.join(root, 'task/big.mp4'), '123456');
    fs.writeFileSync(path.join(root, 'task/small.txt'), 'ok');
    options = { cwd: path.join(root, 'task'), docs: path.join(root, 'docs'), homeDir: path.join(root, 'home'),
      configDir: path.join(root, 'home/.claude'), engine: 'claude', runId: 'run-here', state: {}, save: () => {},
      upload: vi.fn(async (key) => `https://storage.invalid/${key}`), deliver: vi.fn(async () => true),
      stopped: () => false, timeoutMs: 1000, limits: { file: 4 } };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('says a file on their Desktop is only there, and to hand it back', async () => {
    const answer = await createResourceRequests(options)({ kind: 'file', path: '~/Desktop/agentbox-launch.mp4' });
    expect(answer.status).toBe('denied');
    expect(answer.message).toContain(HAND_BACK);
    expect(options.upload).not.toHaveBeenCalled();
  });

  it('says a file too big to send is only there, and to hand it back', async () => {
    const answer = await createResourceRequests(options)({ kind: 'file', scope: 'task', path: 'big.mp4' });
    expect(answer.status).toBe('too_large');
    expect(answer.message).toContain(HAND_BACK);
  });

  it('just under the cap, delivers it and says nothing about handing back', async () => {
    const answer = await createResourceRequests(options)({ kind: 'file', scope: 'task', path: 'small.txt' });
    expect(answer.status).toBe('delivered');
    expect(JSON.stringify(answer)).not.toContain(HAND_BACK);
  });

  it('does not tell a run to hand back a path it wrote wrong', async () => {
    const answer = await createResourceRequests(options)({ kind: 'file', scope: 'task', path: 'nothing.txt' });
    expect(answer.status).toBe('not_found');
    expect(answer.message).not.toContain(HAND_BACK);
  });
});
