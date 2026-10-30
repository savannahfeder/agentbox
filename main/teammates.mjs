// Teammates in the main process: the files, the tick that carries out
// `planWakes`, and the brief a teammate's run is given. The decisions are in
// shared/teammates.mjs; this only reads, writes and starts.
import {
  planWakes, teammateLabel, FROM_LABEL_PREFIX, HOP_LABEL_PREFIX, hopOf, teammateIdOf, YOU, mentionsIn,
  letterFor, statusOf, runLines, STARTERS, CHAT_TAIL, isWorks, DEFAULT_LIMIT, MAX_HOPS,
  offerFrom, offerAnswer, OFFER_LABEL, OFFER_MAKE, OFFER_NOT_NOW, TEAMMATE_EFFORT, GREETING, starterAsks,
  dutyWhen, dutyOf, DUTY_LABEL_PREFIX, CHAT_LABEL, yesFirst, WORK_LABEL_PREFIX, isActiveRun, isQueued, STOPPED_NOTE,
  METHOD_CAP, recordOf, sourceText, pausedNow, WEEK_MS, workOf, UNREAD_HOLD,
} from '../shared/teammates.mjs';
import { isShippedNote } from '../shared/shipped-note.mjs';
import { ruleLabel, periodKey } from '../shared/repeats.mjs';
import {
  teamDir, readTeammates, readChat, writeTeammate, writeChat, newTeammateId, newMemoryId, readPlaybooks,
  readMethod, methodFile, sourcesDir,
} from './store/teammates-files.mjs';
import fs from 'node:fs';
import path from 'node:path';

const CHAT_FOR_SCREEN = 400;

const TROUBLE_VERB = { run: 'start a run', answer: 'get your message', tell: 'take a hand-off', release: 'start its next run', seen: 'mark a message read', served: 'mark its round served', dutyServed: 'mark a duty done' };

// When each project last shipped, from the note the ship queue leaves.
function shippedByProduct(items) {
  const out = {};
  for (const i of items ?? []) {
    if (!isShippedNote(i.note)) continue;
    const at = i.wrote?.note?.ts ?? i.updatedAt ?? 0;
    if (at > (out[i.product] ?? 0)) out[i.product] = at;
  }
  return out;
}

const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function lastRanOf(teammateId, dutyId, items) {
  let at = null;
  for (const i of items) if (teammateIdOf(i) === teammateId && dutyOf(i) === dutyId && (i.createdAt ?? 0) > (at ?? 0)) at = i.createdAt;
  return at;
}
const TROUBLE_SHOWN_MS = 30 * 60_000;

export class Teammates {
  constructor(store) {
    this.store = store;
  }

  dir() {
    return teamDir(this.store.config.storeRoot, this.store.config.accountId);
  }

  list(now = Date.now()) {
    return readTeammates(this.dir(), now);
  }

  get(id, now = Date.now()) {
    return this.list(now).find((t) => t.id === id) ?? null;
  }

  chat() {
    return readChat(this.dir());
  }

  // A project a teammate can work in: the one asked for when it exists, else
  // the first with code in it, since most of what a teammate does is code.
  _product(slug) {
    const products = this.store.listProducts().filter((p) => !p.practice && !p.personal);
    return products.find((p) => p.slug === slug)?.slug ?? products.find((p) => p.repoPath)?.slug ?? products[0]?.slug ?? null;
  }

  // A project named on a pass, if it is one a teammate can work in.
  _productIf(slug) {
    if (!slug) return null;
    return this.store.listProducts().some((p) => p.slug === slug && !p.practice && !p.personal) ? slug : null;
  }

  create(fields = {}, now = Date.now()) {
    const starter = fields.starter ? STARTERS.find((s) => s.starter === fields.starter) : null;
    const base = { ...(starter ?? {}), ...fields };
    const product = this._product(base.product);
    if (!product) throw new Error('Make a project first. A teammate works in one of your projects.');
    const team = this.list(now);
    const name = String(base.name ?? '').trim() || 'New teammate';
    const id = newTeammateId();
    const patch = {
      name,
      letter: base.letter || letterFor(name, team),
      role: base.role ?? null,
      job: base.job ?? null,
      goal: base.goal ?? null,
      counted: base.counted ?? null,
      asksFirst: base.asksFirst ?? null,
      works: isWorks(base.works) ? base.works : null,
      product,
      engine: base.engine ?? null,
      model: base.model ?? null,
      effort: base.effort ?? null,
      limit: Number.isInteger(base.limit) ? base.limit : DEFAULT_LIMIT,
      status: base.status === 'draft' ? 'draft' : 'active',
      starter: starter?.starter ?? null,
      createdAt: now,
      paused: false,
    };
    // Its first round is the next one, not one already past today.
    if (patch.works) patch.served = periodKey(patch.works, now) ?? '';
    writeTeammate(this.dir(), id, patch, now);
    return this.get(id, now);
  }

  // Someone new, from words: a draft that sets itself up by asking you in the
  // team chat. Its first run is the setup.
  // `greeted` is the New teammate page: the greeting it drew goes in the chat
  // first, from the teammate, so your answer reads as one.
  describe({ text, starter, product, engine, threads, greeted = false } = {}, now = Date.now()) {
    const s = starter ? STARTERS.find((x) => x.starter === starter) : null;
    if (starter && !s) throw new Error('No such starter.');
    const words = String(s?.ask ?? text ?? '').trim();
    if (!words) throw new Error('Say what you need them to do.');
    const team = this.list(now);
    const offered = starterAsks(team).map((a) => a.ask);
    const t = s
      ? this.create({ starter: s.starter, status: 'draft', product, engine, ...(team.some((x) => x.name === s.name) ? { name: 'New teammate' } : {}) }, now)
      : this.create({ name: 'New teammate', status: 'draft', job: words, product, engine }, now);
    if (greeted) writeChat(this.dir(), { kind: 'msg', from: t.id, to: [], text: GREETING, options: offered, ts: now - 1 }, now);
    const m = writeChat(this.dir(), { kind: 'msg', from: YOU, to: [t.id], text: words, setup: true, ...(threads?.length ? { threads } : {}) }, now);
    return { teammate: this.get(t.id, now), message: m.id };
  }

