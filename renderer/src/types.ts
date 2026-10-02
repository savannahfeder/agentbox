// Mirrors of what the main process derives. The fold itself lives in
// shared/work-items.mjs; these are just the shapes that cross the bridge.

import type { Engine } from '../../shared/engines.mjs';

export interface WorkItem {
  id: string;
  product: string;
  productName: string;
  status: 'open' | 'claimed' | 'done' | 'blocked';
  title: string;
  // The short written name the LIST draws instead of the title, when a session
  // has written one. The title stays the user's own words; see WORK_ITEM_FIELDS in
  // shared/work-items.mjs for why this is a field of its own. Not to be
  // confused with `labels` below, which is a tag list and always was.
  label?: string;
  body?: string;
  kind: string;
  labels: string[];
  priority: number;
  epoch: number;
  claim: { holder: string; leaseUntil: number } | null;
  claimExpired?: boolean;
  answer?: string;
  // What the answer above is allowed to do, for the one run it starts. Absent
  // is the ordinary case and means the project's own setting.
  answerMode?: AnswerMode | null;
  result?: string;
  note?: string;
  parent?: string;
  // The moment before which nothing happens to this item: it cannot be claimed,
  // it will not start, and it is not in the inbox. 0 or absent is unscheduled.
  runAt?: number;
  // Which model this runs on, when she chose one on the card: a Claude Code
  // alias, depending on the engine beside it. The two vocabularies do not
  // overlap, which is why the pair only means anything read together
  // (`modelForEngine`, ../../shared/engines.mjs). Absent means the workspace
  // default.
  model?: string;
  // How hard it thinks, when she picked a level in the model drawer: one of
  // Claude Code's five effort words. Absent means the engine chooses.
  effort?: string;
  // Which coding agent picks it up, when she chose one. Absent means the
  // workspace default, which is every row on a Mac with one coding agent on it.
  // What it will REALLY run on is resolved in main and arrives on the snapshot
  // (`engines.byItem`); this is only what the row asks for.
  engine?: string;
  createdAt: number;
  updatedAt: number;
  // Per field, who set the value that survived the fold and when. The fold's own
  // bookkeeping, handed over rather than discarded, because an agent's `done`
  // and her archive are the same word for opposite events and the inbox has to
  // tell them apart (shared/work-items.mjs).
  wrote?: Record<string, { ts: number; source: string; by?: string } | undefined>;
  // THE TEAM FIELDS (shared/work-items.mjs). Absent on every private row.
  // `createdBy` is the person who started the row, `assignee` the person who
  // has to act next (or 'agent'), `runner` whose Mac runs its agents, `due` a
  // calendar day, `people` who is on the conversation.
  createdBy?: string | null;
  assignee?: string;
  runner?: string;
  due?: string;
  people?: string[];
  // THE THREAD'S OWN FIELDS (approved 2026-10-01, shared/work-items.mjs).
  // `visibility` absent reads as 'team'. The summary is shared: the agent keeps
  // it current and the person can edit it, and the later write wins.
  // 'people' is shared with the people in `visibleTo` and nobody else
  // (w-41ff964775); `visibleTo` means nothing beside the other two words.
  visibility?: 'team' | 'people' | 'private';
  visibleTo?: string[];
  problem?: string;
  progress?: string;
  solution?: string;
  blockedBy?: string[];
  blocks?: string[];
  // Set only on the synthesized rows that stand for a running Claude Code
  // agent. Its presence is what every action path checks: an agent row is drawn
  // by the same list and reached by the same keys, and nothing may write it to
  // a ledger it does not live in.
  agent?: AgentSession;
}

export interface Product {
  slug: string;
  dir: string;
  name: string;
  oneLiner: string;
  repoPath: string | null;
  // THE MARK SHE PICKED FOR THIS PROJECT, already a url this window can draw.
  // Null on a project that has never been given one, and that is what makes
  // `ProductMark` draw its burst instead. Resolved by `listProducts` against the
  // file on disk, so a picture she has since deleted goes back to the burst
  // rather than drawing as a broken image (main/project-identity.mjs).
  logo?: string | null;
  // THE PRACTICE PROJECT SAYS SO ABOUT ITSELF. Read off project.json by
  // `listProducts` (main/store.mjs) rather than matched on a name, because
  // "Practice" is a name somebody could reasonably give a real project of their
  // own, and what turns on this flag — never running an agent in it, drawing a
  // band over it, never being the project the compose card opens on — must
  // never happen to real work. Optional because every fixture in this repo
  // predates it and none of them is a practice project.
  //
  // main/store.mjs has written it since; it simply had no mirror on this side,
  // so the renderer could not see the one fact that decides whether a task sent
  // into a project will ever run. The compose card reads it (compose-says.ts),
  // because the supervisor refuses to start a session in a practice project on
  // purpose and the card used to take the task anyway.
  practice?: boolean;
  // SHARED OR PRIVATE (main/team/projects.mjs). Null or absent is private.
  // `direct` marks the record a message between two people lives in, which is
  // not a project and holds no work (main/team/projects.mjs makeDirect).
  team?: { projectId: string; teamId: string | null; visibility: 'team' | 'people'; people: string[]; sharedBy: string | null; direct?: boolean } | null;
}

/** A person on the team, as the cloud knows them. */
export interface Person {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  /** On a team's member list: who owns it (and so may rename it and remove people). */
  role?: 'owner' | 'member';
  /** A line they wrote about themselves, so a day in meetings is not read
   *  off the Team page as idleness, and when it stops holding. Read it
   *  through `saying` in team/status.tsx, never straight: one whose time has
   *  passed is nothing, on the reading Mac's own clock. */
  status?: { text: string; until: number | null } | null;
}

/** What every team call answers: the team as it now stands, or why not. */
export interface TeamCallResult {
  ok: boolean;
  team?: TeamState;
  error?: string;
  /** A new account that waits on the link in its confirmation email. */
  confirm?: boolean;
}

export type ThreadStateWord = 'waiting' | 'running' | 'scheduled' | 'done';

