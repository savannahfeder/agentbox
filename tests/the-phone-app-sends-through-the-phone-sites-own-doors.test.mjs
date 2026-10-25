// THE PHONE APP SENDS THROUGH THE PHONE SITE'S OWN DOORS (renderer/src/phone-send.ts).
//
// The app built its commands itself (mobile/src/lib/actions.ts `commandFor`),
// and the rules that live in the site's sending path never reached it. Codex's
// audit of 2026-10-20 found two of them by reading both: a reply to a thread
// put off for later went without `unschedule`, so it waited for the old time,
// and closing a new thread her Mac had not made yet left a close for an id the
// Mac never knew, so the thread was made and run anyway. Undo had no way in at
// all. The site's sending path is now one module both use; these drive it the
// way the app does and check what lands in her commands.
import { describe, it, expect } from 'vitest';
import { phoneSlug, UNDONE } from '../renderer/src/phone-rows';
import { phoneSender } from '../renderer/src/phone-send';
import { planFor, runSteps } from '../mobile/src/lib/actions';
import { madeHere } from '../shared/phone-snapshot.mjs';

const NOW = Date.now();
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();

function world({ item = {}, commands = [] } = {}) {
  let rows = {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(NOW - 1000), snapshot: { v: 3, item: {
      id: 'w-1', title: 'Plan it', status: 'blocked', kind: 'directive', labels: ['founder'], priority: 0, createdAt: NOW - 9e6, updatedAt: NOW - 1000, ...item,
    }, history: [] } }],
    commands,
  };
  let n = 0;
  const client = {
    generation: () => 0,
    async insertCommand(row) { n += 1; return { id: `c-${n}`, created_at: iso(NOW), claimed_at: null, taken_at: null, outcome: null, payload: {}, item: null, ...row }; },
    async update(_table, query, patch) {
      const id = /id=eq\.([^&]+)/.exec(query)?.[1];
      const c = rows.commands.find((x) => x.id === decodeURIComponent(id) && !x.taken_at && !x.claimed_at);
      return c ? [{ ...c, ...patch }] : [];
    },
  };
  const sender = phoneSender({ client, rows: () => rows, setRows: (r) => { rows = r; }, aliases: () => ({}), changed: () => {} });
  let last = null;
  const send = async (press, it) => {
    const plan = planFor(press, it, NOW);
    if (!plan) return null;
    const made = await runSteps(sender, plan.steps);
    last = { plan, made };
    return made;
  };
  const undo = () => runSteps(sender, last.plan.undo(last.made));
  return { sender, send, undo, rows: () => rows };
}
const item = (status = 'blocked', more = {}) => ({ product: A, id: 'w-1', status, title: 'Plan it', productName: 'Alpha', ...more });
const replyOf = (w) => w.rows().commands.filter((c) => c.kind === 'reply').at(-1);

describe('a reply', () => {
  it('to a thread put off for later clears the schedule, as the site\'s does', async () => {
    const w = world({ item: { snoozedUntil: NOW + 3_600_000 } });
    await w.send({ kind: 'reply', text: 'Go now' }, item('blocked', { snoozedUntil: NOW + 3_600_000 }));
    expect(replyOf(w)).toMatchObject({ kind: 'reply', payload: { text: 'Go now', unschedule: true } });
    // And it leaves Later at once, as the site's reply does.
    expect(w.rows().commands.at(-1)).toMatchObject({ kind: 'snooze', payload: { until: 0 } });
  });

  it('to a thread scheduled to run later clears that too', async () => {
    const w = world({ item: { runAt: NOW + 3_600_000 } });
    await w.send({ kind: 'pick', option: { n: 1, text: 'Ship it', recommended: true } }, item('blocked', { runAt: NOW + 3_600_000 }));
    expect(replyOf(w).payload).toMatchObject({ text: 'Option 1: Ship it', unschedule: true });
    // The site's clearing call after it has nothing left to do (phone-send.ts `replied`).
    expect(w.rows().commands.filter((c) => c.kind === 'schedule')).toEqual([]);
  });

  it('to a thread whose time has passed carries no unschedule', async () => {
    const w = world({ item: { snoozedUntil: NOW - 60_000 } });
    await w.send({ kind: 'reply', text: 'Go' }, item('blocked', { snoozedUntil: NOW - 60_000 }));
    expect(w.rows().commands).toHaveLength(1);
    expect(replyOf(w).payload.unschedule).toBeUndefined();
  });

  it('is taken back by Undo while her Mac has not taken it', async () => {
    const w = world();
    await w.send({ kind: 'reply', text: 'Go' }, item());
    const sent = w.rows().commands.at(-1);
    await w.undo();
    expect(w.rows().commands.find((c) => c.id === sent.id)).toMatchObject({ outcome: UNDONE });
    // The "(withdrawn)" the window sends after it never reaches her Mac.
    expect(w.rows().commands).toHaveLength(1);
  });

  it('says so when her Mac already has it', async () => {
    const w = world();
    await w.send({ kind: 'reply', text: 'Go' }, item());
    w.rows().commands.at(-1).claimed_at = iso(NOW);
    await expect(w.undo()).rejects.toThrow(/already has it/);
  });
});

