// THE WORKER CALLS THE PERSON "YOU", NEVER "SHE" OR "HE".
//
// Measured 2026-10-01 on the team build: a tester, a man, read his own worker
// call him "she" while it picked his task back up. The briefs were written for one founder. In the team version
// anyone on a team is the person a worker works for, so the brief says so
// near the top, in one plain rule, and says it whether or not the install
// gives the worker store tools (the two halves of the brief are fenced, and a
// rule inside one fence would reach only half the workers).
//
// AND THE WORDS HANDED TO IT ON A REPLY MUST NOT CONTRADICT THE RULE. That
// tester's line came on the turn after his reply, which the supervisor used to
// introduce with a heading that said "she" (`replyBrief`). The turn prompts, the picture block,
// the conversation transcript and the store tools' own descriptions are the
// app's own words to a worker, so they say "they" too.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import { buildTools } from '../mcp/tools.mjs';
import { appHomeEnv } from './app-home.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// And never "the founder" (a PM persona, 2026-10-01, was called that in a summary).
const RULE = /anyone on a team[\s\S]{0,200}"you"[\s\S]{0,120}"they"[\s\S]{0,60}never "she", "he" or "the founder"/;

let root;
let appDir;

const makeSupervisor = (config = {}) => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-you-app-'));
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO, 'briefs'))) {
    fs.copyFileSync(path.join(REPO, 'briefs', f), path.join(appDir, 'briefs', f));
  }
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  return new Supervisor({ storeRoot: root, maxConcurrentSessions: 3, ...config }, store, appDir);
};
const item = () => ({ id: 'w-1', product: 'p', title: 'do the thing', labels: [] });
const product = () => ({ slug: 'p', name: 'P', dir: fs.mkdtempSync(path.join(root, 'prod-')), repoPath: null });

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-you-')); });
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (appDir) fs.rmSync(appDir, { recursive: true, force: true });
});

describe('the worker brief', () => {
  const template = () => fs.readFileSync(path.join(REPO, 'briefs', 'worker.md'), 'utf8');

  it('carries the rule near the top, before the first section', () => {
    const text = template();
    const at = text.search(RULE);
    expect(at, 'the rule is not in briefs/worker.md').toBeGreaterThan(-1);
    expect(at).toBeLessThan(text.indexOf('## The store'));
  });

  it('reaches a worker that has store tools', () => {
    const s = makeSupervisor({ storeMcpCommand: path.join(REPO, 'mcp', 'agentbox-mcp.sh') });
    expect(s.storeMcpCommand()).toBeTruthy();
    expect(s.buildBrief(item(), product(), { continuation: false })).toMatch(RULE);
  });

  it('reaches a worker that has none', () => {
    const s = makeSupervisor();
    expect(s.storeMcpCommand()).toBe(null);
    expect(s.buildBrief(item(), product(), { continuation: false })).toMatch(RULE);
  });

  it('is said once, not repeated in each half', () => {
    expect(template().match(new RegExp(RULE.source, 'g'))).toHaveLength(1);
  });
});

describe('what a worker is handed on later turns', () => {
  const GENDERED = /\b(she|her|hers|herself|he|him|his)\b/i;

  it('a reply says "they", not "she"', () => {
    const s = makeSupervisor();
    const text = s.replyBrief({ id: 'w-1', answer: 'Put back the original test.' });
    expect(text).toContain('Put back the original test.');
    expect(text.replace('Put back the original test.', '')).not.toMatch(GENDERED);
  });

  it('a fork says "they"', () => {
    const s = makeSupervisor();
    expect(s.forkBrief({ id: 'w-2', title: 'Try the other way', body: 'Try it with a queue.' })).not.toMatch(GENDERED);
  });

  it('a picture that is no longer on disk says "they"', () => {
    const s = makeSupervisor();
    const p = product();
    const text = s.attachmentBlock({ id: 'w-1', body: 'See attachments/gone.png' }, p);
    expect(text).toContain('NO LONGER ON DISK');
    expect(text).not.toMatch(GENDERED);
  });

  it('the conversation so far says "they"', () => {
    const s = makeSupervisor();
    const text = s.conversationBlock({ id: 'w-1' }, [
      { source: 'founder', field: 'answer', text: 'Make it warmer.', ts: 1 },
      { source: 'agent', field: 'note', text: 'Halfway there.', ts: 2 },
    ]);
    expect(text).toContain('Make it warmer.');
    expect(text).not.toMatch(GENDERED);
  });
});

describe('the store tools a worker reads', () => {
  it('describe the person as "they"', () => {
    const home = appHomeEnv();
    fs.mkdirSync(path.join(home, 'accounts', 'acct-you'), { recursive: true });
    const was = process.env.STORE_ACCOUNT_ID;
    process.env.STORE_ACCOUNT_ID = 'acct-you';
    try {
      const { tools } = buildTools({ holder: 'test' });
      const gendered = /\b(she|her|hers|herself|he|him|his)\b/i;
      const said = [];
      for (const tool of tools) {
        said.push(`${tool.name}: ${tool.description}`);
        for (const [field, schema] of Object.entries(tool.schema ?? {})) {
          if (schema?.description) said.push(`${tool.name}.${field}: ${schema.description}`);
        }
      }
      expect(said.length).toBeGreaterThan(10);
      expect(said.filter((s) => gendered.test(s))).toEqual([]);
    } finally {
      if (was === undefined) delete process.env.STORE_ACCOUNT_ID; else process.env.STORE_ACCOUNT_ID = was;
    }
  });
});
