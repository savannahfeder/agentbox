// A COMMAND'S ANSWER GOES AWAY WHEN THE CONVERSATION MOVES PAST IT.
//
// The bug: a `/fork` answer stayed pinned under every later message in the
// reading pane, long after the fork had happened.
//
// It is every command, not only `/fork`. A command publishes
// one result per task into the supervisor's state, the pane draws it at the foot
// of the thread, and nothing ever took it down: it is saved with the rest of the
// session state, so it survives a restart too. Her `/fork` answer from the
// afternoon was still sitting under messages written hours later, which reads as
// though the app had just run it again.
//
// THE RULE IS A PREDICATE, NOT A TIMER, which is this codebase's rule for
// everything that expires: the answer belongs to the moment she ran the command,
// so it shows until the row itself has moved on, and the row's own `updatedAt`
// is what says that. No sweep, no countdown, nothing to fire, and a restart
// cannot resurrect it because the comparison is made every time it is read.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const dirs = [];
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

const KEY = JSON.stringify(['astral', 'w-row']);

function build(item) {
  const dir = mkdtempSync(join(tmpdir(), 'zero-stale-'));
  dirs.push(dir);
  const product = { slug: 'astral', name: 'Astral', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: join(dir, 'home'), storeRoot: dir, claudeBin: '/nonexistent/claude',
      codexBin: null, maxConcurrentSessions: 3, authProfiles: ['default'], codexHome: join(dir, 'codex-home'),
    },
    {
      listItems: () => [item], listProducts: () => [product], readItem: () => item,
      isDue: () => true, settleAnswer() {}, recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  return sup;
}

describe('the answer a command leaves on the task', () => {
  it('is shown while it is the newest thing on the row', () => {
    const ran = Date.now();
    const sup = build({ id: 'w-row', product: 'astral', status: 'open', title: 'x', updatedAt: ran - 1000 });
    sup._compactions = { [KEY]: { state: 'done', text: 'Forked into a new task', at: ran } };
    expect(sup.compactionStatus('astral', 'w-row')?.text).toBe('Forked into a new task');
  });

  // Her reply, or an agent writing back, is the row moving on.
  it('goes away once anything newer lands on the row', () => {
    const ran = Date.now() - 60_000;
    const sup = build({ id: 'w-row', product: 'astral', status: 'open', title: 'x', updatedAt: Date.now() });
    sup._compactions = { [KEY]: { state: 'done', text: 'Forked into a new task', at: ran } };
    expect(sup.compactionStatus('astral', 'w-row')).toBe(null);
  });

  // A command that is still running is not a leftover, whatever the row does
  // underneath it: taking that away mid-run would look like the command died.
  it('stays while the command is still running', () => {
    const sup = build({ id: 'w-row', product: 'astral', status: 'open', title: 'x', updatedAt: Date.now() });
    sup._compactions = { [KEY]: { state: 'running', at: Date.now() - 60_000 } };
    expect(sup.compactionStatus('astral', 'w-row')?.state).toBe('running');
  });

  // A row the store no longer has cannot say it has moved on, and an answer
  // with no row to sit under is not worth keeping either.
  it('is dropped when the row itself is gone', () => {
    const sup = build({ id: 'w-row', product: 'astral', status: 'open', title: 'x', updatedAt: Date.now() });
    sup.store.readItem = () => null;
    sup._compactions = { [KEY]: { state: 'done', text: 'x', at: Date.now() } };
    expect(sup.compactionStatus('astral', 'w-row')).toBe(null);
  });
});
