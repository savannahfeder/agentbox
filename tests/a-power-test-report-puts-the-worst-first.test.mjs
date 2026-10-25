// A POWER TEST REPORT PUTS THE WORST FIRST.
//
// What was asked (w-811757c0b5, 2026-10-20): "log every potential issue", over
// hours, from several testers at once. A pile of diary lines is not something a
// person can act on, so the report ranks what the testers logged (broken, then
// wrong, slow, confusing; then how often it was seen), sets beside each one
// what had just happened to the app (a login running out, a restart), and adds
// what the watcher found that no tester could see.
//
// The tester writes issues through diary.mjs, one line at a time, so a tester
// stopped mid-action by the clock loses nothing it had logged.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rankIssues, nearestEvent, writeReport } from '../.claude/skills/power-test/scripts/report.mjs';
import { readDiary, issueFrom } from '../.claude/skills/power-test/scripts/diary.mjs';

const DIARY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.claude/skills/power-test/scripts/diary.mjs');
const MIN = 60_000;

describe('the diary a tester writes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-'));
  const diary = (...args) => spawnSync(process.execPath, [DIARY, ...args], { env: { ...process.env, POWER_OUT: dir }, encoding: 'utf8' });

  it('logs an issue with a number, and counts it again when it is seen again', () => {
    expect(diary('note', 'sent five threads').stdout).toMatch(/Noted/);
    expect(diary('issue', '--severity', 'wrong', '--title', 'answer on the wrong thread', '--steps', '1. send two', '--shot', 'two').stdout).toMatch(/Logged issue 1\. No picture called two\.png yet/);
    expect(diary('again', '1', 'happened with Codex too').stdout).toMatch(/seen 2 times/);
    const { issues, notes } = readDiary(path.join(dir, 'diary.jsonl'));
    expect(notes).toHaveLength(1);
    expect(issues[0]).toMatchObject({ n: 1, severity: 'wrong', seen: 2, shots: ['two.png'] });
  });

  it('refuses an issue with no title, a severity it does not know, or an again for an issue that is not there', () => {
    expect(issueFrom(['--severity', 'broken']).error).toMatch(/--title/);
    expect(issueFrom(['--title', 'x', '--severity', 'bad']).error).toMatch(/broken, wrong, slow, confusing/);
    const r = diary('again', '9', 'x');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/There is no issue 9\. You have logged 1/);
  });
});

describe('the order of what went wrong', () => {
  it('puts broken before wrong, and the one seen twice before the one seen once', () => {
    const ranked = rankIssues([
      { title: 'a', severity: 'confusing', seen: 3, at: 1 },
      { title: 'b', severity: 'wrong', seen: 1, at: 2 },
      { title: 'c', severity: 'broken', seen: 1, at: 3 },
      { title: 'd', severity: 'wrong', seen: 2, at: 4 },
    ]);
    expect(ranked.map((i) => i.title)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('ties an issue to what happened in the ten minutes before it, and not to anything after or longer ago', () => {
    const events = [{ at: 0, kind: 'agents', says: 'agents' }, { at: 20 * MIN, kind: 'login-out', says: 'login out' }, { at: 40 * MIN, kind: 'restart', says: 'restart' }];
    expect(nearestEvent(events, 23 * MIN).says).toBe('login out');
    expect(nearestEvent(events, 31 * MIN)).toBeNull();
    expect(nearestEvent(events, 39 * MIN)).toBeNull();
  });

  it('never blames the agents\' pace, which holds for the whole session', () => {
    expect(nearestEvent([{ at: 0, kind: 'agents', says: 'agents' }], 2 * MIN)).toBeNull();
  });
});

describe('the report', () => {
  it('ranks the testers\' issues, says what happened before each, and adds the watcher\'s findings', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'power-'));
    const dir = path.join(root, 'founder');
    fs.mkdirSync(dir);
    const start = 1_000_000;
    const write = (file, rows) => fs.writeFileSync(path.join(dir, file), rows.map((r) => JSON.stringify(r)).join('\n'));
    write('diary.jsonl', [
      { at: start + 5 * MIN, kind: 'issue', severity: 'confusing', title: 'the Later menu has no way out' },
      { at: start + 23 * MIN, kind: 'issue', severity: 'broken', title: 'a thread never started', steps: '1. send it', shots: ['never.png'] },
      { at: start + 30 * MIN, kind: 'again', n: 2, text: 'again after reload' },
    ]);
    write('timeline.jsonl', [{ at: start + 20 * MIN, kind: 'login-out', says: 'The .claude-second login ran out of usage.' }]);
    write('machine.jsonl', [{ key: 'log:x', kind: 'log-error', severity: 'wrong', title: 'The app logged an error', detail: 'leftovers: could not list processes', firstAt: start + MIN, count: 3 }]);
    write('actions.jsonl', [{ at: start, verb: 'look', args: [], ms: 80, errors: [] }, { at: start + 1, verb: 'click', args: ['3'], ms: 2400, errors: ['error: boom'] }]);
    const { text, counts } = writeReport({ root, startedAt: start, endedAt: start + 60 * MIN, focus: 'running out of usage', people: [{ slug: 'founder', name: 'Ana Ruiz', role: 'a founder', dir, rounds: 3, coverage: { did: ['closed threads'], notYet: ['undoing something (Z)'] } }] });
    expect(counts).toEqual({ issues: 2, seenTwice: 1, machine: 1 });
    expect(text.indexOf('a thread never started')).toBeLessThan(text.indexOf('the Later menu has no way out'));
    expect(text).toContain('3 min after: The .claude-second login ran out of usage.');
    expect(text).toContain(path.join(dir, 'never.png'));
    expect(text).toContain('leftovers: could not list processes');
    expect(text).toContain('stand-ins');
    expect(text).toContain('Never got to: undoing something (Z)');
    expect(text).toContain('error: boom');
    expect(fs.readFileSync(path.join(root, 'report.md'), 'utf8')).toBe(text);
  });

  it('says so plainly when nothing was logged or found', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'power-'));
    const dir = path.join(root, 'cto');
    fs.mkdirSync(dir);
    const { text } = writeReport({ root, startedAt: 0, endedAt: 30 * MIN, real: true, people: [{ slug: 'cto', name: 'Sam Patel', role: 'a CTO', dir }] });
    expect(text).toContain('Nothing logged.');
    expect(text).toMatch(/the watcher found 0/);
    expect(text).not.toContain('stand-ins');
  });
});
