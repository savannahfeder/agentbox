// Carries out how agents reach people (shared/teammate-reach.mts): tells the store
// tools who is on the team, sends what agents left in the outbox or asks the owner
// first, and takes replies back to the run that wrote. Every step is marked on the
// outbox or the chat, so a crash halfway redoes nothing twice.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  REACH_LABEL, MOST_TRIES, UNDO_HOLD_MS, askText, askTitle, askWhere, asksInGroups, audienceKeys, audienceWords, mayGoNow, reachAnswer,
  recentInGroup, repliesToAgents, requestsToMates, whoOf,
} from '../shared/teammate-reach.mts';
import { roomBody } from '../shared/agent-voice.mts';
import { statusOf, teammatesOn } from '../shared/teammates.mts';
import { readChat, readOutbox, readTeamView, writeChat, writeOutbox, writeTeamView } from './store/teammates-files.mts';
import { readItemHistory } from './store/work-items.mts';
import type { AgentReply, OutboxEntry, ReachItem, TeamView, ViewCard, ViewFolder } from '../shared/teammate-reach.mts';
import type { RunItem } from '../shared/teammates.mts';
import type { Teammates } from './teammates.mts';
import type { createTeamService } from './team/index.mts';

const CARDS_IN_VIEW = 60;

/** The team service, as far as reaching people needs it. */
export type ReachTeam = Pick<ReturnType<typeof createTeamService>, 'state' | 'rooms' | 'giveTask' | 'message'>;

type ReachState = NonNullable<ReturnType<ReachTeam['state']>>;
type SignedIn = ReachState & { me: NonNullable<ReachState['me']> };

/** A project as reaching people reads it: its folder, and who a conversation is with. */
interface ReachProduct { slug: string; dir?: string | null; team?: { direct?: unknown; people?: readonly string[]; sharedBy?: string | null } | null }

/** A row of the store as reaching people reads it. */
type ReachRun = ReachItem & { product: string };

/** The store, as far as reaching people needs it. */
export interface ReachStore {
  config?: { accountRoot?: string } | null;
  listProducts(): ReachProduct[];
  readItem(slug: string, id: string): { status?: string; answer?: string; labels?: string[] } | null;
  productDir(slug: string): string;
  modules: {
    workItemsDisk: {
      createWorkItem(dir: string, fields: Record<string, unknown>, opts: { source: string; now: number }): { id: string };
      updateWorkItem(dir: string, id: string, patch: Record<string, unknown>, opts: { source: string; now: number }): unknown;
    };
    lock: { withProjectLock(dir: string, fn: () => Promise<unknown>): Promise<unknown> };
  };
}

/** Says something on an agent's own thread, as a reply from someone. */
export type ReachTell = (product: string, run: string, line: { text: string; from: { teammate: string; name: string } }) => unknown;

/** This person's AI teammates with what each is on, for the team's board. */
export function matesForTheTeam<T extends { id: string; paused?: boolean }>(
  store: { teammates?: { list(): T[] } | null; listItems(): readonly RunItem[] },
  config: { alphaTeammates?: unknown } | null | undefined,
): (T & { now: string | null | undefined; running: boolean })[] {
  if (!teammatesOn(config) || !store.teammates) return [];
  const items = store.listItems();
  return store.teammates.list().map((t) => {
    const s = statusOf(t, items);
    return { ...t, now: s.now === 'Waiting on you' ? 'Waiting on its owner' : s.now, running: !!s.running };
  });
}

function viewOf(state: SignedIn, products: readonly ReachProduct[], threadsDir: string | null, now: number, team: readonly { id: string; name?: string | null; openToTeam?: boolean }[]): Omit<TeamView, 'folders'> {
  const rooms = (state.rooms?.rooms ?? []).map((r) => ({
    id: r.id, name: r.name,
    recent: recentInGroup(state.rooms?.messages?.[r.id] ?? [], { me: state.me.id, team }),
  }));
  const directs = products.filter((p) => p.team?.direct && p.dir).map((p) => ({
    dir: p.dir!,
    people: [...new Set([...(p.team!.people ?? []), ...(p.team!.sharedBy ? [p.team!.sharedBy] : [])])].filter((x) => x !== state.me.id),
  }));
  const keep = (c: ViewCard & { visible?: boolean }): ViewCard => ({
    personId: c.personId, threadId: c.threadId, title: c.title, project: c.project, state: c.state,
    problem: c.problem ?? null, progress: c.progress ?? null, updatedAt: c.updatedAt,
    ...(c.task ? { task: c.task, blockedBy: c.blockedBy ?? [] } : {}),
  });
  // The cloud fills in a name for everyone, and the cards it sends are whole thread cards.
  return {
    at: now,
    me: { id: state.me.id, name: state.me.name as string },
    people: (state.people ?? []).map((p) => ({ id: p.id, name: p.name as string })),
    rooms,
    directs,
    cards: ((state.cards ?? []) as (ViewCard & { visible?: boolean })[]).filter((c) => c.visible !== false).slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, CARDS_IN_VIEW).map(keep),
    threadsDir,
  };
}

