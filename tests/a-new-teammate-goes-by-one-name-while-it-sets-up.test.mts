// Both power testers of w-db46e3fcfd made a teammate from Auto's offer and met
// it under two names while it set itself up: the Team list called it by its
// job ("Data Export Monitor. Take on…"), and its page's heading, its task box
// and the Standup called it "New teammate". It now goes by the list's name
// everywhere until it names itself.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeammatesTitle } from '../renderer/src/teammates/TeammatesPage.tsx';
import { buildMembers } from '../renderer/src/team/everything/members.ts';

const draft = { id: 't-aaaaaaaaaa', name: 'New teammate', letter: 'N', status: 'draft', job: 'Data export monitor. Take on work like this thread from now on.', role: null, paused: false, waiting: [], now: null, running: null };
const named = { ...draft, id: 't-bbbbbbbbbb', name: 'Quality lead', letter: 'Q', status: 'active', role: 'Quality lead' };
const view = { list: [draft, named], chat: [], runs: [] };

describe('a teammate setting itself up', () => {
  it('is headed by what it was asked to do, as the Team list names it', () => {
    const html = renderToStaticMarkup(createElement(TeammatesTitle, { view, open: draft.id }));
    expect(html).toContain('Data export monitor');
    expect(html).not.toContain('>New teammate<');
  });

  it('goes by that name on the team, so the Standup and its card say it too', () => {
    const members = buildMembers({ me: { id: 'p-me', name: 'Sam', avatarUrl: null }, people: [{ id: 'p-me', name: 'Sam', avatarUrl: null }], teammates: [draft, named] });
    expect(members.find((m) => m.key === `mate:${draft.id}`)?.name).toMatch(/^Data export monitor/);
  });

  it('and one that has named itself keeps its own name', () => {
    const members = buildMembers({ me: { id: 'p-me', name: 'Sam', avatarUrl: null }, people: [{ id: 'p-me', name: 'Sam', avatarUrl: null }], teammates: [draft, named] });
    expect(members.find((m) => m.key === `mate:${named.id}`)?.name).toBe('Quality lead');
    expect(renderToStaticMarkup(createElement(TeammatesTitle, { view, open: named.id }))).toContain('Quality lead');
  });
});
