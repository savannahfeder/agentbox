// A THREAD THAT OPENS WITH A PASTED SCREENSHOT IS STILL OFFERED.
//
// What broke: the import card asked "are there more agents here to import?"
// and there were. On one Mac on 2026-10-05, three terminal conversations from
// the last ten days, about 1MB each and plainly typed into, never reached the
// card. Each opened with a pasted screenshot, which Claude Code writes into the
// first message row as base64, so that one line was 240KB, 294KB and 486KB.
// The reader looks at the first 96KB of a transcript and drops the half line at
// the end of what it read, so the first message was thrown away whole, the
// thread had no name, and a thread with no name is dropped. Measured by reading
// every transcript head of those ten days with no time limit: 6 started by
// hand, 2 offered, 3 lost this way, 1 rightly left out (an `/mcp` login).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isScratchFolder, isScratchProjectDir, readSessionThreads, readTranscriptHead, threadTitle,
} from '../main/agent-sessions.mts';

const NOW = Date.UTC(2026, 9, 5, 20, 0, 0);
const ago = (mins) => NOW - mins * 60 * 1000;
const image = (bytes) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'A'.repeat(bytes) } });

let home;

/**
 * A transcript in the shape Claude Code writes today: housekeeping rows first,
 *  an attachment row carrying `cwd` and `entrypoint`, then the first message,
 *  whose `type` comes before its content and whose `cwd` comes after it. */
function writeTranscript({ folder, id, entrypoint = 'cli', content, when = ago(10), extra = [] }) {
  const cwd = `${home}/${folder}`;
  const dir = path.join(home, '.claude', 'projects', folder.replace(/\//g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  const lines = [
    { type: 'permission-mode', permissionMode: 'default', sessionId: id },
    { type: 'attachment', attachment: { type: 'x' }, entrypoint, cwd, sessionId: id },
    { parentUuid: null, type: 'user', message: { role: 'user', content }, userType: 'external', entrypoint, cwd, sessionId: id },
    ...extra,
  ];
  fs.writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  fs.utimesSync(file, new Date(when), new Date(when));
  return file;
}

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'w-24ed-home-'));
});
afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe('a first message bigger than the part of the file that is read first', () => {
  it('still gives the thread its name, text before the picture (the reported case)', () => {
    const file = writeTranscript({
      folder: 'Astral', id: 'a0000000-0000-0000-0000-000000000001',
      content: [{ type: 'text', text: '[Image #1] For some reason, all of my agents are currently stuck' }, image(240_000)],
    });
    expect(threadTitle(readTranscriptHead(file).said)).toBe('For some reason, all of my agents are currently stuck');
  });

  it('still gives the thread its name when the picture comes before the words', () => {
    const file = writeTranscript({
      folder: 'Astral', id: 'a0000000-0000-0000-0000-000000000002',
      content: [image(490_000), { type: 'text', text: 'why is the sidebar blank here?' }],
    });
    expect(threadTitle(readTranscriptHead(file).said)).toBe('why is the sidebar blank here?');
  });

  it('still names it when two pictures come first and the words are past a megabyte', () => {
    const file = writeTranscript({
      folder: 'Astral', id: 'a0000000-0000-0000-0000-000000000003',
      content: [image(700_000), image(700_000), { type: 'text', text: 'compare these two' }],
    });
    expect(threadTitle(readTranscriptHead(file).said)).toBe('compare these two');
  });

  it('a first message just inside the first read was already fine and stays fine', () => {
    const file = writeTranscript({
      folder: 'Astral', id: 'a0000000-0000-0000-0000-000000000004',
      content: [{ type: 'text', text: 'small paste' }, image(90_000)],
    });
    expect(threadTitle(readTranscriptHead(file).said)).toBe('small paste');
  });

  it('a picture with no words still leaves the thread nameless', () => {
    const file = writeTranscript({
      folder: 'Astral', id: 'a0000000-0000-0000-0000-000000000005',
      content: [image(300_000)],
    });
    expect(threadTitle(readTranscriptHead(file).said)).toBe('');
  });

  it('stops at a ceiling rather than reading a huge line to its end', () => {
    const file = writeTranscript({
      folder: 'Astral', id: 'a0000000-0000-0000-0000-000000000006',
      content: [image(60_000), { type: 'text', text: 'past the ceiling' }],
    });
    // Head of 4KB, ceiling of 16KB: the words are 60KB in, so they are not reached.
    expect(readTranscriptHead(file, 4 * 1024, 16 * 1024).said).toEqual([]);
    // And with a ceiling past them, they are.
    expect(threadTitle(readTranscriptHead(file, 4 * 1024, 128 * 1024).said)).toBe('past the ceiling');
  });

  it('does not read further when the cut line is not a message she typed', () => {
    // A huge attachment row cut at the head: nothing to gain from reading it.
    const dir = path.join(home, '.claude', 'projects', 'big-attachment');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'a0000000-0000-0000-0000-000000000007.jsonl');
    fs.writeFileSync(file, `${JSON.stringify({ type: 'attachment', entrypoint: 'cli', cwd: `${home}/x`, blob: 'B'.repeat(200_000), note: 'type":"user' })}\n`);
    expect(readTranscriptHead(file).said).toEqual([]);
  });
});

