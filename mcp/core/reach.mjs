// The store tools an agent uses to reach people and see the team's work. A store
// server has no cloud: it reads what the app last wrote about the team, and leaves
// what it wants to say in the outbox for the app to send. Who is speaking comes
// from the run, never an argument.
import fs from 'node:fs';
import path from 'node:path';
import { readOutbox, readTeamView, writeOutbox, newOutId } from '../../main/store/teammates-files.mjs';
import { readItemHistory, readWorkItem, readWorkItems, updateWorkItem } from '../../main/store/work-items.mjs';
import { baseName, carriedNotes, familyOfName, filesInLines, marksOf, nextVersionName, otherFilesInLines, placeWords, reviewKind, shownName, threadFiles } from '../../shared/artifact-marks.mjs';
import { lineGap, mergeThree } from '../../shared/doc-merge.mjs';
import { VIEW_FRESH_MS, groupTurn, mayGoNow, saidToSendTo } from '../../shared/teammate-reach.mjs';
import { CHAT_LABEL, tooLongForAChat } from '../../shared/teammates.mjs';
import { PLAIN_AGENT } from '../../shared/agent-voice.mjs';
import { isTaskRow } from '../../shared/team-rules.mjs';
import { fileKeyIn, folderNamed, foldFolders, readFolderLog, writeFolderLog } from '../../shared/file-folders.mjs';
import { teammateContext } from './teammates.mjs';
import { resolveProduct } from './account.mjs';
import { listProducts } from './products.mjs';
import { MAX_SENT_BYTES, MAX_SENT_MB, sizeWords } from '../../shared/carried-files.mjs';
import { looksSecret } from '../../main/team/carry-files.mjs';

const TEXT_MOST = 8000;

function context(ctx = {}) {
  const c = teammateContext({ ...ctx, outsider: true });
  const now = ctx.now ?? Date.now();
  const view = readTeamView(c.dir);
  if (!view?.me) throw new Error('your owner is not signed in to a team here, so there is nobody to write to');
  return { ...c, view, now, stale: now - (view.at ?? 0) > VIEW_FRESH_MS };
}

function personNamed(name, view) {
  const raw = String(name ?? '').trim().replace(/^@/, '');
  const lower = raw.toLowerCase();
  const others = view.people.filter((p) => p.id !== view.me.id);
  const full = others.filter((p) => p.name.toLowerCase() === lower || p.id === raw);
  const hits = full.length ? full : others.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === lower);
  if (hits.length === 1) return hits[0];
  const everyone = others.map((p) => p.name).join(', ') || 'nobody else yet';
  if (hits.length > 1) throw new Error(`${raw} could be ${hits.map((p) => p.name).join(' or ')}: use the whole name`);
  throw new Error(`nobody on the team is called ${raw || 'that'}. The team: ${everyone}`);
}

/** `person:<name>` in a wait, as the id the lists and the team sync read. */
export function waitsNamed(blockedBy, ctx = {}) {
  if (!blockedBy.some((w) => String(w).startsWith('person:'))) return blockedBy;
  const { view } = context(ctx);
  const owner = view.people.find((p) => p.id === view.me.id);
  return blockedBy.map((w) => {
    if (!String(w).startsWith('person:')) return w;
    const name = String(w).slice('person:'.length).trim();
    const lower = name.toLowerCase();
    if (name === view.me.id || (owner && [owner.name.toLowerCase(), owner.name.toLowerCase().split(/\s+/)[0]].includes(lower))) {
      throw new Error(`${name} is your owner: waiting on them is a question, so ask it in your answer instead`);
    }
    return `person:${personNamed(name, view).id}`;
  });
}

const uniqueById = (list) => [...new Map(list.map((p) => [p.id, p])).values()];

function audience({ to, group, thread }, { view, item }) {
  if (group) {
    const lower = String(group).trim().toLowerCase();
    const room = (view.rooms ?? []).find((r) => r.name.toLowerCase() === lower || r.id === group);
    if (!room) throw new Error(`no group called ${group}. Yours: ${(view.rooms ?? []).map((r) => r.name).join(', ') || 'none'}`);
    return { room: room.id, names: [room.name] };
  }
  if (thread) {
    const ids = [...new Set([...(item.people ?? []), ...(item.visibleTo ?? [])])].filter((p) => p !== view.me.id);
    const people = ids.map((id) => view.people.find((p) => p.id === id)).filter(Boolean);
    if (!people.length) throw new Error('this thread has no people on it but your owner: name who you mean in to');
    return { people: people.map((p) => p.id), names: people.map((p) => p.name) };
  }
  const names = (Array.isArray(to) ? to : [to]).filter((n) => String(n ?? '').trim());
  if (!names.length) throw new Error('say who this is for: to, group or thread');
  const people = uniqueById(names.map((n) => personNamed(n, view)));
  if (people.length > 11) throw new Error('a message goes to at most eleven people');
  return { people: people.map((p) => p.id), names: people.map((p) => p.name) };
}

