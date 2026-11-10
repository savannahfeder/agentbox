// "I just created a teammate and I don't know what's happening. It sort of
// looks like nothing is going on right now... it just looks stuck." The setup
// run was working: it read the brief, named itself Juno and posted in the chat
// two minutes later. But all its page showed was "Picked up Set up its job"
// under the person's pasted brief. Now a run that is up says so, how long, and
// the step it is on; one with no agent on it yet says it is waiting for one,
// rather than "Picked up"; and a long message folds so it cannot bury either.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { workingLine, longMessage } from '../renderer/src/teammates/chat-lines.ts';

const NOW = 1_800_000_000_000;
const t = (over = {}) => ({ id: 't-aaaaaaaaaa', name: 'Juno', running: { id: 'w-1', product: 'p' }, now: 'Set up its job', ...over });
const session = (over = {}) => ({ itemId: 'w-1', product: 'p', startedAt: NOW - 90_000, tail: [], ...over });

describe('the line for a teammate at work', () => {
  // The first cut read "Is working, 1 minute in Reading docs/launch-plan.md".
  it('names the step it is on, then how long it has been going', () => {
    const line = workingLine(t(), session({ activity: [{ id: 'a', label: 'Reading marketing/relaunch-names.md', detail: '', startedAt: NOW }] }), NOW);
    expect(line).toEqual({ state: 'working', text: 'Reading marketing/relaunch-names.md', aside: '1 minute in' });
  });

  it('says it just started in its first minute, and falls back to the run between steps', () => {
    expect(workingLine(t(), session({ startedAt: NOW - 5_000 }), NOW)).toEqual({ state: 'working', text: 'Set up its job', aside: 'just started' });
  });

  // The line above it already says which run it took on.
  it('says it is waiting for a free agent when nothing is running it yet, without the run again', () => {
    expect(workingLine(t(), null, NOW)).toEqual({ state: 'waiting', text: 'Waiting for a free agent', aside: '' });
  });

  // The team chat drew "Ada Waiting for a free agent" and "Ada Reading docs/x".
  it('reads as a sentence about the teammate in the team chat', async () => {
    const { teamWorkingLine } = await import('../renderer/src/teammates/chat-lines.ts');
    expect(teamWorkingLine('Ada', { state: 'waiting', text: 'Waiting for a free agent', aside: '' })).toEqual({ lead: 'Ada is waiting for a free agent', text: '' });
    expect(teamWorkingLine('Ada', { state: 'working', text: 'Reading docs/launch-plan.md', aside: '1 minute in' })).toEqual({ lead: 'Ada is', text: 'reading docs/launch-plan.md' });
    expect(teamWorkingLine('Ada', { state: 'working', text: 'Set up its job', aside: 'just started' })).toEqual({ lead: 'Ada is on', text: 'Set up its job' });
  });

  it('says nothing for a teammate with nothing on, or one paused and idle', () => {
    expect(workingLine(t({ running: null }), null, NOW)).toBeNull();
    expect(workingLine(t({ running: null, paused: true }), null, NOW)).toBeNull();
  });
});

describe('a long message in the chat', () => {
  it('folds past twelve lines or 900 characters, and a short one does not', () => {
    expect(longMessage('a\n'.repeat(13))).toBe(true);
    expect(longMessage('x'.repeat(901))).toBe(true);
    expect(longMessage('Can you try checkout on a phone?')).toBe(false);
    expect(longMessage('a\n'.repeat(12).trim())).toBe(false);
  });

  it('is drawn folded with a way to read all of it', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/longMessage\(m\.text \?\? ''\)/);
    expect(page).toMatch(/Show all/);
    expect(page).toMatch(/<LiveRow /);
  });
});

// "When it says 'free' underneath its name, I thought it was referring to the
// plan I was on." A teammate with nothing on is Idle, and says until when.
describe('a teammate with nothing on', async () => {
  const { idleLine } = await import('../renderer/src/teammates/chat-lines.ts');
  const { nowLine } = await import('../renderer/src/teammates/TeammatesRail.tsx');
  const SAT = new Date(2026, 9, 24, 10, 0).getTime();
  it('is idle until its next round, or just idle with no schedule', () => {
    expect(idleLine({ works: { every: 'weekday', at: '09:00' } }, SAT)).toBe('Idle until Mon 9:00am');
    expect(idleLine({ works: { every: 'day', at: '15:30' } }, SAT)).toBe('Idle until 3:30pm');
    expect(idleLine({ works: null }, SAT)).toBe('Idle');
  });
  it('never says Free anywhere it is drawn', () => {
    expect(nowLine({ status: 'active', paused: false, running: null, waiting: [], now: null, works: null })).toBe('Idle');
    for (const f of ['TeammatesPage.tsx', 'TeammatesRail.tsx']) {
      expect(fs.readFileSync(new URL(`../renderer/src/teammates/${f}`, import.meta.url), 'utf8')).not.toMatch(/'Free|Free until/);
    }
  });
});
