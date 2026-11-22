// A THREAD AN AI TEAMMATE OPENS SHOWS IN YOUR CHAT WITH IT (w-ea25379c96).
//
// "When they create a thread for 'just want a different agent,' I don't see
// that thread in the chat anywhere. In regular chats, I can see the thread and
// click into it." A teammate's run that files work for an ordinary agent files
// it under the run (create_work_item with parent). The teammate's page listed
// only threads labelled as its runs, and its chat only messages and what it
// sent you, so the new thread was in neither. Measured on the stand-in team in
// a built app: the page said "Nothing on right now" with such a thread open.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { runLines, statusOf, teammateLabel } from '../shared/teammates.mts';

vi.mock('../renderer/src/api', () => ({ api: new Proxy({}, { get: () => async () => ({ ok: false }) }) }));
const { TeammatesPage } = await import('../renderer/src/teammates/TeammatesPage.tsx');
const { TeammatesContext } = await import('../renderer/src/teammates/row-lead.tsx');
const { openedLines, threadsItOpened } = await import('../renderer/src/teammates/chat-lines.ts');

const MIN = 60_000;
const NOW = Date.parse('2026-10-30T19:00:00Z');
const mate = { id: 't-a1a1a1a1a1', name: 'Head of marketing', letter: 'H', product: 'kestrel', status: 'active', paused: false, served: '', limit: 40, works: null, memory: [], playbooks: [], duties: [] };
const other = { ...mate, id: 't-b2b2b2b2b2', name: 'Security lead', letter: 'S' };
const run = (id, who = mate, product = 'kestrel') => ({
  id, product, status: 'claimed', kind: 'directive', labels: ['founder', teammateLabel(who.id), 'hop:0'], priority: null, title: 'Launch post',
  createdAt: NOW - 30 * MIN, updatedAt: NOW - 30 * MIN,
});
const filed = (id, parent, title, ago, more = {}) => ({
  id, product: 'kestrel', status: 'open', kind: 'directive', labels: [], priority: null, title, parent, start: 'later',
  createdAt: NOW - ago, updatedAt: NOW - ago, ...more,
});

function draw(items, tabOf = () => 'snoozed') {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  try {
    const view = { list: [{ ...mate, ...statusOf(mate, items, NOW) }, { ...other, ...statusOf(other, items, NOW) }], chat: [], runs: runLines(items, [mate, other]), playbooks: [] };
    return renderToStaticMarkup(React.createElement(TeammatesContext.Provider, { value: new Map([[mate.id, mate], [other.id, other]]) }, React.createElement(TeammatesPage, {
      view, items, open: mate.id, products: [{ slug: 'kestrel', name: 'Kestrel' }], engines: [], me: 'Sam', onOpen() {}, onOpenThread() {}, onChanged() {}, tabOf, onOpenList() {},
    })));
  } finally { clock.mockRestore(); }
}

describe('a thread an AI teammate opens', () => {
  it('is a line in your chat with it that opens the thread', () => {
    const html = draw([run('w-run'), filed('w-video', 'w-run', 'Cut the launch video', 10 * MIN)]);
    expect(html).toMatch(/<button type="button" class="tq-sent-line"><span class="v">Not started:<\/span> <span class="t">Cut the launch video<\/span><\/button>/);
  });

  it('says where it stands as it moves', () => {
    const items = [run('w-run'), filed('w-video', 'w-run', 'Cut the launch video', 10 * MIN)];
    expect(draw(items, () => 'progress')).toMatch(/<span class="v">In progress:<\/span> <span class="t">Cut the launch video</);
    expect(draw(items, () => 'inbox')).toMatch(/tq-dot-need[\s\S]*?Waiting on you:<\/span> <span class="t">Cut the launch video</);
    expect(draw(items, () => 'done')).toMatch(/<span class="v">Done:<\/span> <span class="t">Cut the launch video</);
  });

  it('lists every thread it opened, oldest first, from any of its runs', () => {
    const items = [run('w-run'), run('w-run2'), filed('w-b', 'w-run2', 'Second', 5 * MIN), filed('w-a', 'w-run', 'First', 20 * MIN)];
    expect(openedLines(items, mate.id).map((l) => l.item)).toEqual(['w-a', 'w-b']);
    expect(draw(items)).toMatch(/First<\/span><\/button><button type="button" class="tq-sent-line">[\s\S]*?Second/);
  });

  it('leaves out threads filed anywhere else', () => {
    const items = [
      run('w-run'),
      run('w-theirs', other),
      { id: 'w-plain', product: 'kestrel', status: 'open', labels: [], title: 'Plain thread', createdAt: NOW - 40 * MIN },
      filed('w-under-plain', 'w-plain', 'Under a plain thread', 10 * MIN),
      filed('w-under-other', 'w-theirs', 'Under another teammate', 10 * MIN),
      // Same id as the run, other project: not the run's.
      { ...filed('w-elsewhere', 'w-run', 'Same parent id, other project', 10 * MIN), product: 'other' },
      // A run of a teammate is drawn as a run, not again as a thread it opened.
      { ...filed('w-pass', 'w-run', 'A pass', 10 * MIN), labels: [teammateLabel(other.id)] },
    ];
    expect(openedLines(items, mate.id)).toEqual([]);
    expect(threadsItOpened(items, mate.id)).toEqual([]);
    const html = draw(items);
    for (const t of ['Under a plain thread', 'Under another teammate', 'Same parent id, other project', 'A pass']) expect(html).not.toContain(t);
  });

  // The AI teammate's own page (Chats and Team) lists its tasks, not a chat, and drew only its runs.
  it('is on the teammate page\'s task list too', () => {
    const items = [run('w-run'), filed('w-video', 'w-run', 'Cut the launch video', 10 * MIN)];
    expect(threadsItOpened(items, mate.id).map((i) => i.id)).toEqual(['w-video']);
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("const runs = [...items.filter((i) => i.labels?.includes(`teammate:${id}`)), ...threadsItOpened(items, id)];");
  });
});
