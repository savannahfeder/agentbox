// Your AI teammates on the phone: the copy the computer sends with its settings
// (shared/phone-snapshot.mjs `phoneTeammatesOf`), read by the desktop's own
// rules (renderer/src/teammates/chat-lines.ts), with your messages shown the
// moment you send them.
import {
  answerOf, asksYou, chatWith, clockOf, dayOf, heldFor, heldTitle, idleLine, matesInOrder, nameOf, SAVED_VERBS, type ChatEntry,
} from '../../../renderer/src/teammates/chat-lines';
import { MAX_HOPS, teammateIdOf } from '../../../shared/teammates.mjs';
import { phoneSlug, type PhoneRows } from '../../../renderer/src/phone-rows';
import type { Teammate, TeamChatLine, TeamRunLine, TeammatesView } from '../../../renderer/src/types';

export { clockOf, matesInOrder };

export interface PhoneTeam {
  device: string;
  view: TeammatesView;
  /** When the computer sent this copy; a message it took after that is still drawn from the phone. */
  copyAt: number;
}

const blank = { role: null, job: null, goal: null, counted: null, asksFirst: null, works: null, worksLabel: null, engine: null, model: null, effort: null, limit: 0, paused: false, status: 'active', memory: [], createdAt: 0, waiting: [], now: null, running: null, queued: 0, done: [], runsThisWeek: 0 };

/** The computer with teammates on that was heard from last, and its teammates; null when none has them on. */
export function teamFrom(rows: readonly { device: string; updated_at?: string; settings?: any }[]): PhoneTeam | null {
  const at = (r: { updated_at?: string }) => Date.parse(r.updated_at ?? '') || 0;
  const on = rows
    .filter((r) => r.settings?.workspace?.alpha?.teammates && Array.isArray(r.settings?.teammates?.list))
    .sort((a, b) => at(b) - at(a))[0];
  if (!on) return null;
  const t = on.settings.teammates;
  return {
    device: on.device,
    copyAt: at(on),
    view: {
      list: t.list.map((m: any) => ({ ...blank, ...m, letter: m.letter || String(m.name ?? '?').slice(0, 1) })),
      chat: Array.isArray(t.chat) ? t.chat : [],
      runs: Array.isArray(t.runs) ? t.runs : [],
      ...(t.trouble ? { trouble: t.trouble } : {}),
    },
  };
}

/** The teammate a thread belongs to, by its `teammate:<id>` label. */
export function mateOf(item: { labels?: string[] } | null | undefined, team: PhoneTeam | null): Teammate | null {
  const id = item ? teammateIdOf(item) : null;
  return (id && team?.view.list.find((t) => t.id === id)) || null;
}

/** It has something for you: a thread, a question, or work held for your go-ahead. */
export function waitsOnYou(t: Teammate, view: TeammatesView): boolean {
  return t.waiting.length > 0 || asksYou(view, t.id) || !!heldFor(view, t.id);
}

/** The line under its name in Chats (TeammatesRail.tsx `nowLine`). */
export function nowLine(t: Teammate, view: TeammatesView, now = Date.now()): string {
  if (asksYou(view, t.id)) return 'Has a question for you';
  if (heldFor(view, t.id)) return 'Holding work for your go-ahead';
  if (t.status === 'draft' && !t.waiting.length) return 'Setting up';
  if (t.paused && !t.running) return t.waiting.length ? 'Paused, waiting on you' : 'Paused';
  return t.now ?? idleLine(t, now);
}

/** Beside its name at the top: paused, setting up, primary, or its role. */
export function asideOf(t: Teammate): string {
  if (t.paused) return 'Paused';
  if (t.status === 'draft') return 'Setting up';
  if (t.primary) return 'Primary';
  const r = roleOf(t);
  return r ? r[0].toUpperCase() + r.slice(1) : 'AI teammate';
}

/** Its role, unless the role is its name. */
export function roleOf(t: Pick<Teammate, 'name' | 'role'>): string | null {
  const r = (t.role ?? '').trim();
  return r && r.toLowerCase() !== t.name.trim().toLowerCase() ? r : null;
}

const REFUSAL_SHOWN_MS = 10 * 60_000;

/** A message you sent that the copy does not carry yet: still on its way, or turned down and why. */
export type Pending = Omit<TeamChatLine, 'to'> & { to: string[]; waiting: true; refused: string | null };

export function onTheirWay(commands: PhoneRows['commands'], team: PhoneTeam | null, now = Date.now()): Pending[] {
  if (!team) return [];
  const out: Pending[] = [];
  for (const c of commands) {
    const p = c.payload;
    if (c.kind !== 'setting' || c.device !== team.device || p?.scope !== 'teammate' || p.key !== 'post') continue;
    const takenAt = c.taken_at ? Date.parse(c.taken_at) || 0 : null;
    const refused = c.outcome?.startsWith('refused') ? c.outcome.replace(/^refused:\s*/, '') : null;
    if (refused && takenAt !== null && now - takenAt > REFUSAL_SHOWN_MS) continue;
    if (!refused && takenAt !== null && takenAt <= team.copyAt) continue;
    out.push({ id: c.id, kind: 'msg', from: 'you', to: p.value?.to ?? [], text: String(p.value?.text ?? ''), ts: Date.parse(c.created_at) || now, ...(p.value?.answers ? { answers: p.value.answers } : {}), waiting: true, refused });
  }
  return out;
}

/** Its questions still waiting on you, oldest first. */
export function openQuestions(view: TeammatesView, id: string, pending: readonly Pending[] = []): TeamChatLine[] {
  const answered = new Set(pending.filter((p) => !p.refused).flatMap((p) => Object.keys(p.answers ?? {})));
  const said = pending.some((p) => !p.refused && !p.answers && p.to.includes(id));
  return chatWith(view, id).filter((e): e is TeamChatLine => e.kind === 'msg' && e.from === id && !!e.options?.length && !answerOf(view, e) && !answered.has(e.id) && !said);
}

