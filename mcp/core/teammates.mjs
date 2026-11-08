// The store tools a teammate uses on its runs: talk in the team chat, pass work
// to a teammate, keep what it learns about the person, and set itself up.
//
// Which teammate the session is comes from the app, not the model: the run it
// was started for (`ZERO_ITEM`) carries `teammate:<id>`, so no argument names
// who is speaking and no session can speak as another teammate.
import fs from 'node:fs';
import path from 'node:path';
import { readWorkItem, updateWorkItem } from '../../main/store/work-items.mjs';
import { listProjects, legacyRoot } from '../../main/store/project.mjs';
import {
  teamDir, readTeammates, readChat, writeTeammate, writeChat, newMemoryId, newTeammateId,
  readPlaybooks, writePlaybook, newPlaybookId, newLessonId, newDutyId, methodFile, sourcesDir, writeMethod,
} from '../../main/store/teammates-files.mjs';
import { teammateIdOf, hopOf, workOf, setupTitle, isSetupTitle, mentionsIn, isWorks, letterFor, cleanDuty, dutyStart, isDate, tooLongForAChat, METHOD_CAP, VOICES, YOU, MAX_HOPS, HOP_LABEL_PREFIX } from '../../shared/teammates.mjs';
import { periodKey } from '../../shared/repeats.mjs';
import { resolveProduct, resolveAccount } from './account.mjs';

