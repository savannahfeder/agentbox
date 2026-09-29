// What we paste in front of every agent, and what we stopped pasting.
//
// Three of the cuts were paragraphs written after two incidents in her own
// store months ago, which mean nothing on a Mac that installed Agentbox
// yesterday. One was the checkpoint rule, which she corrected us on: the pane
// already shows what a session is doing, live, off the run's own trace
// (main/supervisor.mjs traceStreamLine, renderer/src/item-thread.ts), so the
// note was never what made progress visible.
//
// And the repeating-task section is 1,103 characters about how to finish one
// run of a task that runs every day. It was pasted in front of every worker,
// including every one on a task that will never run again. It is fenced now and
// the repeat:<rule> label is the switch.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let root;
let appDir;

const makeSupervisor = (config = {}) => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-brief-app-'));
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO, 'briefs'))) {
    fs.copyFileSync(path.join(REPO, 'briefs', f), path.join(appDir, 'briefs', f));
  }
  // A fresh install: no writing rules, so what is measured here is the
  // scaffolding itself rather than her personal box.
  fs.writeFileSync(path.join(appDir, 'briefs', 'writing-rules.md'), '', 'utf8');
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  return new Supervisor({ storeRoot: root, maxConcurrentSessions: 3, ...config }, store, appDir);
};

const item = (over = {}) => ({ id: 'w-1', product: 'p', title: 'do the thing', labels: [], ...over });
const product = () => {
  const dir = fs.mkdtempSync(path.join(root, 'prod-'));
  return { slug: 'p', name: 'P', dir, repoPath: null };
};

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-brief-')); });
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (appDir) fs.rmSync(appDir, { recursive: true, force: true });
});

// The opening sentence of the repeating-task section, which is what goes
// missing when the fence works.
const REPEAT_RULES = 'If this item is one run of a repeating task';

describe('the repeating-task rules are only pasted onto a repeat run', () => {
  it('a one-off task is not told how to finish a repeat', () => {
    const s = makeSupervisor();
    const brief = s.buildBrief(item(), product(), { continuation: false });
    expect(brief).not.toContain(REPEAT_RULES);
    expect(brief).not.toContain('repeat-rules:start');
  });

  it('a run of a repeating task still gets them whole', () => {
    const s = makeSupervisor();
    const brief = s.buildBrief(item({ labels: ['founder', 'repeat:r1'] }), product(), { continuation: false });
    expect(brief).toContain(REPEAT_RULES);
    // The clean label is the only thing in Agentbox that hides a finished row, so
    // a repeat run that does not learn about it cannot finish quietly.
    expect(brief).toContain('clean');
    expect(brief).not.toContain('repeat-rules:start');
    expect(brief).not.toContain('repeat-rules:end');
  });
});

describe('what she cut is gone from the file we ship', () => {
  const template = () => fs.readFileSync(path.join(REPO, 'briefs', 'worker.md'), 'utf8');

  it('the three scar-tissue paragraphs are out', () => {
    expect(template()).not.toContain('EXISTENCE IS NOT APPROVAL');
    expect(template()).not.toContain('RECENCY OUTRANKS EVERYTHING');
    expect(template()).not.toContain('Recency has a limit');
  });

  it('the checkpoint rule is out', () => {
    expect(template()).not.toContain('Checkpoint as you go');
  });

  // Nothing in Agentbox reads a branch name: the code artifact she opens is built
  // from the session's own transcript, never from git (main/code-change.mjs).
  // So a developer with his own convention keeps it.
  it('our branch name is no longer imposed', () => {
    expect(template()).not.toContain('agentbox/<item-id>');
    expect(template()).toContain('Never commit to main');
  });

  it('altitude stayed, on her word', () => {
    expect(template()).toContain('## Altitude');
  });
});

// THE BRIEF'S OWN LENGTH READS AS AN INSTRUCTION (2026-08-28). 14,000
// characters describing rows, branches, reviews, STATE.md and questions is
// pasted in front of a worker whose row may say nothing more than "what does
// this PDF say", and it argues by sheer volume for a big run.
//
// So the file says out loud what it is, before the section that lists the
// machinery. It goes ahead of 'Doing the work' because that is the section it
// is qualifying.
describe('the brief says its own length is not the instruction', () => {
  const template = () => fs.readFileSync(path.join(REPO, 'briefs', 'worker.md'), 'utf8');

  it('names the biggest-run framing and puts the ask in charge', () => {
    const t = template();
    expect(t).toContain('## The ask sets the size of the run');
    expect(t).toContain('EVERYTHING BELOW DESCRIBES THE BIGGEST KIND OF RUN');
    expect(t).toMatch(/asks a question wants an answer, not a project/);
  });

  // And it pays for itself. Adding prose to fight verbosity is self-defeating,
  // so this section is held to the size of a paragraph, not a section.
  it('is short enough to be worth its own point', () => {
    const t = template();
    const section = t.slice(
      t.indexOf('## The ask sets the size of the run'),
      t.indexOf('## Doing the work'),
    );
    expect(section.length).toBeLessThan(900);
  });

  it('sits above the machinery it qualifies', () => {
    const t = template();
    expect(t.indexOf('## The ask sets the size of the run'))
      .toBeLessThan(t.indexOf('## Doing the work'));
  });

  // The standard is parity with a plain session: a brief that makes an
  // ordinary ask come out worse than plain Claude Code would is overfitted,
  // and the rule against it has to survive every edit to this file.
  it('holds general work to Claude Code parity', () => {
    expect(template()).toMatch(/asks a question wants an answer, not a\s+project/);
    expect(template()).toMatch(/worse than a plain Claude Code\s+session/);
  });

  // It is fenced by nothing, so no marker stripping can take it out of a
  // built brief. A worker on an install with no store tools asks simple
  // questions too, and that is the default this supervisor builds.
  it('reaches a built brief and is behind no switch', () => {
    const t = template();
    const section = t.slice(
      t.indexOf('## The ask sets the size of the run'),
      t.indexOf('## Doing the work'),
    );
    expect(section).not.toMatch(/<!--/);
    const s = makeSupervisor();
    expect(s.buildBrief(item(), product(), { continuation: false }))
      .toContain('## The ask sets the size of the run');
  });
});