function leave(c, fields) {
  if (c.stale) throw new Error('the app is not running, so this cannot be sent now. Say so in your answer, with the words, and finish');
  const { me, item, project, dir, now } = c;
  const line = {
    kind: 'out', id: newOutId(),
    from: { mate: me?.id ?? null, name: me?.name ?? PLAIN_AGENT }, run: item.id, product: project.id,
    ...fields,
  };
  // One press, one send: "Send v2 to Dev" is the yes a card would ask for.
  const named = (fields.people ?? []).map((id) => c.view.people.find((p) => p.id === id)).filter(Boolean);
  if (named.length === (fields.people ?? []).length && !fields.outside && saidToSendTo(readItemHistory(project.dir, item.id), named)) line.saidYes = true;
  writeOutbox(dir, line, now);
  const { yes } = readOutbox(dir);
  const held = !mayGoNow({ ...line, tries: 0 }, yes);
  return { line, held };
}

const FILES_MOST = 10;
const realOf = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const inside = (root, file) => !!root && (file === root || file.startsWith(root + path.sep));
const hiddenIn = (rel) => rel.split(path.sep).some((s) => s.startsWith('.'));

/** Where this thread's agent may send files from: its own checkout, its project, and the project's code. */
function threadFolders({ project, item }) {
  let repo = null;
  try { repo = JSON.parse(fs.readFileSync(path.join(project.dir, 'project.json'), 'utf8')).repoPath || null; } catch { /* no code folder */ }
  return {
    checkout: repo ? realOf(path.join(repo, '.claude', 'worktrees', item.id)) : null,
    dir: realOf(project.dir),
    repo: repo ? realOf(repo) : null,
  };
}

/** The files an agent named, as a person's attachments are handed over: `{ name, srcPath }`. */
function filesToCarry(list, c) {
  const asked = (Array.isArray(list) ? list : list == null ? [] : [list]).map((f) => String(f ?? '').trim()).filter(Boolean);
  if (!asked.length) return [];
  if (asked.length > FILES_MOST) throw new Error(`a message carries at most ${FILES_MOST} files`);
  const { checkout, dir, repo } = threadFolders(c);
  const roots = [checkout, dir, repo].filter(Boolean);
  const copyInto = checkout ?? dir;
  return asked.map((ask) => {
    const found = (path.isAbsolute(ask) ? [ask] : roots.map((r) => path.join(r, ask))).map(realOf).find(Boolean);
    if (!found) throw new Error(`${ask} is not there. Name a file in ${roots.join(' or ')}`);
    const root = [checkout, dir, repo].find((r) => inside(r, found));
    if (!root) throw new Error(`${ask} is outside the folders this thread can send from. Copy it into ${copyInto} and name it there`);
    const rel = path.relative(root, found);
    if (hiddenIn(rel)) throw new Error(`${ask} is in a hidden folder, so it cannot go`);
    if (looksSecret(rel.split(path.sep).join('/'))) throw new Error(`${ask} looks like a secret, so it cannot go`);
    const st = fs.statSync(found);
    if (!st.isFile()) throw new Error(`${ask} is a folder; name the files in it`);
    if (st.size > MAX_SENT_BYTES) throw new Error(`${ask} is ${sizeWords(st.size)}, over the ${MAX_SENT_MB} MB a message can send`);
    return { name: path.basename(found), srcPath: found };
  });
}

/**
 * What this thread and Files know of the file called `name`: how many versions,
 * every version's name, and where its newest is. Nothing when there is no thread.
 *
 * `chain` is the thread's own versions in order, with who wrote each, and `dir`
 * the folder their relative paths are in, which is what a merge needs to read
 * them. `voice` is who this run speaks as, so a version of its own can be told
 * from somebody else's.
 */
