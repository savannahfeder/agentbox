// What the team chat draws, from the snapshot: messages, passes and the lines
// runs leave, in time order, seen whole or through one teammate.
import type { RunningSession, Teammate, TeamChatLine, TeamRunLine, TeammatesView, WorkItem } from '../types';
import { spanLabel } from '../notes';
import { nextRunAt } from '../../../shared/repeats.mjs';
import { teammateIdOf } from '../../../shared/teammates.mjs';

export type ChatEntry = TeamChatLine | TeamRunLine;

/** Teammates as the Chats list draws them: the primary first, the rest as they were. */
export function matesInOrder<T extends Pick<Teammate, 'id'> & { primary?: boolean }>(team: readonly T[]): T[] {
  return [...team.filter((t) => t.primary), ...team.filter((t) => !t.primary)];
}

const toList = (to: TeamChatLine['to']): string[] => (Array.isArray(to) ? to : to ? [to] : []);

// One teammate's page is the team chat seen through them: what they said and
// did, and what was said to them.
export function involves(entry: ChatEntry, id: string): boolean {
  if (entry.kind === 'run') return entry.teammate === id;
  if (entry.from === id) return true;
  return toList(entry.to).includes(id);
}

export function chatEntries(view: TeammatesView | null | undefined, only: string | null = null): ChatEntry[] {
  if (!view) return [];
  const all: ChatEntry[] = [...view.chat, ...view.runs];
  // What you wrote in the chat reaches a waiting run as its answer; the chat
  // already shows it, so only answers typed in the thread itself get a line.
  const saidInChat = new Set(view.chat.filter((m) => m.kind === 'msg' && m.from === 'you').map((m) => String(m.text ?? '').trim()));
  // The team chat says a run finished and leaves out that it was picked up;
  // a teammate's own page keeps both.
  const finished = new Set(view.runs.filter((r) => r.verb === 'finished' || r.verb === 'stopped').map((r) => r.item));
  const shown = all.filter((e) => {
    if (!only && e.kind === 'run' && e.verb === 'picked' && finished.has(e.item)) return false;
    // A run's own start line repeats the pass that made it, so the pass speaks for it.
    if (e.kind === 'run' && e.verb === 'passed') return false;
    if (e.kind === 'run' && e.verb === 'answered' && saidInChat.has(String(e.text ?? '').trim())) return false;
    if (e.kind === 'msg' && (e as TeamChatLine & { start?: boolean }).start) return false;
    return only ? involves(e, only) : true;
  });
  return shown.sort((a, b) => a.ts - b.ts);
}

export function nameOf(id: string | undefined, team: Teammate[]): string {
  if (!id || id === 'you') return 'You';
  return team.find((t) => t.id === id)?.name ?? 'A teammate';
}

export function waitingCount(team: Teammate[]): number {
  return team.reduce((n, t) => n + t.waiting.length, 0);
}