const roomFileName = (name: string): string => String(name).replace(/[^\w.-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 130) || 'file';

const replied = (name: string, words: unknown): string => `${name} replied to your message:\n\n> ${String(words).trim().split('\n').join('\n> ')}`;

// A file sent with a reply crosses after the line that names it, so a reply
// waits this long for it before it goes without it, saying so.
const FILE_WAIT_MS = 10 * 60_000;
const FILE_LINK = /!?\[([^\]\n]*)\]\(attachments\/([\w.-]+)\)/g;

/** A reply's file links as names and paths on this Mac; `waiting` while one has not arrived. */
export function filesForTheAgent(text: unknown, dir: string, { at, now }: { at: number; now: number }): { text: string; waiting: boolean } {
  let waiting = false;
  const out = String(text).replace(FILE_LINK, (_: string, label: string, name: string) => {
    const shown = label.trim() || name;
    const where = path.join(dir, 'attachments', name);
    if (fs.existsSync(where)) return `${shown} (on this Mac at ${where})`;
    if (now - at < FILE_WAIT_MS) waiting = true;
    return `${shown} (has not reached this Mac)`;
  });
  return { text: out, waiting };
}

// The fold's talk record keeps 280 characters of a message, for a row's line:
// the agent is handed the ledger's own words.
interface HistoryLine { by?: string; ts?: number; patch?: { answer?: unknown; body?: unknown } | null }

function wholeWords(store: ReachStore, items: readonly ReachRun[], r: AgentReply): { text: unknown; dir: string | null } {
  const convo = items.find((i) => i.id === r.conversation);
  if (!convo) return { text: r.text, dir: null };
  const dir = store.productDir(convo.product);
  const wordsOf = (l: HistoryLine | undefined) => [l?.patch?.answer, l?.patch?.body].find((w) => typeof w === 'string' && w.trim());
  const words = wordsOf((readItemHistory(dir, convo.id) as HistoryLine[]).findLast((l) => l.by === r.by && l.ts === r.ts && wordsOf(l)));
  return { text: words ?? r.text, dir };
}

