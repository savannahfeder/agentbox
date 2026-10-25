// A THREAD CAN BE RENAMED, AND THE CRUMB GOES BACK ONE LEVEL (w-ab3d51dc7d).
//
// What was asked, 2026-10-13: "there's no way for us to update the title of a
// task", in the summary or anywhere else. Measured on this branch before the
// change: `store.threadEdit` dropped every key but the summary's lines and the
// properties, so `{ label }` threw "nothing to change", and the name in the
// bar's crumb sat inside the one back button, so pressing it closed the thread.
// The same ask: "selecting the whole breadcrumb brings me back ... That's not
// how I expected it to work." Only "‹ NEEDS YOU" goes back now; the name is
// its own control, and pressing it renames the thread.
//
// A RENAME WRITES `label`, NEVER `title`. The title is the message the thread
// was started with: it opens the conversation and briefs every run
// (message-split.ts joinMessage), so renaming must not rewrite it. `label` is
// already the name every row shows (list-rules.ts rowTitle), and written on
// the person's authority it outranks the namer's, which would otherwise have
// put its own name back.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Store } from '../main/store.mjs';
import { rowTitle } from '../renderer/src/list-rules.ts';
import { ThreadCrumb, SummaryPanel } from '../renderer/src/threads/Summary.tsx';
import { renameTo } from '../renderer/src/threads/crumb-rules.ts';
globalThis.React = React;

let root, store;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-'));
  const dir = path.join(root, 'kestrel');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'kestrel', name: 'kestrel' }));
  store = await new Store({ accountRoot: root, products: [] }).init();
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const MESSAGE = 'Currently I think there is no way for us to update the title of a task, which I would expect to be able to do.';
const namerWrites = (id, label) => store.modules.workItemsDisk.updateWorkItem(store.productDir('kestrel'), id, { label }, { source: 'agent' });

describe('renaming a thread in the store', () => {
  it('writes the new name, and every row shows it', () => {
    const made = store.composeItem('kestrel', { title: MESSAGE });
    store.threadEdit('kestrel', made.id, { label: 'Rename tasks' });
    const row = store.readItem('kestrel', made.id);
    expect(row.label).toBe('Rename tasks');
    expect(rowTitle(row)).toBe('Rename tasks');
  });

  it('leaves the message the thread was started with exactly as it was', () => {
    const made = store.composeItem('kestrel', { title: MESSAGE });
    store.threadEdit('kestrel', made.id, { label: 'Rename tasks' });
    expect(store.readItem('kestrel', made.id).title).toBe(MESSAGE);
  });

  it('replaces a name the namer had already written', () => {
    const made = store.composeItem('kestrel', { title: MESSAGE });
    namerWrites(made.id, 'Task title editing');
    store.threadEdit('kestrel', made.id, { label: 'Rename tasks' });
    expect(rowTitle(store.readItem('kestrel', made.id))).toBe('Rename tasks');
  });

  it('is not undone by the namer writing again afterwards', () => {
    const made = store.composeItem('kestrel', { title: MESSAGE });
    store.threadEdit('kestrel', made.id, { label: 'Rename tasks' });
    namerWrites(made.id, 'Task title editing');
    expect(rowTitle(store.readItem('kestrel', made.id))).toBe('Rename tasks');
  });

  it('trims the name it is given', () => {
    const made = store.composeItem('kestrel', { title: MESSAGE });
    store.threadEdit('kestrel', made.id, { label: '  Rename tasks \n' });
    expect(store.readItem('kestrel', made.id).label).toBe('Rename tasks');
  });

  it('refuses a blank name rather than leave a row with none', () => {
    const made = store.composeItem('kestrel', { title: MESSAGE });
    namerWrites(made.id, 'Task title editing');
    expect(() => store.threadEdit('kestrel', made.id, { label: '   ' })).toThrow();
    expect(rowTitle(store.readItem('kestrel', made.id))).toBe('Task title editing');
  });

  it('still refuses the title itself, which stays the message', () => {
    const made = store.composeItem('kestrel', { title: MESSAGE });
    expect(() => store.threadEdit('kestrel', made.id, { title: 'Something else' })).toThrow(/nothing to change/);
    expect(store.readItem('kestrel', made.id).title).toBe(MESSAGE);
  });
});

