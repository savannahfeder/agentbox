// Someone opened Cmd+K on the Pricing researcher thread, typed "investor
// update" and pressed Enter. The first row was the command "Waits on October
// investor update", and Enter ran it: the open thread went into Later, waiting
// on the investor thread, with no confirmation. The thread she meant was the
// second row, under Threads. Measured on paletteOrder (components/Palette.tsx):
// any command whose label every typed word starts a word of went above the
// threads, and "Waits on <title>" carries the whole title in its label.
import { describe, it, expect } from 'vitest';
import { paletteOrder } from '../renderer/src/components/Palette.tsx';

const cmd = (id, label, keywords = '') => ({ id, label, keywords, run: () => {} });
const thread = (id, label) => ({ id: `thread-${id}`, label, run: () => {} });
const waits = cmd('wait-w-9', 'Waits on October investor update', 'waits waiting blocked by depends needs october investor update');
const investor = thread('app-w-9', 'October investor update');
const ids = (o) => o.rows.map((r) => r.id);

describe('typing a thread\'s name puts that thread under Enter', () => {
  it('the reported case: the thread, not "Waits on" it', () => {
    expect(ids(paletteOrder([waits], [investor], false, 'investor update'))).toEqual([investor.id, waits.id]);
  });
  it('the whole title typed, and one word of it', () => {
    expect(ids(paletteOrder([waits], [investor], false, 'October investor update'))[0]).toBe(investor.id);
    expect(ids(paletteOrder([waits], [investor], false, 'invest'))[0]).toBe(investor.id);
  });
  it('the Threads heading sits over the first row and Commands over the rest', () => {
    const { labels } = paletteOrder([waits], [investor], false, 'investor update');
    expect(labels.get(0)).toBe('Threads');
    expect(labels.get(1)).toBe('Commands');
  });
});

describe('a command typed by its own name still comes first', () => {
  it('"waits on" is the command', () => {
    expect(ids(paletteOrder([waits], [investor], false, 'waits on'))[0]).toBe(waits.id);
    expect(ids(paletteOrder([waits], [investor], false, 'waits on october'))[0]).toBe(waits.id);
  });
  it('"new thread" and "settings", with threads named by the same words', () => {
    const newThread = cmd('new-thread', 'New thread', 'task compose');
    const settings = cmd('settings', 'Settings…', 'preferences');
    expect(ids(paletteOrder([newThread], [thread('1', 'New thread ideas')], false, 'new thread'))[0]).toBe('new-thread');
    expect(ids(paletteOrder([settings], [thread('2', 'Settings page copy')], false, 'settings'))[0]).toBe('settings');
  });
  it('a found thread whose title does not name the words leaves the command first', () => {
    expect(ids(paletteOrder([waits], [thread('3', 'Board pack')], false, 'investor update'))[0]).toBe(waits.id);
  });
});