  start(id, now = Date.now()) {
    const t = this.get(id, now);
    if (!t) throw new Error('No such teammate.');
    if (t.status !== 'active') writeTeammate(this.dir(), id, { status: 'active' }, now);
    writeChat(this.dir(), { kind: 'act', from: id, verb: 'started' }, now);
    writeChat(this.dir(), { kind: 'msg', from: YOU, to: [id], text: 'You have just been started. Introduce yourself in one or two sentences, say what you will do first, then begin.', start: true }, now);
    return this.get(id, now);
  }

  update(id, patch = {}, now = Date.now()) {
    const t = this.get(id, now);
    if (!t) throw new Error('No such teammate.');
    const allowed = ['name', 'role', 'job', 'goal', 'counted', 'asksFirst', 'works', 'product', 'engine', 'model', 'effort', 'limit', 'paused', 'letter', 'handoffsNeedYes'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    if ('product' in clean) clean.product = this._product(clean.product);
    if (clean.works && isWorks(clean.works)) clean.served = periodKey(clean.works, now) ?? '';
    if ('paused' in clean && !!clean.paused !== !!t.paused) {
      writeChat(this.dir(), { kind: 'act', from: id, verb: clean.paused ? 'paused' : 'resumed' }, now);
    }
    writeTeammate(this.dir(), id, clean, now);
    // Its open runs follow it from their next turn. A model is one engine's
    // name, so a move to another engine clears it.
    const effort = ('effort' in clean ? clean.effort : t.effort) || TEAMMATE_EFFORT;
    if ('engine' in clean && (clean.engine ?? null) !== (t.engine ?? null)) this._moveOpenRuns(id, { engine: clean.engine ?? '', model: '', effort }, now);
    else if (('model' in clean && (clean.model ?? null) !== (t.model ?? null)) || ('effort' in clean && (clean.effort ?? null) !== (t.effort ?? null))) {
      this._moveOpenRuns(id, { model: ('model' in clean ? clean.model : t.model) ?? '', effort }, now);
    }
    return this.get(id, now);
  }

  _moveOpenRuns(id, patch, now) {
    const { workItemsDisk } = this.store.modules;
    let items = [];
    try { items = this.store.listItems(now); } catch { return; }
    for (const run of items.filter((i) => teammateIdOf(i) === id && i.status !== 'done')) {
      const dir = this.store.productDir?.(run.product);
      if (!dir) continue;
      try {
        workItemsDisk.updateWorkItem(dir, run.id, patch, { source: 'system', now });
      } catch (err) {
        this.noteTrouble(`A run of this teammate stayed on its old agent: ${err.message}`, now);
      }
    }
  }

  // Stop: the run it is on and anything queued behind it end now, and it waits
  // for your next word. `kill` stops a run's agent (the supervisor's stopSession).
  stop(id, { kill } = {}, now = Date.now()) {
    if (!this.get(id, now)) throw new Error('No such teammate.');
    return { stopped: this._endRuns(id, (i) => isActiveRun(i) || isQueued(i), { kill, note: STOPPED_NOTE }, now) };
  }

  // Delete ends every run it has open, its questions to you too, so nothing
  // it started is left running or waiting for a teammate that is gone.
  remove(id, { kill } = {}, now = Date.now()) {
    if (!this.get(id, now)) throw new Error('No such teammate.');
    this._endRuns(id, () => true, { kill, note: 'Its teammate was deleted.' }, now);
    writeTeammate(this.dir(), id, { endedAt: now }, now);
    return { ok: true };
  }

  // Closed as you, not as the app: an app's close of a thread you wrote is
  // news in Needs you, and yours is filed.
  _endRuns(id, which, { kill, note }, now) {
    const { workItemsDisk } = this.store.modules;
    const runs = this.store.listItems(now).filter((i) => teammateIdOf(i) === id && i.status !== 'done' && which(i));
    for (const run of runs) {
      kill?.(run.id);
      const dir = this.store.productDir?.(run.product);
      if (!dir) continue;
      workItemsDisk.updateWorkItem(dir, run.id, { note }, { source: 'system', now });
      workItemsDisk.updateWorkItem(dir, run.id, { status: 'done' }, { source: 'founder', now });
    }
    return runs.length;
  }

  remember(id, text, { from = null, by = null } = {}, now = Date.now()) {
    const words = String(text ?? '').trim();
    if (!words) throw new Error('Nothing to remember.');
    const mem = { id: newMemoryId(), text: words.slice(0, 300), from, at: now, by };
    writeTeammate(this.dir(), id, { remember: mem }, now);
    writeChat(this.dir(), { kind: 'act', from: id, verb: 'learned', text: mem.text, ref: mem.id }, now);
    return mem;
  }

  // Its method, for the About page: the text and when it last changed.
  method(id) {
    if (!this.get(id)) throw new Error('No such teammate.');
    const m = readMethod(this.dir(), id);
    return m ? { text: m.text, changedAt: m.changedAt } : null;
  }

  forget(id, memoryId, now = Date.now()) {
    writeTeammate(this.dir(), id, { forget: memoryId }, now);
    return { ok: true };
  }

  // Your words in the team chat. On a teammate's page they go to that
  // teammate; in the team chat to whoever they name with @.
  post({ text, to = [], options, fresh = false, answers } = {}, now = Date.now()) {
    const words = String(text ?? '').trim();
    if (!words) throw new Error('Nothing to send.');
    const team = this.list(now);
    const ids = new Set([...(Array.isArray(to) ? to : [to]).filter(Boolean), ...mentionsIn(words, team)]);
    const known = [...ids].filter((x) => team.some((t) => t.id === x));
    // Which of its questions each answer is for, so the chat can show them one by one.
    const said = answers && typeof answers === 'object' && !Array.isArray(answers)
      ? Object.fromEntries(Object.entries(answers).filter(([, a]) => typeof a === 'string' && a.trim()).map(([q, a]) => [q, a.trim().slice(0, 2000)]))
      : {};
    return writeChat(this.dir(), { kind: 'msg', from: YOU, to: known, text: words.slice(0, 8000), ...(options ? { options } : {}), ...(fresh ? { fresh: true } : {}), ...(Object.keys(said).length ? { answers: said } : {}) }, now);
  }

  // Your go-ahead for work held after too many hand-offs: the same work again,
  // from you, so it wakes the teammate with everything it carried.
  goAhead(id, ref, now = Date.now()) {
    const held = this.chat().messages.find((m) => m.id === ref);
    if (!held) throw new Error('That work is no longer in the chat.');
    if (held.kind === 'pass') {
      return writeChat(this.dir(), { kind: 'pass', from: YOU, to: id, title: held.title, details: held.details ?? '', ...(held.product ? { product: held.product } : {}) }, now);
    }
    const from = this.nameOf(held.from, this.list(now));
    return writeChat(this.dir(), { kind: 'msg', from: YOU, to: [id], text: `Go ahead with what ${from} wrote:\n\n> ${String(held.text ?? '').split('\n').join('\n> ')}` }, now);
  }

  // What the screen draws: every teammate with what it is doing, and the chat
  // with the lines its runs leave, newest last.
  view(items, now = Date.now()) {
    let team = [];
    let chat = { messages: [] };
    try {
      team = this.list(now);
      chat = this.chat();
    } catch (err) {
      return { list: [], chat: [], runs: [], error: err.message };
    }
    const mine = (items ?? []).filter((i) => teammateIdOf(i));
    let books = [];
    try { books = readPlaybooks(this.dir()); } catch { /* the playbooks file is read again next time */ }
    return {
      ...(this.trouble && now - this.trouble.at < TROUBLE_SHOWN_MS ? { trouble: this.trouble.text } : {}),
      list: team.map((t) => ({
        ...t, ...statusOf(t, mine, now),
        // A name that already is the role is not followed by it again.
        role: t.role && t.role.toLowerCase() === String(t.name).toLowerCase() ? null : t.role,
        worksLabel: isWorks(t.works) ? ruleLabel(t.works) : null,
        duties: (t.duties ?? []).map((d) => ({ id: d.id, what: d.what, when: dutyWhen(d), lastRan: lastRanOf(t.id, d.id, mine) })),
        playbooks: books.filter((b) => b.readers.includes(t.id)).map((b) => b.id),
      })),
      chat: chat.messages.slice(-CHAT_FOR_SCREEN),
      runs: runLines(mine, team).slice(-CHAT_FOR_SCREEN),
      playbooks: books,
    };
  }

  /* ----------------------------------------------------------------- tick */
  // Carries out what `planWakes` decided. Each action is written so a crash
  // between two of them redoes nothing twice: runs are created if absent under
  // the project lock, and the seen marker comes after the run it records.
  async tick({ items, now = Date.now(), deliver, tell } = {}) {
    let team;
    let chat;
    try {
      team = this.list(now);
      chat = this.chat();
    } catch (err) {
      this.noteTrouble(`Teammates could not be read: ${err.message}`, now);
      return [];
    }
    try {
      await this.offer({ items, chat, now });
    } catch (err) {
      this.noteTrouble(`The offer of a teammate failed: ${err.message}`, now);
    }
    if (!team.length) return [];
    team = this._namedByRole(team, now);
    const mine = (items ?? []).filter((i) => teammateIdOf(i));
    const actions = planWakes({ teammates: team, chat, items: mine, now, shipped: shippedByProduct(items) });
    const byId = new Map(team.map((t) => [t.id, t]));
    const done = [];
    const { workItemsDisk, lock } = this.store.modules;
    // What did not go through is not marked seen or served, so the next tick
    // tries it again.
    const failed = new Set();
    for (const a of actions) {
      const t = byId.get(a.teammate);
      if (a.type === 'seen' && failed.has(a.msg)) continue;
      if (a.type === 'served' && failed.has(`${a.teammate}@${a.key}`)) continue;
      if (a.type === 'dutyServed' && failed.has(`${a.teammate}#${a.duty}@${a.key}`)) continue;
      try {
        if (a.type === 'run') {
          const product = this._productIf(a.trigger.product) ?? this._product(t.product);
          if (!product) continue;
          const dir = this.store.productDir(product);
          const hop = a.trigger.hop ?? 0;
          const labels = ['founder', teammateLabel(t.id), `${HOP_LABEL_PREFIX}${hop}`, `${WORK_LABEL_PREFIX}${a.trigger.work ?? a.id}`];
          if (a.trigger.kind === 'pass' && a.trigger.from && a.trigger.from !== YOU) labels.push(`${FROM_LABEL_PREFIX}${a.trigger.from}`);
          if (a.trigger.kind === 'duty') labels.push(`${DUTY_LABEL_PREFIX}${a.trigger.duty}`);
          if (a.trigger.kind === 'message' && a.trigger.from === YOU && !a.trigger.via) labels.push(CHAT_LABEL);
          await lock.withProjectLock(dir, async () => {
            const opening = this.openingFor(t, a.trigger, team);
            const made = workItemsDisk.createWorkItemIfAbsent(dir, a.id, {
              title: a.title,
              ...(opening.yours ? {} : { body: opening.body }),
              kind: 'directive',
              priority: 5,
              labels,
              ...(a.start === 'later' ? { start: 'later' } : {}),
              // Held for your yes: blocked until you reply on it.
              ...(a.trigger.hold ? { status: 'blocked' } : {}),
              ...(t.engine ? { engine: t.engine } : {}),
              ...(t.model ? { model: t.model } : {}),
              effort: t.effort || TEAMMATE_EFFORT,
            }, { source: 'system', now });
            // Your words go in as yours, the way a task you type does, so the
            // thread opens on them under your name.
            if (made?.created !== false && opening.yours) workItemsDisk.updateWorkItem(dir, a.id, { title: a.title, body: opening.body }, { source: 'founder', now });
          });
        } else if (a.type === 'seen') {
          writeChat(this.dir(), { kind: 'seen', ref: a.msg, for: a.teammate, ...(a.run ? { run: a.run } : {}) }, now);
        } else if (a.type === 'served') {
          writeTeammate(this.dir(), a.teammate, { served: a.key }, now);
        } else if (a.type === 'dutyServed') {
          writeTeammate(this.dir(), a.teammate, { dutyServed: { [a.duty]: a.key } }, now);
        } else if (a.type === 'answer') {
          await deliver?.(a.product, a.item, a.text);
        } else if (a.type === 'tell') {
          if (!tell) throw new Error('nothing here can hand work to a thread');
          await tell(a.product, a.item, { text: a.text, from: a.from, hold: a.hold, hop: a.hop });
        } else if (a.type === 'release') {
          const dir = this.store.productDir(a.product);
          workItemsDisk.updateWorkItem(dir, a.item, { start: 'now' }, { source: 'system', now });
        } else if (a.type === 'limit') {
          this._sayOnce(a.teammate, 'limit', `${t.name} has used ${t.limit ?? DEFAULT_LIMIT} runs this week and waits until runs free up. Your own messages still reach it.`, now);
        } else if (a.type === 'unread') {
          this._sayOnce(a.teammate, 'unread', `${t.name} stopped "${a.what}": its last ${UNREAD_HOLD} are still unanswered in your inbox. Answer or close one and it starts again.`, now);
        } else if (a.type === 'hops') {
          writeChat(this.dir(), { kind: 'act', from: a.teammate, verb: 'hops', ref: a.msg, text: `${t.name} is holding this until you say go. Teammates had passed it back and forth ${MAX_HOPS} times without you.` }, now);
        }
        done.push(a);
      } catch (err) {
        if (a.msg) failed.add(a.msg);
        if (a.trigger?.msg) failed.add(a.trigger.msg);
        if (a.trigger?.key) failed.add(a.trigger.kind === 'duty' ? `${a.teammate}#${a.trigger.duty}@${a.trigger.key}` : `${a.teammate}@${a.trigger.key}`);
        this.noteTrouble(`${t?.name ?? 'A teammate'} could not ${TROUBLE_VERB[a.type] ?? 'carry on'}: ${err.message}`, now);
      }
    }
    if (done.length && done.length === actions.length) this.trouble = null;
    return done;
  }

  // The offer of a teammate for asks you keep making: acts on a tap on an
  // open one, then makes a new one if your threads call for it.
  async offer({ items = [], chat = this.chat(), now = Date.now() } = {}) {
    const { workItemsDisk, lock } = this.store.modules;
    for (const row of items.filter((i) => (i.labels ?? []).includes(OFFER_LABEL) && i.status !== 'done')) {
      const tap = offerAnswer(row.answer);
      if (!tap) continue;
      const dir = this.store.productDir(row.product);
      if (tap.kind === 'make') {
        const listed = String(row.result ?? '').split('\n').filter((l) => l.startsWith('- '));
        const threads = this._threadsBehind(row, listed, items, chat);
        const asks = listed.join('\n');
        const read = threads.length ? `\n\nRead all ${threads.length} threads behind them first, with everything I said in them.` : '';
        const text = tap.words
          ? `${tap.words}\n\nLike these asks of mine:\n${asks}${read}`
          : `Someone to take on asks like these, which I keep making:\n${asks}${read}`;
        this.describe({ text, product: row.product, threads }, now);
      }
      // Clean, so the answered offer leaves Needs you rather than waiting to be
      // read, and titled for what happened, so it no longer reads as an offer.
      const like = String(row.title ?? '').match(/“(.+)”/)?.[1];
      workItemsDisk.updateWorkItem(dir, row.id, {
        ...(like ? { title: tap.kind === 'make' ? `Made a teammate for things like “${like}”` : `No teammate for things like “${like}”` } : {}),
        status: 'done',
        labels: [...(row.labels ?? []), 'clean'],
        note: tap.kind === 'make' ? 'A new teammate is setting itself up in the team chat.' : 'Not now. This one will not be offered again.',
      }, { source: 'system', now });
    }
    const offered = new Set(chat.messages.filter((m) => m.kind === 'act' && m.verb === 'offered').map((m) => m.ref));
    const offer = offerFrom({ items, offered, now });
    if (!offer) return null;
    const dir = this.store.productDir(offer.product);
    if (!dir) return null;
    const body = offer.said;
    const result = [
      '**Make a teammate for these?**', '', `${offer.said} Like these:`, '', ...offer.asked.map(({ title, n }) => `- ${title}${n > 1 ? ` (${n} times)` : ''}`), '',
      'A teammate would take this kind of work on. It does it on its own, on a schedule if you like, and comes to you only when it needs you. It reads these threads first, with everything you said in them, then asks you only what they leave open.',
      '', '## Options', `1. ${OFFER_MAKE} (recommended)`, `2. ${OFFER_NOT_NOW}`,
    ].join('\n');
    // Recorded first, so a crash after it can never offer the same job twice.
    writeChat(this.dir(), { kind: 'act', from: YOU, verb: 'offered', ref: offer.key, text: offer.title, threads: offer.threads }, now);
    await lock.withProjectLock(dir, async () => {
      const made = workItemsDisk.createWorkItem(dir, {
        title: offer.title, body, kind: 'question', priority: 5, labels: [OFFER_LABEL],
        problem: 'A teammate could do this kind of work on its own.', progress: `Found ${offer.count} asks like these this month`,
      }, { source: 'system', now });
      workItemsDisk.updateWorkItem(dir, made.id, { result }, { source: 'agent', now });
    });
    return offer;
  }

  // The threads an answered offer came from. An offer made before it kept
  // them is matched back to your asks by the titles it listed.
  _threadsBehind(row, listed, items, chat) {
    const kept = chat.messages.find((m) => m.kind === 'act' && m.verb === 'offered' && m.text === row.title && m.threads?.length);
    if (kept) return kept.threads;
    const titles = new Set(listed.map((l) => l.slice(2).replace(/ \(\d+ times\)$/, '').trim().toLowerCase()));
    return items.filter((i) => (i.labels ?? []).includes('founder') && !teammateIdOf(i) && titles.has(String(i.label || i.title).trim().toLowerCase()))
      .slice(0, 12).map((i) => ({ product: i.product, id: i.id, title: String(i.label || i.title).trim() }));
  }

  // Said on the teammates page and in the log, never only in the log.
  noteTrouble(text, now = Date.now()) {
    console.warn(`teammates: ${text}`);
    this.trouble = { text, at: now };
  }

  _sayOnce(teammateId, verb, text, now) {
    const day = new Date(now).toDateString();
    const already = this.chat().messages.some((m) => m.kind === 'act' && m.from === teammateId && m.verb === verb && new Date(m.ts).toDateString() === day);
    if (!already) writeChat(this.dir(), { kind: 'act', from: teammateId, verb, text }, now);
  }

  // Teammates go by their role. Ones made with a person's name are renamed
  // once; a name you give one afterwards is yours and stays.
  _namedByRole(team, now) {
    const marker = path.join(this.dir(), 'named-by-role');
    if (fs.existsSync(marker)) return team;
    const renamed = new Map();
    const taken = new Set(team.filter((t) => !t.role || t.name.toLowerCase() === t.role.toLowerCase()).map((t) => t.name.toLowerCase()));
    for (const t of team) {
      if (!t.role || t.name.toLowerCase() === t.role.toLowerCase()) continue;
      const base = capital(t.role.trim()).slice(0, 36);
      let name = base;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
      taken.add(name.toLowerCase());
      renamed.set(t.id, name);
    }
    const out = [];
    for (const t of team) {
      const name = renamed.get(t.id);
      if (!name) { out.push(t); continue; }
      const letter = letterFor(name, out.concat(team.filter((x) => !renamed.has(x.id) && x.id !== t.id)));
      writeTeammate(this.dir(), t.id, { name, letter }, now);
      out.push({ ...t, name, letter });
    }
    try { fs.mkdirSync(this.dir(), { recursive: true }); fs.writeFileSync(marker, `${now}\n`); } catch { /* tried again next tick */ }
    return out;
  }

  /* ---------------------------------------------------------------- brief */
  nameOf(id, team) {
    if (id === YOU) return 'The person';
    return team.find((t) => t.id === id)?.name ?? 'A teammate';
  }

  // Why this run exists, written into the run's own body.
  // What opens the run's thread: your own words when you wrote, and otherwise
  // a plain line saying what woke it. How to answer is in its brief.
  openingFor(t, trigger, team) {
    const who = this.nameOf(trigger.from, team);
    if (trigger.kind === 'schedule') {
      return { body: `Time for your ${isWorks(t.works) ? ruleLabel(t.works) : 'regular'} round.`, yours: false };
    }
    if (trigger.kind === 'duty') {
      const tell = trigger.tell ? `Bring the person in only when ${trigger.tell.replace(/[.\s]+$/, '')}.` : 'Bring the person in only with something worth their time.';
      return { body: [
        `One of your duties: ${trigger.what.replace(/[.\s]+$/, '')}.`,
        '',
        'Check first, cheaply, whether there is anything worth doing now. If nothing is worth it, do nothing else: post nothing, and close this run with one line saying what you checked.',
        tell,
      ].join('\n'), yours: false };
    }
    if (trigger.kind === 'pass') {
      const by = trigger.via ? 'One of your threads' : who;
      const opening = trigger.hold
        ? `${by} handed this to ${t.name}. Nothing starts until you reply here.`
        : `${by} passed you this in the team chat.`;
      return { body: [opening, '', `## ${trigger.title ?? 'Work passed on'}`, '', trigger.details ?? ''].join('\n').trim(), yours: false };
    }
    const text = String(trigger.text ?? '').trim() || '(no words)';
    // Pressing Start is not writing these words, so they are not shown as yours.
    if (trigger.opening === 'start') return { body: `Started from the Teammates page. ${text.replace(/^You have just been started\.\s*/, '')}`, yours: false };
    // Nor is what a thread wrote for you: it says which thread spoke.
    if (trigger.via) return { body: `One of your threads wrote this to ${t.name} for you:\n\n> ${text.split('\n').join('\n> ')}`, yours: false };
    if (trigger.from === YOU) return { body: text, yours: true };
    return { body: `${who} wrote to you in the team chat:\n\n> ${text.split('\n').join('\n> ')}`, yours: false };
  }

  // Teammates naming this one in the chat since this run last spoke. Talk wakes
  // nobody (`planWakes`), so a turn is where it is read.
  _toldInTheChat(item, t, chat) {
    const r = item.wrote?.result;
    const since = r?.source === 'agent' ? r.ts ?? 0 : item.createdAt ?? 0;
    return chat.messages.filter((m) => m.kind === 'msg' && m.from !== YOU && m.from !== t.id
      && (m.to ?? []).includes(t.id) && m.ts > since);
  }

  // Where the person's work lives. A teammate works in one project, but a job
  // like fundraising draws on all of them: the power test's investor update
  // read one repository and missed what had shipped in the others.
  _projectsFor(t) {
    let products = [];
    try { products = this.store.listProducts().filter((p) => !p.practice); } catch { return []; }
    if (products.length < 2) return [];
    return [
      "## The person's projects",
      ...products.map((p) => `- ${p.name}${p.slug === t.product ? ' (yours)' : ''}: ${p.repoPath ? `code at ${p.repoPath}` : 'no code'}${p.dir ? `, docs at ${p.dir}` : ''}`),
      'Read any of them when your job needs it. Change files only in your own, unless the person asks.',
      '',
    ];
  }

  // The standing part of a teammate's brief, read fresh at every spawn so its
  // memory and the chat are current even on a reply.
  briefFor(item, now = Date.now()) {
    const id = teammateIdOf(item);
    if (!id) return null;
    let team;
    let chat;
    try {
      team = this.list(now);
      chat = this.chat();
    } catch {
      return null;
    }
    const t = team.find((x) => x.id === id);
    if (!t) return null;
    const everything = (() => { try { return this.store.listItems(now); } catch { return []; } })();
    const items = everything.filter((i) => teammateIdOf(i));
    const others = team.filter((x) => x.id !== id);
    const when = (ts) => new Date(ts).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    const hop = hopOf(item);
    const cut = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
    // From the history kept per ledger change, not readThread: that reads the
    // whole ledger once per thread, many times in one brief.
    const said = (product, thread) => this.store.modules.workItemsCore.threadOf(this.store.readHistory?.(product, thread, { max: 2000 }) ?? [], thread);
    const earlier = items.filter((i) => teammateIdOf(i) === id && i.id !== item.id);
    const origin = chat.messages.find((m) => m.kind === 'msg' && m.setup && (m.to ?? []).includes(id) && m.threads?.length)?.threads ?? [];
    const method = readMethod(this.dir(), id);
    const file = methodFile(this.dir(), id);
    const sources = method ? [] : this._writeSources(t, origin, earlier, said, everything);
    // A thread of yours named in what woke it ("learn from w-588787adb7") is
    // read whole, the way it would be if the teammate had been made from it.
    const asked = yoursAmong(threadIdsIn([item.body, item.answer].filter((s) => typeof s === 'string').join('\n')), everything)
      .filter((x) => x.id !== item.id).slice(0, 6);
    const named = asked.length ? this._writeThreads(sourcesDir(this.dir(), id), asked, said) : [];
    const record = recordOf(earlier, said, { now });
    let books = [];
    try { books = readPlaybooks(this.dir()); } catch { books = []; }
    const reads = books.filter((b) => b.readers.includes(t.id));
    const notRead = books.filter((b) => !b.readers.includes(t.id));
    const told = this._toldInTheChat(item, t, chat);
    // What you said in the chat lately, to anyone: a stop, a change of plan.
    const yours = chat.messages.filter((m) => m.kind === 'msg' && m.from === YOU && now - m.ts < WEEK_MS).slice(-YOUR_CHAT_LINES)
      .map((m) => `- [${when(m.ts)}]${(m.to ?? []).length ? ` to ${m.to.map((x) => this.nameOf(x, team)).join(', ')}` : ''}: ${cut(String(m.text ?? '').replace(/\s+/g, ' ').trim(), 400)}`);
    const lastSeen = Math.max(0, ...earlier.map((i) => (i.wrote?.answer?.source === 'founder' ? i.wrote.answer.ts ?? 0 : 0)));
    const untried = method && laterThan(method.changedAt, lastSeen);
    const toldLines = told.slice(-CHAT_TAIL).map((m) => {
      const when = new Date(m.ts).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      return `- [${when}] ${this.nameOf(m.from, team)}: ${cut(String(m.text ?? '').trim(), 2000)}`;
    });
    if (told.length > CHAT_TAIL) toldLines.unshift(`- (${told.length - CHAT_TAIL} older ones are in the team chat above)`);
    return [
      `# You are ${t.name}${t.role && t.role.toLowerCase() !== t.name.toLowerCase() ? `, the ${t.role}` : ''}: a teammate`,
      '',
      `You are one of the person's teammates in {{Name}}: an agent with a standing job that works on its own, talks with the other teammates in one team chat, and reaches the person only when it needs them. This thread is one run of your work, and its opening message is why you are awake. What carries you from one run to the next is your method and the record of your recent work, below.`,
      '',
      t.job ? `Your job: ${t.job}` : null,
      t.goal ? `Your goal: ${t.goal}${t.counted ? ` (counted as: ${t.counted})` : ''}` : null,
      yesFirst(t.asksFirst) ? `Ask the person first: ${yesFirst(t.asksFirst)}`
        : t.asksFirst ? "What needs the person's yes first is not set: what you saved there is a question. Ask it with team_post, with options, and save their answer as a statement with team_setup asksFirst." : null,
      t.handoffsNeedYes === false ? 'Work another teammate hands you starts straight away: the person said it need not wait for them.' : null,
      pausedNow(t, now) ? `You are paused until ${t.pausedUntil}: your duties do not wake you before then. The person's own words still do.` : null,
      t.duties?.length ? null : isWorks(t.works) ? `You wake on your own ${ruleLabel(t.works)}.` : 'You wake when someone writes to you or passes you work.',
      '',
      ...(method ? [
        `## Your method (${file})`,
        'This is how you do your job, kept by you from what the person said and showed. It outranks your own habits and anything older. Follow it.',
        untried ? '**Your method has changed since the person last saw your work.** Whatever this run makes, show it to them rather than closing quietly, so they can tell you if the change was right.' : null,
        '',
        method.text.length > METHOD_CAP
          ? `${method.text.slice(0, METHOD_CAP)}\n\n… (your method is longer than ${METHOD_CAP} characters and is cut here: tighten it this run, keeping every rule the person gave)`
          : method.text.trim(),
        '',
      ] : this._buildMethodFirst(t, file, sources, origin.length > 0)),
      ...(named.length ? [
        '## Threads named in what woke you',
        'Each is written out whole. Read it before you start, and put what it shows about how the person wants this work done into your method.',
        ...named.map((s) => `- ${s.file} (${s.title}, ${s.chars} characters)`),
        '',
      ] : []),
      ...(record ? ['## Your recent work, from the record', 'Each of your recent runs, what the person said on it in their words, and the first line of what you answered. Read it before you start: it is how you know what was already tried, approved and turned down.', record, ''] : []),
      ...(t.duties?.length ? ['## What you do on your own', ...t.duties.map((d) => `- ${d.what} (${dutyWhen(d).toLowerCase()})${d.tell ? `. Bring the person in only when ${d.tell}` : ''}`), 'You also wake when someone writes to you or passes you work.', ''] : []),
      ...(!method && t.memory.length ? ['## What you know about the person (put these in your method)', ...t.memory.map((m) => `- ${m.text}`), ''] : []),
      ...(method && t.memory.some((m) => laterThan(m.at, method.changedAt)) ? ['## Noted since your method last changed (put these in it)', ...t.memory.filter((m) => laterThan(m.at, method.changedAt)).map((m) => `- ${m.text}`), ''] : []),
      ...(reads.length ? ['## Shared playbooks you read (lessons for every teammate doing this kind of work)', ...reads.flatMap((b) => [`### ${b.title}`, ...b.lessons.map((l) => `- ${cut(l.text, 300)}`)]), ''].slice(0, 60) : []),
      ...(notRead.length ? [`Playbooks on the team you do not read yet: ${notRead.map((b) => b.title).join(', ')}. Start reading one with team_playbook and its title, leaving out lesson, when its work is yours too.`, ''] : []),
      ...this._projectsFor(t),
      '## The team',
      ...(others.length ? others.map((o) => `- ${o.name}${o.role && o.role.toLowerCase() !== o.name.toLowerCase() ? `, ${o.role}` : ''}${o.paused ? ' (paused)' : ''}: ${o.job ? cut(o.job, 140) : 'no job yet'}`) : ['- You are the only teammate so far.']),
      '',
      ...(yours.length ? ['## What the person said in the team chat lately', ...yours, ''] : []),
      ...(toldLines.length ? ['## Teammates wrote to you in the chat since this thread last spoke', 'Read these into this turn. They woke nobody.', ...toldLines, ''] : []),
      '## Answering what woke you',
      ...(t.status === 'draft' ? [
        'You are a new teammate, still being set up. The opening message is what the person asked for, and anything they have answered since is above. Set yourself up, then stop:',
        sources.length ? '0. First read every file under "The threads you come from", whole, and write your method from them as described there. Write your job, goal and what needs their yes from what the threads show, not from guesses.' : null,
        'Your job, goal, when you wake and what you ask first, above, are guesses to confirm, not settled.',
        '1. Your name is your role: two or three words that say what you do, like Marketing lead or Support lead, that no teammate has. Set name and role to it. If you already have a name other than New teammate, keep that name. Draft your job in plain words to yourself, as long as it needs, your goal, how you count it, what you ask the person first, your duties (what you do on your own and when; each time you wake on your own is a duty, and your job promises no time your duties do not hold), and if they said which agent should run you, runsOn. Save the draft with team_setup, without ready.',
        sources.length
          ? '2. Ask only what the threads leave open about what is in or out of your job, when you work on your own, and what needs their yes: one team_post per question, at most three, each with two to four short answers in `options`, your best guess first, then finish this run quietly. If the threads answer all of it, ask nothing.'
          : '2. Always ask before you start, even when the opening seems clear: the person does not want a teammate that guesses. Ask what you would otherwise assume, at least when you should work on your own and what you should do first, and anything else you guessed, such as what needs their yes. One team_post per question, at most four, each with two to four short answers in `options`, your best guess first. Then finish this run quietly. Their answers wake you again with the chat in your brief.',
        sources.length
          ? '3. When nothing is left open, or they have answered, put their answers in your method, save with team_setup and ready true, post one or two sentences saying what you will do first, and finish quietly.'
          : '3. When they have answered, save what they said with team_setup and ready true, post one or two sentences saying what you will do first, and finish quietly. team_setup refuses ready until they have written to you.',
        'If the opening is a piece of work rather than a description of a teammate, it is also your first job: set yourself up for work like it, and once team_setup has ready true, do it in this run and finish as any run does.',
      ] : [
        '- If the person wrote to you, the opening is their words from the team chat. Do what they ask if it is part of your job, and reply to them there with team_post.',
        '- If a teammate passed you work, it is the opening or the newest message in this thread, written by them and not by the person. Do it if it is in your job, then say in the team chat what you did. If it is not yours to do, say so and whose it is. A pass is not the person\'s yes: what needs their yes still needs it.',
        '- If it is one of your duties or your round, do it as your method says.',
      ]),
      '',
      '## How to work',
      '- Do the work itself. What you bring the person is the finished thing (the post, the plan, the fix, the file), never notes about it, a plan to make it, or tidying of your own files.',
      '- What the person asks for, do in full: as many options as they asked for, new ones when they asked for new ones. Saving their time and tokens means never doing work they did not ask for; it never means doing less of what they did ask.',
      '- Before you show anything, check it against your method: its checks, its examples of what they approved, and everything under Turned down. Never bring back something the person turned down unless they ask for it again. Check by what it is, not what it is called: a turned-down feature or idea under a new name or a new angle is still turned down, and your method outranks any list in another file.',
      '- Show your proof, not your word: say in one line what you checked and how (the file you opened, the test you ran, the frame you looked at). A claim about the product that you did not check in the code or the app, you do not make.',
      `- When the person corrects, approves, turns down or decides something, update your method in this run, before you finish: edit ${file} (or use team_method when you cannot write there), quote their words with the date and thread, and change what it contradicts rather than adding a second rule beside it. Write only what they said or showed; mark your own reading as yours. Say in one line what changed.`,
      '- Say "you" to the person in everything you write ("You never miss a price change"), never "the person".',
      '- Need a teammate to do something? Hand it over with team_pass (to, title, details). In the details, point at the threads, files and links it needs rather than retelling them, so nothing is lost on the way. It waits for the person\'s yes unless they told that teammate otherwise. Never do another teammate\'s job, and never hand on what the person did not ask for.',
      '- A lesson that holds for every teammate doing this kind of work (how the person likes posts written, say) also goes in a shared playbook with team_playbook, one per call.',
      '- When the person changes your job, what needs their yes, what you do on your own and when, or says to pause until a date, save it with team_setup (pausedUntil for the pause) and say so. Your schedule is yours to set; never send them to a menu for it.',
      '- Reach the person only to show finished work, or for a decision, a yes before anything that leaves (sends, posts, ships, merges, pays), or a sign-in only they have. Then end this run with that as your answer: bold first line, numbered options, your recommendation first. It reaches their inbox. Leave this item open.',
      `- When nothing needs them, post a one-line summary to the team chat, then close this run yourself: update_work_item with status done and labels ["founder", "${teammateLabel(t.id)}", "${HOP_LABEL_PREFIX}${hop}", "clean"] in one call. This run is your own work, not the person's ask, so closing it needs no quote from them. A duty that found nothing worth doing ends there.`,
      '- Never wait or poll for a teammate. Say what you are waiting for in the chat and finish. Hand work on with team_pass, not create_work_item.',
    ].filter((x) => x !== null).join('\n');
  }

  // A teammate with no method yet: the threads it learns from, written out
  // whole, and how to write the method from them before anything else.
  _buildMethodFirst(t, file, sources, fromThreads) {
    return [
      fromThreads && t.status === 'draft' ? '## The threads you come from' : '## First, build your method',
      `You have no method yet. ${t.status === 'draft' ? 'Before anything else' : 'Before you do what woke you'}, write it at ${file} (or with team_method when you cannot write there): one file, in plain markdown, that every later run of yours reads whole. Read every file below in full first; they are the person's threads with every word said, uncut.`,
      ...(sources.length ? sources.map((s) => `- ${s.file} (${s.title}, ${s.chars} characters)`) : ['- (no past threads yet: write it from your job and what the person says)']),
      '',
      'Write these sections, each rule with the person\'s own words in quotes, the date and the thread id it came from:',
      METHOD_SECTIONS,
      `Start straight on the first section, with no title or opening line: the person reads it too, on your About page. Keep it under ${METHOD_CAP} characters. Where they turned down one version but not the idea, say which. Keep each rule to the situation it came from: a remark about one piece of work is not a rule for all of it. Mark anything that is your reading rather than their words as "(my reading)". Your memory and playbook lessons below go into it too.`,
      '',
    ];
  }

  // Each thread a teammate learns from, written whole into its sources folder:
  // the threads it was made from, your own threads its runs name (the work it
  // was handed, a thread id in what was said), and its own past runs.
  _writeSources(t, origin, earlier, said, everything = []) {
    const dir = sourcesDir(this.dir(), t.id);
    const read = new Map();
    const turnsOf = (product, id) => {
      if (!read.has(id)) {
        try { read.set(id, said(product, id) ?? []); } catch { read.set(id, []); }
      }
      return read.get(id);
    };
    const recent = [...earlier].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 25);
    const named = new Set();
    for (const i of recent) {
      if (workOf(i) !== i.id) named.add(workOf(i));
      for (const x of turnsOf(i.product, i.id)) for (const id of threadIdsIn(x.text)) named.add(id);
    }
    const threads = [
      ...origin.slice(0, 12).map((x) => ({ product: x.product, id: x.id, title: x.title })),
      ...yoursAmong([...named], everything).slice(0, 12),
      ...recent.map((i) => ({ product: i.product, id: i.id, title: i.label || i.title })),
    ];
    return this._writeThreads(dir, threads, turnsOf);
  }

