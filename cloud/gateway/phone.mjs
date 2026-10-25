// THE PHONE'S REPLIES, CARRIED ON IN THE CLOUD WITH THE COMPUTER SHUT
// (docs/cloud/PHONE-PLAN.md step 2; the kit is shared/cloud-kit.mjs).
//
// Every minute: a reply no computer has claimed for a minute is claimed as
// `cloud:<run id>` and started from the kit its computer left, through the
// gateway's own start (the plan, the ledger, the sign-in by name). The run
// keeps its input open: each minute its new output is read without counting
// as the computer (`peek`), each finished turn goes into the phone's copy of
// the thread with one alert, and the next reply on that thread goes to the
// same run. Twenty minutes after its last answer with nothing new its input is
// closed, it ends, and the thread waits for its computer to bring it home
// before the cloud starts it again. A run the computer has joined is the
// computer's.
//
// What the server keeps is in its ledger (`ledger/phone/`), which its role
// may read and write; a run's files and the kit are read through the signer's
// links (`runFiles`), as the role itself never reads `runs/`.
import crypto from 'node:crypto';
import {
  CLOUD_TAKES_AFTER_MS, CLOUD_TAKES_UNTIL_MS, answersIn, checkKit, cloudClaim, cloudSessionId, cloudUserLine,
  kitKey, replyPrompt, resultsInLines, runKey, serverRunKey, startPayload,
} from '../../shared/cloud-kit.mjs';
import { withCloudTurn } from '../../shared/phone-snapshot.mjs';
import { fillNewThreadKit, newThreadKitKey } from '../../shared/cloud-kit.mjs';
import { madeHere, newThreadSnapshot } from '../../shared/phone-snapshot.mjs';
import { codexOpenLines, codexTurnLines, codexReadLines, codexAnswersIn } from '../../shared/cloud-kit.mjs';
import { phoneBanner } from '../../shared/notify-rules.mjs';
import { handsBack, HAND_BACK } from '../../shared/cloud-hand-back.mjs';
import { LOGIN_NAME } from '../../shared/cloud-login-name.mjs';
import { askId, approvalAnswerLine } from '../../shared/cloud-kit.mjs';
import { phoneApproval } from '../../shared/phone-snapshot.mjs';
import { cardDigest } from '../../shared/approval-card.mjs';
import { PHONE_FILES_MAX, PHONE_FILE_MAX_BYTES, phoneFilesIn, phoneAttachmentRel, linkPhoneFiles } from '../../shared/phone-files.mjs';
import { isOurSlug } from '../../shared/product-name.mjs';
import { codexApprovalCard, fileChangeCard, isMcpToolCall, elicitationServer, REMEMBERED_CHANGES } from '../../main/codex-approvals.mjs';
import { yesTo, refusalTo } from '../../main/codex-app-server.mjs';

export const PHONE_TRIES = 3;
// A start the cloud refused is tried again no sooner than this.
const TRY_AGAIN_MS = 5 * 60_000;
// A run's end is looked for by the sweep once its notice may have been missed.
const END_LOOK_AFTER_MS = 2 * 60_000;
// The links a run is started with outlive its 8 hours.
const LINK_SECONDS = 12 * 60 * 60;
const PER_SWEEP = 50;
// A run whose last answer is this old, with no new reply, has its input closed.
export const IDLE_CLOSE_MS = 20 * 60_000;
// An ended run its computer never brought home is let go after this.
const NOT_HOME_KEPT_MS = 7 * 24 * 60 * 60_000;
const PAGE_BYTES = 1_000_000;
const PAGES_PER_SWEEP = 20;
// Most of one output line kept between sweeps; a longer one is no answer.
const PARTIAL_MAX = 2 * 1024 * 1024;
const DB_MS = 10_000;
export const ANSWERED_OUTCOME = 'Answered in Agentbox Cloud';
export const NO_ANSWER = 'The run in Agentbox Cloud ended without an answer.';
const PERSON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A file from the phone is read through to the end at most this long.
const FILE_MS = 60_000;

const iso = (t) => new Date(t).toISOString();