describe('the card', () => {
  it('offers the screenshot thread and still leaves out a worker whose brief is huge', () => {
    const cardHome = fs.mkdtempSync(path.join(os.tmpdir(), 'w-24ed-card-'));
    const was = home;
    home = cardHome;
    try {
      writeTranscript({
        folder: 'Astral', id: 'c0000000-0000-0000-0000-000000000001',
        content: [{ type: 'text', text: '[Image #1] all my agents are stuck' }, image(300_000)],
      });
      writeTranscript({
        folder: 'Zero/agentbox', id: 'c0000000-0000-0000-0000-000000000002', entrypoint: 'sdk-cli',
        content: [image(300_000), { type: 'text', text: '# Your work item' }],
      });
      const { threads } = readSessionThreads({ home: cardHome, now: NOW });
      expect(threads.map((t) => t.title)).toEqual(['all my agents are stuck']);
    } finally {
      home = was;
      fs.rmSync(cardHome, { recursive: true, force: true });
    }
  });
});

// THE SECOND THING BETWEEN HER AND THE OLDEST OF THEM: TIME. The card stops
// opening transcripts after three seconds. Of the 12,272 touched in those ten
// days about 12,000 sat in temp folders, our own workers and push checks, and
// every one was opened before being refused. Newest first, the oldest of her
// threads was the 9,968th in line; the first, uncached read that evening got
// through about 6,800. A temp folder is refused anyway, so it is now refused
// by its folder name, before anything is opened.
describe('a temp folder is refused before it is opened', () => {
  it('names the folders Claude Code makes for a temp working folder', () => {
    const h = '/Users/someone';
    expect(isScratchProjectDir('-private-tmp-w-fe233cd5e6-wt', h)).toBe(true);
    expect(isScratchProjectDir('-private-var-folders-19-abc-T-zero-row-chat', h)).toBe(true);
    expect(isScratchProjectDir('-var-folders-19-abc-T-run', h)).toBe(true);
    expect(isScratchProjectDir('-tmp-x', h)).toBe(true);
    expect(isScratchProjectDir('-private-tmp', h)).toBe(true);
  });

  it('keeps folders a person works in, including one whose name only starts like tmp', () => {
    const h = '/Users/someone';
    expect(isScratchProjectDir('-Users-someone-Astral', h)).toBe(false);
    expect(isScratchProjectDir('-Users-someone-Desktop-dev-tmp-notes', h)).toBe(false);
    expect(isScratchProjectDir('-tmpl-site', h)).toBe(false);
    expect(isScratchProjectDir('-private-tmpfiles', h)).toBe(false);
  });

  it('keeps a home that itself lives in a temp folder, as the folder rule does', () => {
    const h = '/var/folders/19/abc/T/home-1';
    expect(isScratchProjectDir('-var-folders-19-abc-T-home-1-Desktop-dev-zero', h)).toBe(false);
    expect(isScratchFolder(`${h}/Desktop/dev/zero`, h)).toBe(false);
  });

  it('never opens a transcript in a temp folder, so it costs the read no time', () => {
    const cardHome = fs.mkdtempSync(path.join(os.tmpdir(), 'w-24ed-tmp-'));
    const was = home;
    home = cardHome;
    try {
      const mine = writeTranscript({ folder: 'Desktop/dev/zero', id: 'd0000000-0000-0000-0000-000000000001', content: 'hello there', when: ago(500) });
      const dir = path.join(cardHome, '.claude', 'projects', '-private-tmp-run-1');
      fs.mkdirSync(dir, { recursive: true });
      // Unreadable on purpose: opening it would throw, stat-ing it does not.
      const ours = path.join(dir, 'd0000000-0000-0000-0000-000000000002.jsonl');
      fs.writeFileSync(ours, '{}\n');
      fs.chmodSync(ours, 0o000);
      const { threads, skipped } = readSessionThreads({ home: cardHome, now: NOW });
      expect(threads.map((t) => t.path)).toEqual([mine]);
      expect(skipped.scratch).toBe(1);
      expect(skipped.started).toBe(0);
    } finally {
      home = was;
      fs.rmSync(cardHome, { recursive: true, force: true });
    }
  });
});

describe('the picture placeholder is not part of the name', () => {
  it('drops [Image #n] and [Pasted text #n +k lines] from a title', () => {
    expect(threadTitle('[Image #1] [Image #2] fix this')).toBe('fix this');
    expect(threadTitle('[Pasted text #1 +40 lines] what does this log say')).toBe('what does this log say');
  });

  it('keeps square brackets a person typed', () => {
    expect(threadTitle('[WIP] tidy the sidebar')).toBe('[WIP] tidy the sidebar');
  });
});
