// THE AGENT IMPORT ACTUALLY IMPORTS SOMETHING.
//
// What was measured on the build a tester used, before this: the finish card read
// their real agents correctly, and pressing its button wrote a list of names into
// zero.config.json that no other part of Agentbox has ever read. Their store was
// byte for byte identical before and after. The reading half worked and the
// taking half did nothing at all.
//
// So these hold two things shut. The rows arrive, and pressing the button twice
// does not file them twice.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import {
  IMPORT_LABEL,
  agentImportRow,
  agentsNeedingRows,
  importedAgentBrief,
  importedAgentName,
  shortenHome,
} from '../shared/agent-import.mjs';
import { belongsInInbox } from '../renderer/src/list-rules.ts';

const HOME = '/Users/someone';

const HUNTER = {
  name: 'flaky-test-hunter',
  title: 'Flaky Test Hunter',
  line: 'Finds tests that pass and fail on the same commit.',
  scope: 'all',
  path: `${HOME}/.claude/agents/flaky-test-hunter.md`,
};

const REVIEWER = {
  name: 'apollo-api-reviewer',
  title: 'Apollo API Reviewer',
  line: 'Review changes to the Apollo public API for breaking changes.',
  scope: 'project',
  path: `${HOME}/Desktop/dev/apollo/.claude/agents/apollo-api-reviewer.md`,
};

async function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-agentimport-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  return new Store({
    storeRoot: root,
    accountId: 'test-account',
    accountRoot,
    products: [],
  }).init();
}

describe('what one imported agent says in the inbox', () => {
  it('opens with the ask and nothing above it', () => {
    const row = agentImportRow(HUNTER, { projectName: 'Apollo', home: HOME });
    expect(row.body.startsWith('**Tell Flaky Test Hunter what to do first, in one sentence.**')).toBe(true);
    expect(row.title).toBe('Flaky Test Hunter is ready. Give it its first job.');
  });

  // The inbox row clips its opening at a sentence end inside 112 characters, so
  // an ask whose first sentence runs past that reaches her cut in half. Her
  // longest real agent name is the one this is measured against.
  it('keeps the ask inside what the inbox row shows', () => {
    for (const a of [HUNTER, REVIEWER, { ...HUNTER, title: 'Release Notes Writer' }]) {
      const first = agentImportRow(a, { projectName: 'Apollo', home: HOME })
        .body.split('\n')[0].replace(/\*\*/g, '');
      expect(first.length).toBeLessThan(112);
    }
  });

  it("carries the agent's own description when it has one, and no blank line when it does not", () => {
    expect(agentImportRow(HUNTER, { home: HOME }).body)
      .toContain('Finds tests that pass and fail on the same commit.');
    const bare = agentImportRow({ ...HUNTER, line: '' }, { home: HOME }).body;
    expect(bare).not.toMatch(/\n\n\n/);
  });

  // Agentbox does not copy an agent file and does not move one, so the row says
  // where the file is. A stranger's home folder is shortened, because a path
  // with somebody else's name in it is a path they read twice.
  it('names the file where its author left it, and which scope it is', () => {
    const all = agentImportRow(HUNTER, { home: HOME }).body;
    expect(all).toContain('~/.claude/agents/flaky-test-hunter.md');
    expect(all).toContain('It works in every project on this Mac.');
    expect(all).toContain('never moves or copies one');

    const here = agentImportRow(REVIEWER, { home: HOME }).body;
    expect(here).toContain('It works in this project only.');
    expect(shortenHome(REVIEWER.path, HOME)).toBe('~/Desktop/dev/apollo/.claude/agents/apollo-api-reviewer.md');
    expect(shortenHome('/opt/agents/x.md', HOME)).toBe('/opt/agents/x.md');
  });

  it('names the project the reply will run in, and says nothing about one when there is none', () => {
    expect(agentImportRow(HUNTER, { projectName: 'Apollo', home: HOME }).body).toContain('runs it here in Apollo');
    expect(agentImportRow(HUNTER, { home: HOME }).body).toContain('runs it, putting');
  });
});

