// TAKING BACK A TASK THE AGENT ALREADY ANSWERED SAYS IT WAS TOO LATE.
//
// What broke: the pre-deploy breaker (verify-agentbox, 2026-10-15, seen twice)
// sent a quick task and pressed Z while "Started" was still up. The toast said
// "Withdrawn", the words went back in the composer, and the thread was closed
// with "Undid sending it". But the agent had already answered: its answer sat
// in Done, and sending the words again would have run it a second time.
//
// A task the agent has not answered yet is still truly withdrawn: closing it
// stops the worker (main/ipc.mjs stops the session on any close). Only the
// answered case changes: nothing is closed, the words stay where they are, and
// the answer is opened.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answeredAlready, TOO_LATE_TO_WITHDRAW } from '../renderer/src/withdraw-send';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

describe('whether a task just sent has already been answered', () => {
  it('is answered once an agent has written a result', () => {
    expect(answeredAlready({ status: 'open', result: 'PINEAPPLE' })).toBe(true);
  });

  it('is not answered while the agent is still working on it', () => {
    expect(answeredAlready({ status: 'claimed', result: '' })).toBe(false);
    expect(answeredAlready({ status: 'claimed' })).toBe(false);
  });

  it('is not answered when the result is only whitespace', () => {
    expect(answeredAlready({ status: 'open', result: '  \n' })).toBe(false);
  });

  it('is not answered when the row cannot be found', () => {
    expect(answeredAlready(null)).toBe(false);
    expect(answeredAlready(undefined)).toBe(false);
  });
});

describe('what Z says when it is too late', () => {
  it('says it was too late, and does not say "Withdrawn"', () => {
    expect(TOO_LATE_TO_WITHDRAW).toMatch(/too late/i);
    expect(TOO_LATE_TO_WITHDRAW).not.toMatch(/withdrawn/i);
  });
});

describe('the wiring in App.tsx', () => {
  // Every place a task is made.
  it('reads the row fresh before taking a new task back, and refuses when it is answered, everywhere a task is made', () => {
    const places = [...app.matchAll(/'take back the task you just made'/g)].map((m) => m.index);
    expect(places.length).toBeGreaterThanOrEqual(1);
    for (const at of places) {
      const near = app.slice(at, at + 900);
      expect(near).toMatch(/api\.snapshot\(\)/);
      expect(near).toMatch(/answeredAlready\(/);
      expect(near).toMatch(/refused: TOO_LATE_TO_WITHDRAW/);
    }
  });

  it('a refused undo leaves no "Undid sending it" mark and gives no words back', () => {
    const at = app.indexOf("'refused' in outcome");
    expect(at).toBeGreaterThan(-1);
    const branch = app.slice(at, app.indexOf('return { failed: outcome.refused };', at) + 'return { failed: outcome.refused };'.length);
    expect(branch).not.toMatch(/leaveUndoMarks/);
    expect(branch).not.toMatch(/restore/);
    expect(branch).toContain('return { failed: outcome.refused };');
  });
});
