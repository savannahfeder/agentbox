// The app's read/write surface over its own store. The inbox IS the state
// layer: everything rendered is derived fresh from files, and everything the
// founder does becomes an appended line through the store's own write path.
// The app holds no state an app restart would lose.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadStore } from './store-modules.mts';
import type { StoreModules } from './store-modules.mts';
import { hasCode } from '../shared/has-code.mjs';
import { Repeats } from './repeats.mjs';
import type { CodexThreadLike } from '../shared/codex-import.mts';
import type { Callout } from '../shared/dashboard.mts';
import { CLEAN_LABEL, isCleanRun } from '../shared/repeats.mjs';
import { answerFor, describeFor } from './first-run.mts';
import { checkProjectFolder } from '../shared/project-folder-check.mts';
import { SAME_PROJECT, movedAway, movedHere, splitForCompose, whatMoves, whyItCannotMove } from '../shared/move-thread.mts';
import { EXAMPLES, stampsFor } from '../shared/first-run-examples.mts';
import {
  PRACTICE_ANSWER, PRACTICE_BACKDROP, PRACTICE_FLAG, PRACTICE_NAME, PRACTICE_NOTE, PRACTICE_ROWS, PRACTICE_SLUG,
  PRACTICE_REPLY_ANSWER, PRACTICE_TASK_TRACE,
} from '../shared/first-run-practice.mts';
import { NOTE_NAME } from './rail-note.mts';
import { iconPathFor } from './project-identity.mts';
import { patchProjectAt } from './store/project.mjs';
import { projectWrites, projectWritten } from './store/projects-changed.mjs';
import { imgUrl } from './img-scheme.mts';
import { teamOf, PERSONAL_FLAG } from './team/projects.mts';
import {
  agentImportRow, agentsNeedingRows, threadImportRow, threadsNeedingRows, CATCH_UP_LABEL,
} from '../shared/agent-import.mts';
import {
  CODEX_IMPORT_LABEL, NOT_IMPORTED_LABEL, codexIdOf, codexImportRow, codexMirrorPatch, isCodexImportRow, isCodexMirrorRow,
  productsForThread, threadsNeedingRows as codexThreadsNeedingRows,
} from '../shared/codex-import.mts';
import { buildClaimLine, buildReleaseLine, GIVEN_TASK } from '../shared/work-items.mjs';
import { isEffortWord } from '../shared/effort-levels.mts';
import { shippedNote } from '../shared/shipped-note.mjs';
import { notShipped } from '../shared/not-shipped.mts';
import { asksForGitHubSignIn, SHIPPING_AGAIN } from '../shared/github-push-sign-in.mts';
import { machineryPath, removeMachinery } from './store/home.mjs';
import { Teammates } from './teammates.mts';
import type { WorkItem } from './supervisor.mts';
import { hopOf, HOP_LABEL_PREFIX } from '../shared/teammates.mjs';
import {
  answerMode as readAnswerMode, answerModes, clearAnswerMode as clearAnswerModeFile, setAnswerMode,
  touchAnswerMode as touchAnswerModeFile,
} from './answer-modes.mts';

// WHAT A ROW'S ID LOOKS LIKE, for the reads that take one from the window: a
// task, `w-` and hex, or a run of a repeating task, `r-<rule>-<YYYYMMDD>`
// (shared/repeats.mjs occurrenceId). Runs were refused until a repeating task
// began opening as its latest run (w-5e3f2e047f), and a run's page then had no
// conversation to draw.
const ROW_ID = /^(w-[0-9a-f]{6,}|r-[0-9a-f]{6,}-\d{8})$/;

// How long the project list is handed back without asking the disk anything at
// all (Store._productsNow). One millisecond: long enough that a loop reading it
// a thousand times reads the disk once, short enough that nothing a person can
// do lands inside it.
const PRODUCTS_KEPT_NS = 1_000_000n;
const stampable = (file: string): fs.Stats | null => { try { return fs.statSync(file); } catch { return null; } };
const markOf = (st: fs.Stats | null): string => (st ? `${st.mtimeMs}:${st.size}` : 'gone');
export interface StoreConfig {
  accountRoot: string;
  products: string[];
  storeRoot?: string;
  accountId?: string;
  [key: string]: unknown;
}

export interface StoreTeam { projectId: string; teamId: string | null; visibility: string; [field: string]: unknown }

export interface StoreProduct {
  slug: string;
  archived?: boolean;
  dir: string;
  name: string;
  oneLiner: string;
  repoPath: string | null;
  createdAt: number | null;
  logo: string | null;
  practice: boolean;
  personal: boolean;
  seenBy?: string;
  seenByPeople?: string[];
  team: ReturnType<typeof teamOf>;
  code: boolean;
}

export interface StoreItem extends Omit<WorkItem, 'product'> {
  product?: string;
  [field: string]: unknown;
}

export interface AnswerInput {
  answer?: string | null;
  status?: string | null;
  priority?: number | null;
  permissionMode?: string | null;
  engine?: string | null;
  model?: string | null;
  effort?: string | null;
  inReplyTo?: string;
  fromPhone?: unknown;
  voice?: unknown;
  forAgent?: unknown;
  fromNotes?: unknown[];
  putAway?: unknown;
}

export interface ComposeInput {
  id?: string | null;
  title?: string;
  body?: string;
  kind?: string;
  priority?: number;
  labels?: string[];
  runAt?: number;
  start?: string;
  engine?: string | null;
  model?: string | null;
  effort?: string | null;
  assignee?: string;
  due?: string;
  people?: unknown[];
  visibility?: string;
  visibleTo?: unknown[];
  blockedBy?: unknown[];
  fromPhone?: unknown;
  voice?: unknown;
  forAgent?: unknown;
}

export interface RepeatInput {
  title: string;
  body?: string;
  priority?: number;
  every: string;
  at: string;
  on?: number;
  engine?: string | null;
  model?: string | null;
  startsNext?: boolean;
}

export type FiledItem = {
  title: string;
  body?: string;
  problem?: string;
  kind?: string;
  priority?: number;
  labels?: string[];
};

export interface ImportedChat extends CodexThreadLike {
  source?: string;
  waiting?: boolean;
  name?: string;
}

interface ProjectFile {
  archived?: boolean;
  name?: string;
  oneLiner?: string;
  repoPath?: string;
  createdAt?: string;
  logo?: unknown;
  seenBy?: unknown;
  seenByPeople?: unknown;
  team?: Record<string, unknown>;
  [flag: string]: unknown;
}
interface ProductRow extends StoreProduct { slug: string }

interface ProductsRead {
  live: ProductRow[];
  all: ProductRow[];
  repos: string[];
  stamp?: string;
  writes?: number;
  at?: bigint;
}

interface ProductStamp { stamp: string; folders: { slug: string; dir: string }[] }



export class Store {
  declare config: StoreConfig;
  declare modules: StoreModules;
  declare repeats: Repeats;
  declare teammates: Teammates | null;
  declare watchers: fs.FSWatcher[];
  declare onChange: (() => void) | null;
  declare _debounce: NodeJS.Timeout | null;
  declare _products: ProductsRead | null;

  constructor(config: StoreConfig) {
    this.config = config;
    this.modules = null as unknown as StoreModules;
    this.repeats = null as unknown as Repeats;
    this.watchers = [];
    this.onChange = null; // set by ipc layer; called on any store file change
    this._debounce = null;
    this._products = null; // the kept project list (_productsNow)
  }

  async init() {
    this.modules = await loadStore();
    this.repeats = new Repeats(this.modules);
    this.teammates = this.config?.storeRoot && this.config?.accountId ? new Teammates(this) : null;
    // AND A PRACTICE PROJECT LEFT OVER FROM LAST TIME GOES NOW.A walk that was
    // quit, or a Mac that went to sleep in the middle of one, leaves the
    // practice project sitting in the account root, and everything downstream
    // then treats it as a real project she owns: it is in the rail, it is in
    // the compose card, and it is the project the card opens on. Nothing
    // resumes a walk across a restart (`firstRunNeeded` reads the project
    // COUNT, and a leftover practice project is itself one of them), so a
    // practice project present at launch is by definition a leftover and never
    // one somebody is standing in.
    //
    // In `init` rather than in a launch hook because this is the one place every
    // the app opens its store, and a tidy-up that has to be remembered at a new
    // call site is one that eventually is not.
    try { this.sweepPractice(); } catch { /* a leftover folder is not a reason to fail to open */ }
    return this;
  }

  /* ------------------------------- products ------------------------------ */
  // A product is a project directory under the account root carrying a
  // project.json. Archived products (or the reserved analytics id) don't ride.
  // ARCHIVED PROJECTS ARE LEFT OUT unless a caller asks for them, which is
  // what makes archiving one take it off the inbox, the sidebar, the fleet and
  // the Projects page in one write. Two callers do ask: the Projects page, so
  // an archived one can be brought back, and the team sync, which must still
  // count a shared project you archived as here or it joins it a second time.
  // A FRESH ARRAY EVERY TIME, over rows the keeper below shares: callers have
  // always had a list of their own to sort and filter.
  listProducts({ includeArchived = false }: { includeArchived?: boolean } = {}): StoreProduct[] {
    const read = this._productsNow();
    return (includeArchived ? read.all : read.live).slice();
  }

  /** The list is read from a hundred places in the app and it is not cheap: a
   *  readdir of the account root, then a stat, a read and a parse per project
   *  and a readdir of its code folder, 0.28 ms on a store of nine. Reading it
   *  in a loop is what held the main thread 1,473 times on 2026-11-01, 6,825 s
   *  in all (w-a20f0430a9). Two callers had been fixed one at a time by then;
   *  the answer is kept here so the next one cannot do it again.
   *
   *  Kept honestly. Past a millisecond the folders are stamped again — the
   *  names in the root, each project.json's time and size, each project and
   *  code folder's time — and the kept answer stands only while every stamp is
   *  the one it was read at, which is a stat apiece instead of a read and a
   *  parse apiece. Inside that millisecond no stamp is taken at all, which is
   *  what makes a thousand asks cost what one costs. Nothing the app writes
   *  itself can hide in there whatever the folder times say, because the
   *  writers count their writes (main/store/projects-changed.mjs) and the
   *  store's own writes forget the list outright; what a millisecond can hide
   *  is another process making a project folder, and the app waits 150 ms on
   *  its watcher before it redraws on one of those anyway.
   *
   *  The clock is hrtime, not Date.now: a test with a fake clock would
   *  otherwise hold the window open for its whole run. */
  _productsNow(): ProductsRead {
    const kept = this._products?.writes === projectWrites() ? this._products : null;
    if (kept && process.hrtime.bigint() - kept.at! < PRODUCTS_KEPT_NS) return kept;
    const stamped = this._stampProducts(kept?.repos ?? []);
    if (!stamped) return { live: [], all: [], repos: [] }; // the account root is unreadable
    if (kept && stamped.stamp === kept.stamp) {
      kept.at = process.hrtime.bigint();
      return kept;
    }
    this._products = this._readProducts(stamped);
    return this._products;
  }

  /** The kept list goes, because the app has just made or removed a project
   *  folder, or written a project.json by a path of its own. */
  forgetProducts() {
    projectWritten();
    this._products = null;
  }