export function knownFile(name, ctx = {}) {
  const family = familyOfName(name);
  const out = { versions: 0, names: new Set(), paths: [], path: null, chain: [], dir: null, voice: PLAIN_AGENT };
  let c;
  try { c = teammateContext({ ...ctx, outsider: true }); } catch { return out; }
  out.dir = c.project.dir;
  out.voice = c.me?.name || PLAIN_AGENT;
  try {
    const lines = readItemHistory(c.project.dir, c.item.id, { max: Number.MAX_SAFE_INTEGER });
    const here = threadFiles([...filesInLines(lines), ...otherFilesInLines(lines)]).find((f) => f.key === family);
    out.chain = (here?.versions ?? []).map((v) => ({ name: v.name, path: v.path, edited: v.edited === true, agent: typeof v.agent === 'string' ? v.agent : null }));
    for (const v of here?.versions ?? []) {
      out.names.add(v.name);
      out.paths.push(v.path);
      if (!path.isAbsolute(v.path) && fs.existsSync(path.join(c.project.dir, v.path))) out.real = true;
    }
    out.versions = here?.versions.length ?? 0;
    out.path = here?.versions.at(-1)?.path ?? null;
  } catch { /* a thread with no history yet */ }
  for (const f of readTeamView(c.dir)?.folders ?? []) {
    for (const x of f.files ?? []) {
      if (familyOfName(x.file) !== family) continue;
      out.names.add(x.file);
      out.versions = Math.max(out.versions, x.versions ?? 1);
      out.path ??= x.path ?? null;
      if (x.path && fs.existsSync(x.path)) out.real = true;
    }
  }
  return out;
}

/**
 * Where write_document puts the next version of a file: asked for with
 * `versionOf`, or a file someone already has written again under its name at
 * another path. It goes in this thread's own folder, beside nobody's original,
 * and needs no person to send it to. null: an ordinary write.
 */
export function documentVersion({ product, versionOf, path: rel = null, content = null, ownItem = null, env = process.env }) {
  const asked = String(versionOf ?? '').trim();
  const name = asked ? shownName(asked) : rel ? path.basename(rel) : '';
  if (!name) return null;
  const known = knownFile(name, { env });
  if (!asked && !(known.real && known.names.has(name) && !known.paths.includes(rel))) return null;
  const ext = path.extname(rel ?? '') || path.extname(name);
  if (kindOfName(name) !== kindOfName(`x${ext}`)) throw new Error(`${rel} is a ${ext.slice(1) || 'file'} and ${name} a ${path.extname(name).slice(1) || 'file'}, so it cannot be its next version`);
  const own = String(env.ZERO_PRODUCT ?? '').trim();
  const home = ownItem && own ? own : product;
  const folder = ownItem ? `designs/${ownItem}` : 'designs';
  const dir = resolveProduct(home).dir;
  const next = nextVersionFor(name, ext, { known, taken: (n) => fs.existsSync(path.join(dir, folder, n)) });
  const at = `${folder}/${next}`;
  const base = baseName(name);
  const kept = keepWhatOthersWrote(known, content);
  return {
    product: home, path: at, of: base, title: base.replace(/\.[^.]+$/, ''),
    ...(kept ? { content: kept.content, merged: kept.merged } : {}),
    note: `Saved [${next}](${at}) as the next version of ${known.path ? `[${base}](${known.path})` : base}.`
      + (kept ? ` It kept the edit someone made in ${kept.merged} as well as your own changes.` : ''),
  };
}

const readVersion = (dir, v) => {
  try { return fs.readFileSync(path.isAbsolute(v.path) ? v.path : path.join(dir, v.path), 'utf8'); } catch { return null; }
};

/**
 * `content` with whatever somebody else wrote since, or null when there is
 * nothing to keep. An agent writes its next version from the copy it remembers,
 * so an edit saved after that one is stepped over without anyone noticing
 * (w-27a7ae314a). The newest version is nobody's to overwrite, so the write is
 * merged against it. Nothing records which version a write started from, so the
 * base is the version it is fewest lines from, which is the one it was copied
 * from. Both sides changing the same lines throws: that is the one case somebody
 * has to answer for, and losing either set of words silently is not an answer.
 */
function keepWhatOthersWrote(known, content) {
  if (typeof content !== 'string' || !known.dir) return null;
  // Only when this thread can see every version: a copy elsewhere may hold one it cannot read.
  if (known.chain.length < 2 || known.chain.length !== known.versions) return null;
  const head = known.chain[known.chain.length - 1];
  const itsOwn = !head.edited && typeof head.agent === 'string' && (head.agent || PLAIN_AGENT) === known.voice;
  if (itsOwn || reviewKind(head.path) !== 'markdown') return null;
  const headText = readVersion(known.dir, head);
  if (headText == null || headText === content) return null;
  let baseText = null;
  let gap = Infinity;
  for (const v of known.chain.slice(0, -1)) {
    const was = readVersion(known.dir, v);
    if (was == null) continue;
    // The newest of equals: a later version of the same words is the likelier copy.
    const far = lineGap(was, content);
    if (far <= gap) { gap = far; baseText = was; }
  }
  if (baseText == null) return null;
  const merged = mergeThree({ base: baseText, ours: headText, theirs: content });
  if (!merged.ok) {
    const why = merged.tooBig ? 'it is too long to merge line by line' : 'your words change the same lines';
    throw new Error(`${head.name} changed since you read it, and ${why}, so nothing was saved. Read ${head.path} and write your next version from that.`);
  }
  return merged.text === content ? null : { content: merged.text, merged: head.path };
}

