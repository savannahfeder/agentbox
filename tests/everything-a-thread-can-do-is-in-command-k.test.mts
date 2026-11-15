// ⌘K OVER A THREAD COULD NOT DO HALF OF WHAT THE THREAD COULD.
//
// Reported on a picture of an open thread (w-e85916b92c): typing "priva" into
// ⌘K said "Nothing matches “priva”." although the summary panel's Visible to
// menu makes that very thread private. Measured by setting ⌘K's thread rows
// (App.tsx itemCommands) beside the thread's other controls: the summary panel
// (Visible to, the name, Stop repeating), the three-dot menu (Pin thread,
// where it runs, View code changes), the S key, a conversation's Add people
// and the strip a teammate's task opens with. None of those were in ⌘K.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesQuery } from '../renderer/src/palette-rows.ts';
import { threadCommands } from '../renderer/src/thread-commands.ts';
import { PLACE_ROW, threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const type = (query, rows) => rows.filter((r) => matchesQuery(query, r));
const ids = (rows) => rows.map((r) => r.id);

describe('who sees it', () => {
  const shared = threadCommands({ seen: 'team', teammates: true });
  const hidden = threadCommands({ seen: 'private', teammates: true });

  it('typing "priva" over a shared thread finds the row that makes it private', () => {
    const found = type('priva', shared);
    expect(ids(found)).toEqual(['see-private']);
    expect(found[0].label).toBe('Make private');
    expect(found[0].does).toEqual({ act: 'see', to: 'private', already: false });
  });

  it('is found by the other words for it too', () => {
    for (const q of ['private', 'privacy', 'only me', 'visible', 'who sees']) {
      expect(ids(type(q, shared)), q).toContain('see-private');
    }
  });

  it('never puts a row that shares the thread under "private"', () => {
    for (const rows of [shared, hidden]) {
      expect(ids(type('private', rows))).toEqual(['see-private']);
    }
  });

  it('on a thread that is private already says so rather than finding nothing', () => {
    const [row] = type('private', hidden);
    expect(row.does).toEqual({ act: 'see', to: 'private', already: true });
    expect(row.hint).toMatch(/now/);
  });

  it('shares it with the team or with chosen people, and "share" finds only those', () => {
    expect(ids(type('share', hidden))).toEqual(['see-team', 'see-people']);
    expect(hidden.find((r) => r.id === 'see-team').does).toEqual({ act: 'see', to: 'team', already: false });
    expect(hidden.find((r) => r.id === 'see-people').does).toEqual({ act: 'people' });
  });

  it('names the people a thread is shared with', () => {
    const rows = threadCommands({ seen: 'people', chosen: 'Theo and Ana', teammates: true });
    expect(rows.find((r) => r.id === 'see-people').hint).toBe('shared with Theo and Ana now');
  });

  it('offers no chosen people with nobody else on the team', () => {
    expect(ids(threadCommands({ seen: 'team', teammates: false }))).not.toContain('see-people');
  });

  it('offers nothing where who sees it is not the thread’s to change', () => {
    expect(ids(threadCommands({ seen: null, teammates: true })).filter((id) => id.startsWith('see-'))).toEqual([]);
  });
});

describe('what the three-dot menu does', () => {
  it('pins and unpins, in the menu’s words', () => {
    const pin = threadCommands({ pinned: false });
    expect(ids(type('pin', pin))).toEqual(['pin']);
    expect(pin[0].label).toBe(threadMenuRows({ change: false, terminal: null, finish: false, pin: 'unpinned' })[0].label);
    expect(pin[0].does).toEqual({ act: 'pin', pin: true });
    const unpin = threadCommands({ pinned: true });
    expect(unpin[0].label).toBe('Unpin thread');
    expect(unpin[0].does).toEqual({ act: 'pin', pin: false });
    expect(threadCommands({ pinned: null })).toEqual([]);
  });

  it('moves it between the cloud and this computer, in the menu’s words', () => {
    for (const place of ['cloud', 'here', 'kept']) {
      const [row] = threadCommands({ place });
      expect(row.label).toBe(PLACE_ROW[place].label);
      expect(row.does).toEqual({ act: 'place', keep: place !== 'kept' });
      expect(matchesQuery('cloud', row), place).toBe(true);
    }
    expect(threadCommands({ place: null })).toEqual([]);
  });

  it('opens the code a run changed, only on an open thread that has one', () => {
    const rows = threadCommands({ open: { change: true, summary: null } });
    for (const q of ['code', 'diff', 'changes']) expect(ids(type(q, rows)), q).toEqual(['code']);
    expect(rows[0].label).toBe('View code changes');
    expect(ids(threadCommands({ open: { change: false, summary: null } }))).toEqual([]);
    expect(ids(threadCommands({ open: null }))).toEqual([]);
  });
});

describe('what the summary panel does', () => {
  it('shows and hides the summary, with its key, and says which', () => {
    const closed = threadCommands({ open: { change: false, summary: 'closed' } });
    expect(closed).toEqual([expect.objectContaining({ id: 'summary', label: 'Show summary', keyHint: 'S', does: { act: 'summary' } })]);
    expect(threadCommands({ open: { change: false, summary: 'open' } })[0].label).toBe('Hide summary');
    expect(ids(threadCommands({ open: { change: false, summary: null } }))).toEqual([]);
  });

  it('renames the thread', () => {
    const rows = threadCommands({ rename: true });
    expect(ids(type('rename', rows))).toEqual(['rename']);
    expect(ids(type('name', rows))).toEqual(['rename']);
    expect(threadCommands({ rename: false })).toEqual([]);
  });

  it('stops a repeating task repeating', () => {
    const rows = threadCommands({ repeats: true });
    expect(ids(type('repeat', rows))).toEqual(['end-repeat']);
    expect(rows[0].label).toBe('Stop repeating');
    expect(threadCommands({ repeats: false })).toEqual([]);
  });
});

describe('on a team', () => {
  it('adds people to a conversation', () => {
    const rows = threadCommands({ addPeople: true });
    expect(ids(type('add people', rows))).toEqual(['add-people']);
    expect(ids(type('invite', rows))).toEqual(['add-people']);
  });

  it('routes a task a teammate gave you, in the strip’s words', () => {
    const rows = threadCommands({ routes: [
      { route: 'agent', label: 'Give it to an agent' },
      { route: 'me', label: 'Do it myself' },
      { route: 'back', label: 'Hand it back to Theo' },
    ] });
    expect(rows.map((r) => r.label)).toEqual(['Give it to an agent', 'Do it myself', 'Hand it back to Theo']);
    expect(ids(type('myself', rows))).toEqual(['route-me']);
    expect(ids(type('back', rows))).toEqual(['route-back']);
    expect(rows[0].does).toEqual({ act: 'route', route: 'agent' });
  });
});

describe('the rows sit with the rest of ⌘K', () => {
  const every = threadCommands({
    seen: 'team', teammates: true, pinned: false, place: 'here', open: { change: true, summary: 'open' },
    rename: true, repeats: true, addPeople: true, routes: [{ route: 'me', label: 'Do it myself' }],
  });

  // Ids become React keys and some are named by rules elsewhere ('snooze' is
  // ranked first), so a new row must not take one the thread already uses.
  it('take no id a thread row already has', () => {
    const taken = ['done', 'reply', 'snooze', 'read', 'unread', 'unsnooze', 'approve', 'stop', 'open', 'redeliver', 'send-back', 'resume-any', 'remote-control', 'open-terminal', 'run-now'];
    expect(ids(every).filter((id) => taken.includes(id))).toEqual([]);
    expect(new Set(ids(every)).size).toBe(every.length);
  });

  it('keep to one line', () => {
    for (const r of every) expect(r.label.length, r.label).toBeLessThanOrEqual(27);
  });

  it('are what ⌘K offers on the thread it is over', () => {
    const app = read('renderer/src/App.tsx');
    const block = app.slice(app.indexOf('itemCommands={'), app.indexOf('filtering={isFiltering'));
    expect(block).toMatch(/threadCommands\(\{/);
  });

  it('reach the name and the people list on the thread itself', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/<ThreadCrumb[^>]*renameAsk=/);
    expect(focus).toMatch(/<SummaryPanel[^>]*peopleAsk=/);
  });
});