  /** The folders in the account root, each with the stamp that says whether
   *  what was read off it is still what is there. `repos` are the code folders
   *  the kept answer's `code` was read from. */
  _stampProducts(repos: string[]): ProductStamp | null {
    const root = this.config.accountRoot;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
    const wanted = this.config.products;
    const folders: ProductStamp['folders'] = [];
    const marks: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('_')) continue;
      if (wanted.length && !wanted.includes(entry.name)) continue;
      const dir = path.join(root, entry.name);
      // statSync, not the Dirent: a product may be a symlink into another
      // store root (the combined-workspace pattern), and a Dirent reports a
      // symlink as not-a-directory, which made a symlinked product silently
      // invisible to the inbox and the supervisor.
      const st = stampable(dir);
      marks.push(`${entry.name}=${st?.isDirectory() ? markOf(st) : 'not a folder'}`);
      if (!st?.isDirectory()) continue;
      folders.push({ slug: entry.name, dir });
      marks.push(markOf(stampable(path.join(dir, 'project.json'))));
    }
    // A code folder's own time is the cheap way to ask whether `code` still
    // holds: hasCode reads the names directly inside it, and nothing else.
    for (const repo of repos) marks.push(`${repo}=${markOf(stampable(repo))}`);
    return { stamp: marks.join('|'), folders };
  }

  _readProducts({ stamp, folders }: ProductStamp): ProductsRead {
    const live: ProductRow[] = [];
    const all: ProductRow[] = [];
    const repos: string[] = [];
    for (const { slug, dir } of folders) {
      let project: ProjectFile | null = null;
      try {
        project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')) as ProjectFile;
      } catch {
        continue;
      }
      if (project.repoPath) repos.push(project.repoPath);
      const rest = {
        dir,
        name: project.name || slug,
        oneLiner: project.oneLiner || '',
        repoPath: project.repoPath || null,
        code: hasCode(project.repoPath),
        // What puts an unplaced project under the ones already there rather
        // than alphabetically among them (renderer/src/project-priority.ts).
        createdAt: Number.isFinite(Date.parse(project.createdAt as string)) ? Date.parse(project.createdAt as string) : null,
        // THE MARK SHE CHOSE FOR THIS PROJECT, already a url the window can
        // draw, or null on every project that has never been given one, which is
        // what makes the rail draw its burst instead (main/project-identity.mts).
        //
        // RESOLVED HERE rather than passed on raw, because the rail, the
        // composer's picker, ⌘K and the settings nav all draw a product off this
        // one list, and every one of them would otherwise have to know that
        // `logo` is a bare file name needing `dir` joined to it and a scheme put
        // in front. It costs one stat per product that HAS a mark, on a list
        // that already does a stat and a read per product.
        logo: (() => { const f = iconPathFor({ dir, logo: project.logo }); return f ? imgUrl(f) : null; })(),
        // THE PRACTICE PROJECT SAYS SO ABOUT ITSELF. Read off project.json
        // rather than matched on a name, because "Practice" is a name somebody
        // could reasonably give a real project of their own, and the things
        // that turn on this flag — never spawning a worker in it, drawing a
        // band over it — must never happen to real work.
        practice: project[PRACTICE_FLAG] === true,
        // YOUR PERSONAL PROJECT, where a thread is Only you unless you say
        // otherwise (main/team/projects.mts, w-b989839656).
        personal: project[PERSONAL_FLAG] === true,
        // WHO SEES ITS THREADS on the Team page (w-b989839656), read as
        // written; shared/thread-cards.mjs projectSeenBy is the one reading.
        ...(typeof project.seenBy === 'string' ? { seenBy: project.seenBy } : {}),
        ...(Array.isArray(project.seenByPeople) ? { seenByPeople: project.seenByPeople.filter((p) => typeof p === 'string') } : {}),
        // SHARED OR PRIVATE. Null on a private project, which is every
        // project of a person who never signs in; otherwise the cloud id that
        // is the same on every teammate's Mac (main/team/projects.mts).
        team: teamOf(project),
      };
      all.push({ slug, archived: project.archived === true, ...rest });
      if (!project.archived) live.push({ slug, ...rest });
    }
    const byName = (a: ProductRow, b: ProductRow) => a.name.localeCompare(b.name);
    return { live: live.sort(byName), all: all.sort(byName), repos, stamp, writes: projectWrites(), at: process.hrtime.bigint() };
  }

  /** ARCHIVE A PROJECT, OR BRING ONE BACK. One flag in its project.json and
   *  nothing else: the folder, its documents and its threads stay on disk, and
   *  `listProducts` is what stops showing it. Agents already running there
   *  finish; nothing new starts, because the fleet reads the same list.
   *
   *  Resolved through the list itself, so the only thing this can ever write
   *  is a project folder directly inside this account, named exactly. */
  setProductArchived(slug: string, archived?: unknown) {
    const product = slug ? this.listProducts({ includeArchived: true }).find((p) => p.slug === slug) : null;
    if (!product) throw new Error('That project could not be found.');
    if (product.archived !== (archived === true)) {
      patchProjectAt(product.dir, { archived: archived === true });
      // The watched folders are the listed ones, so one brought back is not
      // watched until the list is read again.
      if (this.watchers.length) this.watch();
    }
    return { slug, archived: archived === true };
  }

  /** WHO SEES A PROJECT'S THREADS on the Team page (w-b989839656): 'private'
   *  (Just you), 'team', or 'people' with the people named. Written into the
   *  project's own file, because it is the project's, and nothing of the
   *  project itself leaves this Mac either way. My Workspace is refused: it is
   *  Just you by what it is. */
  setProductSeenBy(slug: string, { who, people }: { who?: unknown; people?: unknown } = {}) {
    const product = slug ? this.listProducts({ includeArchived: true }).find((p) => p.slug === slug) : null;
    if (!product) throw new Error('That project could not be found.');
    if (product.personal) throw new Error('My Workspace is always just you.');
    if (who !== 'private' && who !== 'team' && who !== 'people') throw new Error(`unknown setting for who sees it: ${who}`);
    const ids: string[] = [...new Set((Array.isArray(people) ? people : []).filter((p) => typeof p === 'string' && p))];
    patchProjectAt(product.dir, { seenBy: who, seenByPeople: who === 'people' ? ids : undefined });
    return { slug, who, people: who === 'people' ? ids : [] };
  }

  /* ------------------------------ work items ----------------------------- */
  // The cross-product fold. Every item carries its product slug so the
  // renderer can group, filter, and rail without a second lookup.
  listItems(now = Date.now()) {
    const { workItemsDisk } = this.modules;
    const all: (StoreItem & { product: string })[] = [];
    // WHAT ONE REPLY MAY DO IS NOT ON THE LEDGER, so it is joined on here, once
    // for the whole fold rather than a file read per row (main/answer-modes.mts).
    const modes = answerModes({ now });
    for (const product of this.listProducts()) {
      let items: StoreItem[] = [];
      try {
        items = workItemsDisk.readWorkItems(product.dir, now);
      } catch (err) {
        console.warn(`zero: unreadable work items for ${product.slug}: ${(err as Error).message}`);
        continue;
      }
      for (const item of items) {
        const row = { ...item, product: product.slug, productName: product.name };
        const key = `${product.slug}/${item.id}`;
        if (key in modes) row.answerMode = modes[key];
        all.push(row);
      }
    }
    return all;
  }

  // THE NEXT PAGE OF FINISHED THREADS THE SNAPSHOT'S 8 MB READ LEFT OUT
  // (`readOlderWorkItems`), newest finished first, for the Done and All tabs
  // as she scrolls to their foot (w-fda2165ec6). Archived projects stay out,
  // as they do of `listItems`.
  listOlderItems({ offset = 0, limit = 50, now = Date.now() }: { offset?: number; limit?: number; now?: number } = {}) {
    const { workItemsDisk } = this.modules;
    const all: StoreItem[] = [];
    for (const product of this.listProducts()) {
      let items: StoreItem[] = [];
      try { items = workItemsDisk.readOlderWorkItems(product.dir, now); } catch { continue; }
      for (const item of items) all.push({ ...item, product: product.slug, productName: product.name });
    }
    const finished = (i: StoreItem) => i.wrote?.status?.ts || i.updatedAt;
    all.sort((a, b) => finished(b)! - finished(a)!);
    return { items: all.slice(offset, offset + limit), more: all.length > offset + limit };
  }

  // One item, folded fresh off disk. The supervisor holds a SPAWN-TIME snapshot
  // for the whole life of a session, so it cannot ask what the session did to
  // the row without reading it again; that question is the difference between a
  // delivery and a no-op (settleDelivery, main/supervisor.mts).
  readItem(slug: string, id: string, now = Date.now()): (StoreItem & { product: string }) | null {
    const { workItemsDisk } = this.modules;
    const item = workItemsDisk.readWorkItem(this.productDir(slug), id, now);
    if (!item) return null;
    const row = { ...item, product: slug };
    const mode = readAnswerMode(slug, id, { now });
    if (mode !== undefined) row.answerMode = mode;
    return row;
  }

  // EVERYTHING THAT HAPPENED ON ONE ITEM, as the lines it actually happened as.
  //
  // The fold keeps the latest value per field, so it cannot answer "what
  // happened here" at all: the row's first title, the reply she sent before the
  // one on screen, the moment an agent picked it up are all in the ledger and
  // nowhere else. Her thread history reads them (renderer/src/thread-history.ts
  // turns them into sentences; this end takes no view on what they mean).
  //
  // The lease lines go here rather than there because they are the bulk of the
  // file and none of them are news: a worker holding a task for an hour writes
  // a heartbeat a minute, and's 39 lines are 15 events.
  //
  // Read once per change of the ledger, not once per call (main/store/
  // work-items.mjs readItemHistory): the phone pass asks for 300 threads in a
  // row, and reading the file for each blocked the app for 21 s (2026-10-14).
  readHistory(slug: string, id: string, { max = 400, before }: { max?: number; before?: number } = {}) {
    if (!ROW_ID.test(String(id ?? ''))) return [];
    return this.modules.workItemsDisk.readItemHistory(this.productDir(slug), id, { max, before } as { max?: number });
  }

  /** readHistory for many threads of one project: its ledger is found and read once, not per thread. */
  historyReader(slug: string) {
    const read = this.modules.workItemsDisk.readItemHistories(this.productDir(slug));
    return (id: string, opts?: { max?: number }) => (ROW_ID.test(String(id ?? '')) ? read(id, opts) : []);
  }

  // THE CONVERSATION ON ONE ROW, oldest first, for the brief a spawning worker
  // is handed (main/supervisor.mts, buildBrief). readHistory above is the same
  // ledger read for her thread view and stops at the lines; this one asks
  // shared/work-items.mjs which of them was somebody SPEAKING.
  //
  // Uncapped on purpose. The brief does the trimming, because only the brief
  // knows what else is competing for the same session's attention, and a cap
  // here would silently decide it twice.
  readThread(slug: string, id: string) {
    const { workItemsDisk, workItemsCore } = this.modules;
    if (!ROW_ID.test(String(id ?? ''))) return [];
    const file = workItemsDisk._internals.ledgerPath(this.productDir(slug));
    return workItemsCore.threadOf(workItemsDisk._internals.readLines(file), id);
  }

  // The scheduling rule, delegated rather than copied. A second "is this due
  // yet" is exactly how the spawner and the inbox would come to disagree about
  // the same item, which is the drift this file exists to prevent.
  isDue(item: StoreItem, now = Date.now()) {
    return this.modules.workItemsCore.isDue(item, now);
  }

  productDir(slug: string) {
    const dir = path.join(this.config.accountRoot, slug);
    if (!fs.existsSync(path.join(dir, 'project.json'))) throw new Error(`no such product: ${slug}`);
    return dir;
  }

  // WHERE ONE OF OUR OWN RECORDS FOR A PRODUCT LIVES, and it is not in the
  // product folder. The ledger, session traces and repeat rules are the app's
  // bookkeeping, so they sit in the app's home the way Claude Code's do
  // (main/store/home.mjs). The founder's own documents, and the two files that
  // describe them, stay where she can see them.
  machineryFile(slug: string, rel: string) {
    return machineryPath(this.productDir(slug), rel);
  }

  // Founder writes. Content and lifecycle alike go in as HERS: what she says
  // and what she decides an item's state is both outrank any agent line.
  //
  // Status used to go in as 'system', on the reasoning that a founder-authored
  // status would freeze the item's lifecycle because a worker could never move
  // it again. The reasoning was right abo writing her archive with machinery's
  // authority let the next thing a worker wrote hand the item straight back to
  // her inbox, three times in fourteen minutes.
  //
  // The fold now draws that line itself: her 'open' is a HANDBACK and claims no
  // authority, so the claim, the blocked and the done that follow all land,
  // while her terminal words hold (shared/work-items.mjs, authorityOf). Pinned
  // by tests/v0-loop.test.mjs here and archive-is-final.test.mjs there.
  // `permissionMode` is WHAT THE ANSWER ITSELF MAY DO, and it belongs to this
  // one reply rather than to the project.It is written as a founder field
  // beside the answer, read once by the run that answer starts
  // (supervisor.spawnPlan) and cleared by that run, so it never leaks into the
  // next one. `model` and `effort` are WHICH MODEL PICKS THE NEXT RUN UP, set
  // from the drawer in the reply box.
  //
  // They go on the ITEM as founder fields, exactly where the new-task card
  // writes them, because that is where the spawn reads them back
  // (`modelForEngine`, shared/engines.mjs). Unlike `permissionMode` they are NOT
  // cleared by the run that uses them: she changed the model of the
  // conversation, and the conversation keeps it until she says otherwise.
  //
  // Undefined means she never opened the drawer and the row keeps what it had.
  // Null means she cleared it, and the engine chooses again.
  //
  // `inReplyTo` makes the answer a reply in a thread (w-920461cbe6): the uid
  // of the message it answers, on THE SAME LINE as the words, so the reply's
  // own uid (what its reactions hang off) is the line that says where it goes.
  answerItem(slug: string, id: string, { answer, status, priority, permissionMode, engine, model, effort, inReplyTo, fromPhone, voice, forAgent, fromNotes, putAway }: AnswerInput) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    let item: (StoreItem & { product: string }) | null = null;
    // THE MODEL GOES ON FIRST, BEFORE THE ANSWER. A reply on an idle row is
    // what starts a run, and the run reads the model off the item; written
    // after the answer it is a race the run can win, and she would pick a model
    // and watch the old one take the task.
    //
    // Written as '' rather than null to clear, because that is how "no model"
    // is said everywhere else here: `modelForEngine` (shared/engines.mjs) reads
    // the empty string as nothing chosen, where a JSON null would have to be
    // special-cased in both engines' argument builders.
    // AND WHICH ENGINE, BESIDE IT AND FOR THE SAME REASON (w-c9da359466). The
    // reply box's drawer only ever offered the models of the engine the row
    // was already on, so a thread begun on Claude Code could not be carried on
    // in Codex by any path in the app: "that is what I'd reach for when Claude
    // runs out" (power-test-2, issues 39 and 40). It is the field `composeItem`
    // already writes and `Supervisor#_engineFor` already reads per run, so the
    // next turn picks it up and nothing else has to know.
    if (engine !== undefined) item = workItemsDisk.updateWorkItem(dir, id, { engine: engine ?? '' }, { source: 'founder' });
    if (model !== undefined) item = workItemsDisk.updateWorkItem(dir, id, { model: model ?? '' }, { source: 'founder' });
    if (effort !== undefined) item = workItemsDisk.updateWorkItem(dir, id, { effort: effort ?? '' }, { source: 'founder' });
    if (answer) item = workItemsDisk.updateWorkItem(dir, id, { answer, ...(inReplyTo ? { inReplyTo } : {}), ...(fromPhone ? { fromPhone } : {}), ...(voice ? { voice } : {}), ...(forAgent ? { forAgent } : {}), ...(fromNotes?.length ? { fromNotes } : {}) }, { source: 'founder' });
    // A REPLY ON A RUN THAT FINISHED QUIETLY MAKES IT NEWS AGAIN (w-5e3f2e047f).
    // A quiet run is kept out of her inbox, and a repeating task now opens on
    // its latest run, so without this the answer to what she just asked there
    // could never reach her. Written as the app rather than as her, so the
    // worker can still mark a later quiet finish of its own.
    if (answer && answer !== '(withdrawn)' && isCleanRun(item)) {
      item = workItemsDisk.updateWorkItem(dir, id, { labels: item!.labels!.filter((l) => l !== CLEAN_LABEL) }, { source: 'system' });
    }
    // The pane may still show a running row after Stop or a provider result.
    // Resolve omitted reply status against the ledger that was just written.
    if (status == null && typeof answer === 'string' && answer.trim() && answer !== '(withdrawn)'
      && (item?.status === 'blocked' || item?.status === 'done')) status = 'open';
    // WHAT THE ANSWER ITSELF MAY DO does not go on the ledger. It is a grant,
    // the ledger is an append-only file every worker writes, and every line on
    // it names its own author with nothing checking the name. It goes in the
    // app's own storage instead (main/answer-modes.mts).
    if (permissionMode !== undefined) {
      setAnswerMode(slug, id, permissionMode ?? null);
      item = this.readItem(slug, id) ?? item;
    }
    // The founder's priority tag, set at send time; founder source outranks
    // whatever the filing agent chose.
    if (priority != null) item = workItemsDisk.updateWorkItem(dir, id, { priority }, { source: 'founder' });
    if (status) item = workItemsDisk.updateWorkItem(dir, id, { status }, { source: 'founder' });
    if (typeof putAway === 'boolean') item = workItemsDisk.updateWorkItem(dir, id, { putAway }, { source: 'founder' });
    return item;
  }

  // A TEAMMATE'S WORDS ON A THREAD (shared/teammates.mjs, `planWakes`). A reply
  // like yours, so the next turn carries it and a finished thread opens again,
  // but written as the app with the teammate named on the line, so it is never
  // read as yours. `hold` blocks the thread after it until you reply
  // (`heldForHer`).
  tellItem(slug: string, id: string, { text, from, hold = false, hop = null, fromNotes = null }: { text: string; from?: { teammate: string; name: string }; hold?: boolean; hop?: number | null; fromNotes?: unknown[] | null }) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    let item = workItemsDisk.updateWorkItem(dir, id, { answer: text, from, ...(fromNotes?.length ? { fromNotes } : {}) }, { source: 'system' });
    // The hop count travels on the thread, so its own hand-offs carry it on.
    const raise = Number.isInteger(hop) && hop! > hopOf(item);
    const had = item.labels ?? [];
    const kept = had.filter((l: string) => l !== CLEAN_LABEL && !(raise && l.startsWith(HOP_LABEL_PREFIX)));
    const labels = raise ? [...kept, `${HOP_LABEL_PREFIX}${hop}`] : kept;
    if (labels.join('\n') !== had.join('\n')) item = workItemsDisk.updateWorkItem(dir, id, { labels }, { source: 'system' });
    // Your own stop or close is yours and outranks this; `stoppedByHer` keeps a
    // stopped thread stopped.
    if (hold) item = workItemsDisk.updateWorkItem(dir, id, { status: 'blocked' }, { source: 'system' });
    else if (item.status === 'done' || item.status === 'blocked') item = workItemsDisk.updateWorkItem(dir, id, { status: 'open' }, { source: 'system' });
    return item;
  }

  // A personal session's final message, written by the supervisor because
  // personal sessions never learn the store exists. The result is the agent's
  // words (source 'agent'); the status is machinery (source 'system', the
  // same split answerItem makes). 'blocked' means waiting on the founder,
  // which is exactly what puts the thread back in the inbox.
  //
  // `status: null` writes the words and leaves the status alone. That is a
  // worker holding the store tools, which set its own status before it ended
  // (`closingMessageIsTheAnswer` in the supervisor).
  recordSessionResult(slug: string, id: string, { result, status = 'blocked' }: { result?: string; status?: string | null }) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    if (status === null) {
      return result ? workItemsDisk.updateWorkItem(dir, id, { result }, { source: 'agent' }) : this.readItem(slug, id);
    }
    if (result) workItemsDisk.updateWorkItem(dir, id, { result }, { source: 'agent' });
    return workItemsDisk.updateWorkItem(dir, id, { status }, { source: 'system' });
  }

  // THE APP SHIPPED A TASK, OR COULD NOT (main/ship-queue.mts). Both are the
  // app's own words, so both go in as 'system', as a note: the reply field is
  // hers. A failure reopens the row, and the queue hands the script's words
  // straight to the agent that wrote the change.
  shipped(slug: string, id: string, { sha, labels }: { sha: string | null; labels: string[] }) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    return workItemsDisk.updateWorkItem(dir, id, { labels, note: shippedNote(sha) }, { source: 'system' });
  }

  shipFailed(slug: string, id: string, { note, labels }: { note: string; labels: string[] }) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    workItemsDisk.updateWorkItem(dir, id, { labels, note }, { source: 'system' });
    // A row the person closed while it waited to ship is theirs, and only
    // their own Reopen outranks that (see `closedBeforeItShipped` below).
    const closed = this.readItem(slug, id)?.status === 'done';
    return workItemsDisk.updateWorkItem(dir, id, { status: 'open' }, { source: closed ? 'founder' : 'system' });
  }

  // Every thread whose ship waited on a GitHub sign-in on this computer goes to the queue again.
  shipAgainAfterGitHubSignIn(now = Date.now()) {
    const { workItemsDisk } = this.modules;
    const again = this.listItems(now).filter((i) => i.status !== 'done' && asksForGitHubSignIn(notShipped(i)?.why));
    for (const i of again) {
      const labels = Array.isArray(i.labels) ? i.labels.filter((l) => l !== 'ship') : [];
      workItemsDisk.updateWorkItem(this.productDir(i.product), i.id, { labels: [...labels, 'ship'], note: SHIPPING_AGAIN }, { source: 'system' });
    }
    return again.map((i) => i.id);
  }

  releaseRunClaim(slug: string, id: string, run?: Parameters<StoreModules['workItemsDisk']['releaseRunClaim']>[2]) {
    return this.modules.workItemsDisk.releaseRunClaim(this.productDir(slug), id, run);
  }

  // THE WRITTEN NAME THE LIST DRAWS. Written by the app rather than by a
  // session, on agent authority, and never onto `title`: the title is what she
  // typed and the fold keeps it hers (main/row-label.mts says why at length).
  // Empty is a no-op rather than an erase, so a naming call that came back with
  // nothing usable leaves the row exactly as it was.
  nameItem(slug: string, id: string, label: unknown) {
    const { workItemsDisk } = this.modules;
    const clean = String(label ?? '').trim();
    if (!clean) return null;
    return workItemsDisk.updateWorkItem(this.productDir(slug), id, { label: clean }, { source: 'agent' });
  }

  // A chat brought in, rewritten as a thread (main/catch-up.mts). The agent's
  // words, so on agent authority like a worker's own summary and answer.
  catchUpItem(slug: string, id: string, { label, problem, result }: { label?: string; problem?: string; result?: string }) {
    const { workItemsDisk } = this.modules;
    return workItemsDisk.updateWorkItem(this.productDir(slug), id, { label, problem, result }, { source: 'agent' });
  }

  // Who a thread sent to Auto went to (shared/auto-route.mjs). On system
  // authority, so it never locks her labels against a later write, the `ship`
  // an agent adds among them.
  routeItem(slug: string, id: string, patch: Record<string, unknown>) {
    const { workItemsDisk } = this.modules;
    return workItemsDisk.updateWorkItem(this.productDir(slug), id, patch, { source: 'system' });
  }

  // How urgent a teammate's message is, as the sorter judged it
  // (main/message-priority.mts). On agent authority, so a level the person set
  // by hand stays theirs.
  prioritizeItem(slug: string, id: string, value: number) {
    const { workItemsDisk } = this.modules;
    if (!Number.isFinite(value)) return null;
    return workItemsDisk.updateWorkItem(this.productDir(slug), id, { priority: value }, { source: 'agent' });
  }

  // A one-off permission mode has been spent. Called by the supervisor at the
  // moment it launches the run that mode was set for, so a mode she chose for
  // one message cannot silently govern a respawn three hours later.
  //
  // IT CLEARS THE MODE THAT WAS SPENT, NEVER WHATEVER HAPPENS TO BE THERE NOW.
  // Caught in review, 2026-08-23. The supervisor reads the mode when it builds
  // the launch and clears on the child's own 'spawn' event, so there is a window
  // in between, and a second answer landing inside it must survive. Clearing is
  // the dangerous direction: it does not mean less, it means back to the
  // project's setting, which can be the wider one. So it compares first, in
  // main/answer-modes.mts, which is where the value lives now.
  clearAnswerMode(slug: string, id: string, spent: string | null | undefined) {
    clearAnswerModeFile(slug, id, spent);
    return this.readItem(slug, id);
  }

  // A run just went out under this row's mode. Nothing changes; the stored
  // grant's clock is restamped so the month-long sweep in main/answer-modes.mts
  // measures from the last run on the thread rather than from the moment she
  // picked the mode. This is what stands where the spawn-time clear used to.
  touchAnswerMode(slug: string, id: string, used: string | null | undefined) {
    touchAnswerModeFile(slug, id, used);
    return this.readItem(slug, id);
  }

  // A session finished acting on her answer. Written by the supervisor as the
  // session exits, because the worker cannot be relied on to close a thread
  // that is still alive: the ordinary and correct end of the loop leaves the
  // row open with her answer still on it, and that state used to be
  // indistinguishable from a worker that died (shared/answers.mjs).
  //
  // Source 'system': it is machinery's record of what happened, not a word
  // anyone said, and it must never hold the field against her. She cannot
  // write it at all, and her next answer outdates it by carrying a later ts.
  settleAnswer(slug: string, id: string, answerTs: number | null | undefined) {
    if (!answerTs) return null;
    const { workItemsDisk } = this.modules;
    return workItemsDisk.updateWorkItem(
      this.productDir(slug), id, { answeredThrough: answerTs }, { source: 'system' },
    );
  }

  // "Run this later." The moment goes in the ledger as HERS, so it survives an
  // app restart, a reboot, and a store restored onto another machine, and so no
  // agent line can quietly move a time she set. 0 clears it.
  //
  // Execution scheduling only. Inbox reminders use snoozeItem instead.
  scheduleItem(slug: string, id: string, runAt: number) {
    const { workItemsDisk } = this.modules;
    return workItemsDisk.updateWorkItem(
      this.productDir(slug), id, { runAt: Math.max(0, Math.trunc(runAt) || 0) }, { source: 'founder' },
    );
  }

  // Put the existing thread back in the person's inbox later. This never
  // changes its execution schedule, answer, status, claim or delivery marks.
  snoozeItem(slug: string, id: string, snoozedUntil: number) {
    if (!Number.isFinite(snoozedUntil)) throw new Error('Later needs a valid time');
    return this.modules.workItemsDisk.updateWorkItem(
      this.productDir(slug), id, { snoozedUntil: Math.max(0, Math.trunc(snoozedUntil)) }, { source: 'founder' },
    );
  }

  // WHO A SHARED ROW IS WITH, changed by a person: handed to an agent, kept,
  // handed back, or passed on by a reply. Only the team fields, on the
  // person's own authority, so an agent writing afterwards cannot undo it.
  teamPatch(slug: string, id: string, patch?: Record<string, unknown> | null) {
    const allowed = Object.fromEntries(Object.entries(patch ?? {}).filter(([k]) => ['assignee', 'runner', 'due', 'people'].includes(k)));
    if (!Object.keys(allowed).length) throw new Error('nothing to change');
    return this.modules.workItemsDisk.updateWorkItem(this.productDir(slug), id, allowed, { source: 'founder' });
  }

  // A REACTION ON ONE MESSAGE (w-560647d4db): the chips under it in a chat.
  // `on` is the uid of the ledger line the message was written as, which is the
  // one name for a message that is the same on every teammate's Mac. Written as
  // the person's own word, and appended like anything else: the fold keeps a
  // press per person rather than one value per row, so two people reacting at
  // the same moment keep both chips (shared/work-items.mjs).
  react(slug: string, id: string, { on, emoji, off = false }: { on: string; emoji: string; off?: boolean }) {
    return this.modules.workItemsDisk.updateWorkItem(
      this.productDir(slug), id, { react: off ? { on, emoji, off: true } : { on, emoji } }, { source: 'founder' },
    );
  }

  // NEW WORDS FOR A MESSAGE YOU SENT, OR THE MESSAGE TAKEN BACK. The fold only
  // believes it from the message's own author (shared/message-edits.mjs).
  editMessage(slug: string, id: string, { on, text, gone = false }: { on: string; text?: string; gone?: boolean }) {
    const edit = gone ? { on, gone: true } : { on, text };
    return this.modules.workItemsDisk.updateWorkItem(this.productDir(slug), id, { edit }, { source: 'founder' });
  }

  // A COMMENT, RESOLVE, APPROVAL OR "SEEN" ON ONE FILE OF A THREAD
  // (shared/artifact-marks.mjs). Starts nothing, on any Mac.
  fileMark(slug: string, id: string, mark: unknown) {
    return this.modules.workItemsDisk.updateWorkItem(this.productDir(slug), id, { artifact: mark }, { source: 'founder' });
  }

  // AN EDIT TO A THREAD FROM ITS SUMMARY (approved 2026-10-01): the summary's
  // three lines and its links, who sees it, and its priority. Written as the
  // person's own words; on the summary the later write wins either way
  // (SHARED_FIELDS in shared/work-items.mjs).
  threadEdit(slug: string, id: string, patch?: Record<string, unknown> | null) {
    // `start` is how a thread leaves Later: the summary and the thread page
    // both write 'now' on it, which is what makes `isDue` true again.
    // `label` is a rename (w-ab3d51dc7d): the name every row shows. Never
    // `title`, which is the message the thread was started with and briefs
    // every run. Written on her authority, it outranks the namer's.
    const fields = ['problem', 'progress', 'solution', 'visibility', 'visibleTo', 'priority', 'blockedBy', 'blocks', 'start', 'label', 'shippedAt'];
    const allowed = Object.fromEntries(Object.entries(patch ?? {}).filter(([k]) => fields.includes(k)));
    if ('label' in allowed) {
      allowed.label = String(allowed.label ?? '').replace(/\s+/g, ' ').trim();
      if (!allowed.label) throw new Error('a thread needs a name');
    }
    if (!Object.keys(allowed).length) throw new Error('nothing to change');
    return this.modules.workItemsDisk.updateWorkItem(this.productDir(slug), id, allowed, { source: 'founder' });
  }

  composeItem(slug: string, { id = null, title, body, kind = 'directive', priority = 0, labels, runAt, start, engine, model, effort, assignee, due, people, visibility, visibleTo, blockedBy, fromPhone, voice, forAgent }: ComposeInput) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    // The 'founder' label is the human-in-the-loop marker: only items the
    // founder composed (or explicitly approved) execute; agent-filed items
    // are proposals until then.
    const allLabels = [...new Set(['founder', ...(labels ?? [])])];
    // The phone command that asked for it, on the very line that makes the
    // row, so no row it made is ever without it (Codex's fourth review).
    const first = { title, kind, priority, labels: allLabels, ...(fromPhone ? { fromPhone: String(fromPhone) } : {}) };
    // A task's audience rides the line that makes it, the only one a teammate's
    // copy takes it from (shared/team-rules.mjs whatATeammateMaySet).
    if (allLabels.includes(GIVEN_TASK) && (visibility === 'team' || (visibility === 'people' && Array.isArray(visibleTo) && visibleTo.length))) {
      Object.assign(first, { visibility, ...(visibility === 'people' ? { visibleTo: [...new Set((visibleTo ?? []).map(String))] } : {}) });
    }
    // A thread the cloud started from the phone keeps the id it ran under there.
    const created = id
      ? workItemsDisk.createWorkItemIfAbsent(dir, id, first, { source: 'system' }).item
      : workItemsDisk.createWorkItem(dir, first, { source: 'system' });
    // The founder's words carry founder authority; the lifecycle does not.
    // A runAt sent with the compose is "send later": the item exists now and
    // starts then, which is why it rides in with her content rather than after.
    const contentPatch = {
      title,
      ...(body ? { body } : {}),
      ...(voice ? { voice } : {}),
      ...(forAgent ? { forAgent } : {}),
      ...(runAt ? { runAt: Math.max(0, Math.trunc(runAt)) } : {}),
      // "Add it to Later" on the card: the thread exists now and starts when
      // she says, which is the one answer on that menu with no clock in it.
      ...(start === 'later' ? { start: 'later' } : {}),
      // WHICH MODEL SHE CHOSE FOR THIS ONE, on founder authority like the rest
      // of her content (2026-08-26).It is a Claude Code alias, and the spawn
      // hands it to `--model`.
      ...(model ? { model: String(model) } : {}),
      // AND HOW HARD IT THINKS, the same way. Only a word shaped like a level
      // is written; which words are right depends on the engine and, on Codex,
      // on the model, so that judgement is the spawn's (`Supervisor#spawnPlan`,
      // `codexEffortRefusal`) and not this line's.
      ...(isEffortWord(effort) ? { effort } : {}),
      // AND WHICH CODING AGENT, on the same authority and for the same reason.
      // This was dropped here too, for as long as the field has existed:
      // `zero:compose` took an `engine` argument and this signature never named
      // it, so the 08-25 picker's choice never reached the ledger at all.
      //
      // ON FOUNDER AUTHORITY, WRITTEN AS ITS OWN LINE, which is what makes
      // `wrote.engine.ts` the moment she chose. shared/engines.mjs leans on that
      // stamp to tell a choice she is making now from one made in August, so a
      // path that wrote this any other way would quietly re-open the hazard the
      // whole gate exists for. Whether the word may be written at all is decided
      // before it gets here, by `Supervisor#engineOffered`.
      ...(engine ? { engine: String(engine) } : {}),
      // A TASK GIVEN TO A PERSON (the team version): who has to do it and
      // when. No agent runs on it until that person hands it to one
      // (shared/team-rules.mjs), and it reaches their inbox, not the sender's.
      ...(assignee ? { assignee: String(assignee) } : {}),
      ...(due ? { due: String(due) } : {}),
      ...(Array.isArray(people) && people.length ? { people } : {}),
      ...(Array.isArray(blockedBy) && blockedBy.length ? { blockedBy: blockedBy.map(String) } : {}),
      // WHO SEES IT (approved 2026-10-01): the team by default, nobody but its
      // owner, or the people she chose (w-41ff964775). No field at all reads
      // as the team, except in your personal project, where it reads as Only
      // you (w-b989839656). So Team is written when it was chosen, which is
      // how a thread in My Workspace is shared on purpose.
      ...(visibility === 'private' || visibility === 'team' ? { visibility } : {}),
      ...(visibility === 'people' && Array.isArray(visibleTo) && visibleTo.length
        ? { visibility, visibleTo: [...new Set((visibleTo ?? []).map(String))] } : {}),
    };
    // WITH ITS PROJECT ON IT, the way `readItem` answers. The fold never carries
    // one, and the renderer withdraws a just-made task with `made.product`, so
    // without this Z after a send asked for "no such product: undefined" and
    // reached past the task to whatever was under it (w-c78d1e1607).
    const made = workItemsDisk.updateWorkItem(dir, created.id, contentPatch, { source: 'founder' });
    return made ? { ...made, product: slug } : made;
  }

  /**
   * MOVE A THREAD TO ANOTHER PROJECT (w-c9da359466, power-test-1 issue 20).
   *
   * Only a thread nothing has ever run on, and shared/move-thread.mts carries
   * the whole of why: the rest of a thread is its session traces, its task
   * folder and the git branch named after it, and a branch cannot change
   * repository.
   *
   * THE RULE IS ASKED AGAIN HERE. ⌘K asked it to decide which rows to draw,
   * off a snapshot that can be seconds old, and a worker that picked the
   * thread up in those seconds would otherwise have the ground moved under it.
   *
   * THE NEW ROW IS WRITTEN BEFORE THE OLD ONE IS CLOSED. A close that landed
   * first and a create that then failed on a full disk would be a thread that
   * is in neither project, which is the one outcome this must not have.
   */
  moveItem(fromSlug: string, id: string, toSlug: string) {
    if (fromSlug === toSlug) throw new Error(SAME_PROJECT);
    const from = this.listProducts().find((p) => p.slug === fromSlug);
    const to = this.listProducts().find((p) => p.slug === toSlug);
    if (!to) throw new Error(`no such project: ${toSlug}`);
    const item = this.readItem(fromSlug, id);
    const why = whyItCannotMove(item, { live: false });
    if (why) throw new Error(why);

    const { compose, after } = splitForCompose(whatMoves(item!));
    // Where it came from, in the thread rather than only in a toast, because a
    // thread that turns up in a project nobody filed it in is a thread nobody
    // can account for a week later. It goes after your words: a body is what
    // the thread shows as your first message, and a one-line ask lives only in
    // the title. Your later replies come too, one still waiting included,
    // since the run there starts over from this message.
    const said = movedHere(from?.name ?? fromSlug);
    const yours = this.readHistory(fromSlug, id, { max: 1e6 })
      .filter((l: { source?: string; patch?: { answer?: unknown } }) => l.source === 'founder' && typeof l.patch?.answer === 'string' && l.patch.answer.trim())
      .map((l: { patch?: { answer?: unknown } }) => (l.patch!.answer as string).trim());
    const body = [compose.body || compose.title, ...yours, said].filter(Boolean).join('\n\n');
    let made = this.composeItem(toSlug, { ...compose, body });
    // The three `composeItem` has no argument for (shared/move-thread.mts).
    if (Object.keys(after).length) {
      made = { ...this.modules.workItemsDisk.updateWorkItem(this.productDir(toSlug), made.id, after, { source: 'founder' }), product: toSlug };
    }

    // AND THE OLD ROW CLOSES SAYING WHERE ITS THREAD WENT. The words are the
    // app's; the close is the person's, because a thread of theirs closed by
    // the app reads as news and stayed in Needs you. Z reopens it as before.
    const note = movedAway(to.name ?? toSlug);
    this.modules.workItemsDisk.updateWorkItem(this.productDir(fromSlug), id, { note }, { source: 'system' });
    this.modules.workItemsDisk.updateWorkItem(this.productDir(fromSlug), id, { status: 'done' }, { source: 'founder' });
    return { item: made, from: from?.name ?? fromSlug, to: to.name ?? toSlug, note };
  }

  /* ------------------------------- teammates ------------------------------ */
  teammatesView(items?: StoreItem[] | null, now = Date.now()) {
    if (!this.teammates) return null;
    return this.teammates.view(items ?? this.listItems(now), now);
  }

  /* ---------------------------- repeating tasks --------------------------- */
  // Every product's rules, with their product on each, the way listItems does
  // it, so the renderer has one list to draw. Ended rules are gone from her
  // view: ending one is how she stops it.
  listRepeats(now = Date.now()) {
    const all: Record<string, unknown>[] = [];
    for (const product of this.listProducts()) {
      for (const rule of this.repeats.list(product.dir, now)) {
        if (rule.endedAt) continue;
        all.push({ ...rule, product: product.slug, productName: product.name });
      }
    }
    return all;
  }

  // The rule is written and NO work item is created here. That ordering is the
  // point: composeItem appends an open founder item before it applies her
  // content, and another copy of the app can spawn that intermediate state, so a rule that
  // turned out to be unkeepable would leave a one-shot running behind it. The
  // first run arrives on the next tick instead. `on` travels with `every:
  // 'week'` and is the whole of what makes it a Thursday. The rule is passed
  // WHOLE now; `setRule` is the one place that validates it. `engine` AND
  // `model` TRAVEL WITH THE REST, and they are named here for the same reason
  // `on` had to be: the rule is passed WHOLE to `setRule`, so a field this
  // signature does not name is a field that is dropped in silence. That is what
  // happened to `on` for as long as weekly rules existed, and it is what was
  // happening to both of these: she could compose "every morning", visibly pick
  // Codex and a Codex model, and every occurrence ran on the then-current
  // workspace default.
  composeRepeat(slug: string, { title, body, priority, every, at, on, engine, model, startsNext }: RepeatInput) {
    return this.repeats.setRule(this.productDir(slug), { title, body, priority, every, at, on, engine, model, startsNext });
  }

  setRepeat(slug: string, id: string, patch: Record<string, unknown>) {
    return this.repeats.patchRule(this.productDir(slug), id, patch);
  }

  endRepeat(slug: string, id: string) {
    return this.repeats.endRule(this.productDir(slug), id);
  }

  // An ordinary agent-filed item: a PROPOSAL, which is what puts it in her
  // inbox and keeps it there until she answers. Used for the miss alert, which
  // is news about a repeating task rather than work she asked for.
  // `problem` is the summary's Context, the few sentences a reader gets before
  // they open anything. Without one the panel falls back to the first sentence
  // of the body (summaryOf, shared/thread-cards.mjs), which on a row whose body
  // is a list reads as that list with its line breaks taken out.
  fileItem(slug: string, { title, body, problem, kind = 'review', priority = 5, labels = [] }: FiledItem) {
    const { workItemsDisk } = this.modules;
    return workItemsDisk.createWorkItem(
      this.productDir(slug), { title, body, problem, kind, priority, labels }, { source: 'agent' },
    );
  }

  // A FIX FOR A RED MAIN, which runs without waiting for anyone: the app files
  // it with the 'founder' label the way a repeating task's run is filed
  // (main/repeats.mjs), because the person agreed that these start and ship on
  // their own (main/main-went-red.mts).
  fileMainFix(slug: string, row: FiledItem) {
    return this.fileOnItsOwn(slug, row);
  }

  // A thread the app files that starts without waiting for anyone, as above.
  // Whether its work then ships without review is the caller's to say.
  fileOnItsOwn(slug: string, { title, body, problem, kind = 'task', priority = 5, labels = [] }: FiledItem) {
    const { workItemsDisk } = this.modules;
    return workItemsDisk.createWorkItem(
      this.productDir(slug),
      { title, body, problem, kind, priority, labels: [...new Set(['founder', ...labels])] },
      { source: 'system' },
    );
  }

  // NEWS THE APP ITSELF HAS, ON A ROW THAT ALREADY EXISTS. The app's own words,
  // so 'system' and a note: the answer is theirs and the result is the agent's.
  // A note is a thread field, so a second one reads as the next thing said on
  // the row rather than overwriting the first. Used by main/main-went-red.mts
  // to say main is green again on the row that reported the red.
  noteItem(slug: string, id: string, note: string) {
    const { workItemsDisk } = this.modules;
    return workItemsDisk.updateWorkItem(this.productDir(slug), id, { note }, { source: 'system' });
  }

  // SOMEONE COMMENTED ON A FILE THIS THREAD MADE, through its shared link
  // (main/team/link-comments.mjs). Said as a note; a closed thread comes back
  // to wait on her as `closedBeforeItShipped` brings one, and a thread still
  // going is left going.
  commentOnASharedFile(slug: string, id: string, note: string, linkComment: { name: string; file: string; text: string } | null = null) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    const item = workItemsDisk.updateWorkItem(dir, id, { note, ...(linkComment ? { linkComment } : {}) }, { source: 'system' });
    if (item?.status !== 'done') return item;
    workItemsDisk.updateWorkItem(dir, id, { status: 'open' }, { source: 'founder' });
    return workItemsDisk.updateWorkItem(dir, id, { status: 'blocked' }, { source: 'system' });
  }

  // A CLOUD RUN'S WORK KEPT ON A BRANCH OF ITS OWN, because laying it into the
  // task folder would have undone work done there (main/cloud/run.mts
  // `park`). Said as a note; the row waits for her, and loses `ship`, so the
  // folder never ships without the run's work.
  cloudWorkKeptAside(slug: string, id: string, note: string) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    const labels = this.readItem(slug, id)?.labels ?? [];
    const kept = labels.filter((l) => l !== 'ship');
    workItemsDisk.updateWorkItem(dir, id, { note, ...(kept.length !== labels.length ? { labels: kept } : {}) }, { source: 'system' });
    return workItemsDisk.updateWorkItem(dir, id, { status: 'blocked' }, { source: 'system' });
  }

  // A CLOSED ROW WHOSE WORK NEVER REACHED MAIN, put back in front of the
  // person. Their close outranks the app's own writes, so it reopens the way
  // their Reopen does (`authorityOf` records that as the app's), then waits on
  // them so no run starts by itself.
  closedBeforeItShipped(slug: string, id: string, note: string) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    workItemsDisk.updateWorkItem(dir, id, { note }, { source: 'system' });
    workItemsDisk.updateWorkItem(dir, id, { status: 'open' }, { source: 'founder' });
    return workItemsDisk.updateWorkItem(dir, id, { status: 'blocked' }, { source: 'system' });
  }

  // New product: rare and deliberate. A directory, a project.json, and a first
  // work item that seeds the drive toward launch.
  //
  // Until today this wrote a name and a date and nothing else, so an agent that
  // landed in a new project had nothing to open: `repoPath` is what becomes a
  // worker's cwd (supervisor.mts), and it was always null here.
  //
  // `repoPath` is optional and stays optional. Cleared on the card, the project
  // is made without a folder, exactly as it was before this change.
  createProduct({ name, repoPath }: { name: string; repoPath?: unknown }) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (!slug) throw new Error('a product needs a name');
    const dir = path.join(this.config.accountRoot, slug);
    if (fs.existsSync(path.join(dir, 'project.json'))) throw new Error(`product ${slug} already exists`);

    let repo = typeof repoPath === 'string' ? repoPath.trim() : '';
    if (repo) {
      repo = path.resolve(repo.startsWith('~') ? path.join(os.homedir(), repo.slice(1)) : repo);
      // AND IT IS NOT THE WHOLE MAC. The picker refuses these already;
      // this is the backstop, because a project is also made from the
      // palette, from a restored draft and from a test, and a repoPath of
      // `~` is a worker whose working directory is somebody's whole home
      // folder. That is where the run of macOS permission panels a tester
      // saw comes from.
      const verdict = checkProjectFolder(repo, { home: os.homedir() });
      if (!verdict.ok) throw new Error(verdict.say);
      fs.mkdirSync(repo, { recursive: true });
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
      schemaVersion: 1,
      id: slug,
      name,
      createdAt: new Date().toISOString(),
      ...(repo ? { repoPath: repo } : {}),
      // EVERY NEW PROJECT STARTS AS JUST YOU (w-b989839656): its threads
      // reach the Team page only once you share the project or the thread.
      seenBy: 'private',
    }, null, 2));
    // AND IT FILES NOTHING INTO HER INBOX.
    //
    // It began as a `directive` reading "Take X from idea toward launch", which
    // `isFresh` took straight into a real session in the person's repo, and it
    // was turned into a `question` so nothing would spawn. Making it ask
    // instead of order fixed the runaway session and left the other half
    // standing: a new project still put a row in her inbox that she had not
    // asked anybody for, and the inbox is the one place she cannot afford noise
    // in. Making a project is not itself a question.
    //
    // So the project is made and the inbox is left alone. She starts the work by
    // writing a task in it, the same way she does in every project she already
    // has. `idea` went with the row; it had no other reader, and neither call
    // site in App.tsx ever passed one.
    this.forgetProducts();
    this.watch(); // pick up the new directory
    return { slug };
  }

  /**
   * THE PRACTICE PROJECT, MADE FOR REAL.
   *
   *  So it is a project like any other: a directory, a project.json, real work
   *  items, and the whole app scoped to it while the walk is on. Three things
   *  make it different and all three are in the file rather than in a special
   *  case somewhere:
   *
   *   1. `practice: true`, which is what stops the supervisor ever starting a
   *      session in it and what puts the band on the screen.
   *   2. NO REPO PATH. There is nothing on the disk it points at, so nothing
   *      can be edited, run or broken by anything that happens in here.
   *   3. NO OPENING ROW. `createProduct` composes one (it asks what to work on
   *      first) and that is a real row waiting on a real answer; the practice
   *      inbox is written by `stagePracticeRows` instead.
   *
   * A practice project already there is REMADE rather than refused. Walking the
   * onboarding twice is a thing she does on purpose, and a second walk that
   * died on `already exists` would be a walk with no practice project in it at
   * all.
   *
   * IT USED TO BE REUSED, AND REUSE IS WHAT KEPT SIX WALKS IN ONE LEDGER.
   * MEASURED on the founder's own store: the practice project's ledger held 168
   * lines and 29 session traces, four rows and one task per walk, going back to
   * 08-24. Reuse also un-archived it: the old `endPractice` set `archived:
   * true` in project.json and this call rewrote that same file from scratch, so
   * the walk-end tidy-up of walk one was silently undone by the start of walk
   * two. Her practice project.json at the moment this was written carried no
   * `archived` key at all for exactly that reason, five walks after the first
   * one ended.
   *
   *  So the walk starts from nothing every time: the folder goes, its machinery
   *  goes, and the four rows below are the whole of what is in it. */
  createPractice() {
    const dir = path.join(this.config.accountRoot, PRACTICE_SLUG);
    this.removePractice(PRACTICE_SLUG);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
      schemaVersion: 1,
      id: PRACTICE_SLUG,
      name: PRACTICE_NAME,
      createdAt: new Date().toISOString(),
      [PRACTICE_FLAG]: true,
    }, null, 2));
    // AND THE SIDEBAR NOTE IS WRITTEN WITH IT.
    //
    // It is `pinned.md` in the project's own folder, which is the real file
    // the panel reads and writes (main/rail-note.mts). Nothing about this is
    // special-cased in the renderer: the practice project simply has a note
    // already in it, the way a project somebody has been working in for a week
    // would. The third introduction slab draws the same text, so what the
    // introduction promises is what the practice project actually has.
    fs.writeFileSync(path.join(dir, NOTE_NAME), PRACTICE_NOTE, 'utf8');
    this.forgetProducts();
    this.watch(); // pick up the new directory
    return { slug: PRACTICE_SLUG };
  }

  /**
   * AND THE PRACTICE PROJECT IS REMOVED AT THE END — the folder, not a flag.
   *
   * THIS USED TO ARCHIVE, AND SHE HAS OVERRULED THAT. The reasoning it replaces
   * is kept here because it was not stupid: `archived` is one key in one file,
   * `listProducts` already skips it, and "rm -rf on a directory in somebody's
   * store is not a thing an onboarding gets to do" is a rule worth having. What
   * it missed is that the folder is in HER store, next to her real projects,
   * and she opens that store.
   *
   *  SO THE DELETE IS NARROW ENOUGH THAT IT CANNOT BE POINTED AT REAL WORK, and
   *  every one of these is a refusal rather than a best effort:
   *
   *   - It is the ONE path `<accountRoot>/practice` and no other. A practice
   *     project living under any other slug is archived the old way instead:
   *     the flag is the app's, the path is not, and a directory somebody named
   *     themselves is not ours to delete.
   *   - It is a real directory by `lstat`, so a SYMLINK at that name is refused
   *     outright. A symlinked project is a shape this store really has
   *     (`listProducts` stats through them on purpose for the combined-workspace
   *     pattern), and following one out of the account root is how a delete
   *     scoped to a tutorial reaches somebody's actual repository.
   *   - Its `project.json` must parse AND carry `practice: true`. The same fact
   *     `listProducts` reads, asked again at the moment of the delete rather
   *     than trusted from a listing taken earlier.
   *
   *  Never throws: the walk does not stop because a practice project could not
   *  be tidied away, and a practice project that is not there is the ordinary
   *  case for anybody who walked it before this existed. */
  endPractice(slug: string = PRACTICE_SLUG): { removed: boolean; why?: string; machinery?: unknown } {
    const file = path.join(this.config.accountRoot, slug, 'project.json');
    let project: ProjectFile | null = null;
    try { project = JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectFile; } catch { return { removed: false, why: 'no practice project' }; }
    if (project[PRACTICE_FLAG] !== true) return { removed: false, why: 'not a practice project' };
    if (slug !== PRACTICE_SLUG) {
      // A practice-flagged project under a name we did not choose. It leaves
      // the app the old way and its folder stays: the delete below is allowed
      // to be this blunt only because it knows the exact path it is for.
      if (project.archived) return { removed: false, why: 'archived, not ours to delete' };
      try {
        fs.writeFileSync(file, JSON.stringify({ ...project, archived: true }, null, 2));
        this.forgetProducts();
        this.watch();
      } catch { /* it is out of the way or it is not; neither fails the walk */ }
      return { removed: false, why: 'archived, not ours to delete' };
    }
    return this.removePractice(slug);
  }

  /**
   * THE DELETE ITSELF, and the three questions it asks before it does anything.
   *
   *  Split out from `endPractice` because `createPractice` needs the same
   *  guarded removal (a second walk starts from nothing) and two copies of a
   *  delete is one copy too many. It is the only code in the app that removes a
   *  directory from the founder's store, and everything about it is written to
   *  be readable at a glance rather than clever.
   *
   *  WHAT GOES: the folder at `<accountRoot>/practice` (its `project.json` and
   *  its `pinned.md`), and the app's own machinery for it under
   *  `$ASTRAL_HOME/projects/<escaped path>/` — the work-item ledger, the session
   *  traces, any repeat rules. WHAT DOES NOT: anything else in the account root,
   *  ever, and any machinery directory whose `.origin` does not name this exact
   *  project (main/store/home.mjs).
   *
   *  THE MACHINERY GOES FIRST, and on purpose. It is keyed on the project's
   *  path, so removing the folder first would leave the ledger addressable only
   *  by a path that no longer exists — which is precisely the state the
   *  founder's Mac was in when this was written, six walks deep. */
  removePractice(slug: string = PRACTICE_SLUG): { removed: boolean; why?: string; machinery?: unknown } {
    const root = path.resolve(this.config.accountRoot);
    const dir = path.join(root, PRACTICE_SLUG);
    if (slug !== PRACTICE_SLUG) return { removed: false, why: 'not the practice path' };
    if (path.resolve(dir) !== dir || path.dirname(dir) !== root) return { removed: false, why: 'not the practice path' };

    // lstat, never stat: a symlink at this name must be refused rather than
    // followed. There is nothing to remove if it is not there at all, which is
    // the ordinary case on every launch after the first.
    let st: fs.Stats | null = null;
    try { st = fs.lstatSync(dir); } catch { return { removed: false, why: 'no practice project' }; }
    if (st.isSymbolicLink()) return { removed: false, why: 'a symlink, not a practice project' };
    if (!st.isDirectory()) return { removed: false, why: 'not a directory' };

    // AND IT SAYS SO ABOUT ITSELF, asked here rather than taken on trust from a
    // listing. A folder called `practice` that a person made themselves has no
    // flag in it and is not touched.
    let project: ProjectFile | null = null;
    try { project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')) as ProjectFile; } catch {
      return { removed: false, why: 'no readable project.json' };
    }
    if (project[PRACTICE_FLAG] !== true) return { removed: false, why: 'not a practice project' };

    const machinery = removeMachinery(dir);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      // A folder that will not delete must not fail the walk. It is off the
      // screen either way at the end of this, because the next launch sweeps
      // again and because nothing draws a project it cannot read.
      console.warn(`zero: could not remove the practice project: ${(err as Error).message}`);
      return { removed: false, why: (err as Error).message, machinery: machinery.removed };
    }
    this.forgetProducts();
    this.watch();
    return { removed: true, machinery: machinery.removed };
  }

  /**
   * EVERY PRACTICE PROJECT LYING AROUND, removed. A walk that was quit halfway
   *  leaves one behind, and the next launch is where that is noticed: `init`
   *  calls this, and `firstRunNeeded` counts projects, so a practice project
   *  left in the store is also a project that stops a first run ever offering
   *  itself again.
   *
   *  It answers `{ removed }` where it used to answer `{ archived }`, because
   *  the two words mean different things to whoever reads the number and the
   *  old one is no longer true of what happened. */
  sweepPractice() {
    let n = 0;
    for (const p of this.listProducts()) {
      if (!p.practice) continue;
      if (this.endPractice(p.slug).removed) n += 1;
    }
    return { removed: n };
  }

  /**
   * THE THREE ROWS ALREADY WAITING WHEN THE PRACTICE PROJECT OPENS.
   *
   * The copy is in shared/first-run-practice.mts and the two-writes-per-row
   * trick is the same one `stageFirstRunExamples` uses; see
   * shared/first-run-examples.mts for why a row needs its agent half stamped
   * later than its founder half before an inbox will draw it. */
  stagePracticeRows(slug: string, { now = Date.now(), label = 'first-run' }: { now?: number; label?: string } = {}) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    const ids: string[] = [];
    for (const row of PRACTICE_ROWS) {
      const at = stampsFor(row, now);
      const created = workItemsDisk.createWorkItem(
        dir,
        { title: row.title, kind: row.kind, priority: 5, labels: ['founder', label] },
        { source: 'system', now: at.hers },
      );
      // HER HALF CARRIES THE ASK. It used to carry the title a second time and
      // nothing else, so the thread opened on `An agent opened this` with no
      // words under it and the row read as having been born out of nothing.
      // `threadEvents` in renderer/src/thread-history.ts takes the first body to
      // arrive as the ask whichever line it lands on, which is this one.
      workItemsDisk.updateWorkItem(
        dir, created.id, { title: row.title, body: row.body }, { source: 'founder', now: at.hers },
      );
      // AN AGENT PICKED IT UP AND HANDED IT BACK, which is the shape a row that
      // has been worked on really has, and it is what makes the run visible.
      // `withRuns` (renderer/src/thread-history.ts) hangs a session's lines off
      // the CLAIM event in the ledger and drops them on the floor if there
      // isn't one, so without these two lines the trace below is written, read
      // and then silently thrown away. Photographed once without them:
      // "2 messages on this task" over an ask and a result, and not one of the
      // eight things the agent did.
      this.appendPracticeRun(slug, created.id, at.hers);
      // THE RUN HAPPENS BETWEEN THE CLAIM AND THE ANSWER, AND THE STAMPS HAVE
      // TO SAY SO. The thread is drawn in stamp order, so a run written from
      // `at.hers` at nine seconds a line ran straight past a result stamped
      // one second after it, and the pane printed the agent's conclusion in
      // the middle of the work that produced it. Its first line also tied with
      // the claim and sorted above "An agent opened this". Photographed both
      // ways on 2026-08-24.
      const ran = at.hers + 1_000;
      const finished = ran + row.trace.length * 9_000 + 1_000;
      // AND THE RUN ITSELF, so opening one of these shows what the agent did
      // rather than only what it concluded.
      this.writePracticeTrace(slug, created.id, row.trace, ran);
      workItemsDisk.updateWorkItem(dir, created.id, { result: row.result }, { source: 'agent', now: finished });
      ids.push(created.id);
    }
    return { ids };
  }

  /**
   * THE REST OF THE PRACTICE TEAM'S WORK, so the tour and the board are not
   * empty (w-58c8f466e7). The copy, and which column each row lands in, is
   * `PRACTICE_BACKDROP` in shared/first-run-practice.mts. The ids come back in
   * its order, which is how `walkRows` knows which one is which.
   *
   *  The column is the app's own reading of the row, so each is written in the
   *  shape that reads that way and nothing marks it: a working one is the ask
   *  with a run and no result yet, and a scheduled one is the ask with a time
   *  in the future, set as hers. None of them carries a result, because a
   *  result is what puts a row back in the inbox and nothing here may land
   *  there (shared/first-run-practice.mts). */
  stagePracticeBackdrop(slug: string, { now = Date.now(), label = 'first-run' }: { now?: number; label?: string } = {}) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    const ids: string[] = [];
    for (const row of PRACTICE_BACKDROP) {
      const at = stampsFor(row, now);
      const created = workItemsDisk.createWorkItem(
        dir,
        { title: row.title, kind: row.kind, priority: 5, labels: ['founder', label] },
        { source: 'system', now: at.hers },
      );
      workItemsDisk.updateWorkItem(
        dir, created.id,
        { title: row.title, body: row.body, ...(row.state === 'scheduled' ? { runAt: now + (row.inMs ?? 0) } : {}) },
        { source: 'founder', now: at.hers },
      );
      if (row.state !== 'scheduled') {
        this.appendPracticeRun(slug, created.id, at.hers);
        this.writePracticeTrace(slug, created.id, row.trace, at.hers + 1_000);
      }
      ids.push(created.id);
    }
    return { ids };
  }

  /**
   * THE CLAIM AND THE RELEASE, so the row reads as one an agent worked on.
   *
   *  Written straight rather than through `claimWorkItem`, which takes the
   *  project lock and is async: these rows were created by this same call a
   *  microsecond ago, nothing else can be holding them, and `stagePracticeRows`
   *  is called from a synchronous ipc handler. The two lines are built by the
   *  same builders the real path uses, so the ledger is identical.
   *
   *  THE RELEASE IS NOT OPTIONAL. A claim on its own leaves the row `claimed`,
   *  which puts it in In progress instead of the inbox, and beat thirteen is
   *  about three rows in an inbox. The release hands it back open. */
  appendPracticeRun(slug: string, id: string, at: number) {
    try {
      const file = this.machineryFile(slug, 'work-items.jsonl');
      const epoch = 1;
      fs.appendFileSync(file, `${JSON.stringify(buildClaimLine({
        id, epoch, holder: 'first-run', now: at, leaseMs: 60_000,
      }))}\n${JSON.stringify(buildReleaseLine({ id, epoch, now: at + 500 }))}\n`);
    } catch { /* the run simply does not draw; the ask and the result still do */ }
  }

  /**
   * ONE PRACTICE ROW'S RUN, WRITTEN WHERE A REAL RUN'S IS.
   *
   *  `zero:session-trace` reads `<product>/sessions/<item-id>/<startedAt>.log`
   *  and nothing else, so this writes exactly that file in exactly the shape
   *  `traceStreamLine` (main/supervisor.mts) writes a live one: `HH:MM:SS` then
   *  TWO spaces then either `[Tool] argument` or the agent talking.
   *  renderer/src/item-thread.ts parses the two apart on that shape, so a
   *  single space here turns every tool call into a sentence with a clock
   *  printed inside it.
   *
   *  THE TIMES ARE THE ROW'S OWN. A trace stamped `now` under a row that
   *  landed twenty-two minutes ago is a conversation that happened after it
   *  finished, and the thread sorts by these stamps.
   *
   *  It is best effort: a practice project whose sessions folder will not take a
   *  file is not a reason to fail the beat that stages the rows. The thread
   *  simply draws the ledger, which is what it did before this existed. */
  writePracticeTrace(slug: string, id: string, lines: unknown, startedAt: number) {
    if (!Array.isArray(lines) || !lines.length) return null;
    try {
      const dir = this.machineryFile(slug, path.join('sessions', id));
      fs.mkdirSync(dir, { recursive: true });
      // ON A WHOLE SECOND, BECAUSE THE STAMP HAS NO MILLISECONDS AND THE
      // READER'S ROLLOVER IS UNFORGIVING. `clockAt` writes HH:MM:SS, so a
      // session that began at …:07.199 has its first line stamped …:07.000,
      // which `momentOf` sees as 199ms BEFORE the session started and pushes a
      // whole day forward. Measured: 86,399,199ms out, on the very first line.
      // Flooring the base is the whole fix, and it has to be the same number in
      // the file name as in the stamps or they disagree by that same fraction.
      const began = Math.floor(startedAt / 1000) * 1000;
      // A few seconds apart, in order, so the run reads as a run. Nine seconds
      // is the measured pace of a real one (renderer/src/components/ItemThread.tsx).
      const text = lines
        .map((line, i) => `${clockAt(began + i * 9_000)}  ${line}`)
        .join('\n');
      const file = path.join(dir, `${began}.log`);
      fs.writeFileSync(file, `${text}\n`);
      return file;
    } catch { return null; }
  }

  /* ----------------------------- the first run ---------------------------- */
  // THE WALK'S EXAMPLE TASK IS ANSWERED HERE, WITHOUT A SESSION.
  //
  // The row is real, the reading pane is real and the result is really written
  // to the ledger, so nothing downstream has to know this one was different.
  // What is missing is the worker: the answer is read straight out of the
  // folder she chose one screen earlier, which takes milliseconds and cannot
  // queue, stall or fail. Her own first task took 59.6 seconds under a sentence
  // promising a few, because it was behind the directive the walk itself had
  // just created.
  //
  // AND THE LINE GOES IN THE SIDEBAR, which is the one thing the live version
  // was for. Only when a line was really found: the sentence that says a folder
  // has no readme in it is a true answer and it is not a description, so it is
  // never written under the project's name.
  finishFirstRunTask(slug: string, id: string, round = 0) {
    const { workItemsDisk } = this.modules;
    const product = this.listProducts().find((p) => p.slug === slug) ?? null;
    // A REPLY TO IT IS ANSWERED HERE TOO (2026-10-06). The first answer offers
    // to make the summary shorter; any reply after that gets the shorter one,
    // and no second trace, because the run it did is already on the thread.
    // AND THE REPLY IS SETTLED FIRST, the way the supervisor settles one when a
    // session exits: without it the row reads as an answer still waiting for an
    // agent and stays in In progress (`answerSettled`, shared/answers.mjs).
    if (product?.practice && round > 0) {
      const before = this.readItem(slug, id);
      this.settleAnswer(slug, id, before?.wrote?.answer?.ts ?? 0);
      const item = workItemsDisk.updateWorkItem(
        this.productDir(slug), id, { result: PRACTICE_REPLY_ANSWER }, { source: 'agent' },
      );
      return { item, line: PRACTICE_REPLY_ANSWER, oneLiner: null };
    }
    // AND SINCE 2026-08-23 THE TASK IS SENT IN THE PRACTICE PROJECT, which
    // points at no folder at all. Everything below reads one, so it cannot run
    // here: a project that is not theirs has nothing honest to say about their
    // code. The answer is written down instead, and it is a decision an agent
    // made on its own, which is the shape the next beat teaches them to close.
    // No one-liner is written either; a practice project has no sidebar line to
    // earn.
    if (product?.practice) {
      const item = workItemsDisk.updateWorkItem(
        this.productDir(slug), id, { result: PRACTICE_ANSWER }, { source: 'agent' },
      );
      // AND THE RUN IT DID, so beat eleven opens onto a conversation. What she
      // opened on 2026-08-24 was the words "Nothing has been said here yet."
      // under the title of the first task anybody sends in Agentbox: the row had
      // a result and no thread at all. Backdated a few seconds so the run reads
      // as having happened before the answer rather than after it.
      this.writePracticeTrace(
        slug, id, PRACTICE_TASK_TRACE, Date.now() - PRACTICE_TASK_TRACE.length * 9_000,
      );
      return { item, line: PRACTICE_ANSWER, oneLiner: null };
    }
    const folder = product?.repoPath ?? null;
    const home = os.homedir().replace(/\/+$/, '');
    const shortFolder = folder && folder.startsWith(home + '/') ? '~' + folder.slice(home.length) : folder;
    const name = product?.name ?? slug;
    // THE ANSWER IS THE PRE-WRITTEN SENTENCE, ours, with her folder's numbers in
    // it. The description is a different fact and it is only ever a sidebar
    // line; see main/first-run.mts and shared/first-run-shape.mts.
    const line = answerFor({ folder, name } as { folder: string; name: string });
    const item = workItemsDisk.updateWorkItem(
      this.productDir(slug), id, { result: line }, { source: 'agent' },
    );
    const described = describeFor({ folder, name, shortFolder });
    if (described.found) this.setOneLiner(slug, described.line);
    return { item, line, oneLiner: described.found ? described.line : null };
  }

  /**
   * BEAT EIGHT'S THREE ROWS.
   *
   *  They are real work items in her real store, because the beat teaches
   *  clearing an inbox and a picture of an inbox teaches nothing about the keys
   *  that clear one. They carry the walk's own label, so the supervisor never
   *  spawns anything on them, and they say "Example." in their first word.
   *
   *  THE TWO WRITES PER ROW ARE THE WHOLE TRICK, and shared/first-run-examples
   *  says why: a row is in her inbox when an agent answered her after her last
   *  word on it, so her half is written at the moment the row claims to have
   *  landed and the agent's half a second later. Written by hand here rather
   *  than through composeItem because that one stamps everything `now`, and
   *  three rows all stamped now read as three rows that arrived in the same
   *  millisecond. */
  stageFirstRunExamples(slug: string, { now = Date.now(), label = 'first-run' }: { now?: number; label?: string } = {}) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    const ids: string[] = [];
    for (const example of EXAMPLES) {
      const at = stampsFor(example, now);
      const created = workItemsDisk.createWorkItem(
        dir,
        { title: example.title, kind: example.kind, priority: 5, labels: ['founder', label] },
        { source: 'system', now: at.hers },
      );
      workItemsDisk.updateWorkItem(dir, created.id, { title: example.title }, { source: 'founder', now: at.hers });
      workItemsDisk.updateWorkItem(dir, created.id, { result: example.result }, { source: 'agent', now: at.agent });
      ids.push(created.id);
    }
    return { ids };
  }

  /**
   * THE AGENT IMPORT, ARRIVING.
   *
   *  One row per agent ticked on the finish card, in the project the walk just
   *  made. They are ordinary work items and they are questions, which is what
   *  makes them wait: the supervisor never spawns fresh work on a question
   *  (`isFresh`, main/supervisor.mts), so nothing starts until the person says
   *  what the agent should do, and their reply spawns a worker the ordinary way
   *  (`isContinuation`). No new mechanism anywhere.
   *
   *  THE STAGGER IS THE SAME TRICK AS THE WALK'S EXAMPLES. Rows all stamped
   *  the same millisecond read as rows with no order, and these have one: the
   *  list the finish card showed. A second apart, oldest first, so the top of
   *  the inbox is the first agent on the card.
   *
   *  Written by hand rather than through composeItem because that one stamps
   *  everything now and marks it the founder's own. These are Agentbox asking,
   *  which is what lets a later session reword one.
   */
  importAgentRows(slug: string, chosen: { name?: string }[] | null | undefined, { now = Date.now(), home = os.homedir() }: { now?: number; home?: string } = {}) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    const product = this.listProducts().find((p) => p.slug === slug) ?? null;
    let existing: StoreItem[] = [];
    try { existing = workItemsDisk.readWorkItems(dir, now); } catch { /* a fresh project has none */ }
    const wanted = agentsNeedingRows(chosen, existing);
    const ids: string[] = [];
    wanted.forEach((agent: { name?: string }, i: number) => {
      const at = now - (wanted.length - 1 - i) * 1000;
      const row = agentImportRow(agent, { projectName: product?.name ?? null, home });
      const created = workItemsDisk.createWorkItem(
        dir,
        { title: row.title, kind: row.kind, priority: row.priority, labels: row.labels },
        { source: 'agent', now: at },
      );
      workItemsDisk.updateWorkItem(dir, created.id, { body: row.body }, { source: 'agent', now: at });
      ids.push(created.id);
    });
    const names = new Set((chosen ?? []).map((a) => String(a?.name ?? '').trim()).filter(Boolean));
    return { ids, added: ids.length, already: names.size - ids.length };
  }

  /**
   * HER OWN THREADS, ARRIVING THE SAME WAY.
   *
   * Deliberately the twin of `importAgentRows` above rather than a mechanism of
   * its own: an ordinary work item, a question so the supervisor waits
   * (`isFresh`, main/supervisor.mts), and her reply spawns a worker the way any
   * reply does. That is the whole specification and there is nothing under it.
   *
   *  Stamped a second apart, oldest last, so the newest thread on the card is
   *  the newest row in the inbox. `chosen` arrives newest first from
   *  `readSessionThreads`. */
  importThreadRows(slug: string, chosen: ImportedChat[] | null | undefined, { now = Date.now(), land = 'inbox' }: { now?: number; land?: string } = {}) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    let existing: StoreItem[] = [];
    try { existing = workItemsDisk.readWorkItems(dir, now); } catch { /* a fresh project has none */ }
    // Codex conversations on the same card are importCodexThreads's, below.
    const claude = (chosen ?? []).filter((t) => t?.source !== 'codex');
    const wanted = threadsNeedingRows(claude, existing);
    const ids: string[] = [];
    let done = 0;
    wanted.forEach((thread: ImportedChat, i: number) => {
      const { at, last } = chatTimes(thread, now - i * 1000);
      const row = threadImportRow(thread);
      const created = workItemsDisk.createWorkItem(
        dir,
        { title: row.title, kind: row.kind, priority: row.priority, labels: row.labels },
        { source: 'agent', now: at },
      );
      // Your words draw under You and the agent's under the agent.
      workItemsDisk.updateWorkItem(dir, created.id, { body: row.body }, { source: 'founder', now: at });
      if (row.result) workItemsDisk.updateWorkItem(dir, created.id, { result: row.result }, { source: 'agent', now: last + 1 });
      if (land === 'sorted' && !thread.waiting) {
        workItemsDisk.updateWorkItem(dir, created.id, { status: 'done' }, { source: 'founder', now: last + 2 });
        done += 1;
      }
      ids.push(created.id);
    });
    const seen = new Set(claude.map((t) => String(t?.id ?? '').trim()).filter(Boolean));
    return { ids, added: ids.length, already: seen.size - ids.length, done };
  }

  /* ---------------------------- codex conversations ----------------------- */
  // HER CODEX CONVERSATIONS ASK TO COME IN, AND HER YES OR NO DECIDES. The
  // words and the rules are in shared/codex-import.mts;
  // main/codex-watch.mts calls the first two every minute; the bridge calls
  // answerCodexImport when she answers.

  /** Every row in every product, each stamped with its product slug. */
  listAllWorkItems(now = Date.now()) {
    const { workItemsDisk } = this.modules;
    const out: (StoreItem & { product: string })[] = [];
    for (const p of this.listProducts()) {
      let items: StoreItem[] = [];
      try { items = workItemsDisk.readWorkItems(this.productDir(p.slug), now); } catch { items = []; }
      for (const item of items) out.push({ ...item, product: p.slug });
    }
    return out;
  }

  /**
   * WHICH PROJECT, WHEN SEVERAL POINT AT THE SAME FOLDER. Her store on
   *  2026-09-15 had seven projects on ~/Desktop/dev/zero, six of them empty test
   *  projects, and the first build filed into whichever the directory listing
   *  returned first ("Test Proj"). So: the one with the most work of its own,
   *  then the one she made first (project.json's createdAt), then the name. */
  homeForCodexThread(thread: CodexThreadLike, products: StoreProduct[], existing: StoreItem[] = []) {
    const matches = productsForThread(thread, products);
    if (matches.length <= 1) return matches[0] ?? null;
    const own = new Map();
    for (const item of existing) if (!codexIdOf(item)) own.set(item.product, (own.get(item.product) ?? 0) + 1);
    const made = (p: StoreProduct) => {
      try { return Date.parse(JSON.parse(fs.readFileSync(path.join(p.dir ?? this.productDir(p.slug), 'project.json'), 'utf8')).createdAt ?? '') || Infinity; } catch { return Infinity; }
    };
    return [...matches].sort((a, b) => (own.get(b.slug) ?? 0) - (own.get(a.slug) ?? 0) || made(a) - made(b) || String(a.name).localeCompare(String(b.name)))[0];
  }

  /**
   * FILE THE ASKING ROW for each conversation that has none yet, in the
   *  project whose folder it ran in. A conversation nobody's project points at
   *  gets nothing here; the ⌘K card offers it under a new project instead. */
  askAboutCodexThreads(threads: CodexThreadLike[], { now = Date.now() }: { now?: number } = {}) {
    const { workItemsDisk } = this.modules;
    const products = this.listProducts();
    const existing = this.listAllWorkItems(now);
    let asked = 0;
    for (const thread of codexThreadsNeedingRows(threads, existing)) {
      const product = this.homeForCodexThread(thread, products, existing);
      if (!product) continue;
      const row = codexImportRow(thread, { projectName: product.name, now });
      const dir = this.productDir(product.slug);
      const created = workItemsDisk.createWorkItem(
        dir,
        { title: row.title, kind: row.kind, priority: row.priority, labels: row.labels },
        { source: 'agent', now },
      );
      workItemsDisk.updateWorkItem(dir, created.id, { body: row.body }, { source: 'agent', now });
      asked += 1;
    }
    return asked;
  }

  /**
   * What the asking row already knows about its conversation, for a yes that
   *  arrives when the transcript cannot be read again. */
  codexThreadFromRow(item?: StoreItem | null) {
    const body = String(item?.body ?? '');
    const grab = (lead: string) => {
      const at = body.indexOf(lead);
      if (at < 0) return '';
      const rest = body.slice(at + lead.length);
      const end = rest.indexOf('\n\n');
      return (end < 0 ? rest : rest.slice(0, end)).trim();
    };
    return { id: codexIdOf(item), title: item?.title ?? '', prompt: grab('You asked: '), last: grab('Codex last said: ') };
  }

  /**
   * HER ANSWER. Yes turns the asking row into one she can read: her prompt as
   *  the body, Codex's last message as the result, open, in her inbox. No closes
   *  it under `not-imported`, which is where Closed finds it to offer it back.
   *  Yes on a row she once said no to is the same yes. */
  answerCodexImport(slug: string, id: string, choice: string, { thread = null, now = Date.now(), bodyAt = now }: { thread?: CodexThreadLike | null; now?: number; bodyAt?: number } = {}) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    const item = workItemsDisk.readWorkItem(dir, id, now);
    if (!item) return null;
    const rest = (item.labels ?? []).filter((l: string) => l !== CODEX_IMPORT_LABEL && l !== NOT_IMPORTED_LABEL);
    if (choice === 'no') {
      workItemsDisk.updateWorkItem(dir, id, { labels: [...rest, NOT_IMPORTED_LABEL] }, { source: 'agent', now });
      return workItemsDisk.updateWorkItem(dir, id, { status: 'done' }, { source: 'founder', now });
    }
    const t = { ...this.codexThreadFromRow(item), ...(thread ?? {}) } as CodexThreadLike;
    const patch = codexMirrorPatch(t);
    // it draws under You, not under an agent's name.
    workItemsDisk.updateWorkItem(dir, id, { body: patch.body }, { source: 'founder', now: bodyAt });
    const mirrored = workItemsDisk.updateWorkItem(dir, id, { kind: patch.kind, labels: patch.labels, result: patch.result }, { source: 'agent', now: now + 1 });
    // At the real moment: the rows above wear the chat's own time, and an engine older than the choice is ignored.
    workItemsDisk.updateWorkItem(dir, id, { engine: (patch as typeof patch & { engine?: string }).engine }, { source: 'agent', now: Math.max(now + 1, Date.now()) });
    // Only a row that was not open is reopened; on an open one the line reads
    // as "You sent it back" in the thread.
    if (item.status === 'open') return mirrored;
    return workItemsDisk.updateWorkItem(dir, id, { status: 'open' }, { source: 'founder', now: now + 1 });
  }

  /**
   * THE ⌘K CARD'S PRESS on Codex conversations: each becomes a readable row at
   *  once, whether it had an asking row, a declined one, or none. */
  importCodexThreads(slug: string, chosen: ImportedChat[] | null | undefined, { now = Date.now(), land = 'inbox' }: { now?: number; land?: string } = {}) {
    const { workItemsDisk } = this.modules;
    const dir = this.productDir(slug);
    const product = this.listProducts().find((p) => p.slug === slug) ?? null;
    let existing: StoreItem[] = [];
    try { existing = workItemsDisk.readWorkItems(dir, now); } catch { existing = []; }
    const ids: string[] = [];
    let already = 0;
    let done = 0;
    for (const thread of chosen ?? []) {
      if (thread?.source !== 'codex') continue; // a Claude Code thread is importThreadRows's
      const id = String(thread?.id ?? '').trim();
      if (!id) continue;
      const had = existing.find((i) => codexIdOf(i) === id);
      if (had && isCodexMirrorRow(had) && had.status !== 'done') { already += 1; continue; }
      let rowId = had?.id ?? null;
      const fresh = !rowId;
      // A row it already had keeps the import's time: an older line would lose
      // to what that row already says.
      const { at, last } = fresh ? chatTimes(thread, now) : { at: now, last: now };
      if (fresh) {
        const row = codexImportRow(thread, { projectName: product?.name ?? null, now });
        const created = workItemsDisk.createWorkItem(
          dir,
          { title: row.title, kind: row.kind, priority: row.priority, labels: row.labels },
          { source: 'agent', now: at },
        );
        workItemsDisk.updateWorkItem(dir, created.id, { body: row.body }, { source: 'agent', now: at });
        rowId = created.id;
      }
      this.answerCodexImport(slug, rowId!, 'yes', { thread, now: last + 2, bodyAt: fresh ? at + 1 : last + 2 });
      if (land === 'sorted' && !thread.waiting) {
        workItemsDisk.updateWorkItem(dir, rowId, { status: 'done' }, { source: 'founder', now: last + 4 });
        done += 1;
      }
      ids.push(rowId!);
    }
    return { ids, added: ids.length, already, done };
  }

  /**
   * KEEP THE ROWS SHE SAID YES TO CURRENT: when Codex writes another answer,
   *  the row's result follows it, which is what puts the news in her inbox. */
  /**
   * KEEP THE ASKING ROWS TRUE TOO: when the conversation has moved on, or a
   *  better read of the transcript says more than the row does, the body is
   *  rewritten. The body is the app's own words (agent source), so the fold
   *  takes it. This is also what repairs the rows the first build filed with
   *  "Codex has not answered yet." on every one of them (2026-09-15). */
  refreshCodexAsks(threads: CodexThreadLike[] | null | undefined, { now = Date.now() }: { now?: number } = {}) {
    const { workItemsDisk } = this.modules;
    const byId = new Map((threads ?? []).map((t) => [String(t?.id ?? ''), t]));
    const names = new Map(this.listProducts().map((p) => [p.slug, p.name]));
    let refreshed = 0;
    for (const item of this.listAllWorkItems(now)) {
      if (!isCodexImportRow(item)) continue;
      const t = byId.get(codexIdOf(item) as string);
      if (!t) continue;
      const row = codexImportRow(t, { projectName: names.get(item.product) ?? null, now });
      if (row.body === item.body) continue;
      workItemsDisk.updateWorkItem(this.productDir(item.product), item.id, { body: row.body }, { source: 'agent', now });
      refreshed += 1;
    }
    return refreshed;
  }

  refreshCodexMirrors(threads: (CodexThreadLike & { when?: number })[] | null | undefined, { now = Date.now() }: { now?: number } = {}) {
    const { workItemsDisk } = this.modules;
    const byId = new Map((threads ?? []).map((t) => [String(t?.id ?? ''), t]));
    let refreshed = 0;
    for (const item of this.listAllWorkItems(now)) {
      if (!isCodexMirrorRow(item) || item.status === 'done') continue;
      // Replied on here, so an agent here answers it from now on.
      if (item.answer) continue;
      const t = byId.get(codexIdOf(item) as string);
      if (!t) continue;
      // Written up here (main/catch-up.mts) since Codex last said anything: the write-up stands.
      const wroteUpAt = item.wrote?.problem?.ts ?? 0;
      if (wroteUpAt && (t.when ?? 0) <= wroteUpAt) continue;
      const patch = codexMirrorPatch(t);
      if (patch.result === item.result) continue;
      const labels = item.labels ?? [];
      workItemsDisk.updateWorkItem(this.productDir(item.product), item.id, { result: patch.result }, { source: 'agent', now });
      if (wroteUpAt && !labels.includes(CATCH_UP_LABEL)) workItemsDisk.updateWorkItem(this.productDir(item.product), item.id, { labels: [...labels, CATCH_UP_LABEL] }, { source: 'system', now });
      refreshed += 1;
    }
    return refreshed;
  }

  /**
   * The line under the project's name in the rail. Written in place, so a
   *  project.json that has grown other fields keeps them. */
  setOneLiner(slug: string, oneLiner: string) {
    const file = path.join(this.productDir(slug), 'project.json');
    try {
      const project = JSON.parse(fs.readFileSync(file, 'utf8'));
      project.oneLiner = oneLiner;
      fs.writeFileSync(file, JSON.stringify(project, null, 2));
      this.forgetProducts();
      return true;
    } catch {
      return false; // a sidebar line is not worth failing a first run over
    }
  }

  /* ------------------------------- dashboard ------------------------------ */
  // The rail's substance: the product's dashboard picture, folded by the store's
  // own rules so every reader agrees about state.
  readDashboard(slug: string, now = Date.now()) {
    const { dashboard } = this.modules;
    const file = path.join(this.productDir(slug), 'dashboard.jsonl');
    let lines: string[] = [];
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    } catch {}
    const picture = lines.length ? dashboard.foldLedger(lines, now) : dashboard.defaultDashboard(now);

    // Flatten that picture into what the rail renders: a headline, a few
    // rows, and the current intent. Unmeasured stays visibly unmeasured; it
    // never becomes a plausible figure (dashboard law).
    const asRow = (m: { label?: string; value?: unknown; unit?: string } | null | undefined) => ({
      label: m?.label ?? '',
      value: m?.value == null ? 'unmeasured' : String(m.value),
      unit: m?.unit ?? '',
      unmeasured: m?.value == null,
    });
    let headline = null;
    let rows: { label: string; value: string | Callout; unit: string; unmeasured: boolean }[] = [];
    try {
      const { key, others } = dashboard.metricRow(picture, { others: 4 });
      headline = key ? asRow(key) : null;
      rows = others.map(asRow);
    } catch {}
    if (picture.bottleneck) rows.push({ label: 'Bottleneck', value: picture.bottleneck, unit: '', unmeasured: false });
    return {
      stage: picture.stage,
      oneLiner: picture.oneLiner,
      headline,
      rows,
      intent: picture.nextMove ?? null,
    };
  }

  /* ------------------------------- watching ------------------------------ */
  // Watch every product dir for ledger changes; debounce into one onChange.
  // fs.watch on dirs is coarse but cheap, and the renderer refetches folds
  // rather than patching state, so a spurious event costs one re-read.
  watch() {
    this.unwatch();
    const dirs = [this.config.accountRoot, ...this.listProducts().map((p) => p.dir)];
    // The team chat and the teammates, which agents write to through the store
    // tools: watched so their words reach the screen as they are said.
    if (this.teammates) {
      try {
        const dir = this.teammates.dir();
        fs.mkdirSync(dir, { recursive: true });
        const watcher = fs.watch(dir, () => this._notify());
        watcher.on('error', () => {
          try { watcher.close(); } catch {}
          this.watchers = this.watchers.filter((w) => w !== watcher);
        });
        this.watchers.push(watcher);
      } catch {}
    }
    for (const dir of dirs) {
      try {
        const watcher = fs.watch(dir, (event, file) => {
          if (file && !/work-items\.jsonl|dashboard\.jsonl|project\.json/.test(file)) return;
          this._notify();
        });
        // fs.watch may return successfully, then emit an error (for example
        // EMFILE). An unhandled error takes down the app, outside this catch.
        // Reads still work without a watcher; release only the failed one.
        watcher.on('error', () => {
          try { watcher.close(); } catch {}
          this.watchers = this.watchers.filter((w) => w !== watcher);
        });
        this.watchers.push(watcher);
      } catch {}
    }
  }

  _notify() {
    clearTimeout(this._debounce as NodeJS.Timeout);
    this._debounce = setTimeout(() => this.onChange?.(), 150);
  }

  unwatch() {
    for (const w of this.watchers) try { w.close(); } catch {}
    this.watchers = [];
  }
}

