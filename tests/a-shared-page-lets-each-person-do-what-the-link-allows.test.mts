// A SHARED PAGE LETS EACH PERSON DO WHAT THE LINK ALLOWS, AND NO MORE.
//
// Asked for 2026-11-12 (w-926a6814a5): a shared document could not be kept to
// certain people or opened for editing, and had no history. Measured on
// renderer/src/shared-file/ against a stand-in database: what each answer
// becomes on the page (a file, a door asking to sign in, a door saying no),
// what each person is offered (comment, edit, history), how two editors saving
// at once both keep their words, and the parts of the page as they render.
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  readSharedFile, saveEdit, readHistory, mayComment, mayEdit, mayLookBack, sharedLine, versionLine, versionWhen,
} from '../renderer/src/shared-file/shared-file.ts';
import { TopBar, FilePage } from '../renderer/src/shared-file/SharedFilePage.tsx';

const TOK = 'pR3nY0q7Lw2Xc9Vb5Tz1';
const ROW = { name: 'plan.md', kind: 'markdown', type: 'text/markdown', body: '# Plan', version: 1, created_at: '2026-11-12T10:00:00Z', updated_at: '2026-11-12T10:00:00Z', owner_name: 'Maya Chen', owner_avatar: null, mine: false };
type Answers = Record<string, unknown>;
const rpcOf = (answers: Answers) => {
  const asked: [string, Record<string, unknown>][] = [];
  const rpc = async (name: string, args: Record<string, unknown>) => {
    asked.push([name, args]);
    const a = answers[name];
    if (a instanceof Error) throw a;
    return typeof a === 'function' ? (a as (x: Record<string, unknown>) => unknown)(args) : a;
  };
  return { rpc, asked };
};
const file = (extra = {}) => ({ name: 'plan.md', kind: 'markdown' as const, type: 'text/markdown', body: '# Q1 plan\n\nWords.', version: 1, createdAt: 0, updatedAt: 0, ownerName: 'Maya Chen', ownerAvatar: null, mine: false, can: 'comment' as const, rev: 3, changedByName: null, anyone: true, ...extra });

describe('reading the link', () => {
  it('carries what this person may do, which copy it is, and who last changed it', async () => {
    const shown = await readSharedFile(rpcOf({ file_link_view: [{ ...ROW, can: 'edit', rev: 4, changed_by_name: 'Theo', anyone: false }] }).rpc, TOK);
    expect(shown).toMatchObject({ state: 'file', file: { can: 'edit', rev: 4, changedByName: 'Theo', anyone: false } });
  });
  it('is the owner\'s own when it is theirs, whatever the row says beside', async () => {
    const shown = await readSharedFile(rpcOf({ file_link_view: [{ ...ROW, mine: true, can: 'view' }] }).rpc, TOK);
    expect(shown).toMatchObject({ file: { can: 'owner' } });
  });
  it('asks somebody signed out to sign in, and tells a stranger it is not for them', async () => {
    expect(await readSharedFile(rpcOf({ file_link_view: [], file_link_door: 'sign-in' }).rpc, TOK)).toEqual({ state: 'sign-in' });
    expect(await readSharedFile(rpcOf({ file_link_view: [], file_link_door: 'no-access' }).rpc, TOK)).toEqual({ state: 'no-access' });
    expect(await readSharedFile(rpcOf({ file_link_view: [], file_link_door: 'stopped' }).rpc, TOK)).toEqual({ state: 'stopped' });
  });
  it('still says a link was stopped against a database that has no door yet', async () => {
    const { rpc, asked } = rpcOf({ file_link_view: [], file_link_door: new Error('Could not find the function'), file_link_stopped: true });
    expect(await readSharedFile(rpc, TOK)).toEqual({ state: 'stopped' });
    expect(asked.map(([n]) => n)).toEqual(['file_link_view', 'file_link_door', 'file_link_stopped']);
  });
});

describe('what each person is offered', () => {
  const cases: [string, Partial<ReturnType<typeof file>>, boolean, boolean, boolean][] = [
    ['a viewer', { can: 'view' }, false, false, false],
    ['a commenter', { can: 'comment' }, true, false, false],
    ['an editor of a document', { can: 'edit' }, true, true, true],
    ['the owner of a document', { can: 'owner' }, true, true, true],
    ['the owner of a page, which only looks back', { can: 'owner', kind: 'page' as never }, true, false, true],
    ['an editor of a picture', { can: 'edit', kind: 'image' as never }, true, false, false],
    ['an editor on a database too old to edit', { can: 'edit', rev: 0 }, true, false, false],
  ];
  for (const [who, extra, comment, edit, history] of cases) {
    it(`${who}: comment ${comment}, edit ${edit}, history ${history}`, () => {
      const f = file(extra);
      expect([mayComment(f), mayEdit(f), mayLookBack(f)]).toEqual([comment, edit, history]);
    });
  }
});