// The day header a run of lines sits under.
export function dayOf(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function clockOf(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');
}

// A teammate that asked you something in the chat, with answers to tap, and
// has not heard from you since. A new teammate's setup questions are asked
// this way, and nothing else would say it is waiting.
export function asksYou(view: TeammatesView | null | undefined, id: string): boolean {
  if (!view) return false;
  let asked = 0;
  for (const m of view.chat) if (m.kind === 'msg' && m.from === id && m.options?.length) asked = Math.max(asked, m.ts);
  if (!asked) return false;
  // Answered in the chat, or in one of its threads.
  if (view.runs.some((r) => r.teammate === id && r.verb === 'answered' && r.ts > asked)) return false;
  return !view.chat.some((m) => m.kind === 'msg' && m.from === 'you' && m.ts > asked && toList(m.to).includes(id));
}

// What you said back to a teammate's question: your next words to it, or null
// while it is still waiting on you. Answers sent together say which question
// each is for, and pass over the ones they leave out.
export function answerTo(view: TeammatesView | null | undefined, q: TeamChatLine): string | null {
  return answerOf(view, q)?.text ?? null;
}

// The same, and whether it was given to this question by name.
export function answerOf(view: TeammatesView | null | undefined, q: TeamChatLine): { text: string; named: boolean } | null {
  if (!view || q.kind !== 'msg' || !q.options?.length) return null;
  for (const m of view.chat) {
    if (m.kind !== 'msg' || m.from !== 'you' || m.ts <= q.ts || !toList(m.to).includes(q.from)) continue;
    if (!m.answers) return { text: String(m.text ?? ''), named: false };
    if (q.id in m.answers) return { text: m.answers[q.id], named: true };
  }
  return null;
}

// The question a teammate's message asks: its last sentence that ends in a
// question mark, else its first sentence.
export function questionOf(text: string): string {
  const sentences = String(text ?? '').replace(/\s+/g, ' ').trim().match(/[^.?!]+[.?!]*/g) ?? [];
  const asked = sentences.filter((s) => s.trim().endsWith('?')).at(-1) ?? sentences[0] ?? '';
  // A short lead such as "First question:" is the teammate counting, not asking.
  const q = asked.trim().replace(/^[^:]{1,20}:\s*/, '');
  return q.charAt(0).toUpperCase() + q.slice(1);
}

// Your answers to a teammate's questions as one message. Each answer goes
// under the question it is for, because the teammate wakes on this message
// alone; one answer needs no question over it.
export function answersMessage(questions: Pick<TeamChatLine, 'id' | 'text'>[], picks: Record<string, string>): { text: string; answers: Record<string, string> } {
  const answered = questions.map((q) => ({ q, a: (picks[q.id] ?? '').trim() })).filter((x) => x.a);
  const answers = Object.fromEntries(answered.map(({ q, a }) => [q.id, a]));
  if (answered.length === 1 && questions.length === 1) return { text: answered[0].a, answers };
  return { text: answered.map(({ q, a }) => `> ${questionOf(q.text ?? '')}\n\n${a}`).join('\n\n'), answers };
}

// A teammate's run waiting its turn behind the one it is on. It is the
// teammate's queue, shown on its page, and not something you put off: the
// second power test found these in its Later list, "not started".
export function queuedTeammateRun(i: Pick<WorkItem, 'labels' | 'start'>): boolean {
  return i.start === 'later' && !!teammateIdOf(i);
}

// Work held for a teammate after too many hand-offs between teammates, which
// waits for your go-ahead: the last such stop with no word from you since.
export function heldFor(view: TeammatesView | null | undefined, id: string): TeamChatLine | null {
  if (!view) return null;
  const stops = view.chat.filter((m) => m.kind === 'act' && m.verb === 'hops' && m.from === id);
  const last = stops.at(-1);
  if (!last) return null;
  return view.chat.some((m) => (m.kind === 'msg' || m.kind === 'pass') && m.from === 'you' && m.ts > last.ts && toList(m.to).includes(id)) ? null : last;
}

// What the held work was called, from the message or pass that was held.
export function heldTitle(view: TeammatesView | null | undefined, stop: TeamChatLine): string {
  const held = view?.chat.find((m) => m.id === stop.ref);
  return String(held?.title ?? held?.text ?? 'the work').replace(/\s+/g, ' ').trim().slice(0, 120);
}

// What a teammate's current run is doing, for the live line under its chat:
// the step it is on and for how long, or that no agent has it yet.
export function workingLine(
  t: Pick<Teammate, 'name' | 'running' | 'now'>,
  session: Pick<RunningSession, 'startedAt' | 'activity'> | null | undefined,
  now = Date.now(),
  asked: string | null = null,
): { state: 'working' | 'waiting'; text: string; aside: string } | null {
  if (!t.running) return null;
  if (!session) return { state: 'waiting', text: 'Waiting for a free agent', aside: '' };
  const run = asked || (t.now && t.now !== 'Waiting on you' && t.now !== 'Paused' ? t.now : 'its next run');
  const elapsed = Math.max(0, now - session.startedAt);
  return { state: 'working', text: session.activity?.at(-1)?.label?.trim() || run, aside: elapsed < 60_000 ? 'just started' : `${spanLabel(elapsed)} in` };
}

// A run's first line. Its teammate's queue letting it go is not an agent
// having it: until a session exists it is waiting, as the live line says.
export function startWord(r: Pick<TeamRunLine, 'teammate' | 'item'>, team: Pick<Teammate, 'id' | 'running'>[], sessions: ReadonlyMap<string, unknown>): string {
  const mate = team.find((x) => x.id === r.teammate);
  return mate?.running?.id === r.item && !sessions.has(r.item) ? 'Waiting to start' : 'Picked up';
}

// The same line in the team chat, said of the teammate by name: a step that
// starts with a verb in -ing follows "is", and anything else is what it is on.
export function teamWorkingLine(name: string, line: { state: 'working' | 'waiting'; text: string }): { lead: string; text: string } {
  if (line.state === 'waiting') return { lead: `${name} is waiting for a free agent`, text: '' };
  if (/^[A-Z][a-z]+ing\b/.test(line.text)) return { lead: `${name} is`, text: line.text[0].toLowerCase() + line.text.slice(1) };
  return { lead: `${name} is on`, text: line.text };
}

// The live line in a teammate's own chat, said of it by name: the step alone
// reads as an echo of the message above it, not as anyone working.
export function liveLine(
  t: Pick<Teammate, 'name' | 'running' | 'now'>,
  session: Pick<RunningSession, 'startedAt' | 'activity'> | null | undefined,
  now = Date.now(),
  asked: string | null = null,
): { state: 'working' | 'waiting'; lead: string; text: string; aside: string } | null {
  const line = workingLine(t, session, now, asked);
  return line && { state: line.state, ...teamWorkingLine(t.name, line), aside: line.aside };
}

// What you said to a teammate that it has not answered. A message sent while
// a run is open goes into that run, so this, not the thread's title, is what
// the run is on; unless it was queued behind a run you did not start. Reads
// every line about the teammate, since its chat hides queued and finished.
export function pendingAsk(entries: readonly ChatEntry[], id: string): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.kind === 'msg') {
      if (e.from === id && toList(e.to).every((x) => x === 'you')) return null;
      if (e.from === 'you' && toList(e.to).includes(id)) return firstSentence(e.text ?? '') || null;
    } else if (e.kind === 'run' && e.teammate === id) {
      if (e.verb === 'answered') return firstSentence(e.text ?? '') || null;
      if (e.verb === 'sent' || e.verb === 'finished' || e.verb === 'stopped' || e.verb === 'queued') return null;
    }
  }
  return null;
}