describe('what a finished rename sends', () => {
  it('sends the new name, trimmed', () => {
    expect(renameTo('  Rename tasks ', 'Old name')).toBe('Rename tasks');
  });
  it('sends nothing when the name did not change', () => {
    expect(renameTo('Old name', 'Old name')).toBeNull();
    expect(renameTo(' Old name  ', 'Old name')).toBeNull();
  });
  it('sends nothing for a blank name, so clearing the box puts the old one back', () => {
    expect(renameTo('', 'Old name')).toBeNull();
    expect(renameTo('   ', 'Old name')).toBeNull();
  });
  it('folds a pasted line break into a space', () => {
    expect(renameTo('Rename\ntasks', 'Old name')).toBe('Rename tasks');
  });
});

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the crumb goes back one level, and its name renames', () => {
  const draw = (props) => renderToStaticMarkup(React.createElement(ThreadCrumb, {
    from: 'Needs you', name: 'First frame white background fix', onBack: () => {}, onRename: async () => true, ...props,
  }));

  it('still reads: where you came from, a slash, the name', () => {
    expect(text(draw())).toBe('Needs you / First frame white background fix');
  });

  it('goes back only from the arrow and the tab you came from', () => {
    const html = draw();
    const back = html.match(/<button[^>]*data-hint="back"[^>]*>([\s\S]*?)<\/button>/);
    expect(back).not.toBeNull();
    expect(text(back[1])).toBe('Needs you');
    expect(back[0]).toMatch(/aria-label="Back to Needs you \(esc\)"/);
  });

  it('keeps the name out of the back button', () => {
    const back = draw().match(/<button[^>]*data-hint="back"[^>]*>[\s\S]*?<\/button>/)[0];
    expect(back).not.toContain('First frame white background fix');
  });

  it('makes the name its own control that renames the thread', () => {
    const html = draw();
    expect(html).toMatch(/<button[^>]*class="thread-crumb-name"[^>]*aria-label="Rename this thread"/);
  });

  it('draws the name as plain words where it cannot be renamed', () => {
    const html = draw({ onRename: undefined });
    expect(html).not.toMatch(/Rename this thread/);
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it('keeps the whole of a long name one hover away', () => {
    const long = 'Export starts on a white frame, so X and LinkedIn pick it as the thumbnail and every launch post looks broken';
    const html = draw({ name: long });
    expect(text(html)).toBe('Needs you / Export starts on a white frame, so X and LinkedIn pick…');
    expect(html).toContain(`title="${long}"`);
  });
});

// THE LABEL LIGHTS UP, AND NOTHING IS FILLED OR BOXED (picked 2026-10-13).
// The grey fill on hover and the filled box while typing, in Context and Done
// as well as the name, were "not the best design practice". Of three looks
// drawn on the real app (designs/w-ab3d51dc7d/edit-looks.html) the pick was
// A: pointing shows only the pencil, and while you type the text stays where
// it was and the field's label turns apricot and says "· editing".
const summaryCss = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');
const ruleOf = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return summaryCss.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
};

describe('editing in place: the label lights up, nothing is filled or boxed', () => {
  it('fills nothing under the pointer on a line, the name or the crumb\'s name', () => {
    expect(summaryCss).not.toMatch(/\.ts-line:hover \{[^}]*background/);
    expect(summaryCss).not.toMatch(/\.ts-title\[role="button"\]:hover \{[^}]*background/);
    expect(summaryCss).not.toMatch(/button\.thread-crumb-name:hover[^{]*\{[^}]*background/);
  });
  it('still shows the pencil under the pointer', () => {
    expect(summaryCss).toMatch(/\.ts-line:hover \.ts-pen/);
    expect(summaryCss).toMatch(/\.ts-title\[role="button"\]:hover \.ts-pen/);
  });
  it('draws the box you type in with no fill and no border', () => {
    const edit = ruleOf('.ts-edit');
    expect(edit).toMatch(/background: none/);
    expect(edit).toMatch(/border-color: transparent/);
    const crumb = ruleOf('.thread-crumb-edit');
    expect(crumb).toMatch(/background: none/);
    expect(crumb).toMatch(/border: 0/);
  });
  it('turns the label of the field being typed in apricot, and says so', () => {
    expect(ruleOf('.ts-sec:has(> .ts-edit) > .ts-h')).toMatch(/color: var\(--accent\)/);
    expect(ruleOf('.ts-sec:has(> .ts-edit) > .ts-h::after')).toMatch(/content: ' · editing'/);
  });
  it('lights only that label: a label over words nobody is typing in stays faint', () => {
    expect(ruleOf('.ts-h')).toMatch(/color: var\(--text-faint\)/);
  });
  it('says what Enter and Esc do while the summary\'s name is being typed, since it has no label to light', () => {
    const src = fs.readFileSync(new URL('../renderer/src/threads/Summary.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/rename\.editing \? 'Renaming · Enter saves, Esc keeps the old name'/);
  });
  it('turns the crumb\'s slash apricot while its name is being typed', () => {
    expect(ruleOf('.thread-crumb:has(.thread-crumb-edit) .thread-crumb-sep')).toMatch(/color: var\(--accent\)/);
  });
  it('keeps the crumb\'s capitals while you type in it, so the bar does not change shape', () => {
    const crumb = ruleOf('.thread-crumb-edit');
    expect(crumb).toMatch(/text-transform: uppercase/);
    expect(crumb).toMatch(/var\(--mono\)/);
  });
});

describe('the summary’s name renames the thread', () => {
  const item = { id: 'w-acme', product: 'northwind', productName: 'Northwind', status: 'open', kind: 'directive', labels: ['founder'],
    title: MESSAGE, label: 'Acme renewal terms', priority: 7, epoch: 0, claim: null, createdAt: 0, updatedAt: 0 };
  it('is a control saying so, under the same name the row shows', () => {
    const html = renderToStaticMarkup(React.createElement(SummaryPanel, { item, items: [item], team: null }));
    expect(html).toMatch(/<h2 class="ts-title"[^>]*role="button"[^>]*aria-label="Rename this thread"[^>]*><span class="ts-title-text">Acme renewal terms/);
  });
});
