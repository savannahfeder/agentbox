// A FORK IS A NEW TASK THAT STARTS WHERE THIS ONE GOT TO.
//
// MP-08 of the provider parity project (w-5ebf7bf7bb). The gap, measured on the
// installed clients 2026-09-22: Claude Code 2.1.280 has `--fork-session`, which
// resumes a conversation under a new id so the original is untouched, and Codex
// has a `fork` subcommand and a `thread/fork` method in the protocol this app
// already speaks. This app had neither, and said so in its own `/help`: "session
// fork/rewind ... not connected here yet".
//
// WHY A NEW TASK RATHER THAN A SECOND THREAD ON THE SAME ROW. A row is the unit
// of everything else here: the inbox, the folder its code lives in, the change
// card, the session that resumes when she replies. Two threads on one row would
// have to answer which of them her next reply belongs to, and the pane would
// have to draw the difference. A new row answers all of that for free, and the
// old row is left exactly as it was, which is the point of forking at all.
//
// The words she types after /fork are the new task's own instruction, so a fork
// is never an empty room: "/fork try it without the modal" is a task that starts
// with everything the first conversation knows and one new instruction.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { taskCommand, forkTitle } from '../main/task-commands.mjs';

const dirs = [];
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

const SOURCE = { id: 'w-source', product: 'astral', status: 'open', title: 'The sign up page needs a real error state', body: 'It just sits there.', labels: ['founder'] };

function build({ items = [SOURCE], composed = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'zero-fork-'));
  dirs.push(dir);
  const product = { slug: 'astral', name: 'Astral', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: join(dir, 'home'),
      storeRoot: dir,
      claudeBin: '/nonexistent/claude',
      codexBin: '/nonexistent/codex',
      maxConcurrentSessions: 3,
      authProfiles: ['default'],
      codexHome: join(dir, 'codex-home'),
    },
    {
      listItems: () => items,
      listProducts: () => [product],
      readItem: (slug, id) => items.find((i) => i.id === id) ?? null,
      composeItem: (slug, patch) => {
        const made = { id: `w-fork${composed.length + 1}`, product: slug, status: 'open', labels: ['founder', ...(patch.labels ?? [])], ...patch };
        composed.push(made); items.push(made); return made;
      },
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  sup.product = product;
  sup.root = dir;
  sup.claudeProfile = join(dir, 'her-second-claude');
  return { sup, product, composed, items };
}