export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; m: TeamChatLine; lead: boolean; mine: boolean; waiting: boolean; refused: string | null; answered: string | null }
  | { kind: 'answered'; key: string; count: number; ts: number }
  | { kind: 'sent'; key: string; runs: TeamRunLine[] }
  | { kind: 'saved'; key: string; ts: number }
  | { kind: 'act'; key: string; e: ChatEntry };

/** One teammate's chat as the phone draws it (TeammatesPage.tsx `ChatColumn`). */
export function chatRows(view: TeammatesView, id: string, pending: readonly Pending[] = [], now = Date.now()): ChatRow[] {
  const mine = pending.filter((p) => p.to.includes(id));
  const entries: (ChatEntry | Pending)[] = [...chatWith(view, id), ...mine].sort((a, b) => a.ts - b.ts);
  const rows: ChatRow[] = [];
  let day = '';
  let prevFrom = '';
  let saved = false;
  let sent: TeamRunLine[] | null = null;
  for (const e of entries) {
    const d = dayOf(e.ts, now);
    if (d !== day) { rows.push({ kind: 'day', key: `day-${e.id}`, label: d }); day = d; prevFrom = ''; sent = null; }
    if (e.kind === 'run' && e.verb === 'sent' && sent) { sent.push(e as TeamRunLine); continue; }
    if (!(e.kind === 'run' && e.verb === 'sent')) sent = null;
    if (e.kind === 'act' && SAVED_VERBS.has(e.verb ?? '')) {
      if (!saved) rows.push({ kind: 'saved', key: e.id, ts: e.ts });
      saved = true;
      continue;
    }
    saved = false;
    const answers = e.kind === 'msg' && e.from === 'you' && !('waiting' in e) ? Object.keys(e.answers ?? {}).length : 0;
    if (answers) {
      rows.push({ kind: 'answered', key: e.id, count: answers, ts: e.ts });
      prevFrom = '';
    } else if (e.kind === 'msg') {
      const p = 'waiting' in e ? (e as Pending) : null;
      const answer = e.options?.length ? answerOf(view, e) : null;
      rows.push({ kind: 'msg', key: e.id, m: e, lead: e.from !== prevFrom, mine: e.from === 'you', waiting: !!p && !p.refused, refused: p?.refused ?? null, answered: answer?.text ?? null });
      prevFrom = e.from;
    } else if (e.kind === 'run' && e.verb === 'sent') {
      sent = [e as TeamRunLine];
      rows.push({ kind: 'sent', key: e.id, runs: sent });
      prevFrom = '';
    } else {
      rows.push({ kind: 'act', key: e.id, e });
      prevFrom = '';
    }
  }
  return rows;
}

export interface ActWords { verb: string; text: string; open: { product: string; id: string } | null; status: string | null; goAhead: { id: string; ref: string } | null; held: boolean }

const clipLine = (s: string, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** What an activity line in one teammate's chat says (TeammatesPage.tsx `Activity`). */
export function actWords(e: ChatEntry, team: PhoneTeam, only: Teammate): ActWords {
  const list = team.view.list;
  const none = { open: null, status: null, goAhead: null, held: false };
  if (e.kind === 'run') {
    const r = e as TeamRunLine;
    const open = { product: phoneSlug(team.device, r.product), id: r.item };
    if (r.verb === 'sent') return { ...none, verb: 'Sent you', text: r.title, open, status: r.waiting ? 'Waiting on you' : r.answered ? 'Answered' : null };
    if (r.verb === 'answered') return { ...none, verb: 'You answered', text: `“${clipLine(r.text ?? r.title, 90)}”`, open };
    if (r.verb === 'queued') return { ...none, verb: 'Next', text: r.title, open };
    if (r.verb === 'finished') return { ...none, verb: 'Finished', text: r.title, open };
    if (r.verb === 'stopped') return { ...none, verb: 'You stopped', text: r.title, open };
    return { ...none, verb: 'Picked up', text: r.title, open };
  }
  const c = e as TeamChatLine;
  if (c.kind === 'pass') {
    const to = typeof c.to === 'string' ? c.to : c.to?.[0];
    return { ...none, verb: only.id === c.from ? 'Passed' : `${nameOf(c.from, list)} passed`, text: `${c.title ?? ''} to ${nameOf(to, list)}` };
  }
  if (c.kind === 'msg') {
    const to = (Array.isArray(c.to) ? c.to : []).map((x) => nameOf(x, list));
    return { ...none, verb: c.from === only.id ? `To ${to.join(', ') || 'the team'}` : `From ${nameOf(c.from, list)}`, text: clipLine(c.text ?? '', 140) };
  }
  if (c.verb === 'hops') {
    const still = heldFor(team.view, c.from)?.id === c.id;
    return { ...none, verb: 'Holding', text: `${heldTitle(team.view, c)} until you say go, after ${MAX_HOPS} hand-offs without you`, held: true, goAhead: still && c.ref ? { id: c.from, ref: c.ref } : null, status: still ? null : 'Going ahead' };
  }
  if (c.verb === 'started') return { ...none, verb: 'Started', text: '' };
  if (c.verb === 'paused' || c.verb === 'resumed') return { ...none, verb: c.verb === 'paused' ? 'Paused' : 'Resumed', text: '' };
  return { ...none, verb: '', text: c.text ?? '' };
}

/** Where its run is working now, as the thread the phone opens. */
export function runningThread(t: Teammate, team: PhoneTeam): { product: string; id: string } | null {
  return t.running ? { product: phoneSlug(team.device, t.running.product), id: t.running.id } : null;
}