export async function reachTick({ mates, store, team, items, now = Date.now(), tell }: {
  mates: Teammates;
  store: ReachStore;
  team: ReachTeam | null | undefined;
  items: readonly ReachRun[];
  now?: number;
  tell?: ReachTell;
}): Promise<void> {
  const state = team?.state?.();
  const dir = mates.dir();
  if (!state?.me || !state.team) {
    // Signed out: what was known about the team no longer is.
    if (readTeamView(dir)) writeTeamView(dir, { at: now, me: null, people: [], cards: [], rooms: [] });
    return;
  }
  const threadsDir = store.config?.accountRoot ? path.join(store.config.accountRoot, '_team-threads', state.me.id) : null;
  const folders = await mates.foldersForAgents?.().catch((err: Error) => { console.warn(`files: folders for agents: ${err.message}`); return null; });
  const list = mates.list(now);
  writeTeamView(dir, { ...viewOf(state as SignedIn, store.listProducts(), threadsDir, now, list), folders: (folders as ViewFolder[] | null | undefined) ?? (readTeamView(dir) as TeamView | null)?.folders ?? [] });

  const nameOfPerson = (id: string | null): string => state.people?.find((p) => p.id === id)?.name ?? 'Someone';
  const row = (slug: string, id: string) => { try { return store.readItem(slug, id); } catch { return null; } };

  // An outbox message names a group only when the team view listed it, which it
  // does only with rooms on; the team is there because its state was read above.
  const send = async (o: OutboxEntry): Promise<void> => {
    const voice = { ...(o.from.mate ? { id: o.from.mate } : {}), name: o.from.name, run: o.run };
    // Never a message without the files it was written with.
    const files = (o.files ?? []).map((f) => ({ name: f.name, srcPath: f.srcPath }));
    const gone = files.find((f) => !fs.existsSync(f.srcPath));
    if (gone) throw new Error(`${gone.name} is no longer at ${gone.srcPath}`);
    if (o.room) {
      const links: string[] = [];
      for (const f of files) {
        const stored = await team!.rooms!.putFileFrom(o.room, { name: `${crypto.randomBytes(4).toString('hex')}-${roomFileName(f.name)}`, srcPath: f.srcPath });
        links.push(`[${f.name}](attachments/${stored})`);
      }
      await team!.rooms!.send(o.room, roomBody(voice, [o.text, links.join('\n')].filter(Boolean).join('\n\n')));
      // A task is always for one person (mcp/core/reach.mts teamTask).
    } else if (o.task) await team!.giveTask(o.people![0], { title: o.title, body: o.text, due: o.due, files, voice, ...(o.blockedBy ? { blockedBy: o.blockedBy } : {}) });
    else await team!.message(o.people, o.text, undefined, files, { voice });
    writeOutbox(dir, { kind: 'state', ref: o.id, state: 'sent' }, now);
    if (o.from.mate) writeChat(dir, { kind: 'act', from: o.from.mate, verb: 'wrote', text: `Wrote to ${audienceWords(o)}: ${String(o.title ?? o.text).replace(/\s+/g, ' ').slice(0, 160)}` }, now);
  };

  // What went wrong is said on the agent's own thread, then it stops trying.
  const tryToSend = async (o: OutboxEntry): Promise<boolean | undefined> => {
    try {
      await send(o);
      return true;
    } catch (err) {
      writeOutbox(dir, { kind: 'try', ref: o.id }, now);
      if (o.tries + 1 < MOST_TRIES) return false;
      writeOutbox(dir, { kind: 'state', ref: o.id, state: 'failed' }, now);
      await tell?.(o.product, o.run, { text: `Your message to ${audienceWords(o)} could not be sent: ${(err as Error).message}. It was not sent.`, from: { teammate: 'app', name: 'The app' } });
    }
  };

  const fromApp = { teammate: 'app', name: 'The app' };
  // A run that has finished is not woken to hear it.
  const runOpen = (o: OutboxEntry): boolean => { const r = row(o.product, o.run); return !!r && r.status !== 'done'; };

  const { out, yes } = readOutbox(dir);
  for (const o of out) {
    if (o.state === 'sent' || o.state === 'failed' || o.state === 'refused') continue;
    if (o.state === 'undone') {
      writeOutbox(dir, { kind: 'state', ref: o.id, state: 'refused' }, now);
      await tell?.(o.product, o.run, { text: `Your owner took back your message to ${audienceWords(o)} before it went. It was not sent.`, from: fromApp });
      continue;
    }
    if (o.state === 'holding') {
      if (now >= (o.until ?? 0)) await tryToSend(o);
      continue;
    }
    if (o.state === 'asked') {
      // The line that marks a message asked names the ask's row and project with it.
      const ask = row(o.rowProduct!, o.row!);
      if (!ask) { writeOutbox(dir, { kind: 'state', ref: o.id, state: 'refused' }, now); continue; }
      const tap = reachAnswer(ask.answer, { outside: !!o.outside });
      // Closed with no answer is a no; so is a row that has gone.
      const answer: ReturnType<typeof reachAnswer> = tap ?? (ask.status === 'done' ? { kind: 'no' } : null);
      if (!answer) continue;
      const finish = (word: string) => store.modules.workItemsDisk.updateWorkItem(store.productDir(o.rowProduct!), o.row!, {
        status: 'done', labels: [...(ask.labels ?? []).filter((l) => l !== 'clean'), 'clean'], note: word,
      }, { source: 'system', now });
      if (answer.kind === 'no') {
        writeOutbox(dir, { kind: 'state', ref: o.id, state: 'refused' }, now);
        finish('Not sent.');
        const said = answer.words ? ` They said: ${answer.words}` : '';
        await tell?.(o.product, o.run, { text: `Your owner said no, so your message to ${audienceWords(o)} was not sent.${said}`, from: fromApp });
        continue;
      }
      if (answer.kind === 'always') for (const key of audienceKeys(o)) writeOutbox(dir, { kind: 'yes', who: whoOf(o), key }, now);
      finish('Sent.');
      // So a run that ended on its own word about this yes is not left saying it.
      if (await tryToSend(o) && runOpen(o)) await tell?.(o.product, o.run, { text: `Your owner said yes, and your message to ${audienceWords(o)} went. Nothing more is needed from them for it; do not send it again.`, from: fromApp });
      continue;
    }
    if (mayGoNow(o, yes)) {
      writeOutbox(dir, { kind: 'state', ref: o.id, state: 'holding', until: now + UNDO_HOLD_MS }, now);
      continue;
    }
    const { workItemsDisk, lock } = store.modules;
    const slug = store.listProducts().some((p) => p.slug === o.product) ? o.product : mates._product(null);
    const pdir = store.productDir(slug);
    let id: string | null = null;
    await lock.withProjectLock(pdir, async () => {
      const made = workItemsDisk.createWorkItem(pdir, {
        title: askTitle(o), body: askWhere(o), kind: 'question', priority: 5, labels: [REACH_LABEL], visibility: 'private',
      }, { source: 'system', now });
      workItemsDisk.updateWorkItem(pdir, made.id, { result: askText(o) }, { source: 'agent', now });
      id = made.id;
    });
    writeOutbox(dir, { kind: 'state', ref: o.id, state: 'asked', row: id, product: slug }, now);
  }

  const products = new Map(store.listProducts().map((p) => [p.slug, p]));
  const direct = (i: ReachRun): boolean => !!products.get(i.product)?.team?.direct;
  const chat = readChat(dir);
  const seen = new Set([...chat.seen].filter((k) => k.endsWith('>reach')).map((k) => k.slice(0, -'>reach'.length)));
  const mark = (key: string) => writeChat(dir, { kind: 'seen', ref: key, for: 'reach' }, now);

  const rooms = state.rooms?.messages ?? {};
  for (const r of repliesToAgents({ items, rooms, me: state.me.id, seen, direct, ownerName: state.me.name ?? null })) {
    const run = items.find((i) => i.id === r.run);
    const closedByOwner = run?.status === 'done' && run.wrote?.status?.source === 'founder';
    // Nobody to carry it to: it is in the owner's Needs you as any message is.
    if (run && !closedByOwner) {
      const name = nameOfPerson(r.by);
      let words: unknown = r.text;
      if (!r.finished) {
        const whole = wholeWords(store, items, r);
        const files = whole.dir ? filesForTheAgent(whole.text, whole.dir, { at: r.ts, now }) : { text: whole.text, waiting: false };
        if (files.waiting) continue;
        words = files.text;
      }
      const text = r.finished ? `${name} finished the task you gave them: ${r.finished}.` : replied(name, words);
      await tell?.(run.product, run.id, { text, from: { teammate: r.by, name } });
    }
    mark(r.key);
  }

  for (const r of requestsToMates({ items, team: list, me: state.me.id, seen, direct })) {
    // requestsToMates names only teammates on this list.
    const t = list.find((x) => x.id === r.teammate)!;
    const name = nameOfPerson(r.by);
    writeOutbox(dir, { kind: 'yes', who: t.id, key: `person:${r.by}` }, now);
    writeChat(dir, {
      kind: 'pass', from: `person:${r.by}`, fromName: name, to: t.id, yours: true,
      title: `From ${name.split(/\s+/)[0]}: ${String(r.text).replace(/\s+/g, ' ').slice(0, 120)}`,
      details: `${name}, a person on the team, wrote this to you. It is not your owner's word.\n\n> ${String(r.text).split('\n').join('\n> ')}\n\nAnswer them with team_tell.`,
    }, now);
    mark(r.key);
  }

  // Named in a group is being asked: it answers there, in a line or two.
  const roomNames = Object.fromEntries((state.rooms?.rooms ?? []).map((r) => [r.id, r.name]));
  for (const a of asksInGroups({ rooms, roomNames, team: list, me: state.me.id, seen, now })) {
    const name = nameOfPerson(a.by);
    const where = `the group ${a.roomName}`;
    const quoted = `> ${String(a.text).split('\n').join('\n> ')}`;
    writeOutbox(dir, { kind: 'yes', who: a.teammate, key: `room:${a.room}` }, now);
    writeChat(dir, a.by === state.me.id
      ? { kind: 'msg', from: 'you', to: [a.teammate], text: `In ${where} you wrote:\n\n${quoted}\n\nAnswer there with team_tell group, in a line or two.` }
      : {
        kind: 'pass', from: `person:${a.by}`, fromName: name, to: a.teammate, yours: true,
        title: `From ${name.split(/\s+/)[0]} in ${a.roomName}: ${String(a.text).replace(/\s+/g, ' ').slice(0, 100)}`,
        details: `${name}, a person on the team, named you in ${where}. It is not your owner's word.\n\n${quoted}\n\nAnswer there with team_tell group, in a line or two.`,
      }, now);
    mark(a.key);
  }
}