/** The name the next version of `name` takes: past every version known, and past `taken`. */
export function nextVersionFor(name, ext, { known = knownFile(name), taken = () => false } = {}) {
  const was = shownName(String(name).trim());
  const base = baseName(was).replace(/\.[^.]+$/, '') + ext;
  let n = Math.max(1, known.versions, Number(/[-_ ]v(\d+)$/i.exec(was.replace(/\.[^.]+$/, ''))?.[1] ?? 1));
  let next = nextVersionName(base, n);
  while (known.names.has(next) || taken(next)) { n += 1; next = nextVersionName(base, n); }
  return next;
}

const kindOfName = (n) => reviewKind(n) ?? path.extname(n).toLowerCase();

/** The one file carried under the name that makes it the next version of `versionOf` (shared/artifact-marks.mjs). */
function asVersion(carried, versionOf) {
  if (versionOf == null || versionOf === '') return carried;
  if (carried.length !== 1) throw new Error('versionOf takes one file: send each new version on its own');
  const was = shownName(String(versionOf).trim());
  const [file] = carried;
  const ext = path.extname(file.name);
  if (kindOfName(was) !== kindOfName(file.name)) throw new Error(`${file.name} is a ${ext.slice(1) || 'file'} and ${was} a ${path.extname(was).slice(1) || 'file'}, so it cannot be its next version`);
  return [{ ...file, name: nextVersionFor(was, ext) }];
}

// One card per message: the app's. An agent that also asks makes a second one.
const ONE_CARD = 'The app shows your owner these exact words on one card. Do not ask them for this yes yourself, and do not end your run on a question about it. This thread is told when they answer.';
const heldNote = (out) => (out.outside
  ? `This is meant to leave the team, so it waits for your owner's yes. ${ONE_CARD}`
  : `You have not written to ${out.names.join(' and ')} before, so this waits for your owner's yes. ${ONE_CARD} Carry on with what you can.`);

// The thread's project is the one place an agent files into. The app sends it on
// from the log under the same rules as a person's move (main/files-place.mjs).
const projectNames = () => { try { return listProducts().map((p) => p.name); } catch { return []; } };

function fileInFolder(c, names, folder) {
  const made = folderNamed({ project: c.project.name, name: folder, known: (c.view.folders ?? []).filter((f) => !f.inside).map((f) => ({ id: f.id, project: f.project, name: f.folder, parent: null })), roots: projectNames(), dir: c.dir, by: c.view.me.id, now: c.now });
  for (const name of names) {
    writeFolderLog(c.dir, { op: 'place', key: fileKeyIn(c.project.name, name), project: c.project.name, family: familyOfName(name), folder: made.id, by: c.view.me.id, at: c.now });
  }
  return made;
}

/** Puts what an agent made in a folder of its thread's project, by name, making the folder if needed. */
export function teamFile({ files, folder } = {}, ctx = {}) {
  const names = (Array.isArray(files) ? files : files == null ? [] : [files]).map((f) => path.basename(String(f ?? '').trim())).filter(Boolean);
  if (!String(folder ?? '').trim()) throw new Error('name a folder to put them in');
  if (!names.length) throw new Error('name a file to put in the folder');
  if (names.length > FILES_MOST) throw new Error(`at most ${FILES_MOST} files at a time`);
  const c = context(ctx);
  const made = fileInFolder(c, names, folder);
  const missing = linkOnThread(c, files);
  const where = `${made.project} > ${made.name}`;
  return {
    folder: made.name, project: made.project, files: names,
    note: missing.length ? `Filed in ${where}, but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not in this thread's folders, so Files shows nothing there for ${missing.length > 1 ? 'them' : 'it'} until a message links ${missing.length > 1 ? 'them' : 'it'}.` : `Filed in ${where}.`,
  };
}

/**
 * Names on this thread the files it was handed that are on disk and that no
 * line names yet, since Files lists only what a thread names. Returns the ones
 * that are not there.
 */
