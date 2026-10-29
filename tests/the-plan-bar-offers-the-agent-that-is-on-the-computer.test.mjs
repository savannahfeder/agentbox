// THE BAR PUSHED YOU AT A PLAN YOU HAD JUST TURNED DOWN (F-151).
//
// A tester on a fresh Linux box took the Codex path on the first screen,
// installed Codex, sent a first task, and the inbox put up "Agents cannot
// start until they have a plan to run on." with Set up with Claude leading it.
// They had chosen between the two agents one screen earlier. The loud button
// was for the one they did not choose, and the sentence named neither, so the
// bar read as a page that had not been watching.
//
// Measured on the v0.1.19 release (118ca93f), shots b009-09 and b009-10,
// Oct 29 2026.
//
// A SEPARATE FAULT FROM THE ONE ABOVE IT. Whether the bar may speak at all is
// `sureNoPlan`, and
// tests/the-plan-bar-only-says-agents-cannot-start-when-that-is-true holds
// that line. This file is only about what it says once it has spoken: the tool
// already on the disk leads, and the sentence names what is missing from it,
// which is a sign-in and not a plan.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planBar } from '../renderer/src/plan-setup.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const reading = (engine, found, signedIn, certain = true) => ({ engine, found, signedIn, certain });
const nothing = (engine) => reading(engine, false, false);

describe('what the plan bar offers', () => {
  // The reported case: Codex installed, signed out, no Claude Code anywhere.
  it('leads with the agent that is already on the computer', () => {
    const bar = planBar([nothing('claude'), reading('codex', true, false)]);
    expect(bar.first).toEqual({ plan: 'codex', label: 'Sign in to ChatGPT' });
    expect(bar.second).toEqual({ plan: 'claude', label: 'Set up with Claude' });
  });

  it('says a sign-in is what is missing, not a plan', () => {
    expect(planBar([nothing('claude'), reading('codex', true, false)]).say)
      .toBe('Agents cannot start until you sign in to your ChatGPT plan.');
  });

  // The same the other way round, so the rule is the disk and not an order.
  it('leads with Claude when Claude Code is the one that is here', () => {
    const bar = planBar([reading('claude', true, false), nothing('codex')]);
    expect(bar.first).toEqual({ plan: 'claude', label: 'Sign in to Claude' });
    expect(bar.second).toEqual({ plan: 'codex', label: 'Set up with ChatGPT' });
    expect(bar.say).toBe('Agents cannot start until you sign in to your Claude plan.');
  });

  // The boundary on one side: nothing on the disk, so there is nothing to
  // lead with and the old words are still the true ones.
  it('asks for a plan when neither agent is on the computer', () => {
    const bar = planBar([nothing('claude'), nothing('codex')]);
    expect(bar.say).toBe('Agents cannot start until they have a plan to run on.');
    expect(bar.first).toEqual({ plan: 'claude', label: 'Set up with Claude' });
    expect(bar.second).toEqual({ plan: 'codex', label: 'Set up with ChatGPT' });
  });

  // And the other side: both on the disk and both signed out, so neither can
  // lead on being here and the sentence cannot name one plan.
  it('offers both sign-ins when both agents are here and signed out', () => {
    const bar = planBar([reading('claude', true, false), reading('codex', true, false)]);
    expect(bar.say).toBe('Agents cannot start until they have a plan to run on.');
    expect(bar.first).toEqual({ plan: 'claude', label: 'Sign in to Claude' });
    expect(bar.second).toEqual({ plan: 'codex', label: 'Sign in to ChatGPT' });
  });

  // THE CASE THAT MUST NOT MATCH. The bar is silent whenever it cannot be
  // sure, and silent is nothing to draw at all.
  it('has nothing to say when a plan is signed in', () => {
    expect(planBar([nothing('claude'), reading('codex', true, true)])).toBe(null);
  });

  it('has nothing to say when a reading never answered', () => {
    expect(planBar([nothing('claude'), reading('codex', true, false, false)])).toBe(null);
  });
});

describe('what the inbox draws', () => {
  const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

  // The bar is drawn off the words, so there is one place that decides both
  // whether it speaks and what it says.
  it('draws the bar only when there are words for it', () => {
    const line = app.split('\n').find((l) => l.includes('<PlanBar'));
    expect(line).toMatch(/planWords/);
    expect(line).toMatch(/!snap\.supervisor\.running\?\.length/);
  });
});
