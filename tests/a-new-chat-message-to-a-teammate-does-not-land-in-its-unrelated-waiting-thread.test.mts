// On 8 Nov 2026 a note to Head of Marketing in the team chat, about a company
// to model posts on, went into its launch film thread instead of a thread of
// its own, and that run worked on it there among the film's files. The film
// thread was not started from the chat; its last answer ended with Options
// about licensing a music track, and `planWakes` took any chat words from you
// as the answer to the newest waiting run that asked something.
//
// Measured on plain data: before the fix, the unrelated message below came back
// as an `answer` into the film thread and no `run` was made.
import { describe, it, expect } from 'vitest';
import { planWakes, runIdFor, teammateLabel, DUTY_LABEL_PREFIX, CHAT_LABEL, DEFAULT_LIMIT } from '../shared/teammates.mts';

const NOW = new Date(2026, 10, 8, 21, 17).getTime();
const hom = { id: 't-a1a1a1', name: 'Head of Marketing', letter: 'H', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'agentbox-team', memory: [] };
const chat = (messages, seen = []) => ({ messages, seen: new Set(seen) });
const film = (over = {}) => ({
  id: 'w-f11f11f11f11', product: 'agentbox-team', title: "Bring the day's product update", status: 'open',
  labels: [teammateLabel(hom.id), `${DUTY_LABEL_PREFIX}d-update`], createdAt: NOW - 86_400_000,
  result: 'The film is cut.\n\n## Options\n1. License the track (recommended)\n2. Use a free one',
  wrote: { result: { ts: NOW - 3_600_000, source: 'agent' } }, ...over,
});
const say = (text, over = {}) => ({ id: 'm-new', kind: 'msg', from: 'you', to: [hom.id], text, ts: NOW, ...over });
const into = (acts) => acts.filter((a) => a.type === 'answer');

describe('your chat words to a teammate with a thread waiting on you', () => {
  it('start a thread of their own when they are about something new', () => {
    const acts = planWakes({ teammates: [hom], chat: chat([say('Look at Reason Machines, a company to model our posts on.')]), items: [film()], now: NOW });
    expect(into(acts)).toEqual([]);
    expect(acts.find((a) => a.type === 'run')).toMatchObject({ teammate: hom.id, id: runIdFor(`m-new>${hom.id}`) });
  });

  it('start a new thread too when the waiting thread is held, or a pass from a teammate made it', () => {
    for (const over of [{ status: 'blocked' }, { labels: [teammateLabel(hom.id), 'work:w-other'] }]) {
      const acts = planWakes({ teammates: [hom], chat: chat([say('Something new')]), items: [film(over)], now: NOW });
      expect(into(acts)).toEqual([]);
      expect(acts.find((a) => a.type === 'run')).toBeTruthy();
    }
  });

  it('go into that thread when they answer its question in the chat', () => {
    const q = { id: 'm-q', kind: 'msg', from: hom.id, to: [], text: 'Which track?', options: ['License it', 'Free one'], run: 'w-f11f11f11f11', ts: NOW - 60_000 };
    for (const m of [say('License it', { answers: { 'm-q': 'License it' } }), say('the licensed one')]) {
      const acts = planWakes({ teammates: [hom], chat: chat([q, m], [`m-q>${hom.id}`]), items: [film()], now: NOW });
      expect(into(acts)).toEqual([expect.objectContaining({ item: 'w-f11f11f11f11', msg: 'm-new' })]);
      expect(acts.find((a) => a.type === 'run')).toBeUndefined();
    }
  });

  it('go into a thread your own chat words started that asked you something', () => {
    const chatRun = film({ id: 'w-c4a7c4a7c4a7', labels: [teammateLabel(hom.id), CHAT_LABEL] });
    const acts = planWakes({ teammates: [hom], chat: chat([say('Option 1')]), items: [chatRun], now: NOW });
    expect(into(acts)).toEqual([expect.objectContaining({ item: 'w-c4a7c4a7c4a7' })]);
  });

  it('answer the chat question they name, not the newest waiting thread', () => {
    const chatRun = film({ id: 'w-c4a7c4a7c4a7', labels: [teammateLabel(hom.id), CHAT_LABEL], wrote: { result: { ts: NOW - 10_000, source: 'agent' } } });
    const q = { id: 'm-q', kind: 'msg', from: hom.id, to: [], text: 'Which track?', options: ['A', 'B'], run: 'w-f11f11f11f11', ts: NOW - 60_000 };
    const acts = planWakes({ teammates: [hom], chat: chat([q, say('A', { answers: { 'm-q': 'A' } })], [`m-q>${hom.id}`]), items: [film(), chatRun], now: NOW });
    expect(into(acts)).toEqual([expect.objectContaining({ item: 'w-f11f11f11f11' })]);
  });
});