/** The database, as the service role, with a deadline on every call. */
export function supabaseRest({ url, serviceKey, fetchImpl = fetch, timeoutMs = DB_MS }) {
  const base = `${String(url).replace(/\/+$/, '')}/rest/v1`;
  const q = (v) => encodeURIComponent(v);
  async function call(method, path, { body, prefer } = {}) {
    const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) };
    const res = await fetchImpl(`${base}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (!res.ok) throw new Error(`the database answered ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  const thread = (owner, device, project, item) => `owner=eq.${q(owner)}&device=eq.${q(device)}&project=eq.${q(project)}&item=eq.${q(item)}`;
  return {
    waitingReplies: ({ after, before, limit }) => call('GET', `phone_commands?select=id,owner,device,project,item,kind,payload,created_at&kind=in.(reply,new)&taken_at=is.null&claimed_at=is.null&created_at=gt.${q(iso(after))}&created_at=lt.${q(iso(before))}&order=created_at.asc&limit=${limit}`),
    async claim(id, by, at) {
      const rows = await call('PATCH', `phone_commands?id=eq.${q(id)}&claimed_at=is.null&taken_at=is.null`, { body: { claimed_at: at, claimed_by: by }, prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length === 1;
    },
    // Answers to permission cards the cloud put on the phone (askId).
    waitingApprovals: ({ limit }) => call('GET', `phone_commands?select=id,owner,device,project,item,kind,payload,created_at&kind=eq.approve&taken_at=is.null&claimed_at=is.null&payload->>approval=like.cloud-*&order=created_at.asc&limit=${limit}`),
    giveBack: (id, by) => call('PATCH', `phone_commands?id=eq.${q(id)}&claimed_by=eq.${q(by)}&taken_at=is.null`, { body: { claimed_at: null, claimed_by: null } }),
    taken: (id, outcome, at) => call('PATCH', `phone_commands?id=eq.${q(id)}&taken_at=is.null`, { body: { taken_at: at, outcome } }),
    async thread(owner, device, project, item) {
      const rows = await call('GET', `phone_threads?select=snapshot&${thread(owner, device, project, item)}`);
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    },
    writeThread: (owner, device, project, item, snapshot) => call('PATCH', `phone_threads?${thread(owner, device, project, item)}`, { body: { snapshot, updated_at: iso(Date.now()) } }),
    // A thread the cloud started from the phone; one already there is kept.
    newThread: (owner, device, project, item, snapshot) => call('POST', 'phone_threads?on_conflict=owner,device,project,item', { body: { owner, device, project, item, snapshot, updated_at: iso(Date.now()) }, prefer: 'resolution=ignore-duplicates,return=minimal' }),
    // A link the sandbox fetches one of her phone's files by, or null when it is not there.
    async signPhoneFile(owner, device, name, seconds) {
      const root = String(url).replace(/\/+$/, '');
      const at = [owner, device, name].map(encodeURIComponent).join('/');
      const res = await fetchImpl(`${root}/storage/v1/object/sign/phone-files/${at}`, {
        method: 'POST', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: seconds }), signal: AbortSignal.timeout(timeoutMs),
      });
      const said = await res.json().catch(() => null);
      if ([400, 404].includes(res.status)) return null;
      if (!res.ok) throw new Error(`the storage answered ${res.status}`);
      return typeof said?.signedURL === 'string' ? `${root}/storage/v1${said.signedURL}` : null;
    },
    // What is behind such a link: its sha256, hashed as it comes, and its size.
    async phoneFileDigest(link, maxBytes) {
      const res = await fetchImpl(link, { signal: AbortSignal.timeout(FILE_MS) });
      if (!res.ok || !res.body) return null;
      const hash = crypto.createHash('sha256');
      let bytes = 0;
      for await (const chunk of res.body) {
        bytes += chunk.length;
        if (bytes > maxBytes) return { sha256: null, bytes };
        hash.update(chunk);
      }
      return { sha256: hash.digest('hex'), bytes };
    },
    pushDevices: (owner) => call('GET', `push_devices?select=token&owner=eq.${q(owner)}`),
    dropPushDevice: (owner, token) => call('DELETE', `push_devices?owner=eq.${q(owner)}&token=eq.${q(token)}`),
  };
}

/**
 * The phone's half of the server. `start(person, sessionId, payload)` and
 * `input(...)` are the gateway's own invoke; `room(person)` says whether a
 * run could start now, without taking a place.
 */
