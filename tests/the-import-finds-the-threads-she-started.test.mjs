// THE IMPORT FINDS THE THREADS SHE STARTED.
//
// Two claims to pin, and they pull in opposite directions, which is why they are
// one file. The card has to FIND the thread she just ran, and it has to find
// almost nothing else. A scan that returns everything passes the first and fails
// her, and that is what the old card effectively did in the other direction: it
// read a folder of `.md` files last edited in March.
//
// The store is built here rather than read off a Mac. Every count in the module's
// own comments came from one real Mac and can never be reproduced, so what is asserted
// here is the RULE, on a store shaped exactly like the one those counts came out
// of: an Agentbox worker, a harness run in a temp folder, a subagent, a slash
// command with nothing said, and one terminal session with a person in it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NAME } from '../shared/product-name.mjs';
import {
  RECENT_DAYS, isScratchFolder, readSessionThreads, readTranscriptHead,
  startedByHand, threadTitle, threadsByFolder,
} from '../main/agent-sessions.mjs';

const NOW = Date.UTC(2026, 7, 29, 3, 40, 0);
const ago = (mins) => NOW - mins * 60 * 1000;

let home;

/**
 * One transcript, in the shape Claude Code writes: JSON objects a line each,
 *  every message row carrying `cwd` and `entrypoint`. */
function writeTranscript({ folder, id, entrypoint, cwd, said = [], when }) {
  const dir = path.join(home, '.claude', 'projects', folder);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  const lines = [JSON.stringify({ type: 'summary', leafUuid: 'x', sessionId: id })];
  for (const text of said) {
    lines.push(JSON.stringify({
      type: 'user', sessionId: id, cwd, entrypoint, userType: 'external',
      message: { role: 'user', content: [{ type: 'text', text }] },
    }));
  }
  // A trailing newline, so the reader's "drop the half line at the end" does
  // not eat the last real row.
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  fs.utimesSync(file, new Date(when), new Date(when));
  return file;
}