function linkOnThread(c, files) {
  const asked = (Array.isArray(files) ? files : [files]).map((f) => String(f ?? '').trim()).filter(Boolean);
  const { checkout, dir, repo } = threadFolders(c);
  const roots = [checkout, dir, repo].filter(Boolean);
  let lines = [];
  try { lines = readItemHistory(c.project.dir, c.item.id, { max: Number.MAX_SAFE_INTEGER }); } catch { /* a thread with no lines yet */ }
  const said = new Set([...filesInLines(lines), ...otherFilesInLines(lines)].map((f) => f.path));
  const missing = [];
  const links = [];
  for (const ask of asked) {
    const found = (path.isAbsolute(ask) ? [ask] : roots.map((r) => path.join(r, ask))).map(realOf).find((f) => f && fs.statSync(f).isFile());
    const root = found && roots.find((r) => inside(r, found));
    if (!root) { missing.push(path.basename(ask)); continue; }
    const rel = path.relative(root, found).split(path.sep).join('/');
    if (!said.has(rel) && !hiddenIn(rel)) links.push(`[${path.basename(rel)}](${rel})`);
  }
  if (links.length) updateWorkItem(c.project.dir, c.item.id, { note: `Filed ${links.join(', ')}` }, { source: 'agent', now: c.now });
  return missing;
}

const TOP_OF_PATH = (rel) => (String(rel ?? '').includes('/') ? String(rel).split('/')[0] : null);

/** After write_document: what Files now says about where it sits. `filedIn` only once the line is written. */
export function fileWrittenDocument({ path: rel, folder } = {}, ctx = {}) {
  const asked = String(folder ?? '').trim();
  const top = TOP_OF_PATH(rel);
  if (!asked && !top) return {};
  let c;
  try { c = context(ctx); } catch (err) {
    return asked ? { say: `It is saved, but it is not in ${asked}: ${err.message}.` } : {};
  }
  const known = (c.view.folders ?? []).filter((f) => !f.inside && f.project?.toLowerCase() === c.project.name.toLowerCase());
  const match = top && known.find((f) => f.folder.toLowerCase() === top.toLowerCase())?.folder;
  const into = asked || match;
  if (!into) return { say: `It is saved at ${rel}. ${top} is a directory on disk, not a folder in Files, so in Files it sits at the top of ${c.project.name}. Pass folder to put it in one.` };
  try {
    const made = fileInFolder(c, [path.basename(rel)], into);
    return { filedIn: made.name, filedWhere: `${made.project} > ${made.name}` };
  } catch (err) {
    return { say: `It is saved, but it is not in ${into}: ${err.message}.` };
  }
}

/** list_documents as a person sees it: each file's folder in Files, and the files only Files holds. */
export function documentsWithFolders(list, { folder = null } = {}, ctx = {}) {
  let c;
  try { c = context(ctx); } catch { return list; }
  const known = foldersNow(c).filter((f) => f.project?.toLowerCase() === c.project.name.toLowerCase());
  if (!known.length) return list;
  const out = list.map((d) => ({ ...d }));
  for (const f of known) {
    for (const file of f.files ?? []) {
      const hit = out.find((d) => path.basename(d.path ?? '') === file.file);
      if (hit) hit.filesFolder = f.folder;
      else out.push({ id: null, title: file.file, kind: reviewKind(file.file) === 'markdown' ? 'markdown' : reviewKind(file.file) ?? 'file', path: file.path, folder: f.folder, filesFolder: f.folder, versions: file.versions, status: 'current', cataloged: false, note: 'In Files. Open it with Read at this path.' });
    }
  }
  if (!folder) return out;
  const asked = String(folder).toLowerCase();
  const isFilesFolder = known.some((f) => f.folder.toLowerCase() === asked);
  return isFilesFolder ? out.filter((d) => d.filesFolder?.toLowerCase() === asked || d.folder?.toLowerCase() === asked).map((d) => ({ ...d, filesFolder: known.find((f) => f.folder.toLowerCase() === asked).folder })) : list;
}

// What this Mac's agents have asked to say there and the group cannot show yet.
const waitingForRoom = ({ dir }, room) => readOutbox(dir).out
  .filter((o) => o.room === room && !['sent', 'failed', 'refused', 'undone'].includes(o.state))
  .map((o) => ({ at: o.ts, agent: { id: o.from?.mate ?? null, run: o.run, name: o.from?.name } }));

const askedByOwner = (item) => (item?.labels ?? []).includes(CHAT_LABEL) || item?.wrote?.answer?.source === 'founder';

