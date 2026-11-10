// A RUN CAN READ WHICH MODEL AND EFFORT IT IS ON.
//
// The owner's rule of 2026-11-03 is that a demo video runs on Opus 5.5 at high
// effort, and that an agent which cannot run at that level must stop rather than
// make the film anyway. No run could obey it: a worker is told what to do and
// never what it is, so the only model name in its system prompt was Claude
// Code's own "You are powered by…", which says nothing about the effort level,
// and a teammate had no way to check either half.
//
// Measured on the film that started this (w-480ebb3f7b57, 2026-11-04): the run
// was on Opus 5 at high effort while the reply box over it said Opus 5.5, and
// the agent could not have noticed. The model half is fixed at the source
// (tests/a-run-nobody-picked-a-model-for-is-on-the-model-the-card-names); this
// is the half that lets a rule about either one be checked by the run it binds.
//
// IT SAYS ONLY WHAT IS KNOWN. With no effort level on the row, Claude Code runs
// the model at its own default and the app does not get to name it, so the line
// names the model and stops.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const supervisor = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'what-this-run-is-on-'));
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  return new Supervisor({ storeRoot: dir, maxConcurrentSessions: 1 }, store, REPO, REPO, dir);
};
const product = { slug: 'p', dir: os.tmpdir(), repoPath: null };
const row = (patch = {}) => ({ id: 'w-1a2b3c4d5e', product: 'p', title: 'Make the film', body: 'Do it.', labels: ['founder'], ...patch });
const lineOf = (patch, engine = 'claude') => {
  const system = supervisor().spawnPlan(row(patch), product, { engine }).system;
  return system.split('\n').find((l) => l.startsWith('This run is on ')) ?? null;
};

describe('the line every worker is given about itself', () => {
  it('names the model that will really run, by the name the app draws', () => {
    expect(lineOf({ effort: 'high' })).toBe('This run is on Claude Code, Opus 5.5, at high effort.');
  });

  it('names a model picked on the row instead', () => {
    expect(lineOf({ model: 'sonnet', effort: 'low' })).toBe('This run is on Claude Code, Sonnet 5.5, at low effort.');
  });

  // A version pinned by hand draws as itself, the rule the picker follows
  // (renderer/src/models.ts modelChoices), so an older model cannot hide behind
  // a newer label.
  it('names a pinned version as itself', () => {
    expect(lineOf({ model: 'claude-opus-5', effort: 'high' })).toBe('This run is on Claude Code, Opus 5, at high effort.');
  });

  it('claims no effort level when nothing set one', () => {
    expect(lineOf({})).toBe('This run is on Claude Code, Opus 5.5.');
    expect(lineOf({})).not.toContain('effort');
  });

  // A word Claude Code does not take is dropped from the command line, so it
  // must not be claimed here either.
  it('claims no effort level for a word the engine would drop', () => {
    expect(lineOf({ effort: 'enormous' })).toBe('This run is on Claude Code, Opus 5.5.');
  });

  it('names codex and its own slug', () => {
    expect(lineOf({ engine: 'codex', model: 'gpt-5.6-sol', effort: 'high' }, 'codex'))
      .toBe('This run is on Codex, gpt-5.6-sol, at high effort.');
  });

  it('names no model for a codex run whose model its own config decides', () => {
    expect(lineOf({ engine: 'codex', effort: 'high' }, 'codex')).toBe('This run is on Codex, at high effort.');
  });
});

describe('what the line is for', () => {
  const system = supervisor().spawnPlan(row({ effort: 'high' }), product, { engine: 'claude' }).system;

  it('says to check a rule about either against it, and to say so when they differ', () => {
    expect(system).toContain('Check a rule that names a model or an effort level against it');
  });

  // It is a fact about the run, so it sits with the connections above the
  // person's own instructions rather than among them, and the blocks that must
  // stay last still are.
  it('sits above the person\'s standing instructions', () => {
    expect(system.indexOf('This run is on ')).toBeLessThan(system.indexOf('These rules format a final answer'));
  });
});
