// AN IMPORTED CLAUDE CODE THREAD CARRIES ON ITS CONVERSATION (GitHub #44).
//
// The import card turned each Claude Code session into a row whose body said
// the app "has not read the conversation" and that replying "starts a fresh
// session". Somebody bringing in a hundred sessions that were partway through
// something got a hundred rows asking them to restate every job from scratch.
//
// The issue thought resuming from the row's own folder could not find a
// transcript filed under the original folder. Measured 2026-10-14 on Claude
// Code 2.1.293: a session started in /tmp/a and resumed by id from /tmp/b
// remembered the word it had been told, and the new turn was appended to the
// transcript under /tmp/a.
//
// IT IS A COPY ONLY WHILE THE CHAT IS STILL OPEN (w-62228098e6). The import
// forked every time, so setup's promise that a chat "carries on here, in the
// same conversation" was a copy that drifted from the original. Now the first
// reply forks with `--fork-session` only when Claude Code still has the session
// open, which its state file says (`<home>/sessions/*.json`, a live pid). A
// closed chat is carried on under its own id, so `claude --resume` in a
// terminal finds what was said here.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

/** Claude Code's own note that a session is open, with the process holding it. */
function stillOpen(ctx, pid = process.pid) {
  mkdirSync(join(ctx.profile, 'sessions'), { recursive: true });
  writeFileSync(join(ctx.profile, 'sessions', `${pid}.json`), JSON.stringify({ pid, sessionId: THREAD, cwd: '/somewhere' }));
}

const dirs = [];
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