export function createPhoneCarry({ db, runFiles, links, objects, start, input, stop, room, scopedKey, now, log, sendPush }) {
  const said = new Set();
  const once = (kind, line) => { if (!said.has(kind)) log(line); said.add(kind); };
  const tryKey = (person, id) => `ledger/phone/tries/${person}/${id}.json`;
  const openKey = (person, runId) => `ledger/phone/open/${person}/${runId}.json`;
  const endedKey = (person, runId) => `ledger/phone/ended/${person}/${runId}.json`;
  const readJson = async (key) => { const o = await objects.get(key); return o ? JSON.parse(o.body) : null; };
  const readFile = async (key) => { try { return await runFiles.get(key); } catch (err) { once(`read:${err?.message}`, `phone: could not read ${key}: ${err?.message || err}`); return null; } };
  const threadOf = (r) => `${r.owner}|${r.device}|${r.project}|${r.item}`;
  const save = (rec) => objects.put(openKey(rec.owner, rec.runId), JSON.stringify(rec));
  // The computer writes this when it joins a run the server started.
  const joined = async (rec) => !!(await readFile(scopedKey(rec.owner, serverRunKey(rec.runId).replace(/\.json$/, '.joined.json'))));
  const stdinOf = (frame, text, note) => Buffer.from(cloudUserLine(replyPrompt(frame, text), { note, uuid: crypto.randomUUID() })).toString('base64');

  async function kitOf(person, cmd) {
    const text = await readFile(scopedKey(person, kitKey(cmd.device, cmd.project, cmd.item)));
    if (!text) return null;
    let kit;
    try { kit = JSON.parse(text); } catch { once('kit-json', 'phone: a kit that is not JSON was left to its computer'); return null; }
    const elsewhere = (kit?.device && kit.device !== cmd.device) || (kit?.project && kit.project !== cmd.project) || (kit?.item && kit.item !== cmd.item);
    const problem = checkKit(kit, { now: now() }) || (elsewhere ? 'a kit for another thread' : null);
    if (problem) { once(`kit:${problem}`, `phone: a kit was left to its computer: ${problem}`); return null; }
    return kit;
  }

  async function failed(person, cmd, tries, why) {
    const n = (tries?.n ?? 0) + 1;
    await objects.put(tryKey(person, cmd.id), JSON.stringify({ n, at: now(), why }));
    once(`start:${why}`, `phone: a reply could not start in the cloud (${why}); its claim was given back`);
    if (n >= PHONE_TRIES) log(`phone: reply ${cmd.id} was tried ${n} times and is left to the computer`);
  }

  // HER PHONE'S FILES IN HER WORDS (shared/phone-files.mjs), each checked to
  // be what its name says and fetched by the sandbox into the project's
  // documents folder where her computer saves the same file: { said, files },
  // her words linked there and the files to place, or null to leave them to
  // the computer.
  async function phoneFilesFor(person, cmd, words, docs) {
    const found = phoneFilesIn(words);
    if (!found.length) return { said: words, files: [] };
    const leave = (why) => { once(`file:${why}`, `phone: words with a file from the phone are left to the computer: ${why}`); return null; };
    if (found.length > PHONE_FILES_MAX) return leave(`more than ${PHONE_FILES_MAX} files at once`);
    if (typeof docs !== 'string' || !docs.startsWith('/')) return leave('its kit has no documents folder');
    if (!db.signPhoneFile || !db.phoneFileDigest) return leave('this server cannot read the phone\'s files');
    const files = new Map();
    for (const f of found) {
      const at = `${docs.replace(/\/+$/, '')}/${phoneAttachmentRel(f)}`;
      if (files.has(at)) continue;
      let link; let seen;
      try { link = await db.signPhoneFile(person, cmd.device, f.name, LINK_SECONDS); } catch (err) { return leave(`its storage did not answer (${err?.message || err})`); }
      if (!link) return leave('a file from the phone is not in its storage');
      try { seen = await db.phoneFileDigest(link, PHONE_FILE_MAX_BYTES); } catch (err) { return leave(`a file from the phone could not be read (${err?.message || err})`); }
      if (!seen || seen.bytes > PHONE_FILE_MAX_BYTES || `${seen.sha256}${f.name.slice(64)}` !== f.name) return leave('a file from the phone was not the one it was sent as');
      files.set(at, { path: at, url: link });
    }
    return { said: linkPhoneFiles(words, found), files: [...files.values()] };
  }

  // Sequenced input to a run, asked again if its answer was lost: the sandbox
  // takes the same number once.
  async function send(rec, payload) {
    for (let i = 0; i < 3; i += 1) {
      try { if ((await input(rec.owner, rec.sessionId, { runId: rec.runId, ...payload, server: true }))?.ok) return true; } catch { /* asked again */ }
    }
    return false;
  }

  // What she sees for a turn: the agent's answer, or why there is none.
  const answerText = (a) => {
    if (!a || a.isError || !a.text.trim()) return NO_ANSWER;
    if (handsBack(a.text)) {
      const what = a.text.split('\n').find((l) => l.trimStart().startsWith(HAND_BACK)).trim().slice(HAND_BACK.length).trim();
      return `This needs your computer${what ? ` (${what})` : ''}. It carries on there when your computer is back.`;
    }
    return a.text;
  };

  async function alert(rec, title, over = null) {
    let phones;
    try { phones = await db.pushDevices(rec.owner); } catch (err) { once('push-read', `phone: could not read the phones to alert: ${err?.message || err}`); return; }
    if (!phones?.length) return;
    const say = over ?? phoneBanner([{ kind: 'item', title }]);
    const messages = phones.map((p) => ({ to: p.token, title: say.title, body: say.body, sound: 'default', priority: 'high', channelId: 'default', data: { product: `${rec.project}@${rec.device}`, id: rec.item } }));
    let tickets;
    try { tickets = await sendPush(messages); } catch (err) { once('push-send', `phone: could not send an alert: ${err?.message || err}`); return; }
    for (const [i, t] of (tickets ?? []).entries()) {
      if (t?.status === 'ok') continue;
      const why = t?.details?.error ?? t?.message ?? 'no answer';
      if (why === 'DeviceNotRegistered') await db.dropPushDevice(rec.owner, messages[i].to).catch((err) => once('push-drop', `phone: could not forget a phone: ${err?.message || err}`));
      else once(`push:${why}`, `phone: Expo did not take an alert: ${why}`);
    }
  }

  // One finished turn: into the phone's copy, the command taken, one alert.
  async function relayTurn(rec, answer) {
    const turn = rec.turns[rec.relayed];
    if (!turn) return;
    const row = await db.thread(rec.owner, rec.device, rec.project, rec.item);
    const next = row ? withCloudTurn(row.snapshot, { reply: turn.reply, answer, repliedAt: Date.parse(turn.repliedAt) || rec.startedAt, answeredAt: now() }) : null;
    if (next) await db.writeThread(rec.owner, rec.device, rec.project, rec.item, next);
    else once('no-thread', 'phone: a cloud run answered for a thread the phone no longer has');
    await db.taken(turn.command, ANSWERED_OUTCOME, iso(now()));
    turn.answered = true;
    rec.relayed += 1;
    rec.lastTurnEndedAt = now();
    await save(rec);
    await alert(rec, row?.snapshot?.item?.title ?? '');
  }

  // The run's new output, read without counting as the computer, and every
  // turn it finished since the last look.
  async function relay(rec) {
    if (rec.codex) { await payCodex(rec); await codexNextTurn(rec); }
    for (let p = 0; p < PAGES_PER_SWEEP; p += 1) {
      let page;
      try { page = await input(rec.owner, rec.sessionId, { action: 'events', runId: rec.runId, since: rec.cursor, peek: true, maxBytes: PAGE_BYTES }); } catch (err) {
        once(`peek:${err?.message}`, `phone: could not read a cloud run's output: ${err?.message || err}`);
        return;
      }
      if (page?.relayed?.key) page = JSON.parse(await readFile(scopedKey(rec.owner, page.relayed.key)) || 'null');
      if (!page?.ok || !Array.isArray(page.events) || !page.events.length) return;
      await noteAsks(rec, page.events);
      let text = '';
      for (const e of page.events) if (e?.kind === 'stdout' && typeof e.data === 'string') text += Buffer.from(e.data, 'base64').toString('utf8');
      const lines = `${rec.partial ?? ''}${text}`.split('\n');
      rec.partial = lines.pop();
      if (rec.partial.length > PARTIAL_MAX) rec.partial = '';
      rec.cursor += page.events.length;
      if (rec.codex) { await noteCodexAsks(rec, lines); await payCodex(rec); }
      const results = rec.codex ? codexReadLines(lines, rec.codex.read) : resultsInLines(lines);
      await save(rec);
      for (const r of results) await relayTurn(rec, answerText(r));
      if (rec.codex) await codexNextTurn(rec);
      if (!page.more) return;
    }
  }

  // A PERMISSION CARD WITH THE COMPUTER SHUT. A run that asks holds its
  // approvals server's calls (cloud/sandbox/server.mjs `offline.hold`); each
  // held call goes on the phone as the computer puts a card (phoneApproval,
  // its fingerprint taken as the computer takes one), with one alert, and her
  // answer carrying that card is the held call's answer. A call answered
  // elsewhere (the computer joined) leaves the phone.
  const cardsWaiting = (rec) => Object.values(rec.asks ?? {}).some((a) => !a.done);
  const whatItWants = (a) => String(a.input?.description ?? a.input?.command ?? a.tool ?? 'a command');

  async function withCards(rec, change) {
    const row = await db.thread(rec.owner, rec.device, rec.project, rec.item);
    if (!row?.snapshot) return null;
    const cards = change(Array.isArray(row.snapshot.approvals) ? row.snapshot.approvals : []);
    const { approvals: _gone, ...rest } = row.snapshot;
    await db.writeThread(rec.owner, rec.device, rec.project, rec.item, cards.length ? { ...rest, approvals: cards } : rest);
    return row.snapshot;
  }

  async function putCard(rec, id, ask) {
    ask.card = cardDigest({ id, at: ask.at, product: rec.project, item: rec.item, tool: ask.tool, input: ask.input });
    rec.asks[id] = ask;
    await save(rec);
    const was = await withCards(rec, (cards) => [...cards.filter((c) => c.id !== id), phoneApproval({ id, at: ask.at, tool: ask.tool, input: ask.input }, ask.card)]);
    const title = was?.item?.title ?? '';
    await alert(rec, title, phoneBanner([{ kind: 'approval', title: whatItWants(ask), thread: title }]));
  }

  async function cardGone(rec, id) {
    const ask = rec.asks?.[id];
    if (!ask || ask.done) return;
    ask.done = true;
    await save(rec);
    await withCards(rec, (cards) => cards.filter((c) => c.id !== id));
  }

  async function noteAsks(rec, events) {
    rec.asks ??= {};
    for (const e of events) {
      if (e?.kind === 'ask' && e.tool === 'approval_prompt') {
        const id = askId(rec.runId, e.conn, e.id);
        if (rec.asks[id]) continue;
        const input = e.input?.input && typeof e.input.input === 'object' ? e.input.input : {};
        await putCard(rec, id, { conn: e.conn, callId: e.id, at: now(), tool: String(e.input?.tool_name ?? 'unknown'), input });
      } else if (e?.kind === 'ask-answered') {
        await cardGone(rec, askId(rec.runId, e.conn, e.id));
      }
    }
  }

  // A CODEX RUN ASKS ITS CLIENT, on its output, so with the computer shut the
  // server is that client: each approval goes on the phone as the computer's
  // Codex client cards it, and a request no card can answer is refused at once
  // in that client's words, since one left unanswered holds the turn until
  // the run's ceiling.
  const CODEX_CONN = 'codex';
  const codexLine = (id, body) => Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', id, ...body })}\n`).toString('base64');

  async function noteCodexAsks(rec, lines) {
    const c = rec.codex;
    c.changes ??= {};
    c.owed ??= [];
    rec.asks ??= {};
    for (const raw of lines) {
      if (!raw || !raw.includes('"method"')) continue;
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (!msg || typeof msg.method !== 'string') continue;
      const p = msg.params ?? {};
      if (msg.id === undefined || msg.id === null) {
        if (msg.method === 'item/started' && p.item?.type === 'fileChange' && typeof p.item.id === 'string') {
          const card = fileChangeCard(p.item);
          if (card) c.changes[p.item.id] = card;
          const ids = Object.keys(c.changes);
          for (const old of ids.slice(0, Math.max(0, ids.length - REMEMBERED_CHANGES))) delete c.changes[old];
        } else if (msg.method === 'item/completed' && typeof p.item?.id === 'string') {
          delete c.changes[p.item.id];
        } else if (msg.method === 'serverRequest/resolved') {
          await cardGone(rec, askId(rec.runId, CODEX_CONN, p.requestId));
        } else if (msg.method === 'turn/completed' || msg.method === 'turn/failed') {
          // Codex settles a turn's open requests when the turn ends.
          for (const [id, ask] of Object.entries(rec.asks)) if (ask.codex) await cardGone(rec, id);
        }
        continue;
      }
      const id = askId(rec.runId, CODEX_CONN, msg.id);
      if (rec.asks[id]) continue;
      // The store's own tools go ahead without a card, as on the computer.
      if (msg.method === 'mcpServer/elicitation/request' && isMcpToolCall(p) && isOurSlug(elicitationServer(p))) {
        c.owed.push({ id: msg.id, body: yesTo(msg.method) });
        continue;
      }
      const card = yesTo(msg.method) ? codexApprovalCard(msg.method, p, new Map(Object.entries(c.changes))) : null;
      if (!card) {
        once(`codex-refused:${msg.method}`, `phone: a Codex run's ${msg.method} has no card to put on the phone, so it was refused`);
        c.owed.push({ id: msg.id, body: refusalTo(msg.method) });
        continue;
      }
      await putCard(rec, id, { codex: msg.method, callId: msg.id, at: now(), tool: card.tool, input: card.input });
    }
  }

  // What is owed a Codex run's requests, in order; one that cannot be sent is tried again next minute.
  async function payCodex(rec) {
    const owed = rec.codex?.owed ?? [];
    while (owed.length) {
      const n = rec.sent + 1;
      if (!(await send(rec, { action: 'stdin', n, data: codexLine(owed[0].id, owed[0].body) }))) {
        once(`owed:${rec.runId}`, `phone: could not answer a Codex request in cloud run ${rec.runId}; tried again next minute`);
        return;
      }
      rec.sent = n;
      owed.shift();
      await save(rec);
    }
  }

  // Her answer to a card the cloud put on the phone, once.
  async function answerCard(cmd, open) {
    const p = cmd.payload ?? {};
    const rec = [...new Set(open.values())].find((r) => r.owner === String(cmd.owner).toLowerCase() && r.asks?.[p.approval]);
    const ask = rec?.asks[p.approval];
    if (!ask || ask.done) return db.taken(cmd.id, ask ? 'That permission request was already answered.' : 'That permission request is no longer waiting.', iso(now()));
    if (p.card !== ask.card) return db.taken(cmd.id, 'That card changed before your answer reached it, so nothing was allowed.', iso(now()));
    if (!(await db.claim(cmd.id, cloudClaim(rec.runId), iso(now())))) return null;
    const n = rec.sent + 1;
    const said = ask.codex
      ? { action: 'stdin', n, data: codexLine(ask.callId, p.allow === true ? yesTo(ask.codex) : refusalTo(ask.codex)) }
      : { action: 'mcp', n, conn: ask.conn, line: approvalAnswerLine(ask.callId, { allow: p.allow === true, note: typeof p.note === 'string' ? p.note : null, input: ask.input }) };
    if (!(await send(rec, said))) {
      try { await db.giveBack(cmd.id, cloudClaim(rec.runId)); } catch (err) { log(`phone: could not give back the claim on ${cmd.id}: ${err?.message || err}`); }
      once(`card:${rec.runId}`, `phone: an answer to a card could not reach cloud run ${rec.runId}; tried again next minute`);
      return null;
    }
    rec.sent = n;
    ask.done = true;
    await save(rec);
    await withCards(rec, (cards) => cards.filter((c) => c.id !== p.approval));
    return db.taken(cmd.id, ANSWERED_OUTCOME, iso(now()));
  }

  // A CODEX RUN (shared/cloud-kit.mjs): its thread is opened first, and her
  // words go as one `turn/start` each, the next only once the last has
  // answered, numbered on from the kit's first turn id.
  const busy = (rec) => (rec.codex ? rec.codex.read.resumed !== true || rec.relayed < rec.codex.turnsSent : rec.relayed < rec.turns.length);

  // A new thread's kit starts its thread instead of resuming one: its first
  // turn is its brief (`firstPrompt`), in the thread the start answers with.
  function firstInput(rec, kit, text, { firstPrompt = null } = {}) {
    if (kit.engine !== 'codex') return stdinOf(kit.frame, text, kit.note ?? null);
    const opens = Number.isInteger(kit.codex.startId) ? kit.codex.startId : kit.codex.resumeId;
    rec.codex = {
      resumeId: opens, nextId: kit.codex.firstTurnId, turn: kit.codex.turn, turnsSent: 0, read: { resumeId: opens, turnIds: [] },
      ...(typeof firstPrompt === 'string' ? { firstPrompt } : {}),
    };
    return Buffer.from(codexOpenLines(kit)).toString('base64');
  }

  async function sendCodexTurn(rec, text, { raw = null } = {}) {
    const id = rec.codex.nextId;
    const n = rec.sent + 1;
    const data = Buffer.from(codexTurnLines({ frame: rec.frame, codex: { turn: rec.codex.turn } }, text, { id, raw, threadId: rec.codex.read.threadId ?? null })).toString('base64');
    if (!(await send(rec, { action: 'stdin', n, data }))) return false;
    rec.sent = n;
    rec.codex.nextId = id + 1;
    rec.codex.turnsSent += 1;
    rec.codex.read.turnIds.push(id);
    await save(rec);
    return true;
  }

  async function codexNextTurn(rec) {
    const c = rec.codex;
    if (rec.closedAt || rec.joined || rec.state !== 'open') return;
    if (typeof c.read.resumed === 'string') {
      // Nothing it was asked can be answered: each reply is told why, and the run is closed.
      while (rec.relayed < rec.turns.length) await relayTurn(rec, `Agentbox Cloud could not open this thread (${c.read.resumed}). It carries on when your computer is back.`);
      const n = rec.sent + 1;
      if (await send(rec, { action: 'stdin', n, end: true })) { rec.sent = n; rec.closedAt = now(); await save(rec); }
      return;
    }
    if (c.read.resumed !== true || rec.relayed < c.turnsSent || c.turnsSent >= rec.turns.length) return;
    const turn = rec.turns[c.turnsSent];
    const raw = turn.reply == null && typeof c.firstPrompt === 'string' ? c.firstPrompt : null;
    if (!(await sendCodexTurn(rec, turn.said ?? turn.reply, { raw }))) once(`turn:${rec.runId}`, `phone: could not send a reply to cloud run ${rec.runId}; tried again next minute`);
  }

  async function startRun(person, cmd, text, tries) {
    const kit = await kitOf(person, cmd);
    if (!kit) return null;
    const sendable = await phoneFilesFor(person, cmd, text, kit.docs);
    if (!sendable) return null;
    const free = await room(person);
    if (!free.ok) { once(`room:${free.error}`, `phone: no room to start a reply in the cloud (${free.error})`); return null; }
    const runId = crypto.randomUUID();
    const claim = cloudClaim(runId);
    if (!(await db.claim(cmd.id, claim, iso(now())))) return null;
    const rec = {
      runId, sessionId: cloudSessionId(cmd.item, runId), owner: person, device: cmd.device, project: cmd.project, item: cmd.item,
      startedAt: now(), kitMadeAt: kit.madeAt, frame: kit.frame, state: 'open', docs: kit.docs ?? null,
      // `reply` is her words as the phone shows them; `said`, as the agent gets them.
      turns: [{ command: cmd.id, reply: text, said: sendable.said, repliedAt: cmd.created_at }], sent: 0, relayed: 0, cursor: 0, partial: '',
    };
    const giveBack = async (why) => {
      try { await db.giveBack(cmd.id, claim); } catch (err) { log(`phone: could not give back the claim on ${cmd.id}: ${err?.message || err}`); }
      await failed(person, cmd, tries, why);
      return null;
    };
    let answer;
    try {
      const payload = await startPayload(kit, {
        runId,
        getUrl: (k) => links.get(scopedKey(person, k), LINK_SECONDS),
        putUrl: (k) => links.put(scopedKey(person, k), LINK_SECONDS),
        loginName: (k) => `${LOGIN_NAME}${k}`,
        kept: kit.kept ?? null,
        // Open for her next reply while the computer is away.
        endTurn: null,
        // Started here, so no computer is there from its first moment.
        away: true,
      });
      payload.files = [...payload.files, ...sendable.files];
      answer = await start(person, rec.sessionId, payload);
    } catch (err) {
      return giveBack(err?.error || 'cloud');
    }
    if (!answer?.ok) return giveBack(answer?.error || 'no answer');
    if (!(await send(rec, { action: 'stdin', n: 1, data: firstInput(rec, kit, sendable.said) }))) {
      // A run with no reply would sit until its ceiling.
      await stop(person, rec.sessionId).catch(() => {});
      return giveBack('the reply did not reach the run');
    }
    rec.sent = 1;
    await save(rec);
    const forComputer = { runId, sessionId: rec.sessionId, command: cmd.id, device: cmd.device, project: cmd.project, item: cmd.item, reply: text, repliedAt: cmd.created_at, startedAt: rec.startedAt, kitMadeAt: kit.madeAt };
    try { await runFiles.put(scopedKey(person, serverRunKey(runId)), JSON.stringify(forComputer)); } catch (err) { once('record', `phone: could not leave the run's record for the computer: ${err?.message || err}`); }
    log(`phone: started reply ${cmd.id} in the cloud as ${runId}`);
    return rec;
  }

  // Her next reply on a thread whose run the server holds open.
  async function follow(rec, cmd, text, tries) {
    if (rec.state !== 'open') {
      once(`not-home:${rec.runId}`, `phone: a reply on a thread whose cloud run ended and has not come home to its computer is left to the computer (${rec.runId})`);
      return 'left';
    }
    if (rec.joined) {
      once(`joined:${rec.runId}`, `phone: a reply on a thread its computer has joined is left to the computer (${rec.runId})`);
      return 'left';
    }
    // Closing, or still on its last reply: the next look takes it.
    if (rec.closedAt || busy(rec)) return 'waits';
    const sendable = await phoneFilesFor(rec.owner, cmd, text, rec.docs);
    if (!sendable) return 'left';
    const claim = cloudClaim(rec.runId);
    if (!(await db.claim(cmd.id, claim, iso(now())))) return 'computer';
    const refused = async () => {
      try { await db.giveBack(cmd.id, claim); } catch (err) { log(`phone: could not give back the claim on ${cmd.id}: ${err?.message || err}`); }
      await failed(rec.owner, cmd, tries, 'the reply did not reach the run');
      return 'refused';
    };
    // Her files first, into the run as it goes, then her words that link them.
    if (sendable.files.length) {
      const f = rec.sent + 1;
      if (!(await send(rec, { action: 'files', n: f, files: sendable.files }))) return refused();
      rec.sent = f;
      await save(rec);
    }
    const n = rec.sent + 1;
    const went = rec.codex ? await sendCodexTurn(rec, sendable.said) : await send(rec, { action: 'stdin', n, data: stdinOf(rec.frame, sendable.said, null) });
    if (!went) return refused();
    if (!rec.codex) rec.sent = n;
    rec.turns.push({ command: cmd.id, reply: text, said: sendable.said, repliedAt: cmd.created_at });
    await save(rec);
    return 'sent';
  }

  // A NEW THREAD FROM THE PHONE, started from its project's new-thread kit
  // under the id its computer gives a thread the phone started (madeHere), on
  // a branch at the main the kit saw. Its turns are relayed as a reply's are,
  // and her replies to it go to the same run.
  const titleOf = (p) => String(p?.title ?? '').trim() || String(p?.body ?? '').trim().split('\n')[0].slice(0, 200);
  // What a new thread's kit cannot do as she asked, so her computer does it.
  function newThreadLeft(p, kit) {
    if (p.start === 'later' || Number(p.runAt) > 0) return 'it is to start later';
    if (p.engine && p.engine !== kit.engine) return 'it is for another coding agent';
    if (p.model && p.model !== (kit.newThread?.model ?? null)) return 'it asks for a model its kit does not run';
    if (p.effort && p.effort !== (kit.newThread?.effort ?? null)) return 'it asks for an effort its kit does not run';
    if (p.assignee || p.due || p.visibility || p.visibleTo || p.people) return 'it is for the team';
    if (!titleOf(p)) return 'it has no words';
    return null;
  }

  async function projectKitOf(person, cmd, engine = 'claude') {
    const text = await readFile(scopedKey(person, newThreadKitKey(cmd.device, cmd.project, engine)));
    if (!text) return null;
    let kit;
    try { kit = JSON.parse(text); } catch { once('new-kit-json', 'phone: a new-thread kit that is not JSON was left to its computer'); return null; }
    const elsewhere = (kit?.device && kit.device !== cmd.device) || (kit?.project && kit.project !== cmd.project);
    const problem = checkKit(kit, { now: now() }) || (!kit.newThread ? 'not a new-thread kit' : null) || (elsewhere ? 'a kit for another project' : null)
      || (kit.engine !== engine ? 'a kit for another coding agent' : null);
    if (problem) { once(`new-kit:${problem}`, `phone: a new-thread kit was left to its computer: ${problem}`); return null; }
    return kit;
  }

  // The kit for the coding agent she chose, or, with none chosen, for the one
  // the project gives a new thread (each kit names it).
  async function newThreadKitFor(person, cmd) {
    const chosen = cmd.payload?.engine;
    if (chosen === 'codex') return projectKitOf(person, cmd, 'codex');
    const claude = await projectKitOf(person, cmd, 'claude');
    if (chosen) return claude;
    const codex = claude?.newThread?.defaultEngine === 'codex' || !claude ? await projectKitOf(person, cmd, 'codex') : null;
    const usual = (claude ?? codex)?.newThread?.defaultEngine ?? 'claude';
    return usual === 'codex' ? codex : claude;
  }

  async function startNewRun(person, cmd, itemId, tries) {
    const project = await newThreadKitFor(person, cmd);
    if (!project) return null;
    const p = cmd.payload ?? {};
    const why = newThreadLeft(p, project);
    if (why) { once(`new:${why}`, `phone: a new thread is left to its computer: ${why}`); return null; }
    const title = titleOf(p);
    const body = String(p.body ?? '');
    // Her files go with her ask; the brief links them where the sandbox puts them.
    const sendable = await phoneFilesFor(person, cmd, body, project.docs);
    if (!sendable) return null;
    const filled = fillNewThreadKit(project, { itemId, title, body: sendable.said });
    if (!filled) { once('new-fill', 'phone: a new-thread kit could not be filled, so the thread is left to its computer'); return null; }
    const free = await room(person);
    if (!free.ok) { once(`room:${free.error}`, `phone: no room to start a new thread in the cloud (${free.error})`); return null; }
    const runId = crypto.randomUUID();
    const claim = cloudClaim(runId);
    if (!(await db.claim(cmd.id, claim, iso(now())))) return null;
    const { kit } = filled;
    const rec = {
      runId, sessionId: cloudSessionId(itemId, runId), owner: person, device: cmd.device, project: cmd.project, item: itemId,
      startedAt: now(), kitMadeAt: project.madeAt, frame: kit.frame, state: 'open', newThread: true, docs: kit.docs ?? null,
      turns: [{ command: cmd.id, reply: null, repliedAt: cmd.created_at }], sent: 0, relayed: 0, cursor: 0, partial: '',
    };
    const giveBack = async (reason) => {
      try { await db.giveBack(cmd.id, claim); } catch (err) { log(`phone: could not give back the claim on ${cmd.id}: ${err?.message || err}`); }
      await failed(person, cmd, tries, reason);
      return null;
    };
    let answer;
    try {
      const payload = await startPayload(kit, {
        runId,
        getUrl: (k) => links.get(scopedKey(person, k), LINK_SECONDS),
        putUrl: (k) => links.put(scopedKey(person, k), LINK_SECONDS),
        loginName: (k) => `${LOGIN_NAME}${k}`,
        kept: kit.kept ?? null,
        endTurn: null,
        // Started here, so no computer is there from its first moment.
        away: true,
        refs: filled.refs,
      });
      payload.files = [...payload.files, ...sendable.files];
      answer = await start(person, rec.sessionId, payload);
    } catch (err) {
      return giveBack(err?.error || 'cloud');
    }
    if (!answer?.ok) return giveBack(answer?.error || 'no answer');
    // A fresh thread's command line carries the cloud's note; its first message is the brief.
    // A Codex one's start carries the note, and its brief goes once the start has named the thread.
    const data = kit.engine === 'codex'
      ? firstInput(rec, kit, null, { firstPrompt: filled.prompt })
      : Buffer.from(cloudUserLine(filled.prompt, { note: kit.note ?? null, uuid: crypto.randomUUID() })).toString('base64');
    if (!(await send(rec, { action: 'stdin', n: 1, data }))) {
      await stop(person, rec.sessionId).catch(() => {});
      return giveBack('her ask did not reach the run');
    }
    rec.sent = 1;
    await save(rec);
    try { await db.newThread(person, cmd.device, cmd.project, itemId, newThreadSnapshot({ itemId, title, body, at: Date.parse(cmd.created_at) || now() })); } catch (err) {
      once('new-copy', `phone: could not write a new thread's copy for the phone: ${err?.message || err}`);
    }
    const forComputer = { runId, sessionId: rec.sessionId, command: cmd.id, device: cmd.device, project: cmd.project, item: itemId, new: { title, body }, repliedAt: cmd.created_at, startedAt: rec.startedAt, kitMadeAt: project.madeAt };
    try { await runFiles.put(scopedKey(person, serverRunKey(runId)), JSON.stringify(forComputer)); } catch (err) { once('record', `phone: could not leave the run's record for the computer: ${err?.message || err}`); }
    log(`phone: started new thread ${itemId} in the cloud as ${runId}`);
    return rec;
  }

  async function considerNew(cmd, open) {
    const person = String(cmd.owner || '').toLowerCase();
    if (!PERSON.test(person) || cmd.item) return 'left';
    const itemId = madeHere(cmd.id);
    if (open.has(threadOf({ owner: person, device: cmd.device, project: cmd.project, item: itemId }))) return 'left';
    const tries = await readJson(tryKey(person, cmd.id));
    if (tries && (tries.n >= PHONE_TRIES || now() - tries.at < TRY_AGAIN_MS)) return 'left';
    // A computer that is awake makes the thread within seconds.
    if (now() - Date.parse(cmd.created_at) < CLOUD_TAKES_AFTER_MS) return 'left';
    const made = await startNewRun(person, cmd, itemId, tries);
    if (!made) return 'left';
    open.set(threadOf(made), made);
    return 'started';
  }

  async function consider(cmd, open) {
    if (cmd.kind === 'new') return considerNew(cmd, open);
    const person = String(cmd.owner || '').toLowerCase();
    const text = cmd.payload?.text;
    if (!PERSON.test(person) || typeof text !== 'string' || !text.trim() || !cmd.item) return 'left';
    const tries = await readJson(tryKey(person, cmd.id));
    if (tries && (tries.n >= PHONE_TRIES || now() - tries.at < TRY_AGAIN_MS)) return 'left';
    const rec = open.get(threadOf({ owner: person, ...cmd }));
    if (rec) return follow(rec, cmd, text, tries);
    // A computer that is awake claims a reply within seconds.
    if (now() - Date.parse(cmd.created_at) < CLOUD_TAKES_AFTER_MS) return 'left';
    const made = await startRun(person, cmd, text, tries);
    if (!made) return 'left';
    open.set(threadOf(made), made);
    return 'started';
  }

  async function closeIfIdle(rec) {
    if (rec.state !== 'open' || rec.joined || rec.closedAt || busy(rec) || !rec.lastTurnEndedAt || cardsWaiting(rec)) return;
    if (now() - rec.lastTurnEndedAt < IDLE_CLOSE_MS) return;
    const n = rec.sent + 1;
    if (!(await send(rec, { action: 'stdin', n, end: true }))) { once(`close:${rec.runId}`, `phone: could not close cloud run ${rec.runId}; tried again next minute`); return; }
    rec.sent = n;
    rec.closedAt = now();
    await save(rec);
  }

  /** A run this server started has ended: what it said goes to the phone, once. */
  async function runEnded(person, runId) {
    const rec = normal(await readJson(openKey(person, runId)));
    if (!rec || rec.state !== 'open') return false;
    try { await objects.put(endedKey(person, runId), JSON.stringify({ at: now() }), { ifNoneMatch: '*' }); } catch (err) {
      if (err?.conflict) return false;
      throw err;
    }
    try {
      if (rec.joined || (await joined(rec))) {
        // Its computer brought it home and has the thread now.
        await objects.del(openKey(person, runId));
        return true;
      }
      const events = await readFile(scopedKey(person, runKey(runId, 'events.jsonl')));
      const answers = rec.codex ? codexAnswersIn(events, { resumeId: rec.codex.resumeId, turnIds: [...rec.codex.read.turnIds] }) : answersIn(events);
      while (rec.relayed < rec.turns.length) await relayTurn(rec, answerText(answers[rec.relayed]));
      rec.state = 'ended-not-home';
      rec.endedAt = now();
      await save(rec);
      return true;
    } catch (err) {
      // The sweep comes back to it.
      await objects.del(endedKey(person, runId)).catch(() => {});
      log(`phone: could not finish cloud run ${runId}: ${err?.message || err}`);
      return false;
    }
  }

  // A record from before runs took more than one reply.
  function normal(rec) {
    if (!rec) return null;
    return {
      state: 'open', sent: 1, relayed: 0, cursor: 0, partial: '',
      turns: rec.turns ?? [{ command: rec.command, reply: rec.reply, repliedAt: rec.repliedAt }],
      ...rec,
    };
  }

  async function sweep() {
    const t = now();
    const out = { looked: 0, started: 0, sent: 0, ended: 0 };
    // Every run the server holds, by thread: relayed, let go once home.
    const open = new Map();
    for (const key of await objects.list('ledger/phone/open/')) {
      const m = /^ledger\/phone\/open\/([0-9a-f-]{36})\/([^/]+)\.json$/.exec(key);
      if (!m) continue;
      try {
        const rec = normal(await readJson(key));
        if (!rec) continue;
        if (rec.state === 'ended-not-home') {
          if (await joined(rec)) { await objects.del(key); continue; }
          if (t - rec.endedAt > NOT_HOME_KEPT_MS) { await objects.del(key); log(`phone: cloud run ${rec.runId} never came home; the cloud may start its thread again`); continue; }
        } else if (!rec.joined && (await joined(rec))) {
          rec.joined = true;
          await save(rec);
        } else if (!rec.joined) {
          await relay(rec);
        }
        open.set(threadOf(rec), rec);
      } catch (err) {
        log(`phone: cloud run ${m[2]} was passed: ${err?.message || err}`);
      }
    }
    let rows = [];
    try { rows = await db.waitingReplies({ after: t - CLOUD_TAKES_UNTIL_MS, before: t, limit: PER_SWEEP }) ?? []; } catch (err) {
      once(`list:${err?.message}`, `phone: could not read the phones' replies: ${err?.message || err}`);
    }
    out.looked = rows.length;
    for (const cmd of rows) {
      try {
        const did = await consider(cmd, open);
        if (did === 'started') out.started += 1;
        if (did === 'sent') out.sent += 1;
      } catch (err) { log(`phone: reply ${cmd?.id} was passed: ${err?.message || err}`); }
    }
    let answers = [];
    try { answers = await db.waitingApprovals?.({ limit: PER_SWEEP }) ?? []; } catch (err) {
      once(`answers:${err?.message}`, `phone: could not read the phones' answers to cards: ${err?.message || err}`);
    }
    for (const cmd of answers) {
      try { await answerCard(cmd, open); } catch (err) { log(`phone: answer ${cmd?.id} was passed: ${err?.message || err}`); }
    }
    for (const rec of new Set(open.values())) {
      try {
        await closeIfIdle(rec);
        // An end whose notice was missed.
        if (rec.state === 'open' && t - rec.startedAt >= END_LOOK_AFTER_MS && (await objects.head(`runs/u-${rec.owner}/${rec.runId}/done.json`).catch(() => null))) {
          if (await runEnded(rec.owner, rec.runId)) out.ended += 1;
        }
      } catch (err) { log(`phone: cloud run ${rec.runId} was passed: ${err?.message || err}`); }
    }
    return out;
  }

  return { sweep, runEnded };
}
