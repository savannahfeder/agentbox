// Typing "remind me" in ⌘K put five threads first and "Later (2 selected)"
// under them, below the fold. The row was called Remind Me until it was renamed
// Later, and its old name went into its keywords; a later rule sent every
// command found only by keyword under the threads. A command's old names now
// count as its name, so what people still call it finds it first.
import { describe, it, expect } from 'vitest';
import { paletteOrder } from '../renderer/src/components/Palette.tsx';
import { matchesQuery, rankMatches, LATER_KEYWORDS, LATER_OLD_NAMES } from '../renderer/src/palette-rows.ts';

const later = { id: 'snooze', label: 'Later (2 selected)', keywords: LATER_KEYWORDS, oldNames: LATER_OLD_NAMES, run: () => {} };
const remote = { id: 'remote-control', label: 'Remote Control', keywords: '', run: () => {} };
const rename = { id: 'rename', label: 'Rename thread', keywords: 'name title', run: () => {} };
const thread = (id: string, label: string) => ({ id: `thread-${id}`, label, run: () => {} });
const reminders = [thread('1', "Remind me to cancel David's card"), thread('2', 'Reminder to message about testing')];
const ids = (o: { rows: { id: string }[] }) => o.rows.map((r) => r.id);
const order = (q: string, cmds: typeof later[] | typeof rename[]) => paletteOrder(rankMatches(q, cmds.filter((c) => matchesQuery(q, c))), reminders, false, q);

describe('a command named by one of its old names goes above the threads', () => {
  it('the reported case: "remind me" puts Later first', () => {
    expect(ids(order('remind me', [later]))).toEqual(['snooze', 'thread-1', 'thread-2']);
  });
  it('"snooze" and its first letters do too', () => {
    expect(ids(order('snooze', [later]))[0]).toBe('snooze');
    expect(ids(order('rem', [later, remote]))).toEqual(['snooze', 'remote-control', 'thread-1', 'thread-2']);
  });
  it('the headings follow: Threads sits under the command, no Commands heading after', () => {
    const { labels } = order('remind me', [later]);
    expect(labels.get(1)).toBe('Threads');
    expect([...labels.values()]).not.toContain('Commands');
  });
});

describe('what still goes after the threads', () => {
  it('a keyword that is not an old name', () => {
    expect(ids(order('defer', [later]))).toEqual(['thread-1', 'thread-2', 'snooze']);
    expect(ids(order('title', [rename]))).toEqual(['thread-1', 'thread-2', 'rename']);
  });
  it('words inside an old name that do not start its words', () => {
    expect(ids(order('ind', [later]))).toEqual(['thread-1', 'thread-2', 'snooze']);
  });
});