// A title or a choice is drawn as plain words, so markdown in one shows as stars.
const plain = (s) => String(s ?? '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();

const NOT_A_TEAMMATE = 'this session is not a teammate\'s run, so it has no team chat to write to';

function projectOf(itemId, product) {
  if (product) return resolveProduct(product);
  for (const p of listProjects()) {
    try { if (readWorkItem(p.dir, itemId)) return p; } catch { /* a product with no ledger */ }
  }
  throw new Error(`no thread ${itemId} in any product`);
}

// `outsider` lets a thread that is no teammate's run in: it speaks for the
// person (`me` is null), which is what they asked it to do.
export function teammateContext({ env = process.env, now = Date.now(), outsider = false } = {}) {
  const itemId = String(env.ZERO_ITEM ?? '').trim();
  if (!itemId) throw new Error(NOT_A_TEAMMATE);
  const project = projectOf(itemId, String(env.ZERO_PRODUCT ?? '').trim() || null);
  const item = readWorkItem(project.dir, itemId, now);
  if (!item) throw new Error(`no thread ${itemId} in ${project.name}`);
  const tid = teammateIdOf(item);
  if (!tid && !outsider) throw new Error(NOT_A_TEAMMATE);
  const accountId = String(env.STORE_ACCOUNT_ID ?? '').trim() || resolveAccount().accountId;
  const dir = teamDir(legacyRoot(), accountId);
  const team = readTeammates(dir, now);
  if (!tid) return { dir, me: null, team, item, project, hop: 0, writtenIn: { via: item.id, viaProduct: project.id } };
  const me = team.find((t) => t.id === tid);
  if (!me) throw new Error(`the teammate behind ${itemId} is no longer on the team`);
  // The run and the work it is on route its hand-offs (`planWakes`). Hand-offs
  // count up without you, and your reply on the run starts the count again.
  const hop = item.wrote?.answer?.source === 'founder' ? 0 : hopOf(item);
  return { dir, me, team, item, project, hop, writtenIn: { run: item.id, work: workOf(item) } };
}

function idsFor(names, team, me) {
  const list = (Array.isArray(names) ? names : [names]).map((n) => String(n ?? '').trim().replace(/^@/, '')).filter(Boolean);
  const out = [];
  for (const n of list) {
    const lower = n.toLowerCase();
    const t = team.find((x) => x.id === n || x.name.toLowerCase() === lower);
    if (!t) throw new Error(`no teammate called ${n}. The team: ${team.map((x) => x.name).join(', ')}`);
    if (t.id !== me?.id) out.push(t.id);
  }
  return out;
}

// A document on a chat line opens from a card, and only from the thread's project.
function documentOf(rel, project) {
  const asked = String(rel).trim();
  const file = path.resolve(project.dir, asked);
  if (path.isAbsolute(asked) || !file.startsWith(project.dir + path.sep)) throw new Error(`${asked} is outside this project. Write the document in the project, then send it.`);
  if (!fs.existsSync(file)) throw new Error(`${asked} is not there. Write the document first, then send it.`);
  const src = path.relative(project.dir, file);
  return { product: project.id, src, name: path.basename(file) };
}

export function teamPost({ text, to = [], options, document } = {}, ctx = {}) {
  const { dir, me, team, hop, writtenIn, project } = teammateContext({ ...ctx, outsider: true });
  const words = String(text ?? '').trim();
  if (!words) throw new Error('nothing to post');
  // Without a teammate this is the person's own words, passed on.
  const tooLong = me ? tooLongForAChat(words) : null;
  if (tooLong) throw new Error(tooLong);
  const doc = document ? documentOf(document, project) : null;
  const ids = new Set([...idsFor(to, team, me), ...mentionsIn(words, team).filter((x) => x !== me?.id)]);
  const opts = me && Array.isArray(options) ? options.map(plain).filter(Boolean).slice(0, 4) : null;
  const m = writeChat(dir, { kind: 'msg', from: me?.id ?? YOU, to: [...ids], text: words.slice(0, 4000), hop, ...writtenIn, ...(opts?.length ? { options: opts } : {}), ...(doc ? { doc } : {}) }, ctx.now);
  const note = !ids.size ? 'Posted. Nobody was named, so nobody is woken by it.'
    : me ? 'Posted. The teammates named read it on their next turn; it wakes nobody. To have one act on it, hand it over with team_pass.'
      : 'Posted. The teammates named will wake to read it.';
  return { posted: m.id, to: [...ids].map((x) => team.find((t) => t.id === x)?.name), note };
}

export function teamPass({ to, title, details, project: named } = {}, ctx = {}) {
  const { dir, me, team, hop, writtenIn, project, item } = teammateContext({ ...ctx, outsider: true });
  // The work is done where it is named, or for a thread handing it on, in that
  // thread's project; otherwise in the receiver's own.
  const where = named ? resolveProduct(named).id : me ? null : project.id;
  // To yourself only for work in another project: it gets a thread of its own there.
  const toSelf = !!me && !!where && where !== project.id && idsFor(to, team, null).includes(me.id);
  const [target] = toSelf ? [me.id] : idsFor(to, team, me);
  if (!target) throw new Error('pass work to another teammate, not to yourself. For work in another project, name it in project');
  const what = plain(title);
  if (!what) throw new Error('give the work a short title');
  const yours = toSelf ? startedByYou(item) : !!me?.primary && startedByYou(item);
  const m = writeChat(dir, { kind: 'pass', from: me?.id ?? YOU, to: target, title: what.slice(0, 200), details: String(details ?? '').slice(0, 6000), hop, ...writtenIn, ...(where ? { product: where } : {}), ...(yours ? { yours: true } : {}) }, ctx.now);
  const them = team.find((t) => t.id === target);
  const held = me && !yours && (toSelf || them?.handoffsNeedYes !== false);
  return {
    passed: m.id, to: them?.name,
    note: toSelf
      ? (held ? 'The person did not ask for this, so it waits in their inbox for their yes. Say so in your answer.'
        : 'It starts in a thread of its own in that project once this run ends. Do none of it here; say so in your answer and finish.')
      : held
      ? `${them.name} takes work from teammates only with the person's yes, so this waits in their inbox until they reply. Say so in your answer.`
      : yours ?`The person asked for this, so it starts now for ${them?.name ?? 'them'}, in the thread they already have on this work or a new one.`
        : `It goes to the thread ${them?.name ?? 'they'} already has on this work, or starts one, and wakes them.`,
  };
}

// The person's own words started this run, or they have replied on it: the
// opening is theirs, or their answer is the newest word on it.
function startedByYou(item) {
  if (item?.wrote?.body?.source === 'founder') return true;
  return answeredInThread(item);
}

// The primary makes a teammate when the person said yes to one. It is a draft
// that sets itself up by asking them, as one you made would.
export function teamHire({ name, job } = {}, ctx = {}) {
  const { dir, me, team, item, project } = teammateContext(ctx);
  if (!me.primary) throw new Error('only your primary employee makes new teammates; suggest one to the person instead');
  if (!startedByYou(item)) throw new Error('make a teammate only in a run started by the person\'s words or answered by them: ask them first, with options');
  const role = plain(name).slice(0, 40);
  const words = String(job ?? '').trim();
  if (!role || !words) throw new Error('give the new teammate a name that says its role, and its job in plain words');
  if (team.some((t) => t.name.toLowerCase() === role.toLowerCase())) throw new Error(`${role} is taken; pick another name`);
  const now = ctx.now ?? Date.now();
  const id = newTeammateId();
  writeTeammate(dir, id, { name: role, role, letter: letterFor(role, team), job: words.slice(0, 2000), status: 'draft', product: me.product ?? project.id, createdAt: now, paused: false }, now);
  writeChat(dir, { kind: 'msg', from: YOU, to: [id], text: words.slice(0, 8000), setup: true }, now);
  writeChat(dir, { kind: 'act', from: me.id, verb: 'hired', text: `${me.name} made ${role}, which is setting itself up.` }, now);
  return { teammate: { id, name: role, status: 'draft' }, note: `${role} wakes now to set itself up, and asks the person what it cannot tell from the job.` };
}

export function teamRemember({ text } = {}, ctx = {}) {
  const { dir, me, item } = teammateContext(ctx);
  const words = String(text ?? '').trim();
  if (!words) throw new Error('nothing to remember');
  if (me.memory.some((m) => m.text.toLowerCase() === words.toLowerCase())) return { remembered: false, note: 'already kept' };
  const now = ctx.now ?? Date.now();
  const mem = { id: newMemoryId(), text: words.slice(0, 300), from: `run ${item.id}`, at: now };
  writeTeammate(dir, me.id, { remember: mem }, now);
  writeChat(dir, { kind: 'act', from: me.id, verb: 'learned', text: mem.text, ref: mem.id }, now);
  return { remembered: true, id: mem.id };
}

const EVERY = ['day', 'weekday', 'week', 'never'];

// Or answered in the setup thread itself, which reaches the run as its answer.
function answeredInThread(item) {
  const said = typeof item?.answer === 'string' ? item.answer.trim() : '';
  return !!said && said !== '(withdrawn)' && item.wrote?.answer?.source === 'founder';
}

function answeredSince(dir, id) {
  const { messages } = readChat(dir);
  const asked = messages.filter((m) => m.kind === 'msg' && m.from === YOU && m.setup && (m.to ?? []).includes(id)).at(-1);
  return messages.some((m) => m.kind === 'msg' && m.from === YOU && !m.setup && (m.to ?? []).includes(id) && m.ts > (asked?.ts ?? 0));
}

// What a change to these says in the chat, so you can see it saved.
const SAID = {
  name: 'its name', role: 'its role', job: 'its job', goal: 'its goal', counted: 'how it counts its goal',
  asksFirst: 'what needs your yes first', works: 'when it works', duties: 'what it does on its own',
  handoffsNeedYes: 'whether work from teammates waits for your yes', pausedUntil: 'when it is paused until',
  readsMessages: 'whether it reads your direct messages', voice: 'how it writes', voiceText: 'how it writes',
};

// Made from your threads and has written its method from them: the threads
// answered what a newcomer would otherwise have to ask.
function learnedFromThreads(dir, id) {
  try {
    return fs.readdirSync(sourcesDir(dir, id)).length > 0 && fs.statSync(methodFile(dir, id)).size > 0;
  } catch {
    return false;
  }
}

// Duties keep their id, and what they have served, when one with the same
// words is set again.
function dutiesFrom(list, me, now) {
  if (!Array.isArray(list)) throw new Error('duties is a list of { what, every, at, on } or { what, after: "ship", most }');
  const out = [];
  const served = {};
  for (const raw of list) {
    const what = String(raw?.what ?? '').trim();
    if (!what) throw new Error('each duty needs what it does');
    const had = (me.duties ?? []).find((d) => d.what.toLowerCase() === what.toLowerCase());
    const d = cleanDuty({ ...raw, what, id: had?.id ?? newDutyId(), at: raw?.after === 'ship' ? undefined : (Array.isArray(raw?.at) ? raw.at : raw?.at ? [raw.at] : []) });
    if (!d) throw new Error(`"${what}" cannot run as written: every is day, weekday or week, at is a list of HH:MM times in 24 hours, on is 0 (Sunday) to 6 for weekly, or after is "ship" with most runs a week`);
    out.push(d);
    if (!had) served[d.id] = dutyStart(d, now);
  }
  return { duties: out, served };
}

export function teamSetup({ name, role, job, goal, counted, asksFirst, every, at, on, duties, runsOn, handoffsNeedYes, pausedUntil, readsMessages, voice, voiceWords, ready } = {}, ctx = {}) {
  const { dir, me, team, item, project } = teammateContext(ctx);
  const now = ctx.now ?? Date.now();
  if (typeof asksFirst === 'string' && /\?\s*$/.test(asksFirst)) {
    throw new Error('asksFirst is what needs the person\'s yes before you do it, said as a statement ("Anything that goes out in public"). Ask a question with team_post instead.');
  }
  const patch = {};
  if (typeof name === 'string' && name.trim()) {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (team.some((t) => t.id !== me.id && t.name.toLowerCase() === clean.toLowerCase())) throw new Error(`${clean} is taken; pick another name`);
    patch.name = clean;
    patch.letter = letterFor(clean, team.filter((t) => t.id !== me.id));
  }
  for (const [k, v] of Object.entries({ role, job, goal, counted, asksFirst })) if (typeof v === 'string' && v.trim()) patch[k] = v.trim();
  if (every !== undefined) {
    if (!EVERY.includes(every)) throw new Error(`every is one of ${EVERY.join(', ')}`);
    if (every === 'never') patch.works = null;
    else {
      const works = { every, at: at ?? '09:00', ...(every === 'week' ? { on: Number.isInteger(on) ? on : 1 } : {}) };
      if (!isWorks(works)) throw new Error('at is HH:MM in 24 hours, and on is 0 (Sunday) to 6 for a weekly round');
      patch.works = works;
      patch.served = periodKey(works, now) ?? '';
    }
  }
  if (duties !== undefined) {
    const made = dutiesFrom(duties, me, now);
    patch.duties = made.duties;
    patch.works = null;
    if (Object.keys(made.served).length) patch.dutyServed = made.served;
  }
  if (runsOn !== undefined) {
    if (runsOn !== 'claude' && runsOn !== 'codex') throw new Error('runsOn is claude or codex');
    patch.engine = runsOn;
  }
  if (handoffsNeedYes !== undefined) {
    if (typeof handoffsNeedYes !== 'boolean') throw new Error('handoffsNeedYes is true or false');
    patch.handoffsNeedYes = handoffsNeedYes;
  }
  if (pausedUntil !== undefined) {
    if (pausedUntil !== null && !isDate(pausedUntil)) throw new Error('pausedUntil is a date, YYYY-MM-DD, or null to stop pausing');
    patch.pausedUntil = pausedUntil;
  }
  if (readsMessages !== undefined) {
    if (typeof readsMessages !== 'boolean') throw new Error('readsMessages is true or false');
    if (!answeredSince(dir, me.id) && !answeredInThread(item)) throw new Error('reading direct messages is the person\'s to choose: ask them first, with options, and save what they said');
    patch.readsMessages = readsMessages;
  }
  if (voice !== undefined) {
    if (!VOICES.some((v) => v.id === voice)) throw new Error(`voice is one of ${VOICES.map((v) => v.id).join(', ')}, or send voiceWords`);
    patch.voice = voice;
    patch.voiceText = null;
  }
  if (typeof voiceWords === 'string' && voiceWords.trim()) patch.voiceText = voiceWords.trim();
  // A new teammate asks before it starts, so ready waits for the person's
  // own words to it after the ask that made it, unless their threads answered.
  if (ready === true && me.status === 'draft' && !answeredSince(dir, me.id) && !answeredInThread(item) && !learnedFromThreads(dir, me.id)) {
    throw new Error('ask you first: post your questions with team_post, each with options, and finish; you can go ready once the person has answered');
  }
  if (ready === true) patch.status = 'active';
  writeTeammate(dir, me.id, patch, now);
  if (patch.name && me.status === 'draft' && isSetupTitle(item.title)) {
    try { updateWorkItem(project.dir, item.id, { title: setupTitle(patch.name) }, { source: 'system', now }); } catch { /* the old title stands */ }
  }
  if (ready === true && me.status === 'draft') writeChat(dir, { kind: 'act', from: me.id, verb: 'started' }, now);
  const changed = Object.keys(SAID).filter((k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(me[k] ?? null));
  if (me.status === 'active' && changed.length) {
    const parts = changed.map((k) => SAID[k]);
    writeChat(dir, { kind: 'act', from: me.id, verb: 'updated', text: `Updated ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}` }, now);
  }
  const after = readTeammates(dir, now).find((t) => t.id === me.id);
  return { teammate: { name: after.name, role: after.role, job: after.job, goal: after.goal, counted: after.counted, asksFirst: after.asksFirst, works: after.works, duties: after.duties, runsOn: after.engine ?? 'your default', handoffsNeedYes: after.handoffsNeedYes !== false, pausedUntil: after.pausedUntil ?? null, status: after.status } };
}

// The teammate's method, written whole or one passage at a time. Through the
// store because a Codex run may write only inside its own task folder.
export function teamMethod({ text, old, new: replacement } = {}, ctx = {}) {
  const { dir, me } = teammateContext(ctx);
  let current = '';
  try { current = fs.readFileSync(methodFile(dir, me.id), 'utf8'); } catch { /* none yet */ }
  let next;
  if (typeof text === 'string') {
    if (!text.trim()) throw new Error('your method cannot be empty');
    next = text;
  } else if (typeof old === 'string' && typeof replacement === 'string') {
    const at = old ? current.indexOf(old) : -1;
    if (at < 0) throw new Error('that passage is not in your method: copy it exactly as it reads now');
    if (current.indexOf(old, at + 1) >= 0) throw new Error('that passage is in your method more than once: include enough around it to say which');
    next = `${current.slice(0, at)}${replacement}${current.slice(at + old.length)}`;
  } else {
    throw new Error('send text (your whole method), or old and new (one passage as it reads now, and what replaces it)');
  }
  const file = writeMethod(dir, me.id, next);
  return { saved: file, characters: next.length, ...(next.length > METHOD_CAP ? { note: `Your method is over ${METHOD_CAP} characters, so your runs see it cut. Tighten it.` } : {}) };
}

// A lesson about how the person likes a kind of work done, kept in the
// playbook of that title so every teammate doing that work reads it. With no
// lesson it starts reading a playbook another teammate wrote.
export function teamPlaybook({ playbook, lesson } = {}, ctx = {}) {
  const { dir, me, item, project } = teammateContext(ctx);
  const now = ctx.now ?? Date.now();
  const title = plain(playbook).slice(0, 120);
  if (!title) throw new Error('name the playbook, like "How you write posts"');
  const books = readPlaybooks(dir);
  let book = books.find((b) => b.title.toLowerCase() === title.toLowerCase());
  if (lesson === undefined) {
    if (!book) throw new Error(`no playbook called ${title}. The team has: ${books.map((b) => b.title).join(', ') || 'none yet'}. Add a lesson to start one.`);
    if (!book.readers.includes(me.id)) writePlaybook(dir, { kind: 'reader', book: book.id, teammate: me.id }, now);
    return { playbook: book.id, reading: true, lessons: book.lessons.map((l) => l.text) };
  }
  const text = String(lesson ?? '').trim().slice(0, 400);
  if (!text) throw new Error('the lesson is empty');
  if (!book) {
    book = { id: newPlaybookId(), title, lessons: [], readers: [] };
    writePlaybook(dir, { kind: 'book', id: book.id, title }, now);
  }
  if (book.lessons.some((l) => l.text.toLowerCase() === text.toLowerCase())) return { playbook: book.id, kept: false, note: 'already in it' };
  const id = newLessonId();
  writePlaybook(dir, { kind: 'lesson', id, book: book.id, text, by: me.id, from: { product: project.id, id: item.id, title: plain(item.label || item.title) } }, now);
  writeChat(dir, { kind: 'act', from: me.id, verb: 'lesson', ref: book.id, text }, now);
  return { playbook: book.id, kept: true, id };
}

export function teamRoster(ctx = {}) {
  const { dir, me, team } = teammateContext({ ...ctx, outsider: true });
  const { messages } = readChat(dir);
  const nameOf = (id) => (id === YOU ? 'the person' : team.find((t) => t.id === id)?.name ?? 'a teammate');
  return {
    you: me?.name ?? null,
    team: team.map((t) => ({ name: t.name, role: t.role, job: t.job, paused: t.paused, status: t.status })),
    recent: messages.filter((m) => m.kind === 'msg' || m.kind === 'pass').slice(-20).map((m) => ({ from: nameOf(m.from), to: m.kind === 'pass' ? [nameOf(m.to)] : (m.to ?? []).map(nameOf), text: m.kind === 'pass' ? `passed: ${m.title}` : m.text, at: new Date(m.ts).toISOString() })),
  };
}

// WORDS ONE AGENT LEAVES ON ANOTHER AGENT'S STOPPED THREAD go there as a
// teammate's reply, which the supervisor takes as a turn, as it does a person's
// reply: her own stop or close outranks it, and so does the hand-off count.
// Null when this is not that, and the ordinary write goes ahead.
export function noteToAnotherThread(id, patch, { ownItem, now = Date.now() } = {}) {
  if (!ownItem || !id || id === ownItem) return null;
  const keys = Object.keys(patch ?? {}).filter((k) => patch[k] !== undefined);
  if (!keys.length || keys.some((k) => k !== 'note' && k !== 'result')) return null;
  const words = String(patch.note ?? patch.result ?? '').trim();
  if (!words) return null;
  let target; let writer;
  try {
    target = projectOf(id, null);
    writer = projectOf(ownItem, null);
  } catch { return null; }
  const item = readWorkItem(target.dir, id, now);
  const from = readWorkItem(writer.dir, ownItem, now);
  // A thread an agent has spoken on and that nobody is on now; a proposal is
  // not started on another agent's word.
  if (!item || !from || item.status === 'claimed' || !item.wrote?.result || !(item.labels ?? []).includes('founder')) return null;
  const tid = teammateIdOf(from);
  const me = tid ? readTeammates(teamDir(legacyRoot(), resolveAccount().accountId), now).find((t) => t.id === tid) : null;
  const name = me?.name ?? `The agent on "${plain(from.label || from.title).slice(0, 60)}"`;
  const hop = (from.wrote?.answer?.source === 'founder' ? 0 : hopOf(from)) + 1;
  let after = updateWorkItem(target.dir, id, { answer: words.slice(0, 8000), from: { teammate: tid ?? 'agent', name } }, { source: 'system', now });
  const herWord = after.wrote?.status?.source === 'founder' && (after.status === 'done' || after.status === 'blocked');
  const tooMany = hop > MAX_HOPS;
  const woke = !herWord && !tooMany;
  if (woke) {
    const labels = [...(after.labels ?? []).filter((l) => l !== 'clean' && !l.startsWith(HOP_LABEL_PREFIX)), `${HOP_LABEL_PREFIX}${hop}`];
    after = updateWorkItem(target.dir, id, { labels, ...(after.status === 'done' || after.status === 'blocked' ? { status: 'open' } : {}) }, { source: 'system', now });
  }
  return {
    told: id, woke,
    note: woke ? `It is on "${plain(item.label || item.title)}" as your words, and its agent starts a turn on it.`
      : tooMany ? `It is on that thread, but it wakes nobody: ${MAX_HOPS} hand-offs in a row with no person between is the most. Say so in your answer.`
        : 'It is on that thread, but its owner stopped it, so it waits for them.',
  };
}
