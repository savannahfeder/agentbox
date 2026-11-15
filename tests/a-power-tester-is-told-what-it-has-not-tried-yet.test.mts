// A POWER TESTER IS TOLD WHAT IT HAS NOT TRIED YET.
//
// What was wrong (w-811757c0b5, 2026-10-20): an agent asked to test the app
// sent a thread or two, saw answers land, and reported that everything works.
// The bugs the person running these tests keeps finding by hand sit in what
// that skips: many threads at once, replying while an agent is still working,
// long threads, switching to Codex or another model, a second project, undo.
//
// Each round of a power test now reads what the tester did (its key presses,
// from browse.mjs's action log, and what the app wrote to its ledger) and
// hands the next round the list of what it has not done yet.
import { describe, it, expect } from 'vitest';
import { coverage, testerPrompt } from '../.claude/skills/power-test/scripts/plan.mjs';

const person = { name: 'Test Person', role: 'an engineer', atOnce: 4, codex: true, projects: ['Payments API', 'Web app'], day: ['Morning'], text: 'You are an engineer.', knowsKeys: true };
const ask = (id, ts, extra = {}) => ({ id, ts, source: 'founder', product: 'payments-api', patch: { title: `task ${id}`, model: 'opus', ...extra } });
const reply = (id, ts, extra = {}) => ({ id, ts, source: 'founder', patch: { answer: 'more', ...extra } });
const answer = (id, ts) => ({ id, ts, source: 'agent', patch: { result: 'done' } });

describe('what a tester has done today', () => {
  it('counts threads, replies, a reply while the agent was working, and the longest thread', () => {
    const lines = [
      ask('a', 1), answer('a', 2), reply('a', 3), reply('a', 4), answer('a', 5), reply('a', 6), reply('a', 7),
      ask('b', 10), ask('c', 11, { engine: 'codex' }),
    ];
    const c = coverage({ lines, person, maxAtOnce: 1 });
    expect(c.threads).toBe(3);
    expect(c.replies).toBe(4);
    expect(c.did).toContain('replied while an agent was still working');
    expect(c.did).toContain('a thread 5 messages long');
    expect(c.did).toContain('used Codex');
  });

  it('does not count a rename as an ask, or the seeded history as the tester\'s', () => {
    const lines = [ask('a', 1), answer('a', 2), { id: 'a', ts: 3, source: 'founder', patch: { title: 'renamed' } }, ask('old', 0)];
    const c = coverage({ lines, person, seeded: new Set(['old']) });
    expect(c.threads).toBe(1);
    expect(c.did).not.toContain('replied while an agent was still working');
  });

  it('lists what is not done yet, in words a person uses', () => {
    const c = coverage({ lines: [ask('a', 1)], actions: [{ verb: 'press', args: ['n'] }], person, maxAtOnce: 1 });
    expect(c.notYet).toEqual(expect.arrayContaining([
      'having 4 threads going at once, as you do on a busy day',
      'replying to a thread while its agent is still working',
      'sending some work to Codex instead of Claude Code',
      'working in more than one of your projects',
      'undoing something (Z)',
      'the command bar (⌘K)',
    ]));
  });

  it('reads keys from the action log: the command bar needs meta, an option is a digit', () => {
    const k = coverage({ actions: [{ verb: 'press', args: ['k'] }], person });
    expect(k.notYet).toContain('the command bar (⌘K)');
    const both = coverage({ actions: [{ verb: 'press', args: ['k', 'meta'] }, { verb: 'press', args: ['2'] }, { verb: 'away', args: ['5'] }], person });
    expect(both.did).toEqual(expect.arrayContaining(['used the command bar', 'picked an option', 'stepped away']));
  });

  it('asks about Codex and a second project only of someone who has them', () => {
    const solo = { ...person, codex: false, projects: ['One'] };
    const c = coverage({ person: solo });
    expect(c.notYet.join('\n')).not.toMatch(/Codex|more than one of your projects/);
  });
});

describe('what the next round is told', () => {
  const base = { person, focus: 'replies after switching to Codex', browse: 'B', diary: 'D', shots: '/tmp/x', round: 3, totalMinutes: 180, minutesLeft: 140, roundMinutes: 20, fraction: 0.2, diaryTail: ['sent three threads'], issues: ['#1 [wrong] answer on the wrong thread (seen 1)'], notYet: ['undoing something (Z)'], real: false };

  it('carries the time left, the focus, what was done, the issues and what is not done yet', () => {
    const p = testerPrompt(base);
    for (const s of ['140 minutes are left', 'replies after switching to Codex', 'sent three threads', 'answer on the wrong thread', 'undoing something (Z)']) expect(p).toContain(s);
  });

  it('says there is no point at which the tester is done', () => {
    expect(testerPrompt(base)).toMatch(/You are never done/);
    expect(testerPrompt(base)).toMatch(/Never stop to write a summary/);
  });

  it('tells a tester that stopped early last time how many minutes it threw away, and says nothing for under two', () => {
    expect(testerPrompt({ ...base, stoppedEarlyMin: 14 })).toContain('you stopped 14 minutes early');
    expect(testerPrompt({ ...base, stoppedEarlyMin: 1 })).not.toContain('stopped 1 minutes early');
  });

  it('opens the app on the first round and looks on the later ones', () => {
    expect(testerPrompt({ ...base, round: 1 })).toContain('B open');
    expect(testerPrompt(base)).not.toContain('B open');
  });

  it('teaches the keys only to someone who knows them', () => {
    expect(testerPrompt(base)).toContain('E closes a thread');
    expect(testerPrompt({ ...base, person: { ...person, knowsKeys: false } })).not.toContain('E closes a thread');
  });
});
