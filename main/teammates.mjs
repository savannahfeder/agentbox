// Teammates in the main process: the files, the tick that carries out
// `planWakes`, and the brief a teammate's run is given. The decisions are in
// shared/teammates.mjs; this only reads, writes and starts.
import {
  planWakes, teammateLabel, FROM_LABEL_PREFIX, HOP_LABEL_PREFIX, hopOf, teammateIdOf, YOU, mentionsIn,
  letterFor, statusOf, runLines, STARTERS, CHAT_TAIL, isWorks, DEFAULT_LIMIT, MAX_HOPS,
  offerFrom, offerAnswer, threadsDigest, OFFER_LABEL, OFFER_MAKE, OFFER_NOT_NOW, TEAMMATE_EFFORT, GREETING, starterAsks,
  dutyWhen, dutyOf, DUTY_LABEL_PREFIX, CHAT_LABEL, yesFirst,
} from '../shared/teammates.mjs';
import { isShippedNote } from '../shared/shipped-note.mjs';
import { ruleLabel, periodKey } from '../shared/repeats.mjs';
import {
  teamDir, readTeammates, readChat, writeTeammate, writeChat, newTeammateId, newMemoryId, readPlaybooks,
} from './store/teammates-files.mjs';
import fs from 'node:fs';
import path from 'node:path';

const CHAT_FOR_SCREEN = 400;