export function longMessage(text: string): boolean {
  return text.length > 900 || text.split('\n').length > 12;
}

// Not "Free", which reads as the plan you are on.
export function idleLine(t: Pick<Teammate, 'works'>, now = Date.now()): string {
  const at = t.works ? nextRunAt(t.works, now) : null;
  if (!at) return 'Idle';
  const when = new Date(at);
  const clock = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');
  const sameDay = new Date(now).toDateString() === when.toDateString();
  return `Idle until ${sameDay ? '' : `${when.toLocaleDateString('en-US', { weekday: 'short' })} `}${clock}`;
}

// Roles are written by the teammate itself, often all lower case.
export function roleLabel(role: string | null | undefined): string {
  const r = (role ?? '').trim();
  return r ? r[0].toUpperCase() + r.slice(1) : '';
}

/** Beside its name in the bar: About on its About page, then whether it is paused or setting up, then its role. */
export function titleAside(kind: string, role: string | null | undefined, t: { paused?: boolean; status?: string } = {}): string {
  if (kind === 'about') return 'About';
  if (t.paused) return 'Paused';
  if (t.status === 'draft') return 'Setting up';
  return roleLabel(role) || 'AI teammate';
}

/** Its name in the Chats list. A draft has none of its own yet, so it goes by what you asked of it. */
export function rowName(t: { name: string; status: string; job?: string | null }): string {
  const ask = (t.job ?? '').split('\n')[0].replace(/\s+/g, ' ').trim();
  if (t.status !== 'draft' || t.name !== 'New teammate' || !ask) return t.name;
  const cut = ask.length > 30 ? `${ask.slice(0, 30).replace(/\s+\S*$/, '')}…` : ask;
  return roleLabel(cut);
}

/** Its goal and how it is counted, as one sentence however each one ends. */
export function goalLine(goal: string, counted: string | null | undefined): string {
  const g = goal.trim();
  const c = (counted ?? '').trim().replace(/[.\s]+$/, '');
  return c ? `${g.replace(/[.,;:\s]+$/, '')}, counted as ${c.replace(/^./, (x) => x.toLowerCase())}.` : g;
}

export function firstSentence(text: string): string {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim();
  return one.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? one;
}

/** The inbox tab every one of these threads sits in, or null when they differ or one is in none. */
export function sentTab<T extends string>(tabs: (T | null)[]): T | null {
  const first = tabs[0] ?? null;
  return first !== null && tabs.every((x) => x === first) ? first : null;
}

// What it saved, shown in your chat with it as one quiet line.
export const SAVED_VERBS = new Set(['learned', 'updated', 'lesson']);

// A teammate's chat with you: your words to it, its words to you, what it sent
// you, what it saved, and work it holds for you. Everything else is its Log.
function betweenYou(e: ChatEntry, id: string): boolean {
  if (e.kind === 'run') return e.teammate === id && (e.verb === 'sent' || e.verb === 'answered' || e.verb === 'stopped');
  if (e.kind === 'msg') {
    if (e.from === 'you') return toList(e.to).includes(id);
    return e.from === id && toList(e.to).every((x) => x === 'you');
  }
  if (e.kind === 'act') return e.from === id && (SAVED_VERBS.has(e.verb ?? '') || e.verb === 'hops' || e.verb === 'limit');
  return false;
}

export function chatWith(view: TeammatesView | null | undefined, id: string): ChatEntry[] {
  return chatEntries(view, id).filter((e) => betweenYou(e, id));
}

export function logOf(view: TeammatesView | null | undefined, id: string): ChatEntry[] {
  return chatEntries(view, id).filter((e) => !betweenYou(e, id));
}

// Which sections of the Chats list you folded, kept as a JSON list.
export const FOLD_KEY = 'zero.chats.folded';
export function foldedSet(raw: string | null): Set<string> {
  try {
    const list = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
}
export function toggleFold(raw: string | null, key: string): string {
  const set = foldedSet(raw);
  if (set.has(key)) set.delete(key); else set.add(key);
  return JSON.stringify([...set]);
}
