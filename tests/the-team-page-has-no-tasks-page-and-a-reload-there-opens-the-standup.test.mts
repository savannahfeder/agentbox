// THE TEAM PAGE HAS NO TASKS PAGE, AND A RELOAD THAT WAS ON IT OPENS THE STANDUP.
//
// Asked over a picture of the page (2026-11-21): "What is it? ... Is it just my
// tasks or something?", then "why do we need this? Doesn't the inbox already
// solve most of these problems?" Read in the code: every task you are part of
// is already in Needs you or In progress (shared/team-rules.mts inMyInbox). A
// task between two other teammates shows on the holder's own page, under In
// progress. They chose to take the page out.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatsColumn, ChatsContext, type ChatsValue } from '../renderer/src/teammates/ChatsColumn.tsx';
import { readPlace, writePlace } from '../renderer/src/where-she-was.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const noop = () => {};
const drawn = (extra: Record<string, unknown>) => renderToStaticMarkup(createElement(ChatsContext.Provider, {
  value: { teammates: [], groups: [], now: Date.now(), onTeammate: noop, onNew: noop, onGroup: noop, ...extra } as ChatsValue,
}, createElement(ChatsColumn, { current: null })));

describe('the Team page', () => {
  it('offers the Standup and no Tasks', () => {
    const html = drawn({ onTeam: noop, onTasks: noop });
    expect(html).toContain('>Standup<');
    expect(html).not.toContain('>Tasks<');
  });
});

describe('the app', () => {
  it('has no Tasks page to draw', () => {
    expect(fs.existsSync(path.join(root, 'renderer/src/team/TasksPage.tsx'))).toBe(false);
    expect(read('renderer/src/App.tsx')).not.toMatch(/TasksPage|teamTasks|tasksOn/);
  });
  it('has no Tasks tab beside Needs you, In progress and Today', () => {
    const pages = read('renderer/src/threads/Pages.tsx');
    expect(pages).not.toMatch(/team\.tasks|>Tasks</);
    expect(pages).toMatch(/team\.today/);
  });
});

describe('a reload that was on the Tasks page', () => {
  const store = () => {
    const kept = new Map<string, string>();
    return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); } };
  };
  const across = (place: Record<string, unknown>) => {
    const s = store();
    writePlace(s, place as never);
    return readPlace(s);
  };
  it('opens the Standup when it was the Team page\'s Tasks', () => {
    expect(across({ view: 'inbox', chats: 'tasks' })?.chats).toBe('team');
  });
  it('opens Needs you when it was the Tasks tab', () => {
    const back = across({ view: 'inbox', tasks: true });
    expect(back).toEqual({ view: 'inbox' });
  });
  it('leaves the Standup and a person\'s page as they were', () => {
    expect(across({ view: 'inbox', chats: 'team' })?.chats).toBe('team');
    expect(across({ view: 'inbox', chats: 'person:p-lena' })?.chats).toBe('person:p-lena');
  });
});