/** What a teammate sees of one of your threads: its summary and nothing more. */
export interface ThreadCard {
  personId: string;
  threadId: string;
  visible: boolean;
  title: string | null;
  project: string | null;
  state: ThreadStateWord;
  priority: number | null;
  problem: string | null;
  progress: string | null;
  solution: string | null;
  blockedBy: { id: string; title: string | null }[];
  blocks: { id: string; title: string | null }[];
  /** Whom it reaches: the chosen people, or null for the whole team. */
  people: string[] | null;
  updatedAt: number;
}

/** The team, as the main process sees it (main/team/index.mjs). */
export interface TeamInvite {
  teamId: string;
  teamName: string;
  invitedBy: string | null;
  invitedByName: string | null;
}

export interface TeamState {
  configured: boolean;
  /** The first look for a saved sign-in is over (false while it is still being found). */
  started?: boolean;
  /** When this person began sharing on this Mac: threads started before it stay theirs unless shared by hand. */
  since?: number | null;
  /** The invites this team has out that nobody has taken up yet. */
  sent?: { email: string; invitedBy: string | null }[];
  signedIn: boolean;
  me: Person | null;
  team: { id: string; name: string } | null;
  /** Invites waiting for your confirmed email, while you are in no team. Joining one needs your yes. */
  invites?: TeamInvite[];
  people: Person[];
  /** Every card in the team, yours included (shared/thread-cards.mjs). */
  cards: ThreadCard[];
  lastSyncAt: number | null;
  error: string | null;
}

export interface RunningSession {
  itemId: string;
  product: string;
  startedAt: number;
  /**
   * WHICH CODING AGENT REALLY STARTED THIS RUN, written at the spawn — a fact,
   *  where `snapshot.engines.byItem` is the supervisor's answer for the NEXT
   *  one, so the byline prefers this while a run is up. Absent on a session
   *  that started before a second engine existed, and every one of those was
   *  Claude Code, which is the reading `engineOf` makes in main/supervisor.mjs. */
  engine?: string;
  tail: string[];
  /** Matched, still-running tool calls; absent on an older main process. */
  activity?: { id: string; label: string; detail: string; startedAt: number }[];
  /**
   * THE PROSE BEING TYPED RIGHT NOW, growing between snapshots — the live half
   * of. Empty between sentences and on any session that started before this
   * existed. It is never on disk: the trace still keeps whole lines only, and
   * this is dropped from the thread the moment the trace carries the same
   * words (`itemThread`). */
  saying?: string;
  /** When that block started being typed, so it sorts against the rest. */
  sayingAt?: number;
  // HELPERS OUT RIGHT NOW, counted off the stream in `countHelpers`
  // (main/supervisor.mjs). Absent whenever there are none, which is every
  // ordinary run, so the mark at the foot of a task keeps its one word.
  helpers?: number;
}

/**
 * What opening a second Agentbox as a brand new user did. `home` is the
 *  throwaway folder its whole world lives in, and `notes` are the things that
 *  copy will be missing — no Claude Code, no keychain, no agent files — said
 *  out loud, because a test copy that quietly cannot run an agent is a test
 *  that lies. See main/fresh-user.mjs. */
export interface FreshUser {
  ok: boolean;
  home?: string;
  agents?: boolean;
  notes?: string[];
  pid?: number | null;
  error?: string;
}

/**
 * What opening the demo inbox did. The same second Agentbox in a throwaway home,
 *  with an invented studio seeded into its store first, so it opens on rows
 *  instead of on the welcome screen. `rows` and `products` are counted off what
 *  was actually written, never assumed, so the toast can say how much is in
 *  there. See main/demo.mjs. */
export interface DemoOpened {
  ok: boolean;
  home?: string;
  products?: string[];
  rows?: number;
  notes?: string[];
  pid?: number | null;
  error?: string;
}

/**
 * ONE LIMIT, AS WHICHEVER CODING AGENT REPORTED IT (shared/usage.mjs). Claude
 *  Code reports three -- the session, the week, and the week for one model
 *  (shared/claude-usage.mjs). Codex reports up to two, a five hour window and a
 *  week, and either of them can be absent (shared/codex-usage.mjs). */
export interface UsageLimit {
  span: 'session' | 'week';
  /**
   * Claude Code's own word for which model a weekly line is about ("all
   *  models", "Fable"), kept as the CLI wrote it. Null on every Codex limit:
   *  nothing in that payload is about a model. */
  qualifier: string | null;
  /**
   * WHAT THE PANEL CALLS IT, IN PLAIN WORDS, stamped on by the reader that
   *  produced it rather than derived where it is drawn. Deriving it meant one
   *  branch for Claude Code's spans and no honest answer for anything else,
   *  which is how "This week, Fable" -- a Claude model -- could have appeared
   *  over a Codex reading (2026-09-05). */
  name: string;
  percent: number;
  /**
   * The clock time it starts over, always true. Null on a Codex limit, which
   *  carries the instant itself and no text at all. */
  resetsText: string | null;
  /**
   * The day it falls on, as the command wrote it ("Sep 3"), for the rows whose
   *  reset is not today. Null wherever `resetsText` is. */
  resetsOn: string | null;
  /**
   * When that is, or null when it could not be worked out honestly (a Claude
   *  stamp computed in another timezone; a Codex window with no reset on it).
   *  Then the clock time is printed instead, or nothing. */
  resetsAt: number | null;
  zone: string | null;
}

/**
 * What was left of ONE coding agent's limit at `at`. Null on the snapshot until
 *  the first reading lands -- which for Claude Code costs twenty-five seconds,
 *  and for Codex may never happen at all on a Mac that has run no Codex work. */
export interface Usage {
  /**
   * WHOSE SUBSCRIPTION THIS IS, resolved by main and never here
   *  (`usageEngine`, shared/usage.mjs). The corner is about the agent most of
   *  her live work is on, and the workspace's own when nothing is running: the
   *  byline's rule that what is running beats what would run, asked about the
   *  app instead of about a row. It is only ever DRAWN where this Mac has two
   *  agents to tell apart, which is `engineWordFor`'s rule in ./byline. */
  engine: string;
  limits: UsageLimit[];
  at: number;
}