// Narrating each step stays, because it is what the row shows while a task
// runs. Priority comes off the agents entirely and the app stamps it
// (shared/rank.mjs, itemPriority). The proposal rule and the blocking rule
// each say the same thing in one sentence instead of six: nothing in the app
// ever read the "Blocked on:" wording, and the Waiting on button in
// Focus.tsx draws off a live CHILD item, which is the half worth demanding.
describe('the four she asked about', () => {
  const template = () => fs.readFileSync(path.join(REPO, 'briefs', 'worker.md'), 'utf8');

  it('narrating each step stayed', () => {
    expect(template()).toContain('NAME EACH STEP IN A SENTENCE THEY WOULD USE');
  });

  it('agents are told to leave priority alone', () => {
    const t = template();
    expect(t).toContain('Leave priority alone');
    expect(t).not.toContain('7 means it blocks other');
    expect(t).not.toMatch(/reserve 8-9/);
  });

  it('the proposal rule is one sentence', () => {
    const t = template();
    const bullet = t.slice(t.indexOf('- EVERYTHING YOU FILE IS A PROPOSAL'));
    const text = bullet.slice(0, bullet.indexOf('\n- '));
    expect(text).toContain('nothing you create runs until');
    expect(text.split('.').filter((x) => x.trim()).length).toBe(1);
  });

  it('the blocking rule keeps the child and drops the wording', () => {
    const t = template();
    expect(t).not.toContain('Blocked on:');
    expect(t).not.toContain('Unblocks when:');
    expect(t).toContain('child work item (parent: this item id)');
  });
});

describe('the whole brief, measured', () => {
  it('a fresh install pastes under 6,000 characters at a one-off task', () => {
    const s = makeSupervisor();
    const brief = s.buildBrief(item(), product(), { continuation: false });
    // The header (the item's own title, body and file list) is not scaffolding;
    // what is pinned here is the instruction sheet that follows it.
    const scaffolding = brief.slice(brief.indexOf('# How to work'));
    expect(scaffolding.length).toBeGreaterThan(0);
    expect(scaffolding.length).toBeLessThan(6000);
  });
});

// THIS RULE CHANGED ON 2026-09-22 AND THE OLD ONE IS KEPT HERE SO NOBODY PUTS
// IT BACK. Every worker used to be told to build in a throwaway worktree, and
// almost none was told strongly enough to delete it: measured on the founder's
// Mac on 2026-08-31, 131 abandoned worktrees across /private/tmp and her home
// folder, 101 GB, the disk at 93%, and the suite failing intermittently because
// a worker mkdtemp'ing under a full /tmp had nowhere to go. Measured again on
// 2026-09-22, this one repository still had 25 of them holding 26 GB, twelve
// carrying edits committed nowhere.
//
// A rule cannot fix that, because its second half (fold the work back, delete
// the copy) only comes due once she approves, and approval rarely lands in the
// hour the session dies.) and a worker that makes a SECOND copy inside its own
// is back to the old problem with an extra step. The brief has to say so in
// both halves: the store-tools worker and the toolless one both write code.
describe('a worker is told the folder it is standing in is already its own', () => {
  const template = () => fs.readFileSync(path.join(REPO, 'briefs', 'worker.md'), 'utf8');
  const RULE = 'YOUR CWD IS ALREADY YOUR OWN FOLDER';

  it('the rule is in the brief', () => {
    expect(template()).toContain(RULE);
  });

  it('it is in both halves, so a toolless session gets it too', () => {
    const t = template();
    const halves = ['store-tools', 'no-store-tools'].map((fence) => {
      const start = t.indexOf(`<!-- ${fence}:start -->`, t.indexOf('## Doing the work'));
      const end = t.indexOf(`<!-- ${fence}:end -->`, start);
      return t.slice(start, end);
    });
    for (const half of halves) expect(half).toContain(RULE);
  });

  it('it reaches a built brief', () => {
    const s = makeSupervisor();
    const brief = s.buildBrief(item(), product(), { continuation: false });
    expect(brief).toContain(RULE);
  });

  // Both halves of the old rule are gone on purpose: a worker must not make a
  // second copy, and must not delete the one the app is keeping for her.
  it('no longer asks a worker to make or remove a worktree of its own', () => {
    const t = template();
    expect(t).not.toContain('Build in a throwaway worktree');
    expect(t).toContain('make a second one or delete this one');
  });

  it('it says the branch keeps the work, because that is what makes the folder disposable', () => {
    expect(template()).toContain('Your branch keeps the commits');
  });
});