describe('a close', () => {
  it('of a new thread her Mac has not made yet takes the new thread back instead', async () => {
    const w = world({ commands: [{ id: 'n-1', device: DEV, project: 'alpha', item: null, kind: 'new', payload: { title: 'Draw it', body: 'Draw it' }, created_at: iso(NOW), claimed_at: null, taken_at: null, outcome: null }] });
    await w.send({ kind: 'close' }, { product: A, id: madeHere('n-1'), status: 'open' });
    expect(w.rows().commands).toHaveLength(1);
    expect(w.rows().commands[0]).toMatchObject({ id: 'n-1', outcome: UNDONE });
  });

  it('of a thread her Mac has is a close, and Undo takes the close back', async () => {
    const w = world({ item: { status: 'done' } });
    await w.send({ kind: 'close' }, item('done'));
    expect(w.rows().commands.at(-1)).toMatchObject({ kind: 'close' });
    await w.undo();
    expect(w.rows().commands).toHaveLength(1);
    expect(w.rows().commands[0]).toMatchObject({ kind: 'close', outcome: UNDONE });
  });
});

describe('the other doors', () => {
  it('Later, back from Later, Stop, Run now and send back to agent are the site\'s commands', async () => {
    const w = world();
    await w.send({ kind: 'later', until: NOW + 3_600_000 }, item());
    await w.send({ kind: 'later', until: 0 }, item('blocked', { snoozedUntil: NOW + 3_600_000 }));
    await w.send({ kind: 'stop' }, item());
    await w.send({ kind: 'run-now' }, item());
    await w.send({ kind: 'send-back' }, item());
    expect(w.rows().commands.map((c) => [c.kind, c.payload])).toEqual([
      ['snooze', { until: NOW + 3_600_000 }], ['snooze', { until: 0 }], ['stop', {}], ['run-now', {}], ['reopen', {}],
    ]);
  });

  it('Allow and Deny carry the card they answer', async () => {
    const w = world({ item: {} });
    w.rows().threads[0].snapshot.approvals = [{ id: 'ap-1', at: NOW, tool: 'Bash', input: { command: 'ls' }, card: 'fp-1' }];
    expect(await w.send({ kind: 'approve', approval: 'ap-1', allow: true }, null)).toEqual({ ok: true });
    expect(w.rows().commands.at(-1)).toMatchObject({ kind: 'approve', item: 'w-1', payload: { approval: 'ap-1', allow: true, card: 'fp-1' } });
    expect(await w.send({ kind: 'approve', approval: 'ap-gone', allow: false }, null)).toEqual({ ok: false, error: 'This card is no longer waiting.' });
  });
});

describe('a new thread', () => {
  it('is titled from its words, as the desktop\'s composer titles one', async () => {
    const w = world();
    const made = await w.send({ kind: 'new', product: A, text: 'Draw the board.\n\nFive columns, dark.' }, null);
    expect(w.rows().commands.at(-1).payload).toMatchObject({ title: 'Draw the board.', body: 'Five columns, dark.', priority: 5 });
    expect(made).toMatchObject({ id: madeHere('c-1'), product: A });
  });

  it('is taken back whole by Undo while her Mac has not made it', async () => {
    const w = world();
    await w.send({ kind: 'new', product: A, text: 'Draw the board' }, null);
    await w.undo();
    expect(w.rows().commands).toHaveLength(1);
    expect(w.rows().commands[0]).toMatchObject({ kind: 'new', outcome: UNDONE });
  });

  it('carries its files under the words, and the priority picked for it', async () => {
    const w = world();
    await w.send({ kind: 'new', product: A, text: 'Look', saved: [{ rel: `phone-files/${'a'.repeat(64)}.png`, name: 'board.png', image: true }], choices: { priority: 9 } }, null);
    expect(w.rows().commands.at(-1).payload).toMatchObject({ title: 'Look', body: `![board.png](phone-files/${'a'.repeat(64)}.png)`, priority: 9 });
  });

  it('with only a file is titled by the file, not left empty', async () => {
    const w = world();
    await w.send({ kind: 'new', product: A, text: '  ', saved: [{ rel: `phone-files/${'b'.repeat(64)}.pdf`, name: 'brief.pdf', image: false }] }, null);
    expect(w.rows().commands.at(-1).payload.title).toBe('Attached: brief.pdf');
  });

  it('with nothing in it sends nothing', async () => {
    const w = world();
    expect(await w.send({ kind: 'new', product: A, text: '   ' }, null)).toBeFalsy();
    expect(w.rows().commands).toHaveLength(0);
  });
});
