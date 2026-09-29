// The scaffolding a session is briefed with is HERS, not ours. Two of the
// three parts are pinned here; the third, the drive being off until she turns
// it on, is in drive.test.mjs.
//
// So: the rules ship filled in, they reach every session, and emptying the box
// takes them out of the brief for good. The state page is absent on a fresh
// install, whole when someone said yes, and never half of either.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';

// The real briefs, because the thing being tested is what the shipped files do.
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let root;
let appDir;

// A copy of the repo's briefs, so a test that empties the box cannot empty hers.
const makeSupervisor = (config = {}) => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-scaffold-app-'));
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO, 'briefs'))) {
    fs.copyFileSync(path.join(REPO, 'briefs', f), path.join(appDir, 'briefs', f));
  }
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  return new Supervisor({ storeRoot: root, maxConcurrentSessions: 3, ...config }, store, appDir);
};

const item = (over = {}) => ({ id: 'w-1', product: 'p', title: 'do the thing', ...over });

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-scaffold-')); });
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (appDir) fs.rmSync(appDir, { recursive: true, force: true });
});

// A product dir. It used to be able to hold a state page; that layer is gone
// and tests/the-state-page-is-gone.test.mjs keeps it gone.
const product = () => {
  const dir = fs.mkdtempSync(path.join(root, 'prod-'));
  return { slug: 'p', name: 'P', dir, repoPath: null };
};

// Two sentences out of the document we ship. If the file stops reaching
// sessions, these are what go missing.
//
// THEY USED TO COME OUT OF THE WRITING RULES and they come out of the message
// rules now (w-3dc46f3a67, 2026-09-22), which is one document where there were
// two. The old pair of sentences only ever passed here because this test copies
// the REPO's briefs, where her own writing rules sit: a real download never had
// that file at all, since package.json excludes it. So "a fresh copy already
// has them" was true of the checkout and never of the app.
const A_RULE = 'LINE ONE AND THE OPTIONS ARE ONE QUESTION, NOT TWO';
const THE_OPENING = 'Line one is the thing they have to say back';

describe('the message rules ship filled in', () => {
  it('a fresh copy already has them', () => {
    const s = makeSupervisor();
    expect(s.readMessageRules()).toContain(A_RULE);
    expect(s.readMessageRules()).toContain(THE_OPENING);
  });

  it('every session is briefed with them', () => {
    const s = makeSupervisor();
    expect(s.messageRules()).toContain(A_RULE);
    expect(s.messageRules()).toContain(THE_OPENING);
  });

  // They are no longer welded into the brief we ship, which is the whole point:
  // a rule she cannot reach in the app is not one she can change or remove.
  it('are not hidden inside the worker brief any more', () => {
    const template = fs.readFileSync(path.join(REPO, 'briefs', 'worker.md'), 'utf8');
    expect(template).not.toContain(A_RULE);
    expect(template).not.toContain(THE_OPENING);
  });

  // AND THEY DO NOT RIDE IN THE BRIEF AT ALL ANY MORE. The writing half used to
  // be spliced into it at a placeholder, which is exactly why a personal task
  // never got it: buildBrief returns early for those. The whole document sits
  // in the system prompt now, where every kind of run passes through, and
  // tests/how-agents-write-to-you-reaches-every-run covers that end of it.
  it('do not ride inside the task brief', () => {
    const brief = makeSupervisor().buildBrief(item(), product(), { continuation: false });
    expect(brief).not.toContain(A_RULE);
    expect(brief).not.toContain(THE_OPENING);
    expect(brief).toContain('# How to work');
    expect(brief).toContain('Honesty');
  });
});