const THREAD = '0b5c1e0e-1111-4222-8333-444455556666';

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'zero-imported-thread-'));
  dirs.push(dir);
  const profile = join(dir, 'second-claude');
  const product = { slug: 'shop', name: 'Shop', dir, repoPath: null };
  const items = [];
  const sup = new Supervisor(
    {
      home: join(dir, 'home'),
      storeRoot: dir,
      claudeBin: '/nonexistent/claude',
      codexBin: '/nonexistent/codex',
      maxConcurrentSessions: 3,
      authProfiles: [profile],
      codexHome: join(dir, 'codex-home'),
    },
    {
      listItems: () => items,
      listProducts: () => [product],
      readItem: (slug, id) => items.find((i) => i.id === id) ?? null,
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  return { sup, product, items, dir, profile };
}

/** The conversation as Claude Code left it, under the folder it ran in. */
function claudeCodeLeftIt(ctx, folder = join(ctx.dir, 'checkout'), { minutesAgo = 30 } = {}) {
  const slug = folder.replace(/[^a-zA-Z0-9]/g, '-');
  const at = join(ctx.profile, 'projects', slug);
  mkdirSync(at, { recursive: true });
  const file = join(at, `${THREAD}.jsonl`);
  writeFileSync(file, `${JSON.stringify({
    type: 'user', cwd: folder, entrypoint: 'cli', sessionId: THREAD,
    message: { role: 'user', content: 'the checkout page drops the coupon' },
  })}\n`);
  const when = new Date(Date.now() - minutesAgo * 60e3);
  utimesSync(file, when, when);
  return folder;
}

/** The row the import card files, after the person has replied on it. */
const importedRow = (extra = {}) => ({
  id: 'w-imported', product: 'shop', status: 'open', kind: 'question',
  title: 'the checkout page drops the coupon',
  body: '**Say what you want done next in this thread.**',
  labels: ['thread-import', `thread:${THREAD}`],
  answer: 'keep going, and add a test for the expired coupon',
  wrote: { answer: { ts: 1, source: 'founder' } },
  ...extra,
});

describe('the first reply on an imported thread', () => {
  let ctx;
  beforeEach(() => { ctx = build(); });

  it('carries on the same conversation, not a copy, once the chat is closed', () => {
    claudeCodeLeftIt(ctx);
    const row = importedRow();
    ctx.items.push(row);
    const plan = ctx.sup.spawnPlan(row, ctx.product, { continuation: true });
    expect(plan.resumeId).toBe(THREAD);
    expect(plan.args).not.toContain('--fork-session');
    expect(plan.resumeProfile).toBe(ctx.profile);
    expect(plan.prompt).not.toContain('This is a copy');
  });

  it('makes a copy while the chat is still open, so a terminal using it is not written over', () => {
    claudeCodeLeftIt(ctx);
    stillOpen(ctx);
    const row = importedRow();
    ctx.items.push(row);
    const plan = ctx.sup.spawnPlan(row, ctx.product, { continuation: true });
    expect(plan.resumeId).toBe(THREAD);
    expect(plan.args).toContain('--fork-session');
    expect(plan.prompt).toContain('This is a copy');
  });

  it('makes a copy when the chat was written to in the last two minutes, state file or not', () => {
    claudeCodeLeftIt(ctx, undefined, { minutesAgo: 1 });
    const row = importedRow();
    ctx.items.push(row);
    expect(ctx.sup.spawnPlan(row, ctx.product, { continuation: true }).args).toContain('--fork-session');
  });

  it('counts a chat as closed when the process its state file names has gone', () => {
    claudeCodeLeftIt(ctx);
    stillOpen(ctx, spawnSync('true').pid);
    const row = importedRow();
    ctx.items.push(row);
    const plan = ctx.sup.spawnPlan(row, ctx.product, { continuation: true });
    expect(plan.args).not.toContain('--fork-session');
  });

  it('is told it has moved, where it used to work, and what they replied', () => {
    const folder = claudeCodeLeftIt(ctx);
    const row = importedRow();
    ctx.items.push(row);
    const { prompt } = ctx.sup.spawnPlan(row, ctx.product, { continuation: true });
    expect(prompt).toContain('THIS CONVERSATION HAS MOVED');
    expect(prompt).toContain('w-imported');
    // The work it remembers may be uncommitted in the old folder and not here.
    expect(prompt).toContain(folder);
    expect(prompt).toContain('keep going, and add a test for the expired coupon');
    // It has never been briefed on how to work here, so it gets the whole brief.
    expect(prompt).toContain('# The founder has answered');
    // And none of the other resumes' wording.
    expect(prompt).not.toContain('THIS IS A FORK');
    expect(prompt).not.toContain('Your session on this work item was interrupted');
    expect(prompt).not.toContain('This is\nthat same session');
  });

  it('resumes its own chat after that, and never forks the original twice', () => {
    claudeCodeLeftIt(ctx);
    const own = join(ctx.dir, 'row-folder');
    const slug = ctx.product.dir.replace(/[^a-zA-Z0-9]/g, '-');
    mkdirSync(join(ctx.profile, 'projects', slug), { recursive: true });
    writeFileSync(join(ctx.profile, 'projects', slug, 'SESSION-OWN.jsonl'), '{}\n');
    ctx.sup._rowSessions = { 'w-imported': { sessionId: 'SESSION-OWN', product: 'shop', cwd: ctx.product.dir, profile: ctx.profile, engine: 'claude', lastUsedAt: Date.now() } };
    const row = importedRow();
    ctx.items.push(row);
    const plan = ctx.sup.spawnPlan(row, ctx.product, { continuation: true });
    expect(plan.resumeId).toBe('SESSION-OWN');
    expect(plan.args).not.toContain('--fork-session');
    expect(own).toBeTruthy();
  });
});

describe('when the conversation cannot be carried on, the row is briefed fresh as before', () => {
  let ctx;
  beforeEach(() => { ctx = build(); });

  it('when Claude Code has cleaned the transcript up', () => {
    const row = importedRow();
    ctx.items.push(row);
    const plan = ctx.sup.spawnPlan(row, ctx.product, { continuation: true });
    // `--resume` on a missing transcript exits in a second and counts as a
    // fast exit against the subscription, so nothing is resumed at all.
    expect(plan.resumeId ?? null).toBeNull();
    expect(plan.args).not.toContain('--fork-session');
    expect(plan.prompt).not.toContain('THIS CONVERSATION HAS MOVED');
  });

  it('when the project is tied to a different login than the one holding it', () => {
    claudeCodeLeftIt(ctx);
    ctx.sup._projectProfile = () => '/some/other-claude';
    ctx.sup._profileFitsProject = (p) => p === '/some/other-claude';
    const row = importedRow();
    ctx.items.push(row);
    const plan = ctx.sup.spawnPlan(row, ctx.product, { continuation: true });
    expect(plan.resumeId ?? null).toBeNull();
    expect(plan.args).not.toContain('--fork-session');
  });

  it('when the row is going to Codex, which has never heard of that id', () => {
    claudeCodeLeftIt(ctx);
    ctx.sup._engineFor = () => 'codex';
    const row = importedRow();
    expect(ctx.sup.importedThreadFor(row, ctx.product)).toBeNull();
  });
});

describe('only a row the import card filed is treated as one', () => {
  let ctx;
  beforeEach(() => { ctx = build(); claudeCodeLeftIt(ctx); });

  it('a thread label without the import label is not enough', () => {
    const row = importedRow({ labels: [`thread:${THREAD}`] });
    ctx.items.push(row);
    const plan = ctx.sup.spawnPlan(row, ctx.product, { continuation: true });
    expect(plan.resumeId ?? null).toBeNull();
  });

  it('an ordinary row resumes nothing', () => {
    const row = importedRow({ labels: ['founder'] });
    ctx.items.push(row);
    const plan = ctx.sup.spawnPlan(row, ctx.product, { continuation: true });
    expect(plan.resumeId ?? null).toBeNull();
    expect(plan.prompt).not.toContain('THIS CONVERSATION HAS MOVED');
  });
});