/** A transcript where `transcriptFile` looks for one, so a chat counts as real. */
const claudeTranscript = (sup, sessionId, cwd) => {
  const slug = String(cwd).replace(/[^a-zA-Z0-9]/g, '-');
  const dir = join(sup.claudeProfile, 'projects', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sessionId}.jsonl`), '{}\n');
};

/** The row has a conversation of its own, on a known account. */
function withChat(sup, id = 'w-source', sessionId = 'SESSION-SOURCE') {
  claudeTranscript(sup, sessionId, sup.root);
  sup._rowSessions = {
    ...(sup._rowSessions ?? {}),
    [id]: { sessionId, product: 'astral', cwd: sup.root, profile: sup.claudeProfile, engine: 'claude', lastUsedAt: Date.now() },
  };
}

describe('what a fork is called', () => {
  it('is the sentence she typed, so two forks are told apart at a glance', () => {
    expect(forkTitle('try it without the modal')).toBe('try it without the modal');
    // Her first sentence when she writes several.
    expect(forkTitle('try it without the modal. Keep the copy as it is.')).toBe('try it without the modal');
    // A pasted paragraph is still one line, and it says where it was cut.
    const long = forkTitle('a'.repeat(200));
    expect(long).toHaveLength(60);
    expect(long.endsWith('…')).toBe(true);
    // Newlines and runs of spaces flatten, because a title is one line.
    expect(forkTitle('try it\n\n  without   the modal')).toBe('try it without the modal');
  });

  // The command refuses an empty fork, so this is only ever a backstop. It is
  // here because a row with no name at all is the one outcome worth refusing
  // twice.
  it('never comes back empty', () => {
    expect(forkTitle('')).toBe('A fork of this conversation');
    expect(forkTitle(undefined)).toBe('A fork of this conversation');
  });
});

describe('forking a conversation', () => {
  let ctx;
  beforeEach(() => { ctx = build(); });

  it('refuses when the task has no conversation to fork yet', async () => {
    const out = await taskCommand(ctx.sup, 'astral', 'w-source', '/fork try it without the modal');
    expect(out.state).toBe('failed');
    expect(out.text).toMatch(/no saved conversation/i);
    expect(ctx.composed).toHaveLength(0);
  });

  it('refuses on its own, because a fork with no instruction is an empty room', async () => {
    withChat(ctx.sup);
    const out = await taskCommand(ctx.sup, 'astral', 'w-source', '/fork');
    expect(out.state).toBe('failed');
    expect(out.text).toMatch(/what the fork should try/i);
    expect(ctx.composed).toHaveLength(0);
  });

  it('makes a new task carrying the instruction, and leaves the original alone', async () => {
    withChat(ctx.sup);
    const out = await taskCommand(ctx.sup, 'astral', 'w-source', '/fork try it without the modal');
    expect(out.state).toBe('done');
    expect(ctx.composed).toHaveLength(1);
    const fork = ctx.composed[0];
    // NAMED AFTER WHAT IT WAS ASKED TO TRY. It used to be the parent's title
    // with a word on the end, so two rows in the inbox looked like the same
    // task and there was no telling which agent was which.
    expect(fork.title).toBe('try it without the modal');
    expect(fork.title).not.toContain('The sign up page needs a real error state');
    expect(fork.body).toBe('try it without the modal');
    expect(fork.labels).toContain('fork:w-source');
    // The original keeps its own conversation, untouched.
    expect(ctx.sup._rowSessions['w-source'].sessionId).toBe('SESSION-SOURCE');
    expect(ctx.sup._rowSessions[fork.id]).toBeUndefined();
  });

  // THE FORK HAS TO BE TOLD IT HAS MOVED. It remembers the row it was on,
  // because it remembers everything, and on 2026-09-23 it went on writing its
  // results onto that row: one thread in her inbox with two agents talking in
  // it, while the fork's own row sat silent. From the outside that looks like
  // a fork that does not work: a reply meant for one agent is picked up by
  // another.
  it('is told which row it is on now, and that the old one is not its own', () => {
    withChat(ctx.sup);
    const fork = { id: 'w-fork1', product: 'astral', status: 'open', title: 'try it without the modal', body: 'try it without the modal', labels: ['founder', 'fork:w-source'] };
    ctx.items.push(fork);
    const plan = ctx.sup.spawnPlan(fork, ctx.product, {});
    expect(plan.prompt).toContain('THIS IS A FORK, AND YOU HAVE MOVED');
    expect(plan.prompt).toContain('w-fork1');
    expect(plan.prompt).toContain('w-source');
    expect(plan.prompt).toContain('try it without the modal');
    // And never the wording for a session that was interrupted, which would
    // send it back to finish the parent's work instead of trying hers.
    expect(plan.prompt).not.toContain('Your session on this work item was interrupted');
  });

  it('starts the new task on the old conversation, under a new id', () => {
    withChat(ctx.sup);
    const fork = { id: 'w-fork1', product: 'astral', status: 'open', title: 'Fork', body: 'try it without the modal', labels: ['founder', 'fork:w-source'] };
    ctx.items.push(fork);
    const plan = ctx.sup.spawnPlan(fork, ctx.product, {});
    expect(plan.resumeId).toBe('SESSION-SOURCE');
    expect(plan.args).toContain('--fork-session');
    // On the account that holds the conversation, because a resume is only a
    // resume on the login whose home the transcript sits in.
    expect(plan.resumeProfile).toBe(ctx.sup.claudeProfile);
  });

  // The label stays on the row forever, so what stops a second fork is the
  // fork's own conversation existing. Her reply on it is an ordinary
  // continuation from then on, exactly like any other row.
  it('never forks twice: once the new task has its own chat it resumes that', () => {
    withChat(ctx.sup);
    withChat(ctx.sup, 'w-fork1', 'SESSION-FORK');
    const fork = { id: 'w-fork1', product: 'astral', status: 'open', title: 'Fork', body: 'x', labels: ['founder', 'fork:w-source'], answer: 'closer, but bigger' };
    ctx.items.push(fork);
    const plan = ctx.sup.spawnPlan(fork, ctx.product, { continuation: true });
    expect(plan.resumeId).toBe('SESSION-FORK');
    expect(plan.args).not.toContain('--fork-session');
  });

  // And a run that dies saying nothing does not fork the source again either:
  // the guard is the fork's own chat, not the shape of the run.
  it('does not fork the source a second time when the first run left a chat', () => {
    withChat(ctx.sup);
    withChat(ctx.sup, 'w-fork1', 'SESSION-FORK');
    const fork = { id: 'w-fork1', product: 'astral', status: 'open', title: 'Fork', body: 'x', labels: ['founder', 'fork:w-source'] };
    ctx.items.push(fork);
    const plan = ctx.sup.spawnPlan(fork, ctx.product, {});
    expect(plan.args).not.toContain('--fork-session');
  });

  // THE HONEST BOUNDARY. Codex's own protocol has `thread/fork`, and this app
  // speaks that protocol, but the call has never been made against a real
  // server here, so nothing claims it works. A refusal that says so is parity
  // documentation; a silent failure is not.
  it('tells the truth about Codex instead of pretending', async () => {
    const codexRow = { ...SOURCE, id: 'w-codex', engine: 'codex' };
    ctx.items.push(codexRow);
    withChat(ctx.sup, 'w-codex', 'THREAD-CODEX');
    // This Mac has no Codex binary, so the engine would be decided as Claude
    // Code whatever the row says. The refusal under test is about the engine
    // the row would actually run on.
    ctx.sup._engineFor = () => 'codex';
    const out = await taskCommand(ctx.sup, 'astral', 'w-codex', '/fork try it without the modal');
    expect(out.state).toBe('failed');
    expect(out.text).toMatch(/Codex/);
    expect(ctx.composed).toHaveLength(0);
  });
});