const TROUBLE_VERB = { run: 'start a run', answer: 'get your message', release: 'start its next run', seen: 'mark a message read', served: 'mark its round served', dutyServed: 'mark a duty done' };

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
    const allowed = ['name', 'role', 'job', 'goal', 'counted', 'asksFirst', 'works', 'product', 'engine', 'model', 'effort', 'limit', 'paused', 'letter'];
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

  remove(id, now = Date.now()) {
    writeTeammate(this.dir(), id, { endedAt: now }, now);
    return { ok: true };
  }

  remember(id, text, { from = null, by = null } = {}, now = Date.now()) {
    const words = String(text ?? '').trim();
    if (!words) throw new Error('Nothing to remember.');
    const mem = { id: newMemoryId(), text: words.slice(0, 300), from, at: now, by };
    writeTeammate(this.dir(), id, { remember: mem }, now);
    writeChat(this.dir(), { kind: 'act', from: id, verb: 'learned', text: mem.text, ref: mem.id }, now);
    return mem;
  }

  forget(id, memoryId, now = Date.now()) {
    writeTeammate(this.dir(), id, { forget: memoryId }, now);
    return { ok: true };
  }

  // Your words in the team chat. On a teammate's page they go to that
  // teammate; in the team chat to whoever they name with @.
  post({ text, to = [], options, fresh = false } = {}, now = Date.now()) {
    const words = String(text ?? '').trim();
    if (!words) throw new Error('Nothing to send.');
    const team = this.list(now);
    const ids = new Set([...(Array.isArray(to) ? to : [to]).filter(Boolean), ...mentionsIn(words, team)]);
    const known = [...ids].filter((x) => team.some((t) => t.id === x));
    return writeChat(this.dir(), { kind: 'msg', from: YOU, to: known, text: words.slice(0, 8000), ...(options ? { options } : {}), ...(fresh ? { fresh: true } : {}) }, now);
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
  async tick({ items, now = Date.now(), deliver } = {}) {
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
          const labels = ['founder', teammateLabel(t.id), `${HOP_LABEL_PREFIX}${hop}`];
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
        } else if (a.type === 'release') {
          const dir = this.store.productDir(a.product);
          workItemsDisk.updateWorkItem(dir, a.item, { start: 'now' }, { source: 'system', now });
        } else if (a.type === 'limit') {
          this._sayOnce(a.teammate, 'limit', `${t.name} has used ${t.limit ?? DEFAULT_LIMIT} runs this week and waits until runs free up. Your own messages still reach it.`, now);
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
      return { body: [`${by} passed you this in the team chat.`, '', `## ${trigger.title ?? 'Work passed on'}`, '', trigger.details ?? ''].join('\n').trim(), yours: false };
    }
    const text = String(trigger.text ?? '').trim() || '(no words)';
    // Pressing Start is not writing these words, so they are not shown as yours.
    if (trigger.opening === 'start') return { body: `Started from the Teammates page. ${text.replace(/^You have just been started\.\s*/, '')}`, yours: false };
    // Nor is what a thread wrote for you: it says which thread spoke.
    if (trigger.via) return { body: `One of your threads wrote this to ${t.name} for you:\n\n> ${text.split('\n').join('\n> ')}`, yours: false };
    if (trigger.from === YOU) return { body: text, yours: true };
    return { body: `${who} wrote to you in the team chat:\n\n> ${text.split('\n').join('\n> ')}`, yours: false };
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
    const items = (() => { try { return this.store.listItems(now).filter((i) => teammateIdOf(i)); } catch { return []; } })();
    const others = team.filter((x) => x.id !== id);
    const tail = chat.messages.filter((m) => m.kind === 'msg' || m.kind === 'pass' || (m.kind === 'act' && m.verb === 'learned')).slice(-CHAT_TAIL);
    const line = (m) => {
      const when = new Date(m.ts).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      const from = this.nameOf(m.from, team);
      if (m.kind === 'pass') return `[${when}] ${from} passed to ${this.nameOf(m.to, team)}: ${m.title}`;
      if (m.kind === 'act') return `[${when}] ${from} learned: ${m.text}`;
      const to = (m.to ?? []).length ? ` (to ${(m.to).map((x) => this.nameOf(x, team)).join(', ')})` : '';
      return `[${when}] ${from}${to}: ${String(m.text ?? '').replace(/\s+/g, ' ').slice(0, 600)}`;
    };
    const hop = hopOf(item);
    const from = t.status === 'draft' ? chat.messages.find((m) => m.kind === 'msg' && m.setup && (m.to ?? []).includes(id) && m.threads?.length)?.threads : null;
    // From the history kept per ledger change, not readThread: that reads the
    // whole ledger once per thread, up to twelve times in one brief.
    const said = (product, thread) => this.store.modules.workItemsCore.threadOf(this.store.readHistory?.(product, thread, { max: 2000 }) ?? [], thread);
    const digest = from ? threadsDigest(from, said) : '';
    let books = [];
    try { books = readPlaybooks(this.dir()); } catch { books = []; }
    const reads = books.filter((b) => b.readers.includes(t.id));
    const notRead = books.filter((b) => !b.readers.includes(t.id));
    const cut = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
    return [
      `# You are ${t.name}${t.role && t.role.toLowerCase() !== t.name.toLowerCase() ? `, the ${t.role}` : ''}: a teammate`,
      '',
      `You are one of the person's teammates in {{Name}}: an agent with a standing job that works on its own, talks with the other teammates in one team chat, and reaches the person only when it needs them. This thread is one run of your work, and its opening message is why you are awake.`,
      '',
      t.job ? `Your job: ${t.job}` : null,
      t.goal ? `Your goal: ${t.goal}${t.counted ? ` (counted as: ${t.counted})` : ''}` : null,
      yesFirst(t.asksFirst) ? `Ask the person first: ${yesFirst(t.asksFirst)}`
        : t.asksFirst ? "What needs the person's yes first is not set: what you saved there is a question. Ask it with team_post, with options, and save their answer as a statement with team_setup asksFirst." : null,
      t.duties?.length ? null : isWorks(t.works) ? `You wake on your own ${ruleLabel(t.works)}.` : 'You wake when someone writes to you or passes you work.',
      '',
      ...(t.duties?.length ? ['## What you do on your own', ...t.duties.map((d) => `- ${d.what} (${dutyWhen(d).toLowerCase()})${d.tell ? `. Bring the person in only when ${d.tell}` : ''}`), 'You also wake when someone writes to you or passes you work.', ''] : []),
      t.memory.length ? '## What you know about the person (follow these)' : null,
      ...t.memory.map((m) => `- ${m.text}`),
      t.memory.length ? '' : null,
      ...(reads.length ? ['## Playbooks you read (how the person likes this work done; follow these)', ...reads.flatMap((b) => [`### ${b.title}`, ...b.lessons.map((l) => `- ${cut(l.text, 300)}`)]), ''].slice(0, 120) : []),
      ...(notRead.length ? [`Playbooks on the team you do not read yet: ${notRead.map((b) => b.title).join(', ')}. Start reading one with team_playbook and its title, leaving out lesson, when its work is yours too.`, ''] : []),
      ...this._projectsFor(t),
      '## The team',
      ...(others.length ? others.map((o) => { const s = statusOf(o, items, now); return `- ${o.name}${o.role && o.role.toLowerCase() !== o.name.toLowerCase() ? `, ${o.role}` : ''}${o.paused ? ' (paused)' : ''}: ${o.job ? o.job.slice(0, 200) : 'no job yet'}${s.now ? ` Now: ${s.now}.` : ''}`; }) : ['- You are the only teammate so far.']),
      '',
      '## The team chat, newest last',
      ...(tail.length ? tail.map(line) : ['(nothing yet)']),
      '',
      ...(digest ? ['## The threads you come from', 'You were made from these threads, where the person asked for this kind of work: what they asked, what the agent did, and every reply they gave.', '', digest, ''] : []),
      '## Answering what woke you',
      ...(t.status === 'draft' ? [
        'You are a new teammate, still being set up. The opening message is what the person asked for, and anything they have answered since is in the team chat above. Set yourself up, then stop:',
        digest ? '0. First read every thread under "The threads you come from" above for how the person wants this work done: what they asked for, what they corrected, what they liked and turned down, and what they decided. Keep each lasting lesson about how this kind of work is done with team_playbook (a short title like "How you write posts"), and anything about the person themselves with team_remember, one per call, in their words. Write your job, goal and what needs their yes from what the threads show, not from guesses, and in step 2 ask only what the threads leave open.' : null,
        'Your job, goal, when you wake and what you ask first, above, are guesses to confirm, not settled.',
        '1. Your name is your role: two or three words that say what you do, like Marketing lead or Support lead, that no teammate has. Set name and role to it. If you already have a name other than New teammate, keep that name. Draft your job in plain words to yourself, as long as it needs, your goal, how you count it, what you ask the person first, your duties (what you do on your own and when; each time you wake on your own is a duty, and your job promises no time your duties do not hold), and if they said which agent should run you, runsOn. Save the draft with team_setup, without ready.',
        '2. Always ask before you start, even when the opening seems clear: the person does not want a teammate that guesses. Ask what you would otherwise assume, at least when you should work on your own and what you should do first, and anything else you guessed, such as what needs their yes. One team_post per question, at most four, each with two to four short answers in `options`, your best guess first. Then finish this run quietly. Their answers wake you again with the chat in your brief.',
        '3. When they have answered, save what they said with team_setup and ready true, post one or two sentences saying what you will do first, and finish quietly. team_setup refuses ready until they have written to you.',
        'If the opening is a piece of work rather than a description of a teammate, it is also your first job: set yourself up for work like it, and once team_setup has ready true, do it in this run and finish as any run does.',
      ] : [
        '- If the person wrote to you, the opening is their words from the team chat. Reply to them there with team_post, and do what they ask if it is part of your job.',
        '- If a teammate passed you work, do it if it is in your job, then say in the team chat what you did. If it is not yours to do, say so and whose it is.',
        '- If a teammate wrote to you, reply in the team chat. Start with @Name only if they need to act on it.',
        '- If it is your round, do your job for today, as above.',
      ]),
      '',
      '## How a teammate works',
      '- The person reads the team chat, your answers, and your job and goal. Say "you" to them in all of it ("You never miss a price change"), never "the person".',
      '- Talk with team_post: short and plain, one to three sentences. Post when you start something worth knowing, when you finish, and when you hand something on. Naming someone with @Name wakes them, so do that only when they need to act.',
      '- Hand work to a teammate whose job it is with team_pass (to, title, details). They get it as a run of their own. Do not do another teammate\'s job. In the details, point at the threads, files and links it needs rather than retelling them, so nothing is lost on the way.',
      '- When the person states a standing preference ("from now on", "always", "never", "I prefer"), keep it with team_remember in a few words, in their terms.',
      '- When they show how they like a kind of work done (a correction, a choice between two, "too slow at the start"), keep the lesson with team_playbook under that kind of work, so every teammate doing it learns it too. One lesson per call.',
      '- When they change your job, what needs their yes, or what you do on your own, save it with team_setup. The chat shows them it saved; do not ask them to confirm the wording.',
      '- Reach the person only when you need them: a decision, a yes before anything that leaves (sends, posts, ships, merges, pays), or a sign-in only they have. Then end this run with your question as your answer: bold first line, numbered options, your recommendation first. It reaches their inbox. Leave this item open.',
      `- When nothing needs them, post a one-line summary to the team chat, then close this run yourself: update_work_item with status done and labels ["founder", "${teammateLabel(t.id)}", "${HOP_LABEL_PREFIX}${hop}", "clean"] in one call. This run is your own work, not the person's ask, so closing it needs no quote from them.`,
      '- Never wait or poll for a teammate. Say what you are waiting for in the chat and finish; their reply wakes you.',
      '- When the person changes your job, goal or when you work, save it with team_setup (every, at, on) and say so. Your schedule is yours to set that way; never send them to a menu for it.',
      '- Hand work on with team_pass, not create_work_item: a thread you file waits in their Later list for them to start it.',
    ].filter((x) => x !== null).join('\n');
  }
}

export { STARTERS };