export interface SupervisorStatus {
  paused: boolean;
  running: RunningSession[];
  // Items whose answer was marked delivered but whose worker stopped without
  // finishing: no session, no progress. The UI says "stopped" and offers the
  // one-key restart (zero:redeliver).
  stalled?: string[];
  // Items a tick will spawn as soon as a slot frees: waiting their turn, not
  // forgotten. The row says "queued" so the two are never confused.
  queued?: string[];
  // Due later, so neither queued nor forgotten: a third state, and one the
  // user set on purpose.
  scheduled?: string[];
  // ROWS WHOSE LAST RUN ENDED HAVING WRITTEN NOTHING, keyed by item id
  // (`_silentRows` in main/supervisor.mjs). Not `stalled`, which is a worker
  // that DIED and is red; this is a run that ended perfectly cleanly and simply
  // said nothing, which used to be indistinguishable from a row nobody had
  // touched. The chosen fix: say it on the row.
  silent?: Record<string, { runs: number; endedAt: number; until: number }>;
  // User-set standing product ranks: 1 high, -1 low, absent = normal.
  productOrder?: string[];
  hiddenProducts?: string[];
  capacity: number;
  // Which Claude accounts are in trouble and what kind. Always current, because
  // the only thing that reads it is a page she chose to open.
  accountTrouble?: Record<string, { cause: TroubleCause; since: number }>;
  // THE ONE LINE ABOVE THE LIST, and null unless it is really true and has been
  // for twenty unbroken minutes. Two facts can fill it: tasks nothing has been
  // able to run on (design option four), or nothing being able to start anywhere at
  // all. `mixed` is the first of those with more than one reason behind it.
  // `message` and `remedy` are Agentbox's own sentences, never the tool's text:
  // the raw words stay in the session's trace log, which is where somebody
  // debugging wants them and where she never has to read them.
  spawnTrouble?: {
    since: number;
    cause: TroubleCause | 'mixed';
    message: string;
    remedy: string;
    retryAt: number;
    // The same rows counted PER CAUSE, so a look above the list can say what
    // each failure is instead of only how many there are. Every string is
    // written once, in shared/spawn-trouble.mjs; nothing here is worded in the
    // renderer. `act` is null when there is honestly nothing to press, which is
    // true of a limit and of a dropped connection.
    count?: number;
    resetsAt?: string | null;
    byCause?: { cause: TroubleCause; count: number; what: string; next: string; act: string | null; hers: boolean }[];
    // WHICH ROWS THEY ARE, not just how many, so the row that counts them can
    // put them underneath itself instead of claiming, above a list grouped by
    // day, that the rows below are the ones it means.
    ids?: string[];
    // THE SAME ROWS, EACH WITH WHAT IT IS WAITING ON. This is what the opened
    // row reads.
    stopped?: { id: string; cause: TroubleCause }[];
  } | null;
}

// 'interrupted' is a run the machine or the network cut off, and it is the one
// of the five that asks nothing of her. It is kept apart from 'unknown'
// because the generic wording tells her something will keep failing until it
// is fixed, and a Mac that went to sleep is not a thing to fix. 'org-blocked'
// is an account that IS signed in and whose organization has Claude Code
// turned off. It is apart from 'signed-out' because the remedy has a different
// person in it: no login she can type will end it, and being told to type one
// can cost an afternoon.
export type TroubleCause = 'signed-out' | 'org-blocked' | 'at-limit' | 'workspace' | 'interrupted' | 'unknown';

// A worker frozen mid-action, waiting on the user's allow/deny.
export interface Approval {
  id: string;
  at: number;
  product: string | null;
  item: string | null;
  tool: string;
  input: Record<string, unknown>;
}

// One live Claude Code session on this machine, as the main process measured
// it. Not a work item and never in a ledger: `main/agents.mjs` reads these off
// `~/.claude/sessions` and `claude agents --json` every couple of seconds.
export interface AgentSession {
  pid: number;
  ppid: number;
  sessionId: string | null;
  name: string;
  cwd: string;
  startedAt: number;
  // The session's own word for what it is doing. 'waiting' is the only one that
  // reaches her inbox; `waitingFor` says whether a reply can clear it.
  status: string | null;
  waitingFor: string | null;
  lastActiveAt: number;
  lastSaid: string;
  // WHAT THE SESSION IS ABOUT, so the card is not three lines about a pid.
  // `about` is the one-line title the session wrote for itself, `lastAsked` is
  // the last thing the USER typed into it, `touched` the files it has had its hands
  // on. All three are read off the transcript tail main/agents.mjs was already
  // reading, so none of them costs a model anything.
  about?: string;
  lastAsked?: string;
  touched?: string[];
  // AND EVERY MESSAGE THE USER TYPED, oldest first. The card still did not
  // make a five-day-old session recognisable, because it showed the user's
  // LAST message and never the first. The first is the ask, in every live
  // session measured.
  asked?: { at: number; text: string }[];
  product: string | null;
  productName: string | null;
  // The moment the USER chose to come back to it, and when that was set. Set by
  // the user and by nobody else: an agent row has no ledger and no agent can
  // reach this. Absent or past is "not put off" — main/agent-schedule.mjs drops
  // a moment the instant it stops meaning anything.
  runAt?: number;
  runAtSetAt?: number;
  // The moment she closed the row. Any value above zero means closed and it
  // stays closed whatever the session does next (`putAway` in shared/agents.mjs).
  doneThrough?: number;
  /** When she last spoke to it from Agentbox. See tookHerReply in shared/agents.mjs. */
  repliedAt?: number;
  /** The session's own stamp on its own status. */
  statusAt?: number;
  // the app's own workers, folded out of everything she sees: they are already in
  // her inbox as work items, and a second row about the same agent is a
  // rejected duplicate picture.
  startedByZero: boolean;
}

