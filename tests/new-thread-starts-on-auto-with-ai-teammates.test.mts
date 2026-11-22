// NEW THREAD STARTS ON AUTO WITH AI TEAMMATES (w-b5f23cff71).
//
// The screen's half of Auto (shared/auto-route.mts). Approved as drawn
// (designs 83 to 88): To opens on Auto when there is an AI teammate to give a
// thread to, and Model stays, so what it runs on is still yours ("For auto
// mode you can still choose the model ... That's great."). The row says
// Assigning while Auto picks and Asks you who when it could not tell, and the
// thread carries one line under your words saying who took it and why.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { autoOffered, headRows } from '../renderer/src/threads/composer-rules.ts';
import { statusCell } from '../renderer/src/status-word.ts';
import { RouteLine } from '../renderer/src/components/RouteLine.tsx';
import { AGENT_WHY } from '../shared/auto-route.mts';

const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
const video = { id: 't-video', name: 'Video producer', letter: 'V', role: null, paused: false, status: 'active' };
const growth = { id: 't-growth', name: 'Growth marketer', letter: 'G', role: null, paused: false, status: 'active' };
const mates = new Map([[video.id, video], [growth.id, growth]]);
const row = (extra = {}) => ({ id: 'w-1', product: 'p', productName: 'P', status: 'open', title: 'Make a clip', labels: ['founder'], priority: 5, epoch: 1, claim: null, createdAt: 1, updatedAt: 1, ...extra });

describe('To offers Auto', () => {
  it('with an AI teammate that is working, where the box can reach them', () => {
    expect(autoOffered([video], true)).toBe(true);
    expect(autoOffered([{ ...video, paused: true }, growth], true)).toBe(true);
  });

  it('and not with none, with every one paused, or where teammates cannot be reached', () => {
    expect(autoOffered([], true)).toBe(false);
    expect(autoOffered(undefined, true)).toBe(false);
    expect(autoOffered([{ ...video, paused: true }], true)).toBe(false);
    expect(autoOffered([video], false)).toBe(false);
  });

  it('keeps the Model row, as an agent does', () => {
    expect(headRows({ person: false, kind: 'message' })).toEqual(['to', 'model']);
  });
});

describe('the New thread box', () => {
  beforeAll(() => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  });
  const draw = async (props = {}) => {
    const { ThreadComposer } = await import('../renderer/src/threads/ThreadComposer.tsx');
    return renderToStaticMarkup(h(ThreadComposer, {
      products: [{ slug: 'p', name: 'P', dir: '/p', repoPath: '/r' }], items: [], engines: ['claude'],
      onClose() {}, onSent() {}, ...props,
    }));
  };

  it('opens on Auto with an AI teammate to give it to', async () => {
    const html = await draw({ agentMates: [video], onToTeammate: async () => null });
    expect(html).toMatch(/<span class="tc-word-text">Auto<\/span>/);
    expect(html).toContain('auto-fork');
  });

  it('opens on the agent without one, and on whoever it was opened for', async () => {
    expect(await draw()).not.toMatch(/tc-word-text">Auto</);
    expect(await draw({ agentMates: [video], onToTeammate: async () => null, initial: { mate: 't-video' } })).toMatch(/tc-word-text">Video producer</);
  });

  it('sends an Auto thread as a thread carrying the auto label, the model you picked beside it', () => {
    // The tutorial's own task keeps its mark over Auto's.
    expect(card).toMatch(/\.\.\.\(onAuto \? \[AUTO_LABEL\] : \[\]\),[\s\S]{0,500}\/\/ The tutorial's own task[^\n]*\n\s*\.\.\.\(scripted \? \{ labels: scripted\.labels \} : \{\}\),/);
    // Picking anyone in To leaves Auto.
    expect(card).toMatch(/const chooseMate = \(id: string\) => \{ setAdding\(false\); setAuto\(false\);/);
  });
});

describe('the row of a thread sent to Auto', () => {
  it('says Assigning while Auto picks', () => {
    expect(statusCell(row({ labels: ['founder', 'auto'] }), { queued: [] }).word).toBe('Assigning');
  });

  it('says Asks you who when Auto asked, not Stopped', () => {
    const asked = row({ labels: ['founder', 'auto'], routed: { ask: ['mate:t-video', 'mate:t-growth'], why: 'Both.', at: 1, by: 'auto' } });
    expect(statusCell(asked, { stalled: true, queued: [] }).word).toBe('Asks you who');
  });

  it('opens with no bar saying an agent stopped on it, since none did', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('stalled={(snap.supervisor.stalled?.includes(focused.id) ?? false) && !asksWho(focused) && !snap.supervisor.signInNeeded?.[focused.id]}');
  });

  it('is an ordinary row once it is given to someone', () => {
    const given = row({ labels: ['founder', 'teammate:t-video'], routed: { to: 'mate:t-video', why: 'x', at: 1, by: 'auto' } });
    expect(statusCell(given, { stalled: true, queued: [] }).word).toBe('Stopped');
  });
});

describe('the line under your words', () => {
  const line = (routed) => renderToStaticMarkup(h(RouteLine, { item: row({ routed }), mates }));

  it('names the teammate that took it, why, and offers it to someone else', () => {
    const html = line({ to: 'mate:t-video', why: 'It made the last four clips.', at: 1, by: 'auto' });
    expect(html).toContain('<b>Video producer</b> took this. It made the last four clips.');
    expect(html).toContain('Give it to someone else');
  });

  it('says an agent took it, in the app\'s own words', () => {
    const html = line({ to: 'agent', why: AGENT_WHY, at: 1, by: 'auto' });
    expect(html).toContain(AGENT_WHY.replace("'", '&#x27;'));
    expect(html).toContain('agent-face');
  });

  it('asks with the two names as the choice', () => {
    const html = line({ ask: ['mate:t-video', 'mate:t-growth'], why: 'Both have worked on the captions.', at: 1, by: 'auto' });
    expect(html).toMatch(/Both have worked on the captions\. Give it to <span><button[^>]*>Video producer<\/button><\/span><span> or <button[^>]*>Growth marketer<\/button><\/span>\./);
  });

  it('is nothing on a thread Auto never touched', () => {
    expect(renderToStaticMarkup(h(RouteLine, { item: row(), mates }))).toBe('');
  });
});