describe('and they are hers to change or empty', () => {
  it('an edit reaches the next session with no restart', () => {
    const s = makeSupervisor();
    s.writeMessageRules('Say it in one line and stop.');
    expect(s.messageRules()).toContain('Say it in one line and stop.');
    s.writeMessageRules('Actually, two lines.');
    expect(s.messageRules()).toContain('Actually, two lines.');
    expect(s.messageRules()).not.toContain('Say it in one line and stop.');
  });

  // Emptying the box means sessions follow NO message rules. It must not
  // quietly fall back to the shipped text, or "remove it" was a lie.
  it('emptying the box takes them out of every run', () => {
    const s = makeSupervisor();
    s.writeMessageRules('   \n\n  ');
    expect(s.messageRules()).toBe(null);
    // And the brief is still whole.
    const brief = s.buildBrief(item(), product(), { continuation: false });
    expect(brief).toContain('# How to work');
    expect(brief).toContain('Honesty');
  });

  it('round-trips her text exactly, whitespace and all', () => {
    const s = makeSupervisor();
    s.writeMessageRules('one rule\n\n  and another\n');
    expect(s.readMessageRules()).toBe('one rule\n\n  and another\n');
  });

  it('never leaves a half-written file for a spawn to read', () => {
    const s = makeSupervisor();
    s.writeMessageRules('a rule');
    expect(fs.readdirSync(path.join(appDir, 'briefs')).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  // The seam between the brief and the box was a comment in a markdown file.
  // If it ever reaches a session it reads as an instruction nobody wrote, so it
  // is stripped now rather than filled.
  it('leaves no marker behind either way', () => {
    const s = makeSupervisor();
    expect(s.buildBrief(item(), product(), { continuation: false })).not.toContain('<!-- writing-rules');
    s.writeMessageRules('');
    expect(s.buildBrief(item(), product(), { continuation: false })).not.toContain('<!-- writing-rules');
  });
});


// The folders a worker is allowed into are THIS person's folders, worked out at
// every spawn. They used to be one line in a file we ship, naming one
// developer's home, and that line went out inside the download.
describe('the folders a worker may touch', () => {
  it('grants this install its own store root, and nobody else\'s home', () => {
    const sup = makeSupervisor();
    fs.copyFileSync(path.join(REPO, 'worker-permissions.json'), path.join(appDir, 'worker-permissions.json'));
    const file = sup.writeWorkerSettings(null);
    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(written.permissions.additionalDirectories).toEqual([root]);
    // Folders are the only thing added. Workers run on Claude Code's own
    // defaults, with no allow, ask or deny rules of ours (w-6ade63e1aa).
    expect(Object.keys(written.permissions)).toEqual(['additionalDirectories']);
  });

  it('adds a product whose docs live outside the store, and never twice', () => {
    const sup = makeSupervisor();
    fs.copyFileSync(path.join(REPO, 'worker-permissions.json'), path.join(appDir, 'worker-permissions.json'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-elsewhere-'));
    const both = JSON.parse(fs.readFileSync(sup.writeWorkerSettings({ dir: outside }), 'utf8'));
    expect(both.permissions.additionalDirectories).toEqual([root, outside]);
    // A product inside the store adds nothing: the store root already covers it.
    const inside = JSON.parse(fs.readFileSync(sup.writeWorkerSettings({ dir: path.join(root, 'accounts', 'a', 'p') }), 'utf8'));
    expect(inside.permissions.additionalDirectories).toEqual([root]);
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('hands the spawn a settings file it generated, not the one in the bundle', () => {
    const sup = fs.readFileSync(path.join(REPO, 'main', 'supervisor.mjs'), 'utf8');
    // Named by the run since P2, so two spawns with different connector rules
    // never share one file; still generated, never the bundle's.
    expect(sup).toContain("const rules = this.writeWorkerSettings(product, runId);");
  });
});

// So this one is the mirror image of the state page above. On is what an
// untouched config means, off is a key she has to have written, and neither
// side may leave the fence comment where a session can read it.
// THE SWITCH IS GONE (w-5737fe67cf, 2026-09-23): the rule is always on, and a
// config left over from when it could be turned off does not take it out.
describe('the subagent rule is always on', () => {
  const THE_RULE = 'Split work into separate work items';

  it('reaches a session that has never seen the switch', () => {
    const s = makeSupervisor();
    const brief = s.buildBrief(item(), product(), { continuation: false });
    expect(brief).toContain(THE_RULE);
    expect(brief).toContain('Twenty issues off one call are twenty rows');
    expect(brief).not.toContain('<!-- subagent-rule');
  });

  it('stays in even for a config that once switched it off', () => {
    const s = makeSupervisor({ subagentRule: false });
    const brief = s.buildBrief(item(), product(), { continuation: false });
    expect(brief).toContain(THE_RULE);
    expect(brief).toContain('One row, or several');
    expect(brief).not.toContain('<!-- subagent-rule');
  });

  it('and the brief around it is still whole either way', () => {
    for (const config of [{}, { subagentRule: false }]) {
      const brief = makeSupervisor(config).buildBrief(item(), product(), { continuation: false });
      expect(brief).toContain('# How to work');
      expect(brief).toContain('## Doing the work');
      expect(brief).toContain('## Honesty');
    }
  });

  // She asked for it short "because tokens are scarce", and the brief it sits
  // in is itself being cut down. A rule that grows past a paragraph is a rule
  // that has stopped being the thing she asked for.
  it('stays short enough to be worth its tokens', () => {
    const brief = makeSupervisor().buildBrief(item(), product(), { continuation: false });
    const from = brief.indexOf('## One row, or several');
    const section = brief.slice(from, brief.indexOf('\n## ', from + 1));
    expect(section.length).toBeLessThan(600);
    expect(section.length).toBeGreaterThan(200);
  });
});