// ONE TURN OF A CONVERSATION THE USER OPENED. Hers reads at full strength and
// the agent's is quiet, the same split the pane makes everywhere else. `at` is
// the moment it was written, so a five-day-old thread groups by day like the
// ledger does.
export interface AgentTurn {
  at: number;
  who: 'you' | 'it';
  text: string;
  // Which person wrote it, on a shared project (the team version). A message
  // from a teammate is drawn with their face and name instead of "You".
  by?: string;
  // A CONTINUATION OF THE BLOCK ABOVE, not a new message. Shape B puts the
  // work between the messages, so a reply that stopped for a tool is drawn as
  // two blocks with the thing it ran between them. They are still one reply:
  // the count says so, and the second block wears no second name and time.
  same?: boolean;
  // THE FIRST BLOCK ON THE FAR SIDE OF THE GAP, set by `threadWindow`. It is
  // still a continuation for counting and no longer one for drawing: what it
  // continued is in the middle she cannot see.
  resumed?: boolean;
  // SHE HAS SENT IT AND THE RUNNING AGENT HAS NOT TAKEN IT YET.
  //
  // The cause is in main/claude-input: a live reply is written to the ledger
  // only after Claude replays it back, which it does at its next break, and the
  // thread draws the ledger. So the message she had just typed was on no screen
  // at all until the agent paused, and the wait before that is allowed to run
  // to 120 seconds.
  //
  // A message wearing this is the user's, in the thread, from the moment she presses
  // send. Nothing about it is stored, and the committed copy takes its place
  // the moment it lands (item-thread.ts).
  pending?: boolean;
  // AND STILL TAKEABLE BACK, which is the first three seconds of that wait
  // (w-5281ef1221). A label saying the message was still sending made it look
  // as if it should be undoable. The difference is real rather
  // than cosmetic: until the window closes nothing has been written anywhere,
  // and after it `steer` has put the user's words on the session's stdin and no undo
  // can reach them. So the message says which of the two it is in.
  held?: boolean;
  // THE ROW THE WORDS WERE SAID ON, when they came from somewhere other than here.
  //
  // The ask usually lives on the PARENT row, and the pane used to quote it in a
  // grey box above the conversation.So it is an ordinary message now, first in
  // the thread and whole, and this carries the one thing the box had that a
  // message does not: which row those words are on, and the way back to it.
  on?: string;
}

// ONE THING THE AGENT RAN, on its own quiet line between the messages.`lines`
// is how many lines actually came back and `output` is as much of it as is
// kept, so the two disagreeing is how the screen knows to say what it is not
// showing. `more` rides the last line of a run that was cut and says how many
// others there were.
export interface AgentWork {
  kind: 'work';
  at: number;
  verb: string;
  subject: string;
  // THE WHOLE STRING, when `subject` is a shortened form of it. 61% of the
  // work lines on a real machine were cut by the ellipsis and the six worst
  // showed 2% of themselves, so the subject is now shortened on purpose rather
  // than clipped by accident. This is what makes that recoverable: it sits
  // above the output on the line she opened, and it is empty whenever
  // shortening changed nothing.
  full?: string;
  // THE FILE THIS CALL CHANGED, whole and unshortened, when it changed one. It
  // is what turns the path on a work line into a chip that opens the code, and
  // it is empty on every line that did not write a file: a command, a search, a
  // read. `subject` cannot be used for it — the subject has been shortened from
  // the front for the screen, and what this is matched against is the change's
  // own list of paths.
  file?: string;
  output: string;
  lines: number;
  failed: boolean;
  more?: number;
}

export type AgentEvent = (AgentTurn & { kind?: undefined }) | AgentWork;

// What comes back when she opens one. `total` is every readable message in the
// file and `omitted` is how many of them are not on screen: a session with 400
// turns is a scroll bar, not a recall, so the opening and the end are kept and
// the middle is counted out loud rather than dropped quietly.
export interface AgentConversation {
  ok: boolean;
  name?: string | null;
  turns?: AgentEvent[];
  omitted?: number;
  total?: number;
  reason?: string;
}

/**
 * Where Agentbox is in keeping itself current. Written only by main/updater.mjs.
 *
 * `idle` nothing has been asked yet, `checking` mid-question, `current` there
 * is nothing newer, `downloading` one is coming, `ready` it is on disk and the
 * restart is hers to press, `error` the last look failed, `unsupported` this
 * copy cannot update itself (and `error` says why), `installing` the restart
 * was pressed on a copy run from source and it is rebuilding first.
 */
export type UpdatePhase = 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'installing' | 'error' | 'unsupported';

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string | null;
  newVersion: string | null;
  percent: number | null;
  error: string | null;
  checkedAt: number | null;
  // WHEN THE DOWNLOAD FINISHED. The inbox row built from this wears it at its
  // right end, where every other row says how old it is (update-row.ts). Null
  // in every phase but `ready`, because there is nothing waiting to be old.
  readyAt: number | null;
  // The one question the screens ask. Kept on the state so no screen has to
  // learn which phase strings mean "there is a button to press".
  ready: boolean;
  // A COPY RUN FROM SOURCE (main/source-updater.mjs): that it is one, the
  // newest change titles, how many changes there are in all, and whether the
  // restart was pressed and it is rebuilding. Optional so fixtures written
  // before them still type.
  source?: boolean;
  changes?: string[];
  behind?: number | null;
  installing?: boolean;
}