export function teamTell({ text, to, group, thread, outside, files, versionOf, folder } = {}, ctx = {}) {
  const words = String(text ?? '').trim();
  const c = context(ctx);
  const carried = asVersion(filesToCarry(files, c), versionOf);
  if (String(folder ?? '').trim() && !carried.length) throw new Error('folder files what this message carries, and it carries no file');
  if (!words && !carried.length) throw new Error('nothing to say');
  const tooLong = outside ? null : tooLongForAChat(words);
  if (tooLong) throw new Error(tooLong);
  const who = audience({ to, group, thread }, c);
  if (who.room && c.me) {
    const whyNot = groupTurn({ recent: c.view.rooms.find((r) => r.id === who.room)?.recent ?? [], pending: waitingForRoom(c, who.room), mate: c.me.id, run: c.item.id, asked: askedByOwner(c.item), now: c.now });
    if (whyNot) throw new Error(whyNot);
  }
  const { line, held } = leave(c, { ...who, text: words.slice(0, TEXT_MOST), ...(carried.length ? { files: carried } : {}), ...(outside ? { outside: true } : {}) });
  if (String(folder ?? '').trim()) fileInFolder(c, carried.map((f) => f.name), folder);
  return {
    to: who.names, held, ...(carried.length ? { files: carried.map((f) => f.name) } : {}),
    note: held ? heldNote(line) : 'It goes in about ten seconds, under your name, unless your owner takes it back. A reply comes back to this thread as a turn; do not wait for it.',
  };
}

// What a task is blocked on, from words an agent can write: a person's name, or a thread id from team_threads.
function blocksNamed(list, view) {
  return (Array.isArray(list) ? list : [list]).filter((w) => String(w ?? '').trim()).map((w) => {
    const raw = String(w).trim();
    const card = (view.cards ?? []).find((k) => k.threadId === raw);
    if (card) return `card:${card.personId}:${card.threadId}`;
    return `person:${personNamed(raw, view).id}`;
  });
}

export function teamTask({ to, title, details, due, files, versionOf, folder, blockedBy } = {}, ctx = {}) {
  const list = Array.isArray(to) ? to : [to];
  if (list.length !== 1) throw new Error('a task goes to one person; use team_tell for several');
  const named = String(title ?? '').trim();
  if (!named) throw new Error('give the task a short title');
  if (due !== undefined && !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(String(due))) throw new Error('due is a day, YYYY-MM-DD, or a day and a time, YYYY-MM-DDTHH:MM');
  const c = context(ctx);
  const carried = asVersion(filesToCarry(files, c), versionOf);
  const who = audience({ to: list }, c);
  const blocks = blockedBy === undefined ? [] : blocksNamed(blockedBy, c.view);
  const { line, held } = leave(c, { ...who, task: true, title: named.slice(0, 200), text: String(details ?? '').trim().slice(0, TEXT_MOST), ...(carried.length ? { files: carried } : {}), ...(due ? { due } : {}), ...(blocks.length ? { blockedBy: blocks } : {}) });
  if (String(folder ?? '').trim() && carried.length) fileInFolder(c, carried.map((f) => f.name), folder);
  return {
    to: who.names, held, ...(carried.length ? { files: carried.map((f) => f.name) } : {}),
    note: held ? heldNote(line) : 'It goes in about ten seconds, as a task from you, unless your owner takes it back. Their replies and their finishing it come back to this thread as a turn.',
  };
}

// An AI teammate reads direct messages only when its owner has said it may. A
// thread the person started is them asking.
const mayReadMessages = ({ me }) => !me || me.readsMessages === true;

const NOT_OPEN = 'your owner has not let you read their direct messages. They choose that on your page; say so if you need it';

function directRecords(view) {
  const out = [];
  for (const d of view.directs ?? []) {
    let rows = [];
    try { rows = readWorkItems(d.dir); } catch { continue; }
    out.push({ people: d.people, rows: rows.filter((r) => !isTaskRow(r)) });
  }
  return out;
}

const nameIn = (view) => (id) => view.people.find((p) => p.id === id)?.name ?? 'Someone';

