// HER MAC'S SIDE OF THE PHONE WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md, step 1).
//
// For each project she put on her phone, this writes a readable copy of every
// thread worth carrying (shared/phone-snapshot.mjs) to her own rows in the
// cloud, and takes the commands her phone left while the Mac was away: a
// reply, a new thread, a snooze, a close. Each command goes through the very
// handler the window uses for the same thing, so a reply from the phone is a
// reply, with everything a reply does. Then it is marked taken, which is what
// turns "Waiting for your computer" on her phone into done.
//
// THIS COMPUTER IS ONE DEVICE (Codex's review of step 1, finding 4). Its
// projects online carry its own id, and it takes only the commands left on
// them, so a second computer signed into the same account neither takes this
// one's commands nor overwrites a project that happens to share a name. The id
// belongs to this installation and this store together (main/main.mjs
// phoneDevice), so a store copied to another computer gets another id
// (second review, finding 7).
//
// EVERYTHING IT SENDS IS SENT AS ONE PERSON (second review, finding 1). The
// inbox is made for whoever is signed in, names them on every write, and asks
// `alive()` before each one: once she signs out, a pass already running stops
// rather than carrying her projects into whoever signs in next.
//
// A COMMAND IS DONE ONCE (finding 3). Before it is done, that it is being done
// is written down here, and what it writes carries the command's own id
// (`fromPhone`). If this computer stopped half way, the next pass looks for a
// line or a row with that id before doing it again (second and third reviews:
// matching the words, or the moment, took an earlier "yes" for a second one).
// Closing and snoozing are the same twice over. Once done,
// the outcome is kept here before the cloud is told, so a mark that fails is
// retried and the command never runs twice. One that cannot be done is marked
// with why.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { threadSnapshot, threadsWorthCarrying, snapshotKey, checkCommand, madeHere, hideSecrets, bytesOf, phoneChoices, phoneApproval, phoneRepeatsOf, phoneTeammatesOf, SNAPSHOT_LIMITS, TEAMMATES_LIMITS } from '../shared/phone-snapshot.mjs';
import { phoneSettingsOf, settingRoute } from '../shared/phone-settings.mjs';
import { createPhoneUploads, UPLOAD_LIMITS } from './phone-uploads.mjs';
import { createPhoneAlerts } from './phone-alerts.mjs';
import { PHONE_FILES_MAX, phoneFilesIn, phoneFileSafeName, phoneAttachmentRel } from '../shared/phone-files.mjs';
import { runOfClaim, cloudCard } from '../shared/cloud-kit.mjs';
import { isCarried } from '../shared/cloud-carry.mjs';
import { heldForUndo } from '../shared/phone-undo.mjs';

// A file her phone sent with a reply or a new thread (shared/phone-files.mjs).
export { phoneFilesIn };
const HEARTBEAT_MS = 30_000;
const SETTINGS_HEARTBEAT_MS = 5 * 60_000;
// Under phone_settings' own check (20261023000000_phone_settings.sql), with room for the row's JSON to differ.
const SETTINGS_MAX_BYTES = 190_000;
class Refused extends Error {}

// How long a thread started on the phone is remembered as the row it became:
// long past any reply still waiting for it (second review, finding 8).
const MADE_KEPT_MS = 60 * 24 * 3600_000;
// A copy the cloud would not take is tried again, less and less often.
const RETRY_MS = [60_000, 5 * 60_000, 30 * 60_000, 3600_000];
// A running thread's step goes up at most this often, and its copy is sent
// again this often while it runs, so a phone can tell a Mac that went to sleep
// mid-run (cloud-bridge.ts LIVE_FOR_MS) from one still working.
const STEP_EVERY_MS = 30_000;
const STILL_RUNNING_MS = 2 * 60_000;
const SWEEP_EVERY_MS = 3600_000;
// How far back a computer looks for runs the cloud started for it, and how
// long it remembers one it made its own: past the bucket's week of results.
const ADOPT_WITHIN_MS = 7 * 24 * 3600_000;
const ADOPTED_KEPT_MS = 8 * 24 * 3600_000;
const ADOPT_TRIES = 3;
// Reading the settings parses Codex's model cache (199KB) on a Mac with both agents.
const SETTINGS_EVERY_MS = 60_000;

export class SignedOut extends Error {}