export interface Snapshot {
  products: Product[];
  items: WorkItem[];
  // The team (main/team/index.mjs). Null or absent on a build with no team
  // cloud, which is the single-person app.
  team?: TeamState | null;
  agents?: AgentSession[];
  approvals?: Approval[];
  supervisor: SupervisorStatus;
  // Main-process files written since this process read them: code that exists
  // and is not running. ⌘R will not pick it up, only a restart will, and the
  // renderer says so. Null when the running app IS the app on disk.
  restartNeeded?: { files: string[]; since: number } | null;
  /**
   * What was left of her rate limit at the last reading, or null before the
   * first one lands. It rides the snapshot for the same reason `restartNeeded`
   * does: it changes while the app is open. */
  usage?: Usage | null;
  usageByEngine?: Usage[];
  // Whether a newer Agentbox has already downloaded itself and is waiting for a
  // restart (main/updater.mjs). It rides the snapshot rather than boot-info for
  // the same reason `restartNeeded` does: it becomes true hours into a session,
  // on a screen she is already looking at.
  update?: UpdateState;
  /**
   * WHETHER THERE ARE TWO CODING AGENTS TO CHOOSE BETWEEN, AND WHICH ONE EACH
   * ROW RUNS ON. Answered whole by `Supervisor#engineFacts`, because the
   * capability gate and the rule that an old default is not a choice being
   * made now are pinned to that one file; a screen that worked either out for
   * itself could draw "Codex" over a row about to run on Claude Code. It rides
   * the snapshot rather than the settings model because the INBOX reads it, on
   * every row.
   *
   *  `choices` is one entry long on every Mac until she opens the gate, and the
   *  three surfaces that read it all say the same thing about that: nothing new
   *  is drawn. `byItem` names only the rows whose engine DIFFERS from
   *  `workspace`, so the read on this side is `byItem[id] ?? workspace` and the
   *  map is usually empty. Optional so an older payload still
   *  typechecks. */
  engines?: {
    choices: Engine[];
    workspace: string;
    byItem: Record<string, string>;
  };
  // `outsideAgents` is how many of her own Claude Code sessions the inbox
  // takes: all of them, only the ones stopped on a question, or none. It rides
  // the snapshot because the inbox reads it on every draw. How much of the
  // conversation a card carries is NOT in here, deliberately: one shape was
  // chosen and it is the only one.
  config: {
    outsideAgents?: AgentMode;
    // The mode a project's agents really run in, by project slug, with the
    // workspace answer under the empty-string key. It rides the snapshot
    // because the REPLY BOX prints it on every thread, and the settings model
    // is only fetched while the settings screen is open.
    //
    // Resolved in main by `supervisor.effectivePermission`, which walks the
    // same branches the spawn does. Never computed here: a second resolver in
    // the renderer is a second answer, and the whole point of printing it is
    // that it is the true one.
    permission?: Record<string, PermissionMode>;
  };
}

// FOUR, not five.
export type View = 'inbox' | 'snoozed' | 'progress' | 'done' | 'all';

// How many of her own Claude Code sessions the inbox takes. 'all' so she can go
// through them once and close them, 'waiting' for only the ones stopped on a
// question, 'off' for somebody who processes their agents somewhere else
// entirely. The values are AGENT_MODES in shared/agents.mjs, which is the one
// place that decides what any of them means.
export type AgentMode = 'all' | 'waiting' | 'off';

/* ------------------------------- settings -------------------------------- */
// What a session may do. THESE ARE CLAUDE CODE'S OWN SIX PERMISSION MODES AND
// ITS OWN VALUES FOR THEM, not names of ours: read off `claude --help` and off
// code.claude.com/docs/en/permission-modes on 2026-08-23, and handed to the
// real CLI one by one to check it takes each. `default` is the config value
// Claude Code uses for the mode it labels Manual.
//
// Plus the honest seventh: flags that are none of the six. 'custom' is never
// rounded to the nearest mode, because a screen that says "Accept edits" over
// grants that are not that is a screen lying about the fleet.
/**
 * CODEX'S THREE, and they are not permission modes. Claude Code's six and these
 *  do not map onto each other in either direction: each of these is a SANDBOX
 *  plus an approval policy, which is one choice on that engine and two on this
 *  one. shared/codex-modes.mjs is the list and the reasoning; this is only the
 *  type, because .mjs cannot carry one.
 */
export type CodexModeId = 'read-only' | 'auto' | 'full-access';

/**
 * WHAT A ONE-MESSAGE MODE CAN BE, on either engine. A row has one engine, so
 *  only one of the two vocabularies is ever reachable from it; this union is
 *  what the value looks like in transit, between the reply box and the run that
 *  spends it. Each consumer filters by its own list.
 */
export type AnswerMode = PermissionMode | CodexModeId;

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions'
  | 'custom';

export interface AccountSetting {
  profile: string;
  label: string;
  dir: string | null;
  // WHOSE SUBSCRIPTION THIS ROW IS. `label` is a folder name and was the only
  // thing the page ever showed, so a row could change account underneath her
  // and read exactly the same. Null when the folder holds no login yet.
  // `accountUuid` is what tells two rows apart when the same person owns both
  // emails.
  email: string | null;
  accountUuid: string | null;
  /**
   * Whether her work runs on THIS account and no other. False on every row
   * until she picks one, and then every account runs as it always has. */
  chosen?: boolean;
  live: boolean;
  // 'live' and 'resting' are the healthy pair; anything else is the reason this
  // account cannot be used, and 'signed-out' is the only one of them she can do
  // something about from a terminal ('org-blocked' needs an admin of that
  // workspace, which may not be her). `note` is the sentence to print.
  state: 'live' | 'resting' | TroubleCause;
  trouble: { cause: TroubleCause; since: number; note: string } | null;
  cooldownUntil: number;
  running: number;
  /**
   * The Claude plan this subscription is on, read out of Claude Code's own
   *  config file (main/claude-plan.mjs). Null when it cannot be read, and then
   *  no screen says anything about a plan at all. Optional so an older payload
   *  still typechecks. */
  plan?: { label: string | null; max: boolean } | null;
}

export interface ProjectSettings {
  slug: string;
  name: string;
  dir: string;
  repoPath: string | null;
  /** Her mark for this project as a drawable url, or null for the burst. */
  logo: string | null;
  autonomous: boolean;
  permission: PermissionMode | 'workspace';
  permissionArgs: string[] | null;
  /** This project's own Codex mode, or 'workspace' when it has no opinion. */
  codexMode: CodexModeId | 'workspace';
  // The user's rules for this project, as they sit on disk. Empty means the file does
  // not exist, and a project without one is briefed exactly as it always was.
  instructions: string;
  running: number;
}