describe('a second walk through the first run files nothing twice', () => {
  it('skips an agent that already has a row', () => {
    const existing = [{ labels: [IMPORT_LABEL, 'agent:flaky-test-hunter'] }];
    const left = agentsNeedingRows([HUNTER, REVIEWER], existing);
    expect(left.map((a) => a.name)).toEqual(['apollo-api-reviewer']);
  });

  // Claude Code lets a project folder shadow a home folder agent of the same
  // name, and the project's copy is the one that runs.
  it('files one row when two files claim the same name, and describes the project one', () => {
    const shadowed = agentsNeedingRows([
      { ...HUNTER, scope: 'all' },
      { ...HUNTER, scope: 'project', path: '/w/apollo/.claude/agents/flaky-test-hunter.md' },
    ], []);
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0].scope).toBe('project');
  });
});

describe('the rows in a real store', () => {
  it('writes one open question per ticked agent, and the inbox shows them', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Apollo' });

    const out = s.importAgentRows(slug, [HUNTER, REVIEWER], { home: HOME });
    expect(out.added).toBe(2);

    const rows = s.listItems().filter((i) => (i.labels ?? []).includes(IMPORT_LABEL));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // A QUESTION IS WHAT MAKES IT WAIT. The supervisor never spawns fresh
      // work on a question (isFresh, main/supervisor.mjs), so nothing starts
      // until they say what the agent should do, and their reply spawns a
      // worker the ordinary way. No new mechanism anywhere.
      expect(row.kind).toBe('question');
      expect(row.status).toBe('open');
      expect(row.answer).toBeFalsy();
      expect(belongsInInbox(row)).toBe(true);
    }
    expect(rows.map((r) => r.title).sort()).toEqual([
      'Apollo API Reviewer is ready. Give it its first job.',
      'Flaky Test Hunter is ready. Give it its first job.',
    ]);
  });

  it('reads in the order the finish card showed them', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Apollo' });
    s.importAgentRows(slug, [HUNTER, REVIEWER], { home: HOME });
    const rows = s.listItems()
      .filter((i) => (i.labels ?? []).includes(IMPORT_LABEL))
      .sort((a, b) => a.createdAt - b.createdAt);
    expect(rows.map((r) => r.title)).toEqual([
      'Flaky Test Hunter is ready. Give it its first job.',
      'Apollo API Reviewer is ready. Give it its first job.',
    ]);
  });

  it('imports the same two agents again and adds nothing', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Apollo' });
    s.importAgentRows(slug, [HUNTER, REVIEWER], { home: HOME });
    const again = s.importAgentRows(slug, [HUNTER, REVIEWER], { home: HOME });

    expect(again.added).toBe(0);
    expect(again.already).toBe(2);
    expect(s.listItems().filter((i) => (i.labels ?? []).includes(IMPORT_LABEL))).toHaveLength(2);
  });

  it('ticking nothing writes nothing', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Apollo' });
    const before = s.listItems().length;
    expect(s.importAgentRows(slug, [], { home: HOME }).added).toBe(0);
    expect(s.listItems().length).toBe(before);
  });
});

describe("the reply reaches the person's own agent", () => {
  it('finds the agent a row belongs to, and leaves every other row alone', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Apollo' });
    s.importAgentRows(slug, [HUNTER], { home: HOME });
    const [row] = s.listItems().filter((i) => (i.labels ?? []).includes(IMPORT_LABEL));

    expect(importedAgentName(row)).toBe('flaky-test-hunter');
    expect(importedAgentName({ labels: ['founder'] })).toBe(null);
    expect(importedAgentName({})).toBe(null);
  });

  // The body reads as a description of the app. The brief has to read as an
  // instruction, or the session answers as itself and they never learn their
  // agent did not run.
  it('tells the worker to dispatch that agent, and to say so if it cannot', () => {
    const brief = importedAgentBrief('flaky-test-hunter');
    expect(brief).toContain('dispatching the `flaky-test-hunter` subagent');
    expect(brief).toContain('do not');
    expect(brief).toContain('say so plainly in your result');
    expect(importedAgentBrief(null)).toBe('');
    expect(importedAgentBrief('  ')).toBe('');
  });
});