export function createPhoneInbox({
  backend,
  // Who this inbox sends as, and whether they still are.
  owner,
  alive = () => true,
  // This computer's id online; made here and kept with the rest when none is given.
  device: given = null,
  // The projects on her phone, read fresh each pass: [{ slug, name, dir?, repoPath? }].
  projects,
  listItems, // (slug) -> folded rows
  historyOf, // (slug, id, { all }) -> the thread's history lines (store.readHistory); all of them when asked
  apply, // async (command) -> the handler's answer; throws to refuse
  stateFile,
  home = os.homedir(),
  now = Date.now,
  // How long a phone send her Undo can take back is left alone (shared/phone-undo.mjs).
  // The app passes PHONE_UNDO_HOLD_MS; none takes each one on sight.
  undoHoldMs = 0,
  log = () => {},
  // How a thread's copy is made; a test counts the calls.
  build = threadSnapshot,
  // (slug, id) -> { since, where: 'mac' | 'cloud', doing: [{ label, startedAt }] } while an agent runs on it, else null.
  liveOf = () => null,
  // () -> { byId: { [id]: { state, tool?, until? } }, paused } (shared/phone-snapshot.mjs phoneWaitsOf),
  // why each thread nothing runs on is waiting, read once a pass; none says nothing.
  waitsOf = () => null,
  // The permission cards waiting on her, each with the fingerprint of the card as drawn: [{ ...request, card }].
  approvalsOf = () => [],
  // async () -> the window's settings model (main/settings.mjs readSettings); none sends no settings.
  readSettings = null,
  // () -> { [threadId]: true }, the threads pinned on this computer.
  pinsOf = () => ({}),
  // () -> every project's repeating tasks (store.listRepeats); they ride with the settings.
  repeatsOf = null,
  // () -> the teammates view (main/teammates.mjs `view`) while they are on, else null; it rides with the settings too.
  teammatesOf = null,
  version = '',
  // This computer as her phone names it.
  name = os.hostname().replace(/\.local$/i, ''),
  // How long since she last touched this Mac; none sends no alerts (main/phone-alerts.mjs).
  idleMs = null,
  // How an alert reaches Expo; a test stands in for it.
  sendPush,
  // And how a Web Push reaches the web app; a test stands in for it too.
  sendWebPush,
  // THE PHONE WITH THE LID SHUT (shared/cloud-kit.mjs). Told which projects
  // are on her phone each pass; asked whether this computer leaves its
  // threads ready for the cloud (said on the project); and handed each run
  // the cloud server started for a reply, to make it the thread's own
  // (Supervisor#adoptCloudRun): 'adopted', 'no-kit' or 'busy'.
  carrying = null,
  kitsFor = null,
  adopt = null,
  // A reply the server fed a run after this computer took it; whether that run is home.
  cloudReplies = null,
  runHome = null,
  // A NEW THREAD the cloud started from the phone with the lid shut: asked
  // each pass to keep the projects' new-thread kits, and handed each such run
  // to make its row and folder and join it (Supervisor#adoptCloudNewThread).
  newThreadKits = null,
  adoptNew = null,
  // THE MAC'S OWN ROWS WITH THE LID SHUT (shared/cloud-carry.mjs): whether it
  // is in a dark wake, the rows it would have started, and the supervisor told
  // of each hand-over written and each taken back.
  asleep = () => false,
  toCarry = null,
  handedOver = () => {},
  takenBack = () => {},
  // Every pass, the commands of runs it has finished joining, so a hand-over
  // still held for one of them is let go (Supervisor#carriedFinished).
  carriedFinished = () => {},
}) {
  const state = readState(stateFile);
  const save = () => writeState(stateFile, state);
  if (!given && !state.device) { state.device = crypto.randomBytes(6).toString('hex'); save(); }
  const device = given ?? state.device;
  if (!/^[0-9a-f]{12}$/.test(device)) throw new Error('a computer id is twelve hex digits');
  // WHAT WAS SENT WAS SENT AS ONE COMPUTER (Codex's third review, finding 2).
  // Under another id (a store copied here, or the id made a new way) nothing
  // is online yet, so it all goes again; the other id's rows are that
  // computer's, and are left to it.
  // Which rows the phone's new threads became is about this store, not the
  // id, and is kept (Codex's fourth review, finding 3).
  if (state.forDevice !== device) {
    state.forDevice = device;
    state.sent = {};
    state.failed = {};
    state.uploaded = {};
    save();
  }
  const still = () => { if (!alive()) throw new SignedOut('signed out'); };
  // The files threads name, when this cloud can hold them (main/phone-uploads.mjs).
  const uploads = backend.putPhoneFile ? createPhoneUploads({ backend, owner, device, alive, state, save, home, now, log }) : null;
  const alerts = idleMs && backend.pushDevices ? createPhoneAlerts({ backend, owner, device, state, save, now, log, idleMs, send: sendPush, sendWebPush, still }) : null;
  let swept = 0;
  const homeWritten = (p) => (p && home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p ?? null);

  // WHAT EACH THREAD'S COPY WAS LAST BUILT FROM, so a pass skips building the
  // copies of threads that did not change. Building them is the costly part of
  // a pass (261 of 361 ms for 300 threads of the real agentbox-team ledger,
  // 2026-10-14), and it runs on the thread that draws the window every few
  // seconds. A copy is made of the row and its lines and nothing else, so the
  // same row and lines make the same copy.
  const built = new Map();
  const inputsOf = (item, history) => crypto.createHash('sha1').update(JSON.stringify(item)).update('\0').update(JSON.stringify(history)).digest('base64');
  // What each running thread's copy last said about the run, by thread.
  const lives = new Map();
  const liveNow = (sk, slug, id) => {
    let raw = null;
    try { raw = liveOf(slug, id); } catch { /* the supervisor's trouble, not the phone's */ }
    if (!raw) { lives.delete(sk); return null; }
    const doing = (Array.isArray(raw.doing) ? raw.doing : []).slice(0, 3).map((d) => {
      const label = hideSecrets(String(d?.label ?? ''), { home }).replace(/\s+/g, ' ').trim();
      return { label: label.length > 160 ? `${label.slice(0, 159)}…` : label, startedAt: Number(d?.startedAt) || now() };
    });
    const was = lives.get(sk);
    const movable = raw.where !== 'cloud' && raw.movable === true;
    const sameRun = was && was.since === raw.since && was.where === raw.where && !!was.movable === movable;
    const runId = raw.runId ?? (sameRun ? was.runId : undefined);
    const same = sameRun && was.runId === runId;
    const steps = (l) => JSON.stringify(l.doing.map((d) => d.label));
    if (same && now() - was.at < STEP_EVERY_MS) return was;
    if (same && now() - was.at < STILL_RUNNING_MS && steps(was) === steps({ doing })) return was;
    const live = { since: Number(raw.since) || now(), where: raw.where === 'cloud' ? 'cloud' : 'mac', doing, at: now(), ...(movable ? { movable } : {}),
      ...(raw.where === 'cloud' && /^[A-Za-z0-9._-]{1,120}$/.test(runId ?? '') ? { runId } : {}),
    };
    lives.set(sk, live);
    return live;
  };
  // The window gets a turn between projects and every few threads: 300 threads
  // of one project in one go held it for up to half a second.
  const breathe = () => new Promise((resolve) => setImmediate(resolve));
  const THREADS_PER_TURN = 20;

  const beats = new Map();
  async function publish() {
    let sent = 0;
    const chosen = projects();
    try { carrying?.({ device, slugs: chosen.map((p) => p.slug) }); } catch { /* the supervisor's trouble, not the phone's */ }
    try { newThreadKits?.({ device, slugs: chosen.map((p) => p.slug) }); } catch { /* the supervisor's trouble, not the phone's */ }
    let asks = [];
    try { asks = approvalsOf() ?? []; } catch { /* the cards' trouble, not the phone's */ }
    let waits = null;
    try { waits = waitsOf(); } catch { /* the supervisor's trouble, not the phone's */ }
    const waitOf = (item) => waits?.byId?.[item.id] ?? (waits?.paused && item.status !== 'done' ? { state: 'paused' } : null);
    const known = new Set(chosen.map((p) => p.slug));
    let pins = {};
    try { pins = pinsOf() ?? {}; } catch { /* the supervisor's trouble, not the phone's */ }
    for (const p of chosen) {
      await breathe();
      const key = `project:${p.slug}`;
      let cloud = false;
      try { cloud = !!kitsFor?.(p.slug); } catch { /* says no */ }
      const said = cloud ? `${p.name}\0cloud` : p.name;
      // Renew presence even when no threads changed.
      if (state.sent[key] !== said || !(now() - (beats.get(key) ?? -Infinity) < HEARTBEAT_MS)) {
        still();
        await backend.putPhoneProject({ owner, device, project: p.slug, name: p.name, ...(kitsFor ? { cloud } : {}) });
        beats.set(key, now());
        if (state.sent[key] !== said) { state.sent[key] = said; save(); }
      }
      const rows = threadsWorthCarrying(listItems(p.slug), { now: now() });
      const batch = [];
      const here = new Set();
      for (const raw of rows) {
        const item = pins[raw.id] === true ? { ...raw, pinned: true } : raw;
        if (here.size && here.size % THREADS_PER_TURN === 0) await breathe();
        here.add(item.id);
        const sk = `${p.slug}:${item.id}`;
        const history = historyOf(p.slug, item.id);
        const inputs = inputsOf(item, history);
        const live = liveNow(sk, p.slug, item.id);
        const waitingOn = asks.filter((a) => a.product === p.slug && a.item === item.id && a.card).map((a) => phoneApproval(a, a.card, { home }));
        const askKey = JSON.stringify(waitingOn);
        const wait = waitOf(item);
        const waitKey = wait ? JSON.stringify(wait) : '';
        const was = built.get(sk);
        // Only the run or its files moved: the copy of the row and its lines is the one already made.
        let base = was?.inputs === inputs ? was.base : null;
        const made = () => (base ??= build(item, history, SNAPSHOT_LIMITS, { home }));
        const files = uploads && p.dir ? uploads.manifest(sk, made, { dir: p.dir, repoPath: p.repoPath, updatedAt: item.updatedAt ?? 0, base: inputs }) : null;
        if (was && was.inputs === inputs && was.live === live && was.files === files && was.askKey === askKey && was.waitKey === waitKey && state.sent[sk] === was.key) continue;
        let snap = live ? { ...made(), live } : made();
        if (waitingOn.length) snap = { ...snap, approvals: waitingOn };
        if (wait) snap = { ...snap, wait };
        // Where the files are on this Mac, written from her home as the words are, so the phone can follow a path the words give in full.
        if (files) {
          const attached = { dir: homeWritten(p.dir), ...(p.repoPath ? { repo: homeWritten(p.repoPath) } : {}), ...files };
          if (bytesOf(snap) + bytesOf(attached) < SNAPSHOT_LIMITS.bytes) snap = { ...snap, attached };
        }
        const k = snapshotKey(snap);
        built.set(sk, { inputs, key: k, live, files, askKey, waitKey, base: live || files || waitingOn.length || wait ? base : null });
        if (state.sent[sk] === k) continue;
        const failed = state.failed[sk];
        if (failed && failed.key === k && now() < failed.next) continue;
        batch.push({ item: item.id, snapshot: snap, key: k });
      }
      sent += await sendAll(p.slug, batch);
      // Threads no longer carried (archived long ago, or gone) leave the phone.
      const gone = Object.keys(state.sent).filter((k) => k.startsWith(`${p.slug}:`) && !here.has(k.slice(p.slug.length + 1)));
      if (gone.length) {
        still();
        await backend.dropPhoneThreads(device, p.slug, gone.map((k) => k.slice(p.slug.length + 1)), owner);
        for (const k of gone) { delete state.sent[k]; delete state.failed[k]; delete state.alerted[k]; built.delete(k); }
        save();
      }
    }
    // A project taken off her phone takes its threads with it.
    for (const k of Object.keys(state.sent).filter((k) => k.startsWith('project:') && !known.has(k.slice(8)))) {
      const slug = k.slice(8);
      still();
      await backend.dropPhoneProject(device, slug, owner);
      for (const t of Object.keys(state.sent).filter((t) => t.startsWith(`${slug}:`))) { delete state.sent[t]; built.delete(t); }
      for (const t of Object.keys(state.failed).filter((t) => t.startsWith(`${slug}:`))) delete state.failed[t];
      delete state.sent[k];
      save();
    }
    uploads?.kick();
    if (uploads && now() - swept > SWEEP_EVERY_MS) { swept = now(); try { await uploads.sweep(); } catch (err) { log(`phone: could not clear old files: ${err?.message ?? err}`); } }
    return sent;
  }

  // THIS COMPUTER'S SETTINGS FOR HER PHONE'S SETTINGS PAGES. A failure waits
  // for the next read, a minute on, and is said once until it changes.
  const settings = { readAt: -Infinity, sentAt: -Infinity, key: null, trouble: null };
  const computer = String(name || 'This computer').slice(0, 200);
  const troubled = (what, err) => {
    const line = `phone: could not ${what} your settings: ${err?.message ?? err}`;
    if (settings.trouble !== line) log(line);
    settings.trouble = line;
  };
  async function publishSettings(soon) {
    if (!readSettings || !backend.putPhoneSettings) return false;
    if (!soon && now() - settings.readAt < SETTINGS_EVERY_MS) return false;
    settings.readAt = now();
    let carried = null;
    try { carried = phoneSettingsOf(await readSettings(), { version }); } catch (err) { troubled('read', err); return false; }
    if (!carried) return false;
    if (repeatsOf) {
      try { carried = { ...carried, repeats: phoneRepeatsOf(repeatsOf(), projects().map((p) => p.slug), { home }) }; } catch (err) { troubled('read the repeating tasks for', err); }
    }
    if (teammatesOf) {
      try {
        // Only the room the rest leaves under the cloud's 200KB check, so they can never cost the settings their copy.
        const room = Math.min(TEAMMATES_LIMITS.bytes, SETTINGS_MAX_BYTES - bytesOf(carried));
        const mates = room > 0 ? phoneTeammatesOf(teammatesOf(), { home, limits: { ...TEAMMATES_LIMITS, bytes: room } }) : null;
        if (mates && bytesOf(mates) <= room) carried = { ...carried, teammates: mates };
      } catch (err) { troubled('read the teammates for', err); }
    }
    const key = JSON.stringify(carried);
    if (key === settings.key && now() - settings.sentAt < SETTINGS_HEARTBEAT_MS) return false;
    still();
    try {
      await backend.putPhoneSettings({ owner, device, name: computer, settings: carried });
    } catch (err) {
      if (err instanceof SignedOut) throw err;
      troubled('send', err);
      return false;
    }
    Object.assign(settings, { key, sentAt: now(), trouble: null });
    return true;
  }

  // In one go when it can; one at a time when the cloud refuses the lot, so
  // a thread it will not take never holds up the others (finding 9). A copy
  // that fails is NOT counted as sent: it is tried again, later each time
  // (second review, finding 5), and at once when it changes.
  async function sendAll(slug, batch) {
    if (!batch.length) return 0;
    const sk = (b) => `${slug}:${b.item}`;
    try {
      still();
      await backend.putPhoneThreads(device, slug, batch.map(({ item, snapshot }) => ({ item, snapshot })), owner);
      for (const b of batch) { state.sent[sk(b)] = b.key; delete state.failed[sk(b)]; }
      save();
      return batch.length;
    } catch (err) {
      if (err instanceof SignedOut) throw err;
      if (batch.length === 1) {
        const b = batch[0];
        const tries = state.failed[sk(b)]?.key === b.key ? state.failed[sk(b)].tries + 1 : 1;
        state.failed[sk(b)] = { key: b.key, tries, next: now() + RETRY_MS[Math.min(tries, RETRY_MS.length) - 1] };
        save();
        log(`phone: could not send ${b.item} (try ${tries}): ${err?.message ?? err}`);
        return 0;
      }
      let n = 0;
      for (const b of batch) n += await sendAll(slug, [b]);
      return n;
    }
  }

  // The command with each file its phone sent saved in the project's
  // attachments, and linked there. A file that is missing or is not what its
  // name says refuses the command; trouble reaching the cloud leaves it for
  // the next pass.
  async function withPhoneFiles(cmd) {
    const field = cmd.kind === 'reply' ? 'text' : cmd.kind === 'new' ? 'body' : null;
    const words = field && typeof cmd.payload?.[field] === 'string' ? cmd.payload[field] : '';
    const found = phoneFilesIn(words);
    if (!found.length) return cmd;
    if (!backend.getPhoneFile) throw new Refused('this computer cannot take files from your phone');
    if (found.length > PHONE_FILES_MAX) throw new Refused(`more than ${PHONE_FILES_MAX} files at once`);
    const dir = projects().find((p) => p.slug === cmd.project)?.dir;
    if (!dir) throw new Refused('this project has no folder for files');
    let out = words;
    for (const f of found) {
      const data = await backend.getPhoneFile({ owner, device, name: f.name });
      if (!data) throw new Refused('a file from your phone did not reach this computer');
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      if (data.length > UPLOAD_LIMITS.fileBytes || f.name !== `${hash}${f.name.slice(64)}`) throw new Refused('a file from your phone was not the one it was sent as');
      // Where the cloud server puts the same file for a turn it runs, so both link one.
      const rel = phoneAttachmentRel(f);
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (!fs.existsSync(abs) || fs.statSync(abs).size !== data.length) fs.writeFileSync(abs, data);
      out = out.replace(f.link, () => `${f.picture ? '!' : ''}[${phoneFileSafeName(f)}](${rel})`);
      // The same file the uploader would send for the thread, already there.
      if (uploads) { state.uploaded[f.name] = { bytes: data.length, named: now() }; save(); }
    }
    return { ...cmd, payload: { ...cmd.payload, [field]: out } };
  }

  // What a command already did, if this computer did it before it stopped:
  // the line or the row that carries the command's own id (`fromPhone`,
  // shared/work-items.mjs). Nothing else counts, however alike its words.
  function landed(cmd, item) {
    if (cmd.kind === 'reply') return historyOf(cmd.project, item, { all: true }).some((l) => l?.patch?.fromPhone === cmd.id) ? item : null;
    if (cmd.kind === 'new') return listItems(cmd.project).find((i) => i.fromPhone === cmd.id)?.id ?? null;
    return null;
  }

  async function takeCommands() {
    const slugs = projects().map((p) => p.slug);
    still();
    const waiting = (await backend.waitingPhoneCommands(device)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    let taken = 0;
    const newCommands = [];
    let changedSettings = false;
    for (const cmd of waiting) {
      still();
      // The cloud started this one with the lid shut; it is joined, never done again (`adoptCloudRuns`).
      if (cmd.claimedBy) continue;
      // This computer's own hand-over: left to the cloud while asleep, and
      // taken back awake, never done as if her phone had sent it.
      if (isCarried(cmd)) {
        if (asleep()) continue;
        const claim = await backend.claimPhoneCommand(cmd.id, owner);
        if (claim === 'cloud') continue;
        if (claim !== 'gone') { still(); await backend.markPhoneCommand(cmd.id, 'done', owner); }
        takenBack({ project: cmd.project, item: cmd.item, command: cmd.id });
        continue;
      }
      // Her answer to a card the cloud put on the phone is the cloud server's to give (cloud/gateway/phone.mjs).
      if (cmd.kind === 'approve' && cloudCard(cmd.payload?.approval)) continue;
      // Still inside the phone's Undo: claimed now, Undo could never win. The next pass takes it.
      if (!state.done[cmd.id] && heldForUndo(cmd, now(), undoHoldMs)) continue;
      let outcome = state.done[cmd.id];
      if (!outcome) {
        // A reply to a thread started on the phone goes to the row it became.
        const item = cmd.item && state.made[cmd.item] ? state.made[cmd.item].id : cmd.item;
        const resolved = { ...cmd, item };
        const why = checkCommand(resolved, { projects: slugs, hasItem: (project, id) => listItems(project).some((i) => i.id === id) });
        if (why) outcome = `refused: ${why}`;
        else {
          // Claimed in the cloud first: after this the phone cannot take it
          // back, and if she already did, it is not done (third review, 3).
          const claim = await backend.claimPhoneCommand(cmd.id, owner);
          const already = claim === 'gone' || claim === 'cloud' ? null : state.doing[cmd.id] || claim === 'ours' ? landed(resolved, item) : null;
          if (claim === 'gone' || claim === 'cloud') {
            delete state.doing[cmd.id];
            save();
            continue;
          }
          if (already) {
            if (cmd.kind === 'new') state.made[madeHere(cmd.id)] = { id: already, at: now() };
            outcome = 'done';
          } else {
            state.doing[cmd.id] = { at: now() };
            save();
            let ready = null;
            try { ready = await withPhoneFiles(resolved); } catch (err) {
              if (err instanceof SignedOut) throw err;
              // The cloud not answering just now: this one waits for the next pass, the rest go on.
              if (!(err instanceof Refused)) { log(`phone: could not take a file for ${cmd.id} yet: ${err?.message ?? err}`); continue; }
              outcome = `refused: ${err.message}`;
            }
            if (ready) {
              try {
                const ownAlerts = cmd.kind === 'setting' && !!alerts?.takesSetting(ready.payload);
                const out = ownAlerts ? await alerts.setting(ready.payload) : await apply(ready);
                if (cmd.kind === 'new' && typeof out?.id === 'string') state.made[madeHere(cmd.id)] = { id: out.id, at: now() };
                if (cmd.kind === 'setting' && !ownAlerts) changedSettings = true;
                outcome = 'done';
              } catch (err) {
                outcome = `refused: ${String(err?.message || err).slice(0, 200)}`;
              }
            }
          }
        }
        // Remembered here before the cloud is told, so a failed mark never
        // means a second reply.
        state.done[cmd.id] = outcome;
        delete state.doing[cmd.id];
        for (const [k, v] of Object.entries(state.made)) if (!(now() - (v?.at ?? 0) < MADE_KEPT_MS)) delete state.made[k];
        save();
      }
      if (cmd.kind === 'new' && outcome === 'done' && state.made[madeHere(cmd.id)]?.id) {
        newCommands.push({ id: cmd.id, project: cmd.project, item: state.made[madeHere(cmd.id)].id });
        continue;
      }
      still();
      await backend.markPhoneCommand(cmd.id, outcome, owner);
      delete state.done[cmd.id];
      save();
      taken += 1;
    }
    return { taken, changedSettings, newCommands };
  }

  // RUNS THE CLOUD STARTED WHILE THIS COMPUTER WAS SHUT, made the threads'
  // own once each, with every reply the run took (a run stays open for her
  // follow-ups, so several commands share one claim): her replies go on the
  // row in order and the run is joined or brought home
  // (Supervisor#adoptCloudRun). A reply the server fed it after that goes on
  // the row too. Its commands are marked taken once it is home. A run that
  // cannot be made its own after a few tries is said once and let go.
  const adoptTrouble = new Set();
  const sayOnce = (kind, line) => { if (!adoptTrouble.has(kind)) log(line); adoptTrouble.add(kind); };
  async function adoptCloudRuns() {
    if (!adopt || !backend.cloudPhoneCommands) return 0;
    still();
    const claimed = (await backend.cloudPhoneCommands(device, new Date(now() - ADOPT_WITHIN_MS).toISOString()))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const runs = new Map();
    for (const cmd of claimed) {
      const runId = runOfClaim(cmd.claimedBy);
      if (!runId) continue;
      if (!runs.has(runId)) runs.set(runId, []);
      runs.get(runId).push(cmd);
    }
    let n = 0;
    for (const [runId, cmds] of runs) {
      still();
      const rec = state.adopted[runId] ?? { at: now(), tries: 0, placed: [], marked: [] };
      if (rec.over) continue;
      const first = cmds[0];
      const project = first.project;
      // A run the cloud started for a new thread runs under the id the phone gave it.
      const started = first.kind === 'new' ? first : null;
      // One this computer handed over runs under the row's own.
      const handed = first.kind === 'run-now' && isCarried(first) ? first : null;
      const item = started ? madeHere(started.id) : first.item && state.made[first.item] ? state.made[first.item].id : first.item;
      const fresh = cmds.filter((c) => c.kind === 'reply' && !rec.placed.includes(c.id));
      const replies = [];
      // A reply this computer handed over is on the row already.
      for (const c of fresh.filter((x) => !isCarried(x))) {
        let text = typeof c.payload?.text === 'string' ? c.payload.text : '';
        try { text = (await withPhoneFiles({ ...c, item })).payload.text; } catch (err) { if (err instanceof SignedOut) throw err; }
        replies.push(text);
      }
      if (!rec.done) {
        let out = 'not-a-reply';
        if (started && adoptNew) {
          const p = started.payload ?? {};
          const title = String(p.title ?? '').trim() || String(p.body ?? '').trim().split('\n')[0].slice(0, 200);
          // Its files saved here where the cloud put them, so the row links them.
          let body = String(p.body ?? '');
          try { body = (await withPhoneFiles({ ...started, kind: 'new' })).payload.body ?? body; } catch (err) { if (err instanceof SignedOut) throw err; }
          // An agent in the cloud already took it, so Auto has nobody left to pick.
          const { labels: _auto, ...choices } = phoneChoices('new', p);
          try { out = await adoptNew({ project, item, runId, title, body, command: started.id, replies, choices }); } catch (err) {
            out = 'failed';
            sayOnce(`adopt:${err?.message}`, `phone: could not take in the new thread the cloud started (${item}): ${err?.message ?? err}`);
          }
        } else if (handed && adoptNew) {
          const p = handed.payload ?? {};
          const repeat = p.repeat && typeof p.repeat.rule === 'string' && typeof p.repeat.key === 'string' ? { repeat: { rule: p.repeat.rule, key: p.repeat.key } } : {};
          try { out = await adoptNew({ project, item, runId, title: String(p.title ?? ''), body: String(p.body ?? ''), command: handed.id, replies, carried: true, choices: p.engine ? { engine: p.engine } : {}, ...repeat }); } catch (err) {
            out = 'failed';
            sayOnce(`adopt:${err?.message}`, `phone: could not join the cloud's run for ${item}: ${err?.message ?? err}`);
          }
        } else if (item && fresh.length) {
          const carried = fresh.some(isCarried) ? { carried: true } : {};
          try { out = await adopt({ project, item, runId, replies, commands: fresh.map((c) => c.id), ...carried }); } catch (err) {
            out = 'failed';
            sayOnce(`adopt:${err?.message}`, `phone: could not join the cloud's run for ${item}: ${err?.message ?? err}`);
          }
        }
        if (out === 'busy') { sayOnce(`busy:${runId}`, `phone: the cloud's run for ${item} waits for other cloud work to come home first`); continue; }
        rec.tries += 1;
        if (out === 'failed' && rec.tries < ADOPT_TRIES) { state.adopted[runId] = rec; save(); continue; }
        if (out === 'no-kit') sayOnce(`kit:${runId}`, `phone: no kit here for ${item}, so her reply runs on this computer`);
        Object.assign(rec, { at: now(), done: true, home: out !== 'adopted' });
        rec.placed.push(...fresh.map((c) => c.id));
        n += 1;
      } else if (fresh.length && item) {
        if (replies.length) {
          try { await cloudReplies?.({ project, item, runId, replies }); } catch (err) { sayOnce(`late:${runId}`, `phone: could not put a late reply on ${item}: ${err?.message ?? err}`); }
        }
        rec.placed.push(...fresh.map((c) => c.id));
      }
      if (!rec.home) {
        try { rec.home = !runHome || !!runHome({ project, item, runId }); } catch { rec.home = false; }
      }
      if (rec.home) {
        for (const c of cmds) {
          if (c.takenAt || rec.marked.includes(c.id)) continue;
          try { still(); await backend.markPhoneCommand(c.id, 'done', owner); rec.marked.push(c.id); } catch (err) { if (err instanceof SignedOut) throw err; sayOnce('mark', `phone: could not mark a cloud reply taken: ${err?.message ?? err}`); }
        }
        if (cmds.every((c) => c.takenAt || rec.marked.includes(c.id))) rec.over = true;
      }
      state.adopted[runId] = rec;
      save();
    }
    for (const [k, v] of Object.entries(state.adopted)) if (!(now() - (v?.at ?? 0) < ADOPTED_KEPT_MS)) delete state.adopted[k];
    // A reply is in `placed`; a fresh row's Run now only in `marked`.
    const finished = [...new Set(Object.values(state.adopted).filter((r) => r?.done).flatMap((r) => [...(r.placed ?? []), ...(r.marked ?? [])]))];
    try { carriedFinished(finished); } catch { /* the supervisor's trouble, not the phone's */ }
    return n;
  }

  // EACH ROW A SLEEPING MAC WOULD HAVE STARTED, written as its own command for
  // the cloud server to start (shared/cloud-carry.mjs). The supervisor is told
  // before the write, so a pass meanwhile cannot write it twice, and told it
  // is taken back when the write fails.
  async function handOver() {
    if (!toCarry || !asleep()) return 0;
    let n = 0;
    for (const { replaces, ...c } of await toCarry()) {
      still();
      // An old hand-over is marked taken first, so the cloud never starts both.
      if (replaces) {
        try {
          const claim = await backend.claimPhoneCommand(replaces, owner);
          if (claim === 'cloud') continue;
          // Already taken, maybe as a run the cloud did: let go rather than hand over twice.
          if (claim === 'gone') { takenBack({ ...c, command: replaces }); continue; }
          await backend.markPhoneCommand(replaces, 'done', owner);
        } catch (err) {
          if (err instanceof SignedOut) throw err;
          sayOnce(`carry-old:${err?.message}`, `phone: could not take back an old hand-over of ${c.item}: ${err?.message ?? err}`);
          continue;
        }
      }
      const id = crypto.randomUUID();
      handedOver({ ...c, command: id });
      try {
        await backend.addPhoneCommand({ id, device, ...c });
        n += 1;
      } catch (err) {
        takenBack({ ...c, command: id });
        if (err instanceof SignedOut) throw err;
        sayOnce(`carry:${err?.message}`, `phone: could not hand ${c.item} to the cloud: ${err?.message ?? err}`);
      }
    }
    return n;
  }

  // A thread's row when its copy is on the phone, each project read once a pass.
  let alertTrouble = null;
  const carriedNow = () => {
    const rowsOf = new Map();
    return (slug, id) => {
      if (!state.sent[`${slug}:${id}`]) return null;
      if (!rowsOf.has(slug)) rowsOf.set(slug, new Map(listItems(slug).map((i) => [i.id, i])));
      return rowsOf.get(slug).get(id) ?? null;
    };
  };

  return {
    device,
    /** The uploads going on behind the passes; a test waits on them. */
    filesSettled: () => uploads?.kick() ?? Promise.resolve(),
    /** What the desktop's banner was told arrived (main/notify.mjs), and the inbox then: [{ id, product }]. */
    arrivals: (list, needsYou) => alerts?.arrived(list, needsYou),
    async syncOnce() {
      try {
        const commands = await takeCommands();
        let { taken } = commands;
        const { changedSettings, newCommands } = commands;
        let adopted = 0;
        try { adopted = await adoptCloudRuns(); } catch (err) {
          if (err instanceof SignedOut) throw err;
          sayOnce(`read:${err?.message}`, `phone: could not read what the cloud took: ${err?.message ?? err}`);
        }
        const handed = await handOver();
        if (handed) log(`phone: asleep, handed ${handed} to the cloud`);
        const sent = await publish();
        // Removing the phone's waiting copy must follow a successful upload.
        for (const cmd of newCommands) {
          if (!state.sent[`${cmd.project}:${cmd.item}`]) continue;
          still();
          await backend.markPhoneCommand(cmd.id, 'done', owner);
          delete state.done[cmd.id];
          save();
          taken += 1;
        }
        await publishSettings(changedSettings);
        if (alerts) {
          if (taken) alerts.phoneUsed();
          try { await alerts.pass(carriedNow()); alertTrouble = null; } catch (err) {
            if (err instanceof SignedOut) throw err;
            const line = `phone: could not alert: ${err?.message ?? err}`;
            if (line !== alertTrouble) log(line);
            alertTrouble = line;
          }
        }
        if (taken || sent || adopted) log(`phone: took ${taken}, sent ${sent}${adopted ? `, joined ${adopted} from the cloud` : ''}`);
        return { taken, sent, adopted };
      } catch (err) {
        if (err instanceof SignedOut) return { taken: 0, sent: 0, stopped: true };
        throw err;
      }
    },
  };
}

// THIS COMPUTER'S ID ONLINE: this installation's own random id, kept in the
// app's own folder and never in the store, joined with which store it runs.
// A store copied to another computer, or restored there, is another device
// (Codex's second review, finding 7); two stores on one computer are two.
export function phoneDevice(appDataDir, storeRoot) {
  const file = path.join(appDataDir, 'phone-install-id');
  let id = null;
  try { id = fs.readFileSync(file, 'utf8').trim(); } catch { /* first time */ }
  if (!/^[0-9a-f]{32}$/.test(id ?? '')) {
    id = crypto.randomBytes(16).toString('hex');
    fs.mkdirSync(appDataDir, { recursive: true });
    fs.writeFileSync(file, id, { mode: 0o600 });
  }
  return crypto.createHash('sha256').update(`${id}\0${path.resolve(storeRoot)}`).digest('hex').slice(0, 12);
}

// A COMMAND, DONE BY THE HANDLER THE WINDOW USES FOR THE SAME THING
// (main/ipc.mjs), reached the way the phone link reaches them: the Map
// main/main.mjs files every channel in. A handler that answers `ok: false`
// turned it down, and that is what the phone is told.
const ROUTES = {
  reply: (c) => {
    const { unschedule, ...picked } = phoneChoices('reply', c.payload);
    return ['zero:answer', { product: c.project, id: c.item, answer: c.payload.text, fromPhone: c.id, ...picked },
      // As the window does: a reply brings a thread put off to a time back now.
      unschedule ? ['zero:schedule', { product: c.project, id: c.item, runAt: 0 }] : null];
  },
  close: (c) => ['zero:answer', { product: c.project, id: c.item, status: 'done' }],
  snooze: (c) => ['zero:snooze', { product: c.project, id: c.item, snoozedUntil: c.payload.until }],
  stop: (c) => ['zero:stop-session', { product: c.project, id: c.item }],
  'run-now': (c) => ['zero:run-now', { product: c.project, id: c.item }],
  'move-to-cloud': (c) => ['zero:move-to-cloud', { ids: [c.item] }],
  'send-now': (c) => ['zero:send-now', { product: c.project, id: c.item }],
  reopen: (c) => ['zero:reopen', { product: c.project, id: c.item }],
  schedule: (c) => ['zero:schedule', { product: c.project, id: c.item, runAt: c.payload.runAt }],
  approve: (c) => ['zero:approve', { id: c.payload.approval, allow: c.payload.allow === true, ...(typeof c.payload.note === 'string' ? { note: c.payload.note } : {}), card: c.payload.card }],
  new: (c) => ['zero:compose', { product: c.project, title: c.payload.title ?? '', body: c.payload.body ?? '', fromPhone: c.id, ...phoneChoices('new', c.payload) }],
};
export function applyThrough(channels) {
  const routeOf = async (cmd) => {
    if (cmd.kind !== 'setting') return ROUTES[cmd.kind]?.(cmd) ?? [];
    const read = channels.get('zero:settings-read');
    if (!read) return [];
    return settingRoute(cmd.payload, await read({ sender: null }));
  };
  return async (cmd) => {
    const [channel, args, then] = await routeOf({ ...cmd, payload: cmd.payload || {} });
    const fn = channel && channels.get(channel);
    if (!fn) throw new Error('this computer cannot do that yet');
    const out = await fn({ sender: null }, args);
    if (out && out.ok === false) throw new Error(out.error || (out.reason ? `the app turned it down (${out.reason})` : 'the app turned it down'));
    // Done already; what follows is tidying, and its trouble is not the command's.
    if (then && channels.get(then[0])) { try { await channels.get(then[0])({ sender: null }, then[1]); } catch { /* the schedule stays */ } }
    return out;
  };
}

function readState(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    const made = {};
    for (const [k, v] of Object.entries(s.made || {})) made[k] = typeof v === 'string' ? { id: v, at: Date.now() } : v;
    return { device: typeof s.device === 'string' && /^[0-9a-f]{12}$/.test(s.device) ? s.device : null, forDevice: s.forDevice ?? null, sent: s.sent || {}, failed: s.failed || {}, done: s.done || {}, doing: s.doing || {}, made, uploaded: s.uploaded && typeof s.uploaded === 'object' ? s.uploaded : {}, alerted: s.alerted && typeof s.alerted === 'object' ? s.alerted : {}, adopted: s.adopted && typeof s.adopted === 'object' ? s.adopted : {}, webAlerts: s.webAlerts && typeof s.webAlerts === 'object' ? s.webAlerts : {} };
  } catch {
    return { device: null, forDevice: null, sent: {}, failed: {}, done: {}, doing: {}, made: {}, uploaded: {}, alerted: {}, adopted: {}, webAlerts: {} };
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