export interface WorkspaceSettings {
  agentsRunning: boolean;
  sessionsAtOnce: number;
  /**
   * The Claude plan that set `sessionsAtOnce`, when a plan set it, so the
   *  Agents page can say why the number is what it is. Null whenever the
   *  number was chosen by hand or is the one every install has always had.
   *  Optional so an older payload still typechecks. */
  sessionsAtOnceFromPlan?: string | null;
  /**
   * How many agents we SUGGEST for this Mac, worked out from its memory and its
   * cores (main/machine.mjs). It chooses the number somebody starts on and it
   * is what `machineNote` recommends. IT IS NOT A CEILING: these are developers
   * using the tool as they want, and nothing clamps to it. */
  slotsSuggested?: number;
  /**
   * The stepper's own top end, the same number on every Mac. Optional, and the
   * page falls back to 12, so an older payload draws what it always drew. */
  slotsMax?: number;
  /**
   * The one sentence saying what this Mac is and what we would run on it, or
   *  null once somebody is already at or under it. Main's words, not the
   *  page's. */
  machineNote?: string | null;
  capacity: number;
  running: number;
  model: string | null;
  /**
   * WHICH CODING AGENT PICKS A TASK UP when the task says nothing, and which
   * ones she may choose between at all. `engineChoices` is
   * `Supervisor#engineChoices`, so it is one entry long on every Mac until she
   * opens the gate and the Coding agent row is not drawn there. */
  engine?: string;
  engineChoices?: Engine[];
  /**
   * What Codex calls its models on THIS Mac, and what its own config.toml runs.
   *  Both empty/null unless there is a choice, because reading them means
   *  parsing the 199KB cache codex-cli keeps and nothing would read the answer.
   *  See main/codex-models.mjs. */
  codexModels?: Array<{ id: string; label: string; levels?: string[]; defaultLevel?: string | null }>;
  codexModelDefault?: string | null;
  /**
   * What CLAUDE CODE calls its models on THIS Mac, read off the installed
   * binary rather than off the table committed when Agentbox was built, so a
   * `claude update` reaches her picker without a release. `id` is the alias
   * Agentbox sends; `model` is what it resolves to today. Always present and
   * never empty: main falls back to the committed table on a Mac with no
   * Claude Code. See main/claude-models.mjs. */
  claudeModels?: Array<{ id: string; label: string; model?: string; defaultLevel?: string | null }>;
  /**
   * What SHE has set for the whole workspace, when she has set anything: the
   *  value the Model row draws once Codex is the coding agent, and the model a
   *  Codex row that names none actually runs on
   *  (`Supervisor#codexThreadParamsFor`). Null means she has set none, and then
   *  nothing is sent and her own ~/.codex/config.toml decides. */
  codexModel?: string | null;
  /**
   * WHETHER THIS MAC HAS ASKED TO HEAR ABOUT CODEX AT ALL, and the three facts
   *  the connection card is drawn from. Absent -- which is every Mac until
   *  somebody writes the opt-in moment into zero.config.json -- means the card
   *  is not drawn and Settings says nothing about Codex anywhere.
   *
   *  It is NOT `engineChoices.length > 1`. That answers "is there a CHOICE",
   *  which is false on the one Mac this card exists for: the gate open and
   *  Agentbox unable to see her Codex. See `Supervisor#engineChoiceOpened`.
   *
   *  `trouble` is why nothing runs on it DESPITE it being here, or null. Being
   *  found is not being usable: a lapsed subscription leaves the binary exactly
   *  where it was and stops every task on that engine.
   *
   *  `account` is who this Mac is signed into Codex as, and every field of it is
   *  independently null: an API-key login has no email and no plan. Null
   *  altogether when nobody is signed in (main/codex-account.mjs). */
  codex?: {
    found: boolean; certain: boolean; bin: string; url: string; trouble: string | null;
    account?: { email: string | null; name: string | null; plan: string | null; planNamed?: boolean; mode: string | null; accountId: string | null } | null;
    /**
     * EVERY Codex login on this Mac, one per `codexProfiles` word. The
     * supervisor has run an app-server per CODEX_HOME since a second login
     * became real; this is the first thing that can see them all. `profile`
     * is the word the fleet spawns on. */
    accounts?: Array<{
      profile: string; email: string | null; name: string | null;
      plan: string | null; planNamed?: boolean; accountId: string | null;
      signedIn: boolean; chosen: boolean;
    }>;
  } | null;
  permission: PermissionMode;
  permissionArgs: string[];
  /** What a Codex worker may do across the workspace. Never 'workspace' here. */
  codexMode: CodexModeId;
  // One switch over everything that leaves the machine, on at install
  // (legal/privacy.html section 10). `diagnosticsDestination` is whether this
  // copy has anywhere to send to at all: a build from source does not.
  diagnostics: boolean;
  diagnosticsDestination: boolean;
  // Whether the ADHD mode rules ride under "How agents write to you". Off
  // unless she turned it on (w-5737fe67cf).
  adhdMode?: boolean;
  outsideAgents: AgentMode;
  accounts: AccountSetting[];
  /**
   * Set only when two rows turn out to be the same Claude account, which is
   *  two folders and one subscription and therefore no extra capacity. */
  accountsNote: string | null;
  storePath: string;
  /**
   * The home folder, said by main rather than derived from `storePath`.
   * Optional so an older payload still typechecks. */
  homePath?: string;
  claudeBin: string;
  claudeFound: boolean;
  // Whether the search for Claude Code got an answer at all, as opposed to
  // failing to reach the machine. Nothing may say "missing" without it.
  claudeCertain: boolean;
  // Where to send someone who does not have it. One copy, in main/claude-bin.mjs.
  claudeInstallUrl: string;
  // The same two facts about Codex. Either engine is enough to run the app, so
  // the walk's last card shuts the inbox only when both are missing for sure.
  // Optional so an older main process still typechecks.
  codexFound?: boolean;
  codexCertain?: boolean;
  codexInstallUrl?: string;
  standingLines: number;
  // How much of the message rules is left after her edits. Zero means she
  // emptied the box, and no session is briefed with any of them. ONE count
  // since w-3dc46f3a67, where the writing rules and the finishing rules were
  // two documents and two boxes.
  messageRulesLines: number;
  projectsWithInstructions: number;
  projectCount: number;
}