/** One desktop app record, which is a small file ABOUT a session. */
function writeDesktopRecord(rec) {
  const dir = path.join(home, 'Library', 'Application Support', 'Claude',
    'claude-code-sessions', 'acct', 'org');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${rec.sessionId}.json`), JSON.stringify(rec));
}

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'w-a3a8-home-'));

  // THE CASE THAT MATTERS. A terminal the user opened, in a folder they work
  // in, three minutes ago.
  writeTranscript({
    folder: '-Users-her-Desktop-dev-zero', id: 'aaaaaaaa-0000-0000-0000-000000000001',
    entrypoint: 'cli', cwd: `${home}/Desktop/dev/zero`,
    said: ['this is a test'], when: ago(3),
  });

  // AGENTBOX'S OWN WORKER. Started by the app, in a product's documents folder.
  // It opens with the work item brief, and the point of the entrypoint rule is
  // that the brief is not what identifies it.
  writeTranscript({
    folder: '-Users-her-Zero-accounts-x-agentbox', id: 'bbbbbbbb-0000-0000-0000-000000000002',
    entrypoint: 'sdk-cli', cwd: `${home}/Zero/accounts/x/agentbox`,
    said: [`# Your work item\n\nProduct: ${NAME}`], when: ago(5),
  });

  // AN AGENTBOX CHAT. Also started by the app, but it opens with the user's own
  // words in a real folder, so nothing about its content says it is not theirs. This is the
  // row the first draft of the scanner kept.
  writeTranscript({
    folder: '-Users-her-Zero-accounts-x-personal', id: 'cccccccc-0000-0000-0000-000000000003',
    entrypoint: 'sdk-cli', cwd: `${home}/Zero/accounts/x/personal`,
    said: ['Can you read this article and tell me what their main point is?'], when: ago(8),
  });

  // OUR MEASUREMENT HARNESS, twenty at a time in a temp folder.
  for (let i = 1; i <= 20; i += 1) {
    writeTranscript({
      folder: `-private-tmp-speedsize-run-${i}`, id: `dddddddd-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
      entrypoint: 'sdk-cli', cwd: `/private/tmp/speedsize/run-${i}`,
      said: ['measure this'], when: ago(20 + i),
    });
  }

  // A SUBAGENT, which a session started and she never saw.
  writeTranscript({
    folder: '-Users-her-Desktop-dev-zero/aaaaaaaa-0000-0000-0000-000000000001/subagents',
    id: 'eeeeeeee-0000-0000-0000-000000000005',
    entrypoint: 'cli', cwd: `${home}/Desktop/dev/zero`,
    said: ['go and read these files'], when: ago(2),
  });

  // A TERMINAL SHE OPENED AND ONLY RAN SLASH COMMANDS IN. Started by hand, and
  // still not a thread: there is nothing in it the user said.
  writeTranscript({
    folder: '-Users-her-Desktop-dev-harbour', id: 'ffffffff-0000-0000-0000-000000000006',
    entrypoint: 'cli', cwd: `${home}/Desktop/dev/harbour`,
    said: [
      '<local-command-caveat>Caveat: The messages below were generated by the user',
      '<command-name>/model</command-name>',
      '<local-command-stdout>Set model to Opus 5</local-command-stdout>',
    ],
    when: ago(30),
  });

  // A TERMINAL WHERE A SLASH COMMAND CAME FIRST AND SHE SPOKE SECOND. This one
  // IS the user's, and reading only the first message loses it.
  writeTranscript({
    folder: '-Users-her-Desktop-dev-harbour', id: '99999999-0000-0000-0000-000000000007',
    entrypoint: 'cli', cwd: `${home}/Desktop/dev/harbour`,
    said: [
      '<local-command-caveat>Caveat: The messages below were generated by the user',
      '<command-name>/model</command-name>',
      'tried to open zero here but it failed.',
    ],
    when: ago(40),
  });

  // A DESKTOP APP THREAD, written twice the way the app really writes it: its
  // own titled record, and a transcript under the same cli session id.
  writeDesktopRecord({
    sessionId: 'local_77777777', cliSessionId: '77777777-0000-0000-0000-000000000008',
    cwd: `${home}/Desktop/dev/symphony`, originCwd: `${home}/Desktop/dev/symphony`,
    title: 'Fix duplicate cowork task display issue', isArchived: false,
    createdAt: ago(200), lastActivityAt: ago(120),
  });
  writeTranscript({
    folder: '-Users-her-Desktop-dev-symphony', id: '77777777-0000-0000-0000-000000000008',
    entrypoint: 'claude-desktop', cwd: `${home}/Desktop/dev/symphony`,
    said: ['the cowork tasks show twice'], when: ago(120),
  });

  // AN ARCHIVED DESKTOP THREAD. Archiving it means the user is done with it.
  writeDesktopRecord({
    sessionId: 'local_66666666', cliSessionId: '66666666-0000-0000-0000-000000000009',
    cwd: `${home}/Desktop/dev/symphony`, originCwd: `${home}/Desktop/dev/symphony`,
    title: 'An old thing I archived', isArchived: true,
    createdAt: ago(300), lastActivityAt: ago(130),
  });

  // AND ONE SHE STARTED A MONTH AGO, which is not "recent" under any reading.
  writeTranscript({
    folder: '-Users-her-Desktop-dev-zero', id: '11111111-0000-0000-0000-000000000010',
    entrypoint: 'cli', cwd: `${home}/Desktop/dev/zero`,
    said: ['something from last month'], when: NOW - 30 * 86400 * 1000,
  });
});

afterAll(() => {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* a temp dir */ }
});

describe('the thread she just ran', () => {
  it('is found, by the words she typed into it', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    const hers = threads.find((t) => t.title === 'this is a test');
    expect(hers).toBeTruthy();
    expect(hers.source).toBe('terminal');
    expect(hers.short).toBe('~/Desktop/dev/zero');
  });

  it('is the newest thing on the card, because she just ran it', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    expect(threads[0].title).toBe('this is a test');
  });
});

describe('the hundreds she does not want', () => {
  it('leaves out everything a person did not start', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    const titles = threads.map((t) => t.title);
    // The worker, the chat and twenty harness runs: all sdk-cli, none of them hers.
    expect(titles.some((t) => t.startsWith('# Your work item'))).toBe(false);
    expect(titles.some((t) => t.includes('their main point'))).toBe(false);
    expect(titles.some((t) => t === 'measure this')).toBe(false);
  });

  it(`leaves out an ${NAME} chat even though it reads exactly like hers`, () => {
    // The one the first draft kept. Its folder is real and its opening words are
    // her own; the only thing that gives it away is who started it.
    const { threads } = readSessionThreads({ home, now: NOW });
    expect(threads.some((t) => t.folder.endsWith('/personal'))).toBe(false);
  });

  it('leaves out subagents, which she never opened', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    expect(threads.some((t) => t.title === 'go and read these files')).toBe(false);
  });

  it('leaves out a terminal she only ran slash commands in', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    expect(threads.some((t) => t.id.startsWith('ffffffff'))).toBe(false);
  });

  it('leaves out anything older than the window', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    expect(threads.some((t) => t.title === 'something from last month')).toBe(false);
  });

  it('is a handful, not the store', () => {
    // 27 transcripts and 2 desktop records went in. hundreds exist, a handful
    // are relevant.
    const { threads } = readSessionThreads({ home, now: NOW });
    expect(threads.length).toBeLessThan(6);
  });
});

describe('the desktop app, which she named', () => {
  it('is read, and its own title is used rather than a guess', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    const d = threads.find((t) => t.source === 'desktop');
    expect(d).toBeTruthy();
    expect(d.title).toBe('Fix duplicate cowork task display issue');
  });

  it('shows that thread once, not once per store it is written to', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    const same = threads.filter((t) => t.folder.endsWith('/symphony'));
    expect(same).toHaveLength(1);
  });

  it('leaves out one she archived', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    expect(threads.some((t) => t.title === 'An old thing I archived')).toBe(false);
  });
});

describe('the name on the row', () => {
  it('is the first thing a person typed, not the wrapper around a slash command', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    expect(threads.some((t) => t.title === 'tried to open zero here but it failed.')).toBe(true);
  });

  it('has no name for a thread nobody spoke in', () => {
    expect(threadTitle(['<command-name>/model</command-name>'])).toBe('');
    expect(threadTitle([''])).toBe('');
  });

  it('is one flat line, cut at a word', () => {
    const long = threadTitle(['# A heading\nand then more of it']);
    expect(long).toBe('A heading');
    const cut = threadTitle([`${'word '.repeat(40)}end`]);
    expect(cut.length).toBeLessThanOrEqual(76);
    expect(cut.endsWith('...')).toBe(true);
  });
});

describe('the pieces on their own', () => {
  it('knows a folder nobody works in', () => {
    expect(isScratchFolder('/private/var/folders/19/T/speedsize-run-1')).toBe(true);
    expect(isScratchFolder('/private/tmp/probe')).toBe(true);
    expect(isScratchFolder('/Users/her/Desktop/dev/zero')).toBe(false);
    expect(isScratchFolder(null)).toBe(true);
  });

  it('knows who started a session', () => {
    expect(startedByHand('cli')).toBe(true);
    expect(startedByHand('claude-desktop')).toBe(true);
    expect(startedByHand('sdk-cli')).toBe(false);
    // An entrypoint nobody has seen is not the user's, on purpose.
    expect(startedByHand(undefined)).toBe(false);
    expect(startedByHand('something-new')).toBe(false);
  });

  it('reads a transcript by its head, not by its whole self', () => {
    const file = path.join(home, '.claude', 'projects',
      '-Users-her-Desktop-dev-zero', 'aaaaaaaa-0000-0000-0000-000000000001.jsonl');
    const head = readTranscriptHead(file);
    expect(head.entrypoint).toBe('cli');
    expect(head.cwd).toBe(`${home}/Desktop/dev/zero`);
    expect(head.said[0]).toBe('this is a test');
  });

  it('groups by the folder the work happened in, newest folder first', () => {
    const { threads } = readSessionThreads({ home, now: NOW });
    const groups = threadsByFolder(threads);
    expect(groups[0].short).toBe('~/Desktop/dev/zero');
    expect(groups.map((g) => g.short)).toContain('~/Desktop/dev/harbour');
  });

  // Seven until the launch list asked for ten (w-db6f5e331e); the cases for
  // ten live in the-import-offers-the-last-ten-days-from-claude-code-or-codex.
  it('reads a few days as ten, which is the window her card opens on', () => {
    expect(RECENT_DAYS).toBe(10);
  });
});