/**
 * `HH:MM:SS` in local time, which is the clock a session trace is written in.
 *  IT IS UTC, THE SAME AS `traceStreamLine` IN main/supervisor.mts, AND THAT
 *  IS NOT A DETAIL. A trace carries a clock and no date, so the READER puts the
 *  date back: `momentOf` (renderer/src/notes.ts) takes the session's own
 *  startedAt, replaces its UTC hours and minutes with the ones on the line, and
 *  adds a whole day if the result lands before the session began.
 *
 *  So a line stamped in LOCAL time is read as if those digits were UTC, and on
 *  a Mac in California that is wrong twice over. Shot on 2026-08-24 at 22:38
 *  Pacific: the run wrote "22:38:07", the reader read 22:38 UTC, made it 15:38
 *  Pacific, found that was before the session started and added a day, and the
 *  pane printed "Mon, Aug 24 3:38pm" under a result stamped 10:37pm. Seventeen
 *  hours out and the work appeared to happen after the answer.
 *
 *  Pinned by tests/the-practice-project-is-the-whole-app.test.mjs, which writes
 *  a trace and reads it back through the renderer's own parser. */
function clockAt(ms: number) {
  return new Date(ms).toISOString().slice(11, 19);
}

/**
 * When a chat brought in happened: `at` when it started, `last` when it last
 *  moved. A chat with no time it can be trusted for, or one ahead of `fallback`
 *  (the moment of import), is stamped with `fallback`. */
function chatTimes(thread: { when?: unknown; startedAt?: unknown } | null | undefined, fallback: number) {
  const last = Number(thread?.when);
  if (!(last > 0 && last <= fallback)) return { at: fallback, last: fallback };
  const first = Number(thread?.startedAt);
  return { at: first > 0 && first <= last ? first : last, last };
}