export interface Settings {
  ok: boolean;
  error?: string;
  workspace: WorkspaceSettings;
  projects: ProjectSettings[];
}

// A repeating task: a RULE, not a work item, so it never runs, is never claimed
// and cannot be finished by a worker. Its runs are ordinary items labelled
// repeat:<id>, which is also how the run log finds them.
// What a schedule IS, apart from the rule that carries it: the composer and the
// reply box hand this shape around before any rule exists.
export interface RepeatShape {
  every: 'day' | 'weekday' | 'week';
  on?: number;
  at: string;
}

export interface RepeatRule {
  id: string;
  product: string;
  productName: string;
  title: string;
  body?: string;
  priority?: number;
  every: 'day' | 'weekday' | 'week';
  on?: number;              // 0..6 when every is 'week'
  at: string;               // 24h local time, "09:00"
  // Which coding agent and which model every run of this rule is marked with.
  // Absent on a rule that names neither, which is every rule written before the
  // picker existed; those runs go to the workspace default like any unmarked row.
  engine?: string;
  model?: string;
  createdAt: number;
  updatedAt?: number;
  served: string;           // the period key last served, "2026-08-12"
  misses: number;
  alerted: number;
  lastOccurrence?: string;
}

declare global {
  interface Window {
    zero?: {
      snapshot(): Promise<Snapshot>;
      crash?(p: { name: string; message: string; stack: string }): Promise<unknown>;
      // A count. The name is checked against the approved list in the main
      // process, which attaches everything else; nothing from this side rides along.
      track?(name: string): Promise<boolean>;
      agentReply(p: { pid: number; text: string }): Promise<{ ok: boolean; delivered?: boolean; working?: boolean; name?: string; reason?: string }>;
      agentReveal(p: { pid: number }): Promise<{ ok: boolean; name?: string; reason?: string }>;
      agentConversation(p: { pid: number; sessionId: string | null; cwd: string }): Promise<AgentConversation>;
      dashboard(slug: string): Promise<any>;
      terminal(p: {product:string;id:string;action:'open'|'read'|'write'|'resize'|'close';data?:string;cols?:number;rows?:number;offset?:number}): Promise<any>;
      agentUpdate?(p:{engine:string;action:'check'|'recheck'|'start'|'status'|'refresh'}):Promise<any>;
      commandCatalog(p: {product: string; id: string}): Promise<string[]>;
      command(p: {product: string; id: string; text: string}): Promise<{state: string; at: number; text?: string; name?: string}>;
      compact(p: { product: string; id: string }): Promise<{state: string; at: number}>;
      remoteControl(p: {product: string; id: string; action?: string}): Promise<{state: string; at: number; text?: string; url?: string; mayBeActive?: boolean} | null>;
      compactionStatus(p: {product: string; id: string}): Promise<{state: string; at: number} | null>;
      answer(p: { product: string; id: string; answer?: string; status?: string; priority?: number; permissionMode?: string | null; model?: string | null; effort?: string | null }): Promise<WorkItem>;
      setProductOrder(p: { order: string[] }): Promise<unknown>;
      setProductHidden(p: { product: string; hidden: boolean }): Promise<unknown>;
      compose(p: { product: string; title: string; body?: string; kind?: string; priority?: number; runAt?: number; labels?: string[]; model?: string; engine?: string; effort?: string; assignee?: string; due?: string; visibility?: 'team' | 'people' | 'private'; visibleTo?: string[] }): Promise<WorkItem>;
      // The team version (main/team/index.mjs through main/ipc.mjs).
      teamSignIn(): Promise<TeamCallResult>;
      teamSignOut(): Promise<TeamCallResult>;
      teamSignInEmail(p: { email: string; password: string }): Promise<TeamCallResult>;
      teamRename(p: { name: string }): Promise<TeamCallResult>;
      teamRemoveMember(p: { personId: string }): Promise<TeamCallResult>;
      teamLeave(): Promise<TeamCallResult>;
      teamCancelInvite(p: { email: string }): Promise<TeamCallResult>;
      teamSignUp(p: { name: string; email: string; password: string }): Promise<TeamCallResult>;
      teamCreate(p: { name: string }): Promise<TeamCallResult>;
      teamAcceptInvite(p: { teamId: string }): Promise<TeamCallResult>;
      teamInvite(p: { email: string }): Promise<TeamCallResult>;
      teamStatus(p: { text: string; hold: string }): Promise<TeamCallResult>;
      teamShare(p: { product: string; visibility: 'team' | 'people' | 'private'; people?: string[] }): Promise<TeamCallResult>;
      teamSync(): Promise<TeamCallResult>;
      teamRoute(p: { product: string; id: string; route: 'agent' | 'me' | 'back' }): Promise<TeamCallResult>;
      teamMessage(p: { to: string | string[]; body: string }): Promise<TeamCallResult>;
      threadEdit(p: { product: string; id: string; patch: ThreadEditPatch }): Promise<{ ok: boolean; error?: string }>;
      schedule(p: { product: string; id: string; runAt: number }): Promise<WorkItem>;
      repeats(): Promise<RepeatRule[]>;
      composeRepeat(p: { product: string; title: string; body?: string; priority?: number; rule: RepeatShape; engine?: string; model?: string }): Promise<RepeatRule>;
      setRepeat(p: { product: string; id: string; rule: Partial<RepeatShape & { title: string; body: string; priority: number }> }): Promise<RepeatRule>;
      endRepeat(p: { product: string; id: string }): Promise<RepeatRule>;
      pauseSupervisor(paused: boolean): Promise<SupervisorStatus>;
      createProduct(p: { name: string; repoPath?: string | null }): Promise<{ slug: string }>;
      // THE FIRST RUN. Both optional for the same reason chooseFolder is: a
      // page kept alive by ⌘R can be attached to a main process built before
      // either channel existed, and the walk has to fall back rather than
      // throw.
      firstRunAnswer?(p: { product: string; id: string }): Promise<{ item: WorkItem; line: string; found: boolean }>;
      firstRunWalking?(p: { walking: boolean }): Promise<SupervisorStatus>;
      // A second Agentbox as a brand new user, beside this one. Optional for the
      // same reason as the two above: a page kept alive by ⌘R can be attached
      // to a main process packed before this channel existed, and the ⌘K row
      // has to be able to say so rather than throw.
      openFreshUser?(p?: { withAgents?: boolean }): Promise<FreshUser>;
      // The demo inbox, beside this one. Optional for the same reason.
      openDemo?(): Promise<DemoOpened>;
      // Optional: it arrives with a main-process build, and a renderer running
      // against an older one has to be able to say so rather than throw.
      chooseFolder?(p?: { startIn?: string }): Promise<{ path: string | null; refused?: string; browse?: boolean }>;
      // The picker the app draws itself, for a tab with no Mac dialog.
      listFolders?(p?: { at?: string | null; showHidden?: boolean }): Promise<FolderListing>;
      folderExists?(p: { path: string }): Promise<{ exists: boolean }>;
      stopSession(p: { product: string; id: string }): Promise<WorkItem>;
      reopen(p: { product: string; id: string }): Promise<WorkItem>;
      // The user's standing instructions: one text, briefed to every session.
      instructionRead?(id: string): Promise<{text:string;defaultText:string;error?:string}>;
      instructionWrite?(id:string,text:string): Promise<{ok:boolean;error?:string}>;
      // Her own earlier versions of one instruction box, newest first.
      instructionHistory?(id:string): Promise<{versions:{ts:number;chars:number}[];error?:string}>;
      instructionVersion?(id:string,at:number): Promise<{text:string;error?:string}>;
      standingRead?(): Promise<{ text: string; error?: string }>;
      standingWrite?(p: { text: string }): Promise<{ ok: boolean; error?: string }>;
      // The message rules: shipped filled in, hers to change or empty. One
      // document since w-3dc46f3a67, where this was writingRules* and
      // finishing* on two channels.
      messageRulesRead?(): Promise<{ text: string; error?: string }>;
      messageRulesWrite?(p: { text: string }): Promise<{ ok: boolean; error?: string }>;
      // The settings screen. Every write answers with the whole settings object
      // again, so the screen redraws from what the main process now believes
      // rather than from what the click assumed.
      settingsRead?(): Promise<Settings>;
      setProjectSetting?(p: { product: string; key: string; value: unknown }): Promise<Settings>;
      setWorkspaceSetting?(p: { key: string; value: unknown }): Promise<Settings>;
      projectInstructionsRead?(p: { product: string }): Promise<{ ok: boolean; text: string; error?: string }>;
      projectInstructionsWrite?(p: { product: string; text: string }): Promise<{ ok: boolean; error?: string }>;
      onEscapeBrowser?(fn: () => void): () => void;
      /**
       * A key the app owns, pressed while the keyboard was inside an open
       *  file. shared/artifact-keys.mjs says which keys those are. */
      onKeyInTheFile?(fn: (k: { key: string; meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean }) => void): () => void;
      saveAttachments(p: { product: string; files: Array<{ name: string; dataBase64?: string; srcPath?: string }> }): Promise<Array<{ rel: string; name: string; image: boolean }>>;
      pathForFile(file: File): string | null;
      /** Pasted bytes to disk, so the draft carries a path. */
      // Bytes for a paste, a path for a drag. One or the other, never neither.
      stageAttachment(p: { name: string; dataBase64?: string; srcPath?: string }): Promise<{ path: string }>;
      onChanged(fn: () => void): () => void;
      approve?(p: { id: string; allow: boolean; note?: string }): Promise<{ ok: boolean }>;
      // Fired for the button AND for the Cmd+Y/Cmd+N chord that main catches
      // itself, which is the only way the page hears about the chord at all.
      onApprovalAnswered?(fn: (a: { id: string; allow: boolean }) => void): () => void;
      badge?(count: number): Promise<void>;
      // screenDetail is which set of theme pictures this screen wants, 'soft' or
      // 'sharp' (main/screen-detail.mjs). It rides here rather than being
      // pushed because the answer is needed on the first paint.
      bootInfo?(): Promise<{ reloaded: boolean; builtAt: number; recovered?: string | null; screenDetail?: string }>;
      // Keeping Agentbox current (main/updater.mjs). Look again now, and restart
      // onto the version that already downloaded itself.
      updateCheck(): Promise<UpdateState>;
      updateInstall(): Promise<{ started: boolean }>;
      // The window moved to a screen that wants the other set.
      onScreenDetail?(fn: (s: { detail: string }) => void): () => void;
      // The wake sweep's one line: agents put back on the work the lid
      // interrupted, and how many are waiting on her because their session was
      // gone. Startup's version of it rides on bootInfo instead.
      onRecovered?(fn: (r: { text: string }) => void): () => void;
      // What arrived. The page does not choose the words and does not choose
      // whether to speak at all; only the main process can see whether she is
      // looking at the window (main/notify.mjs).
      notify?(arrivals: Array<{
        id: string;
        title: string;
        product?: string | null;
        productName?: string | null;
        kind: string;
      }>): Promise<void>;
      // She clicked the banner: open this row.
      onOpenItem?(fn: (p: { id: string }) => void): () => void;
    };
  }
}


/**
 * ONE FOLDER'S WORTH OF THE DISK, as the app's own picker reads it.
 *
 *  `at` is always an absolute path: the screen may send `~` or a typed path and
 *  main answers with the real one. `parent` is null at the root and nowhere
 *  else. `refused` is the verdict on `at` ITSELF, so the picker can say whether
 *  the folder she is standing in could be a project before she chooses it.
 */
export type FolderListing = {
  at: string;
  parent: string | null;
  home: string;
  folders: { name: string; path: string }[];
  refused?: string | null;
  unreadable?: string;
};

/** What a person may change on a thread from its summary (main/store.mjs threadEdit). */
export type ThreadEditPatch = Partial<{
  problem: string; progress: string; solution: string;
  visibility: 'team' | 'people' | 'private'; visibleTo: string[]; priority: number;
  blockedBy: string[]; blocks: string[];
}>;
