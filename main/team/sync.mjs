// KEEPING A SHARED PROJECT THE SAME ON EVERY TEAMMATE'S MAC.
//
// One pass (`syncOnce`) does four things, in this order:
//
//   1. JOIN. A project somebody shared that this Mac does not have yet becomes
//      a project of its own here, in a folder of its own.
//   2. PUSH. Every ledger line this person wrote in a shared project since the
//      last push goes to the cloud. A byte offset per project is the cursor,
//      since the ledger only grows. A line written before anyone signed in
//      (the project's history from when it was private) goes too, as this
//      person's, with an id made from its own bytes so it can never go twice.
//   3. PULL. Every line the cloud has that this Mac has not seen comes in
//      through the store's one write path (`appendForeignLines`), verbatim and
//      at most once. Lines this person wrote are skipped: they are already here.
//   4. PRIVATE WORK. One title-free line per open task in a private project
//      (who, what state, when it moved), and only when that set changed.
//
// Everything outside this file is passed in, so two "Macs" can run in one test
// over an in-memory cloud. The app wires the real ones in main/team/index.mjs.
import crypto from 'node:crypto';

const PAGE = 500;

// Where each shared project's cursors stand, kept between runs.
export function memorySyncState() {
  const map = new Map();
  return {
    get: (projectId) => ({ pushedTo: 0, pulledSeq: 0, ...(map.get(projectId) || {}) }),
    set: (projectId, value) => { map.set(projectId, { ...value }); },
    getActivityHash: () => map.get('__activity__')?.hash ?? null,
    setActivityHash: (hash) => { map.set('__activity__', { hash }); },
  };
}

export function fileSyncState(file, fs) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  const save = () => {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  };
  return {
    get: (projectId) => ({ pushedTo: 0, pulledSeq: 0, ...(data.projects?.[projectId] || {}) }),
    set: (projectId, value) => { data.projects = { ...(data.projects || {}), [projectId]: { ...value } }; save(); },
    getActivityHash: () => data.activityHash ?? null,
    setActivityHash: (hash) => { data.activityHash = hash; save(); },
  };
}

// A line from before anyone signed in has no writer and no id. It is pushed as
// the sharer's, with an id made from its bytes, so a second push is the same id.
function adopt(line, me) {
  if (line.by && line.uid) return line;
  const uid = line.uid || `h-${crypto.createHash('sha256').update(JSON.stringify(line)).digest('hex').slice(0, 24)}`;
  return { ...line, by: line.by || me, uid };
}

export function createTeamSync({ backend, disk, state, listShared, joinProject, listPrivateOpen = () => [] }) {
  let running = null;

  async function pushProject(project, me) {
    const cursor = state.get(project.projectId);
    const { lines, end } = disk.readLinesFrom(project.dir, cursor.pushedTo);
    const mine = lines.filter((l) => l && (!l.by || l.by === me)).map((l) => adopt(l, me));
    let pushed = 0;
    if (mine.length) pushed = await backend.pushLines(project.projectId, mine);
    state.set(project.projectId, { ...state.get(project.projectId), pushedTo: end });
    return pushed;
  }

  async function pullProject(project, me) {
    let pulled = 0;
    for (;;) {
      const cursor = state.get(project.projectId);
      const rows = await backend.pullLines(project.projectId, cursor.pulledSeq, PAGE);
      if (!rows.length) break;
      const theirs = rows.map((r) => r.line).filter((l) => l && l.by !== me);
      pulled += disk.appendForeignLines(project.dir, theirs);
      // Lines pulled in move the file's end, but they were never ours to push,
      // and a push cursor left behind them would only re-read and skip them.
      const after = state.get(project.projectId);
      state.set(project.projectId, { ...after, pulledSeq: rows[rows.length - 1].seq });
      if (rows.length < PAGE) break;
    }
    return pulled;
  }

  async function publishActivity() {
    const entries = (listPrivateOpen() || []).map((e) => ({ taskKey: String(e.taskKey), state: e.state, movedAt: Number(e.movedAt) }))
      .sort((a, b) => a.taskKey.localeCompare(b.taskKey));
    const hash = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
    if (hash === state.getActivityHash()) return false;
    await backend.putActivity(entries);
    state.setActivityHash(hash);
    return true;
  }

  async function run() {
    const me = backend.personId ?? (await backend.me())?.id;
    if (!me) throw new Error('nobody is signed in');
    const report = { joined: [], pushed: 0, pulled: 0, activity: false };

    const cloudProjects = await backend.listProjects();
    const local = new Map(listShared().map((p) => [p.projectId, p]));
    for (const project of cloudProjects) {
      if (local.has(project.id)) continue;
      const joined = await joinProject(project);
      if (joined) { local.set(project.id, joined); report.joined.push(project.name); }
    }

    for (const project of cloudProjects) {
      const here = local.get(project.id);
      if (!here) continue;
      report.pushed += await pushProject(here, me);
      report.pulled += await pullProject(here, me);
    }

    report.activity = await publishActivity();
    return report;
  }

  return {
    // One pass at a time: a second call while one runs waits for it and then
    // runs again, so a change that lands mid-pass is never left behind.
    async syncOnce() {
      while (running) await running.catch(() => {});
      running = run();
      try { return await running; } finally { running = null; }
    },
  };
}