describe('saving an edit', () => {
  it('goes over the copy the editor started from', async () => {
    const { rpc, asked } = rpcOf({ edit_file_link: 6 });
    const out = await saveEdit(rpc, async () => null, TOK, 'new words', { rev: 5, body: 'old words' });
    expect(out).toEqual({ rev: 6, body: 'new words', merged: false });
    expect(asked).toEqual([['edit_file_link', { tok: TOK, b: 'new words', base: 5 }]]);
  });
  it('keeps both people\'s words when somebody saved in between', async () => {
    let calls = 0;
    const { rpc, asked } = rpcOf({ edit_file_link: () => { calls += 1; if (calls === 1) throw new Error('changed since you opened it'); return 8; } });
    const base = 'line one\nline two\nline three\n';
    const theirs = 'line one EDITED BY THEO\nline two\nline three\n';
    const mine = 'line one\nline two\nline three\nline four by Jun\n';
    const out = await saveEdit(rpc, async () => ({ body: theirs, rev: 7 }), TOK, mine, { rev: 6, body: base });
    expect(out.merged).toBe(true);
    expect(out.body).toBe('line one EDITED BY THEO\nline two\nline three\nline four by Jun\n');
    expect(asked[1]).toEqual(['edit_file_link', { tok: TOK, b: out.body, base: 7 }]);
  });
  it('lets any other refusal through as it is', async () => {
    const { rpc } = rpcOf({ edit_file_link: new Error('this link does not let you edit') });
    await expect(saveEdit(rpc, async () => null, TOK, 'x', { rev: 1, body: '' })).rejects.toThrow(/does not let you edit/);
  });
});

describe('history', () => {
  it('is read newest first as the database gives it, and says who did what', async () => {
    const { rpc } = rpcOf({ file_link_history: [
      { id: 'b', rev: 2, how: 'edited', by_name: 'Theo', by_owner: false, at: '2026-11-12T11:00:00Z', current: true },
      { id: 'a', rev: 1, how: 'shared', by_name: 'Maya Chen', by_owner: true, at: '2026-11-12T10:00:00Z', current: false },
      { id: 'x', rev: 0, how: 'deleted', by_name: 'Nobody', at: '2026-11-12T09:00:00Z' },
    ] });
    const list = await readHistory(rpc, TOK);
    expect(list.map((v) => [v.id, versionLine(v), v.current])).toEqual([['b', 'Edited by Theo', true], ['a', 'Shared by Maya Chen', false]]);
  });
  it('gives every version its hour, today and before', () => {
    const now = new Date(2026, 10, 12, 18, 0).getTime();
    expect(versionWhen(new Date(2026, 10, 12, 17, 2).getTime(), now)).toBe('Today at 5:02pm');
    expect(versionWhen(new Date(2026, 10, 3, 9, 15).getTime(), now)).toBe('Nov 3 at 9:15am');
    expect(versionWhen(new Date(2025, 0, 3, 9, 15).getTime(), now)).toBe('Jan 3, 2025 at 9:15am');
  });
});

describe('the page', () => {
  const bar = (props = {}) => renderToStaticMarkup(h(TopBar, { count: 0, open: false, onComments() {}, ...props }));
  it('offers History to an editor and Edit to an editor who is signed out, and neither to anyone else', () => {
    expect(bar({ history: { open: false, onToggle() {} } })).toContain('>History<');
    expect(bar({ signInToEdit() {} })).toContain('>Edit<');
    expect(bar()).not.toMatch(/>History<|>Edit</);
  });
  it('says who edited it last when that was not its owner', () => {
    const now = Date.parse('2026-11-12T18:00:00Z');
    expect(sharedLine({ ownerName: 'Maya Chen', createdAt: Date.parse('2026-11-02T10:00:00Z'), updatedAt: Date.parse('2026-11-03T10:00:00Z'), changedByName: 'Theo' }, now)).toBe('Shared by Maya Chen · edited by Theo Nov 3');
  });
  it('shows an earlier version in place of the file, with the way back and the way to restore it', () => {
    const peek = { version: { id: 'a', how: 'shared' as const, byName: 'Maya Chen', byOwner: true, at: Date.parse('2026-11-12T10:00:00Z'), current: false }, body: '# Q1 plan\n\nThe first words.', restore: async () => {}, back() {} };
    const html = renderToStaticMarkup(h(FilePage, { token: TOK, file: file({ can: 'edit' }), peek }));
    expect(html).toContain('The first words.');
    expect(html).not.toContain('>Words.<');
    expect(html).toContain('Restore this version');
    expect(html).toContain('Back to the current one');
  });
  it('frames a page kept to certain people from its own words, as the site\'s address cannot read it', () => {
    const page = file({ kind: 'page', name: 'p.html', type: 'text/html', body: '<p>hi</p>' });
    expect(renderToStaticMarkup(h(FilePage, { token: TOK, file: { ...page, anyone: false } }))).toMatch(/srcDoc|srcdoc/);
    expect(renderToStaticMarkup(h(FilePage, { token: TOK, file: page }))).toContain(`/f/${TOK}/raw`);
  });
  it('offers no download of a film kept to certain people, and the site\'s address for one anyone may open', () => {
    const film = file({ kind: 'video', name: 'f.mp4', type: 'video/mp4', body: JSON.stringify({ pieces: 1, size: 10, hash: 'a'.repeat(40) }) });
    expect(renderToStaticMarkup(h(FilePage, { token: TOK, file: { ...film, anyone: false }, piece: async () => null }))).not.toContain('Download');
    expect(renderToStaticMarkup(h(FilePage, { token: TOK, file: film, piece: async () => null }))).toContain(`/f/${TOK}/raw`);
  });
});
