// The Tasks page (every task on the team, late and blocked first) could not be
// opened on a team. When the team layouts became one on 2026-11-02, its door
// stayed on the single-person layout, which a team never has, while the page
// itself only draws on a team. Found checking the onboarding call's script
// against the demo copy (2026-11-21): the script names Tasks and nothing opened it.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatsColumn, ChatsContext, type ChatsValue } from '../renderer/src/teammates/ChatsColumn.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const value = (extra: Partial<ChatsValue>): ChatsValue => ({ teammates: [], groups: [], now: Date.now(), onTeammate: noop, onNew: noop, onGroup: noop, ...extra });
const drawn = (extra: Partial<ChatsValue>, current: string | null = null) => renderToStaticMarkup(
  createElement(ChatsContext.Provider, { value: value(extra) }, createElement(ChatsColumn, { current })),
);

describe('the Team page\'s list', () => {
  it('offers Tasks under the Standup on a team', () => {
    const html = drawn({ onTeam: noop, onTasks: noop });
    expect(html).toContain('>Standup<');
    expect(html).toContain('>Tasks<');
    expect(html.indexOf('>Standup<')).toBeLessThan(html.indexOf('>Tasks<'));
  });

  it('marks Tasks as the page open when it is', () => {
    expect(drawn({ onTeam: noop, onTasks: noop }, 'tasks')).toMatch(/cx-row cx-team on" aria-current="page"[^>]*><span class="cx-mark"[^>]*>.*?<\/span><span class="cx-n">Tasks/);
  });

  it('offers no Tasks where there is no team page to open it in', () => {
    expect(drawn({})).not.toContain('>Tasks<');
  });
});

describe('the app', () => {
  const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
  it('opens Tasks in the Team page and draws the team\'s tasks there', () => {
    expect(app).toContain("onTasks: homeLayout === 'chats' ? () => openChatsPlace('tasks') : undefined,");
    expect(app).toContain("chatsPlace === 'tasks' ? <div className=\"team-page\">{tasksPage('Tasks')}</div>");
  });
});
