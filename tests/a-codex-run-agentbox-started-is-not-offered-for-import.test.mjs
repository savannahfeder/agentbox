// A CODEX RUN AGENTBOX STARTED IS NOT OFFERED FOR IMPORT.
//
// Found driving the real app on a Mac with only Codex (w-db6f5e331e,
// 2026-10-05). A task sent from the app ran on Codex 0.160.0, finished, and a
// minute later the inbox held a second row: "Import into Orders Api? You asked
// Codex: '# Your work item Product: Orders Api...'". The app's own run had come
// back as a conversation to import. Its session_meta carried no thread_source
// (the reader then treats any string `source` as a person's), and
// `originator: "agentbox"`, which is the clientInfo name the app hands Codex
// (main/codex-app-server.mjs CLIENT_INFO). So every task on a Codex Mac would
// have asked to be imported back into the inbox it came from.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCodexThreads } from '../main/codex-threads.mjs';

const NOW = Date.now();
let home;
let codexDir;

function rollout(id, originator, prompt) {
  const ts = new Date(NOW - 3600e3).toISOString();
  const d = new Date(NOW - 3600e3);
  const dir = path.join(codexDir, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });
  // As Codex 0.160.0 writes it: no thread_source, a string source.
  fs.writeFileSync(path.join(dir, `rollout-x-${id}.jsonl`), [
    JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { id, session_id: id, timestamp: ts, cwd: path.join(home, 'work'), originator, source: 'vscode' } }),
    JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: prompt } }),
  ].join('\n') + '\n');
}

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-originator-'));
  fs.mkdirSync(path.join(home, 'work'), { recursive: true });
  codexDir = path.join(home, '.codex');
  rollout('ours', 'agentbox', '# Your work item\n\nProduct: Orders Api');
  rollout('ours-old-name', 'astral', '# Your work item\n\nProduct: Orders Api');
  rollout('cli', 'codex_cli_rs', 'Fix the pickup time check');
  rollout('desktop', 'Codex Desktop', 'Tidy the footer');
});
afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

describe('which Codex runs the import offers', () => {
  const ids = () => readCodexThreads({ home, codexDir, now: NOW }).threads.map((t) => t.id);

  it('leaves out a run Agentbox started', () => {
    expect(ids()).not.toContain('ours');
  });
  it('leaves out one started under an older name of the app', () => {
    expect(ids()).not.toContain('ours-old-name');
  });
  it('keeps what a person typed in the Codex CLI or the Codex app', () => {
    expect(ids()).toEqual(expect.arrayContaining(['cli', 'desktop']));
  });
  it('counts ours as not a person\'s', () => {
    expect(readCodexThreads({ home, codexDir, now: NOW }).skipped.notHers).toBe(2);
  });
});