// A task's card, as an agent reads it: who gave it, the day it is due by, and what blocks it.
function taskFacts(card, nameOf, cards) {
  const day = (at) => { const d = new Date(at - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const blocks = (card.blockedBy ?? []).map(({ id }) => {
    if (id.startsWith('person:')) return nameOf(id.slice('person:'.length));
    if (id.startsWith('name:')) return id.slice('name:'.length);
    const [, person, thread] = id.split(':');
    const on = cards.find((k) => k.personId === person && k.threadId === thread);
    return on?.title ? `${nameOf(person)}: ${on.title} (thread ${thread})` : `a thread of ${nameOf(person)}'s`;
  });
  return {
    from: card.task.from ? nameOf(card.task.from) : null,
    ...(Number.isFinite(card.task.dueAt) ? { due: card.task.clock ? new Date(card.task.dueAt).toISOString() : day(card.task.dueAt), late: Date.now() >= card.task.dueAt } : {}),
    ...(blocks.length ? { blockedBy: blocks } : {}),
  };
}

export function teamThreads(ctx = {}) {
  const c = context(ctx);
  const nameOf = nameIn(c.view);
  const threads = (c.view.cards ?? []).map((k) => ({
    person: nameOf(k.personId), thread: k.threadId, title: k.title, project: k.project, state: k.state,
    ...(k.problem ? { context: k.problem } : {}), ...(k.progress ? { done: k.progress } : {}),
    ...(k.task ? { task: taskFacts(k, nameOf, c.view.cards ?? []) } : {}),
    updated: new Date(k.updatedAt ?? 0).toISOString(),
  }));
  if (!mayReadMessages(c)) return { threads, note: 'Your owner\'s direct messages are not here: they have not let you read them.' };
  const conversations = directRecords(c.view).filter((r) => r.rows.length).map((r) => {
    const newest = [...r.rows].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    return { people: r.people.map(nameOf), title: newest.label || newest.title, updated: new Date(newest.updatedAt ?? 0).toISOString() };
  });
  return { threads, conversations };
}

/**
 * The files a thread's messages name, one entry per version, with what has been
 * said on each: who approved it and every comment with where it sits and
 * whether it is open. A comment still open on an earlier version is listed on
 * the later ones too, saying which version it came from.
 */
function filesOf(lines, marks, nameOf, elsewhere = () => []) {
  const marked = marksOf(marks);
  return threadFiles(filesInLines(lines)).flatMap((family) => family.versions.map((v, i) => ({
    file: v.name,
    path: v.path,
    version: `v${v.n}`,
    versions: family.versions.length,
    by: v.by ? nameOf(v.by) : null,
    approvedBy: marked.approvals.filter((a) => a.file === v.id).map((a) => nameOf(a.by)),
    comments: [...marked.notes.filter((n) => n.file === v.id), ...carriedNotes(family, i, marked.notes)].map((n) => ({
      id: n.id, by: nameOf(n.by), where: placeWords(n), text: n.text,
      status: n.resolved ? 'resolved' : 'open',
      ...(n.from ? { from: `${n.from}, still open` } : {}),
      ...(n.replies?.length ? { replies: n.replies.map((r) => ({ by: nameOf(r.by), text: r.text })) } : {}),
    })).concat(elsewhere(v.name)),
  })));
}

/**
 * A FILE'S COMMENTS ARE THE FILE'S: the notes on each copy of it sent into a
 * conversation, by its name, saying which conversation. Only where the owner
 * lets this agent read their messages, since that is where the notes were made.
 */
function notesElsewhere(c, nameOf) {
  if (!mayReadMessages(c)) return () => [];
  let found = null;
  const all = () => {
    if (found) return found;
    found = [];
    for (const d of c.view.directs ?? []) {
      let rows = [];
      try { rows = readWorkItems(d.dir); } catch { continue; }
      const where = `conversation with ${d.people.map(nameOf).join(', ')}`;
      for (const r of rows) {
        const history = readItemHistory(d.dir, r.id, { max: Number.MAX_SAFE_INTEGER });
        if (!history.some((l) => l?.patch?.artifact)) continue;
        const versions = new Map(threadFiles(filesInLines(history)).flatMap((f) => f.versions).map((v) => [v.id, v.name]));
        for (const n of marksOf(markEntries(history)).notes) {
          const name = versions.get(n.file) ?? n.file;
          found.push({ name, note: { id: n.id, by: nameOf(n.by), where: placeWords(n), text: n.text, status: n.resolved ? 'resolved' : 'open', in: r.label && r.label !== r.title ? `${r.label}, ${where}` : where } });
        }
      }
    }
    return found;
  };
  return (name) => all().filter((f) => f.name === name).map((f) => f.note);
}

const markEntries = (lines) => (lines ?? []).filter((l) => l?.patch?.artifact).map((l) => ({ ...l.patch.artifact, by: l.by ?? null, ts: l.ts, uid: l.uid ?? null }));

const foldersOut = (list) => list.map(({ id: _id, ...f }) => f);

// The app rewrites its view on a tick, and a filing agent checks at once, so what
// this run's log says since then goes on top.
function foldersNow(c) {
  const lib = foldFolders(readFolderLog(c.dir));
  const out = (c.view.folders ?? []).map((f) => ({ ...f, files: [...(f.files ?? [])] }));
  for (const f of lib.folders) {
    if (!out.some((x) => x.id === f.id || (x.project?.toLowerCase() === f.project.toLowerCase() && x.folder.toLowerCase() === f.name.toLowerCase()))) {
      out.push({ id: f.id, project: f.project, folder: f.name, files: [] });
    }
  }
  for (const p of lib.places.values()) {
    // On the stamp itself it counts: the app stamps before it reads, and filing twice changes nothing.
    if (p.at < (c.view.at ?? 0)) continue;
    const same = (x) => familyOfName(x.file) === p.family;
    const had = out.flatMap((f) => f.files).find(same);
    for (const f of out) f.files = f.files.filter((x) => !same(x));
    const into = out.find((f) => f.id === lib.canon(p.folder));
    if (into) into.files.push(had ?? { file: String(p.family).split('\0')[0], justFiled: true });
  }
  return out;
}

// "the launch folder" and "launch" are the same ask.
function foldersNamed(all, asked) {
  const words = String(asked).toLowerCase().replace(/\b(the|folder)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const hits = all.filter((f) => f.folder.toLowerCase() === words);
  const near = hits.length ? hits : all.filter((f) => words && f.folder.toLowerCase().includes(words));
  if (!near.length) throw new Error(`no folder called ${asked}. The folders: ${all.map((f) => f.folder).join(', ') || 'none yet'}`);
  return near;
}

export function teamRead({ person, thread, folder } = {}, ctx = {}) {
  const c = context(ctx);
  const nameOf = nameIn(c.view);
  if (String(folder ?? '').trim()) return { folders: foldersOut(foldersNamed(foldersNow(c), folder)) };
  // Nobody named: this thread's own files, with what people have said on them.
  if (!String(person ?? '').trim() && !thread) {
    const history = readItemHistory(c.project.dir, c.item.id);
    const named = (id) => nameOf(id ?? c.view.me.id);
    return { title: c.item.title, files: filesOf(history, markEntries(history), named, notesElsewhere(c, named)), folders: foldersOut(foldersNow(c)) };
  }
  const isOwner = thread && String(person ?? '').trim().toLowerCase() === c.view.me.name.toLowerCase();
  const who = isOwner ? c.view.me : personNamed(person, c.view);
  if (thread) return readThread(c, who, String(thread), nameOf);
  if (!mayReadMessages(c)) throw new Error(NOT_OPEN);
  const record = directRecords(c.view).find((r) => r.people.length === 1 && r.people[0] === who.id);
  const row = record && [...record.rows].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  if (!row) return { with: who.name, messages: [] };
  return {
    with: who.name,
    messages: (row.talk?.chat ?? []).map((s) => ({ from: nameOf(s.by), ...(s.voice ? { agent: s.voice.name } : {}), text: s.text, at: new Date(s.ts).toISOString() })),
  };
}

// A thread is read only while the owner's card for it is there: the cloud decides
// who may read a card, and its work leaves this computer when the card does.
function readThread(c, who, threadId, nameOf) {
  const card = (c.view.cards ?? []).find((k) => k.personId === who.id && k.threadId === threadId);
  if (!card) throw new Error(`you cannot read ${threadId}: your owner cannot see it. team_threads lists what they can`);
  const lineOf = (l) => {
    const text = l.patch?.body ?? l.patch?.answer ?? l.patch?.result ?? l.patch?.note;
    return text ? { from: l.source === 'agent' ? 'The agent' : nameOf(l.by), text, at: new Date(l.ts).toISOString() } : null;
  };
  if (who.id === c.view.me.id) {
    const row = readWorkItem(c.project.dir, threadId, c.now);
    const history = readItemHistory(c.project.dir, threadId);
    return {
      title: card.title, person: who.name, context: card.problem ?? null, done: card.progress ?? null,
      messages: [row?.body, row?.result].filter(Boolean).map((text) => ({ from: who.name, text })),
      files: filesOf(history, markEntries(history), (id) => nameOf(id ?? who.id), notesElsewhere(c, (id) => nameOf(id ?? who.id))),
    };
  }
  let work = null;
  try { work = JSON.parse(fs.readFileSync(path.join(c.view.threadsDir, who.id, threadId, 'thread.json'), 'utf8')); } catch { /* not come down yet */ }
  if (!work) return { title: card.title, person: who.name, context: card.problem ?? null, done: card.progress ?? null, messages: [], note: 'Only the card has reached this computer so far.' };
  return {
    title: card.title, person: who.name, earlier: work.earlier ?? 0, messages: (work.lines ?? []).map(lineOf).filter(Boolean),
    files: filesOf(work.lines, markEntries(work.marks), (id) => nameOf(id ?? who.id)),
  };
}