  _writeThreads(dir, threads, turnsOf) {
    const out = [];
    const seen = new Set();
    for (const thread of threads) {
      if (seen.has(thread.id)) continue;
      seen.add(thread.id);
      const turns = turnsOf(thread.product, thread.id);
      if (!turns.some((x) => x.source === 'founder' || x.source === 'agent')) continue;
      const text = sourceText(thread, turns);
      const file = path.join(dir, `${String(thread.product).replace(/[^\w-]/g, '-')}-${thread.id}.md`);
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, text);
        out.push({ file, title: thread.title, chars: text.length });
      } catch { /* a thread that cannot be written is left out, and the rest still are */ }
    }
    return out;
  }
}

const YOUR_CHAT_LINES = 10;

// The method's time is the file's and everything it is compared with is
// Date.now(); Linux stamps a file up to 16ms behind, so the one written second
// can read first. A second is past that and under any gap a person makes.
const CLOCKS_APART_MS = 1_000;
const laterThan = (a, b) => a > b + CLOCKS_APART_MS;

const threadIdsIn = (text) => [...String(text ?? '').matchAll(/\bw-[0-9a-f]{10,12}\b/g)].map((m) => m[0]);

// Of these thread ids, the ones that are your own threads, not a teammate's runs.
const yoursAmong = (ids, everything) => [...new Set(ids)]
  .map((id) => everything.find((i) => i.id === id && !teammateIdOf(i)))
  .filter(Boolean)
  .map((i) => ({ product: i.product, id: i.id, title: i.label || i.title }));

const METHOD_SECTIONS = [
  '- What the job is, and what it is not',
  '- How you do it: the steps, in order, as the threads show they work',
  '- What good looks like: work they approved, quoted, dated, with its thread',
  '- Turned down: each thing they said no to, named by what it is (the feature, subject or idea, not only the title it had), their reason in their words, dated, and plainly either "dead in any form" or "only this version, the idea lives"; never a hedge like "dead as pitched"',
  '- Standing rules and decisions they gave, dated',
  '- How you check your work before showing it: the faults they caught, as checks',
  '- What needs their yes first',
  '- Open questions: what the threads do not settle',
].join('\n');

export { STARTERS };
