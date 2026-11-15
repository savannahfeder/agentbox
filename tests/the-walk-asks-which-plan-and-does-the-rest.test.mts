// THE WALK ASKS WHICH PLAN THEY PAY FOR, AND ONLY WHEN IT HAS TO.
//
// Picked 2026-10-05 (w-9f6975906c) out of four drawn approaches: "asking which
// plan, then doing it for them, makes the most sense", and "if we can detect
// it, we should just use it straight up". Before this, somebody with a Claude or
// ChatGPT plan and no Claude Code or Codex reached a card at the END of the walk
// with a link to an install page and a Check again button, and nothing else.
//
// These pin the parts with no window in them: when the question is asked at
// all, what "check this Mac for me" does, which tools a plan sets up, and what
// the setup card says at every moment, so it never shows a step as done that is
// not, and never asks anything but the one browser approval.

import { describe, it, expect } from 'vitest';
import {
  COPY, needsPlan, afterCheck, enginesFor, setupRows, setupLede, planName, toolName,
} from '../renderer/src/plan-setup.ts';

const r = (engine, found, signedIn) => ({ engine, found, signedIn });

describe('whether the question is asked', () => {
  it('is not asked when Claude Code is there and signed in', () => {
    expect(needsPlan([r('claude', true, true), r('codex', false, false)])).toBe(false);
  });
  it('is not asked when only Codex is ready, because one is enough', () => {
    expect(needsPlan([r('claude', false, false), r('codex', true, true)])).toBe(false);
  });
  it('is asked on a Mac with nothing', () => {
    expect(needsPlan([r('claude', false, false), r('codex', false, false)])).toBe(true);
  });
  it('is asked when a tool is there but signed out, since nothing can run yet', () => {
    expect(needsPlan([r('claude', true, false), r('codex', false, false)])).toBe(true);
  });
});

describe('check this Mac for me', () => {
  it('ends the question when something turns out to be ready', () => {
    expect(afterCheck([r('claude', false, false), r('codex', true, true)])).toEqual({ t: 'ready' });
  });
  // IT SAYS WHAT IT FOUND AND WAITS, where it used to start the sign-in itself
  // (w-8656bdd97d). The setup card starts the tool's own login on its first
  // render, so answering with a plan here put an OAuth page in somebody's
  // browser before they had pressed anything.
  it('says what it found when the one that is there is signed out', () => {
    expect(afterCheck([r('claude', true, false), r('codex', false, false)])).toEqual({ t: 'found' });
    expect(afterCheck([r('claude', false, false), r('codex', true, false)])).toEqual({ t: 'found' });
  });
  it('says the same when both are there and both are signed out', () => {
    expect(afterCheck([r('claude', true, false), r('codex', true, false)])).toEqual({ t: 'found' });
  });
  it('says so when there is nothing at all, rather than guessing a plan', () => {
    expect(afterCheck([r('claude', false, false), r('codex', false, false)])).toEqual({ t: 'nothing' });
  });
});

describe('which tools a plan sets up', () => {
  it('Claude sets up Claude Code, ChatGPT sets up Codex, both does Claude first', () => {
    expect(enginesFor('claude')).toEqual(['claude']);
    expect(enginesFor('codex')).toEqual(['codex']);
    expect(enginesFor('both')).toEqual(['claude', 'codex']);
  });
});

describe('the question is in words people know', () => {
  it('names the plans, never the tools underneath', () => {
    const question = [COPY.planHead, COPY.planLede, COPY.claude, COPY.claudePlans, COPY.chatgpt, COPY.chatgptPlans, COPY.both, COPY.bothPlans, COPY.notSure, COPY.privacy].join(' ');
    expect(question).not.toMatch(/Claude Code|Codex|harness|CLI|terminal/i);
    expect(planName('codex')).toBe('ChatGPT');
    expect(toolName('codex')).toBe('Codex');
  });
});

describe('the setup card', () => {
  const states = (phase, engine = 'claude') => setupRows({ engine, phase }).map((x) => x.state);

  it('is installing first', () => {
    expect(states('installing')).toEqual(['now', 'todo', 'todo']);
    expect(setupLede('installing')).toBe(COPY.setupLedeBusy);
  });

  it('asks for the browser approval and nothing else while it signs in', () => {
    const rows = setupRows({ engine: 'claude', phase: 'signing-in' });
    expect(rows.map((x) => x.state)).toEqual(['done', 'now', 'todo']);
    expect(rows[1].sub).toMatch(/Authorize/);
    expect(rows[1].right).toBe(COPY.waiting);
    expect(setupLede('signing-in')).toBe(COPY.setupLedeWait);
  });

  it('names the ChatGPT page, not the Claude one, for Codex', () => {
    expect(setupRows({ engine: 'codex', phase: 'signing-in' })[1].sub).toMatch(/ChatGPT page/);
    expect(setupRows({ engine: 'codex', phase: 'installing' })[0].title).toBe('Install Codex');
  });

  it('ticks everything only once it is ready', () => {
    expect(states('ready')).toEqual(['done', 'done', 'done']);
    for (const phase of ['idle', 'installing', 'checking', 'signing-in', 'failed']) {
      expect(states(phase)).not.toEqual(['done', 'done', 'done']);
    }
  });

  it('marks nothing as happening once it has failed, and says so', () => {
    expect(states('failed')).toEqual(['todo', 'todo', 'todo']);
    expect(setupLede('failed')).toBe(COPY.setupLedeFailed);
  });
});
