// YOUR OWN THREAD WEARS THE MARK OF ITS HARNESS, NOT A FACE.
//
// Asked 2026-11-21 (w-8e34f549aa), with a picture of the Claude and OpenAI
// marks in small tiles: an inbox where every one of your own rows led with the
// two-eyed agent face read as clutter. Your own thread's slot now carries the
// mark of what it runs on, Claude Code's starburst or the OpenAI knot for
// Codex. Measured by rendering one row against each engine the supervisor can
// report: what runs on it now, a conversation brought in from Codex, and what
// it would start on (`snapshot.engines`).
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { TeammatesContext } from '../renderer/src/teammates/row-lead.tsx';
import { FleetContext, type Fleet } from '../renderer/src/fleet.ts';
globalThis.React = React;

const ME = 'p-me', MAYA = 'p-maya';
const T = Date.parse('2026-11-21T12:00:00');
const people = { [ME]: { id: ME, name: 'Alex Rivera', avatarUrl: null }, [MAYA]: { id: MAYA, name: 'Maya Chen', avatarUrl: null } };
const shared = { slug: 'app', name: 'App', dir: '/tmp/a', team: { projectId: 'p', teamId: 't', visibility: 'team', people: [], sharedBy: null } };
const direct = { slug: 'dm', name: 'Maya Chen', dir: '/tmp/d', team: { projectId: 'd', teamId: 't', visibility: 'people', people: [ME, MAYA], sharedBy: MAYA, direct: true } };
const team = { state: { signedIn: true, cards: [] }, me: ME, byId: new Map(Object.entries(people)), products: new Map([[shared.slug, shared], [direct.slug, direct]]) };
const mates = new Map([['disk', { id: 'disk', name: 'Disk keeper', letter: 'D' }]]);

const row = (over = {}) => ({ id: 'w-1', product: 'app', productName: 'App', status: 'open', kind: 'task', title: 'Fix the sign-in test', labels: ['founder'], priority: 5, createdBy: ME, createdAt: T, updatedAt: T, ...over });
const draw = (item, fleet: Fleet = {}, product = shared) => renderToStaticMarkup(
  React.createElement(FleetContext.Provider, { value: fleet },
    React.createElement(TeamContext.Provider, { value: team },
      React.createElement(TeammatesContext.Provider, { value: mates },
        React.createElement(ThreadCells, { item, product, now: T + 60_000, tab: 'inbox' })))));
const slotOf = (html: string) => html.match(/<span class="th-slot">([\s\S]*?)<\/span>(?=[^<]|<span class="th-(title-text|who-name)|$)/)?.[1] ?? '';
const markOf = (html: string) => slotOf(html).match(/class="harness-mark (\w+)"/)?.[1] ?? null;
const onClaude = { engines: { workspace: 'claude', byItem: {} } };

describe("your own thread's slot", () => {
  it('carries the Claude mark on a thread that runs on Claude Code, and no eyes', () => {
    const html = draw(row(), onClaude);
    expect(markOf(html)).toBe('claude');
    expect(slotOf(html)).not.toContain('agent-eyes');
  });

  it('carries the OpenAI mark on a thread that runs on Codex', () => {
    expect(markOf(draw(row(), { engines: { workspace: 'codex', byItem: {} } }))).toBe('codex');
    expect(markOf(draw(row(), { engines: { workspace: 'claude', byItem: { 'w-1': 'codex' } } }))).toBe('codex');
  });

  it('reads each row on its own: a row the supervisor did not name stays on the workspace engine', () => {
    expect(markOf(draw(row({ id: 'w-2' }), { engines: { workspace: 'claude', byItem: { 'w-1': 'codex' } } }))).toBe('claude');
  });

  it('shows what is running on it over what would run next', () => {
    const running = { ...onClaude, sessions: new Map([['w-1', { itemId: 'w-1', product: 'app', startedAt: T, engine: 'codex' }]]) };
    expect(markOf(draw(row(), running as Fleet))).toBe('codex');
  });

  it('is Codex on a conversation brought in from Codex, whatever the workspace runs', () => {
    expect(markOf(draw(row({ labels: ['codex-import'] }), onClaude))).toBe('codex');
    // A label that merely contains the word is not one.
    expect(markOf(draw(row({ labels: ['codex-notes'] }), onClaude))).toBe('claude');
  });

  it('is Claude Code when the snapshot names no engine, as a run with none starts there', () => {
    expect(markOf(draw(row()))).toBe('claude');
  });

  it('keeps the agent face for a harness that has no mark', () => {
    const html = draw(row(), { engines: { workspace: 'some-new-harness', byItem: {} } });
    expect(markOf(html)).toBeNull();
    expect(slotOf(html)).toContain('agent-eyes');
  });

  it('wears OpenCode\'s mark on a thread that runs on OpenCode', () => {
    expect(markOf(draw(row({ id: 'w-9' }), { engines: { workspace: 'claude', byItem: { 'w-9': 'opencode' } } }))).toBe('opencode');
  });
});

// THE ROWS THAT MUST NOT CHANGE: a teammate is a face, not a harness.
describe('rows from someone else', () => {
  it("an AI teammate's thread keeps its drawn face", () => {
    const html = draw(row({ labels: ['founder', 'teammate:disk'] }), onClaude);
    expect(slotOf(html)).toContain('mate-face');
    expect(markOf(html)).toBeNull();
  });

  it("a person's message keeps their initials", () => {
    const html = draw(row({ id: 'w-3', product: 'dm', labels: [], title: 'Pricing copy', body: 'Can you check the pricing copy?', createdBy: MAYA, people: [MAYA, ME], wrote: { body: { ts: T, by: MAYA, source: 'founder' } } }), onClaude, direct);
    expect(slotOf(html)).toContain('tm-av');
    expect(markOf(html)).toBeNull();
  });
});
