// A THREAD A TEAMMATE SENT YOU IS ONE QUIET LINE IN ITS CHAT (2026-11-01).
//
// On the team version, the chief of staff's chat embedded a whole inbox row in
// the conversation: a "NEEDS YOU" tab over a row with WAITING ON YOU, COMPANY,
// MEDIUM and the time, in mono caps, between two messages. The owner called it
// clutter. It is now one soft-cornered line per thread, "Waiting on you: <title>",
// that opens the thread. Measured by drawing the chat and reading its markup.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { runLines, statusOf, teammateLabel } from '../shared/teammates.mts';

vi.mock('../renderer/src/api', () => ({ api: new Proxy({}, { get: () => async () => ({ ok: false }) }) }));
const { TeammatesPage } = await import('../renderer/src/teammates/TeammatesPage.tsx');
const { TeammatesContext } = await import('../renderer/src/teammates/row-lead.tsx');

const MIN = 60_000;
const NOW = Date.parse('2026-10-30T19:00:00Z');
const mate = { id: 't-a1a1a1a1a1', name: 'Chief of staff', letter: 'C', product: 'kestrel', status: 'active', paused: false, served: '', limit: 40, works: null, memory: [], playbooks: [], duties: [] };
const sent = (id, said, ago) => ({
  id, product: 'kestrel', status: 'open', kind: 'directive', labels: ['founder', teammateLabel(mate.id), 'hop:0'], priority: null, title: 'Launch video',
  result: `**${said}**\n\nMore words.`, createdAt: NOW - ago - MIN, updatedAt: NOW - ago, wrote: { result: { ts: NOW - ago, source: 'agent' } },
});
const items = [sent('w-cuts', 'Two cuts of the launch video are ready', 20 * MIN), sent('w-posts', 'Three posts for tomorrow are ready', 14 * MIN)];

function draw(tabOf = () => 'inbox') {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  try {
    const view = { list: [{ ...mate, ...statusOf(mate, items, NOW) }], chat: [], runs: runLines(items, [mate]), playbooks: [] };
    return renderToStaticMarkup(React.createElement(TeammatesContext.Provider, { value: new Map([[mate.id, mate]]) }, React.createElement(TeammatesPage, {
      view, items, open: mate.id, products: [{ slug: 'kestrel', name: 'Kestrel' }], engines: [], me: 'Sam', onOpen() {}, onOpenThread() {}, onChanged() {}, tabOf, onOpenList() {},
    })));
  } finally { clock.mockRestore(); }
}

describe('a thread a teammate sent you', () => {
  it('is one line per thread, saying it waits on you, then its title', () => {
    const html = draw();
    expect(html.match(/class="tq-sent-line"/g)).toHaveLength(2);
    expect(html).toMatch(/<button type="button" class="tq-sent-line"><i class="tq-dot-need" aria-hidden="true"><\/i><span class="v">Waiting on you:<\/span> <span class="t">Two cuts of the launch video are ready<\/span><\/button>/);
  });
  it('carries no inbox row, no tab and no row labels', () => {
    const html = draw();
    expect(html).not.toMatch(/tq-inrows|tq-sent-bar|class="tm-tab/);
    expect(html).not.toMatch(/Medium|Kestrel/);
  });
  it('says where a thread stands when it no longer waits on you, with no dot', () => {
    expect(draw(() => 'progress')).toMatch(/<span class="v">In progress:<\/span>/);
    expect(draw(() => 'done')).toMatch(/<span class="v">Done:<\/span>/);
    expect(draw(() => 'done')).not.toMatch(/tq-dot-need/);
    expect(draw(() => null)).toMatch(/<span class="v">Sent you:<\/span>/);
  });
  it('opens the thread on a click', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/className="tq-sent-line" onClick=\{\(\) => onOpenThread\(r\.product, r\.item\)\}/);
  });
  it('is soft-cornered and quiet', () => {
    const css = fs.readFileSync(new URL('../renderer/src/teammates/teammates.css', import.meta.url), 'utf8');
    const rule = css.match(/\n\.tq-sent-line \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/border-radius: var\(--artifact-corner-small\)/);
    expect(rule).toMatch(/border: 0/);
    expect(css).toMatch(/\.tq-sent-line \.v \{[^}]*color: var\(--text-faint\)/);
  });
});
