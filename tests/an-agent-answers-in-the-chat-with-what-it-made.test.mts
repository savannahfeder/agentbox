// AN AGENT MENTIONED IN A CHAT ANSWERS UNDER THE MESSAGE, WITH WHAT IT MADE.
//
// Approved on w-2e8aa16f0f (2026-10-05): "this is fantastic with the agent
// showing the tasks in-line, amazing!", for the drawing of an agent answering
// in a conversation with its face, its name, where it works and on what, what
// it said, and the tasks it opened in a bordered list. Built on w-7b9cb8636a.
//
// The message carries a link to the task that answers it, so the answer is
// read off that task wherever this copy of the conversation can see it, and
// off its teammate card where it cannot. A teammate who can see neither is told
// where the agent is working rather than shown nothing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentAnswers, ChatAgentsContext } from '../renderer/src/team/ChatAgents.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { artifactUrlTransform } from '../renderer/src/remark-artifact-paths.ts';

const T = Date.parse('2026-10-05T09:13:00');
const task = { id: 'w-task000001', product: 'agentbox-team', productName: 'Agentbox Team', title: 'Make tasks from findings 1 to 3', status: 'done', result: 'Made three tasks in Agentbox Team.', createdAt: T, updatedAt: T, wrote: { result: { ts: T } } };
const kids = [
  { id: 'w-kid0000001', product: 'agentbox-team', title: 'Ask before presetting a code folder', parent: task.id, createdAt: T + 1, updatedAt: T + 1 },
  { id: 'w-kid0000002', product: 'agentbox-team', title: 'Keep a pasted command exactly as typed', parent: task.id, createdAt: T + 2, updatedAt: T + 2 },
];
const items = [task, ...kids];
const ctx = (over = {}) => ({
  projects: [{ slug: 'agentbox-team', name: 'Agentbox Team' }],
  codexModels: [], codexDefault: null,
  find: (product, id) => items.find((i) => i.id === id && i.product === product),
  stateOf: (i) => (i.id === task.id ? 'done' : 'running'),
  filed: (t) => items.filter((i) => i.parent === t.id),
  open: () => {},
  ...over,
});
const sent = (taskId = task.id) => `[@Claude Code in Agentbox Team](agentbox-agent:claude?project=agentbox-team&model=opus&effort=high&task=${taskId}) make tasks from findings 1 to 3`;
const draw = (text, value = ctx(), team = null) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: team },
    React.createElement(ChatAgentsContext.Provider, { value },
      React.createElement(AgentAnswers, { text, md: (t) => React.createElement('p', null, t) }))));

describe('the agent’s answer under the message', () => {
  const html = draw(sent());

  it('wears the agent’s face and name, and says where it works and on what', () => {
    expect(html).toContain('class="agent-face"');
    expect(html).toContain('>Claude Code<');
    expect(html).toMatch(/Agentbox Team · Opus 5(\.5)? · High/);
  });

  it('says what the agent said', () => {
    expect(html).toContain('>Made three tasks in Agentbox Team.<');
  });

  it('lists the threads it filed, each with where it stands, in the shared list', () => {
    expect(html.match(/class="made-row"/g)).toHaveLength(2);
    expect(html).toContain('>Ask before presetting a code folder<');
    expect(html).toContain('>In progress<');
  });

  it('lists the task itself when it has filed nothing yet, so there is a way in', () => {
    const running = { ...task, status: 'claimed', result: undefined };
    const one = draw(sent(), ctx({ find: () => running, stateOf: () => 'running', filed: () => [] }));
    expect(one).toContain('Working on it in Agentbox Team.');
    expect(one.match(/class="made-row"/g)).toHaveLength(1);
    expect(one).toContain('>Make tasks from findings 1 to 3<');
  });
});

describe('a copy of the conversation that cannot see the task', () => {
  it('reads the teammate card when there is one', () => {
    const team = { state: { cards: [{ threadId: task.id, state: 'running', progress: 'Two of three tasks filed.', project: 'Agentbox Team', updatedAt: T }] }, me: 'p-maya', byId: new Map(), products: new Map() };
    const html = draw(sent(), ctx({ find: () => undefined }), team);
    expect(html).toContain('Working on it in Agentbox Team.');
    expect(html).not.toContain('made-row');
  });

  it('says where the agent is working when there is nothing to read', () => {
    const html = draw(sent(), ctx({ find: () => undefined }));
    expect(html).toContain('Asked to work in Agentbox Team. Only people in that project can open it.');
  });
});

describe('what draws no answer', () => {
  it('is a message with no agent in it, or an agent with no task yet', () => {
    expect(draw('thanks Maya')).toBe('');
    expect(draw('[@Codex in Agentbox Team](agentbox-agent:codex?project=agentbox-team) look')).toBe('');
  });
});

describe('the mention inside a sent message', () => {
  it('keeps its address through the markdown, so it can be drawn as a mention', () => {
    expect(artifactUrlTransform('agentbox-agent:codex?project=agentbox-team&task=w-1')).toBe('agentbox-agent:codex?project=agentbox-team&task=w-1');
  });

  it('does not open the door to any other scheme', () => {
    expect(artifactUrlTransform('javascript:alert(1)')).toBe('');
  });

  it('is drawn as a mention, and the conversation starts its agents when the message lands', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toContain('if (href?.startsWith(AGENT_SCHEME)) return <span className="chat-at">{children}</span>;');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('const answer = talking ? await startChatAgents(item, text) : text;');
    // and the message on the screen takes the linked words, so it is not drawn twice
    expect(app).toContain('if (answer !== text) { mine.text = answer; setSending((q) => [...q]); }');
    expect(app).toContain('<ChatAgentsContext.Provider value={chatAgents}>');
  });
});
