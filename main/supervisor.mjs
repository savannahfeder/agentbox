import { claudeActivity, codexActivity, currentActivity } from './agent-activity.mjs';
import { taskRemoteControl } from './task-remote-control.mjs';
import { taskFolderPath, real, restoreTaskFolder } from './task-folders.mjs';
import { SHIP_LABEL, ShipQueue, readShipSettings, shipScriptFor } from './ship-queue.mjs';
import { folderJob } from './task-folders-offthread.mjs';
import { gitJob } from './git-change-offthread.mjs';
import { queuedReplyText } from './live-replies.mjs';
import { attachClaudeInput, claudeStreamArgs } from './claude-input.mjs';
import { hookFailure } from '../shared/hook-failure.mjs';
import { taskCommand } from './task-commands.mjs';
import { providerCommand, reviewTarget, nativeCommandNames } from '../shared/provider-commands.mjs';
import { compactCodexThread } from './codex-compaction.mjs';
import {readSystemTemplate} from './instruction-settings.mjs';
import {fillName} from '../shared/product-name.mjs';
// The supervisor: deterministic, boring, and the only part of the app that talks
// to the brain. It spawns headless claude sessions on the founder's plan, one
// per work item, capped; watches for answered questions and spawns
// continuations; and captures transcripts for the In Progress view.
//
// Judgment lives in the briefs (briefs/*.md) and in the model. This file only
// moves processes around.
//
// PERMISSIONS ARE THE FOUNDER'S CALL, NOT ZERO'S. She sets `sessionArgs` in
// zero.config.json (for example ["--permission-mode", "auto"]) after deciding
// what autonomous sessions on this machine may do, and a config that names its
// own mode is passed through untouched.
//
// WHEN SHE HAS SAID NOTHING, THE DEFAULT IS `--permission-mode auto`, NOT NO
// FLAG AT ALL. This comment said the opposite until 2026-08-23 and it was left
// behind by the change that added auto: it described the old shape, where a
// bare spawn inherited whatever ~/.claude/settings.json happened to say and
// two machines running the same Agentbox could be on two different modes with
// nobody told. `defaultSessionArgs` is the one place that decides it; read
// that rather than this paragraph, and if the two ever disagree again the code
// is right and this is stale.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { buildSessionArgs, CLAUDE_MODES, permissionMode } from './settings.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isUrgent, itemPriority, normalizeOrder, orderFromTiers, productRankScore } from '../shared/rank.mjs';
import { isCleanRun, ruleIdOf } from '../shared/repeats.mjs';
import { mayRunHere } from '../shared/team-rules.mjs';

// WHO IS SIGNED IN, handed to the store server a worker talks through. An MCP
// server starts with only the variables it is given, not the app's, and every
// line it writes for a shared project has to say whose Mac wrote it
// (main/store/work-items.mjs stamps it from this).
function teamPersonEnv() {
  return process.env.AGENTBOX_PERSON_ID ? { AGENTBOX_PERSON_ID: process.env.AGENTBOX_PERSON_ID } : {};
}
import { agentSpokeSince, answerSettled, answerTs, stoppedByHer } from '../shared/answers.mjs';
import { DEFAULT_SESSIONS_AT_ONCE } from './config.mjs';
import { linkAccountTooling, toolingLine } from './account-tooling.mjs';
import { effectiveProfiles } from './account-discovery.mjs';
import { referencedFiles, isImagePath } from '../shared/referenced-files.mjs';
import { writeChangeForRun, changePath } from './code-change.mjs';
import { snapshotRepo, changeFromRepo } from './git-change.mjs';
import { importedAgentBrief, importedAgentName } from '../shared/agent-import.mjs';
import { troubleCause, needsHerHands, troubleSentence, troubleRemedy, deadRunSentence, deadRunCause, undeliveredAnswerSentence, limitResetsAt, limitResetMoment, strandedSentence, strandedRemedy, causeBreakdown } from '../shared/spawn-trouble.mjs';
import { readDeadRunTrace, traceShowsASilentDeath } from '../shared/dead-run-trace.mjs';
import { commandPrompt } from '../shared/claude-commands.mjs';
import { machineryPath, storeRootEnv } from './store/home.mjs';
import { setModelArg } from './settings.mjs';
import { isEffort, isEffortWord } from '../shared/effort-levels.mjs';
// THE SECOND ENGINE, AND THIS FILE IS NOW THE ONE PLACE THAT HOLDS THE GATE.
//
// It did not used to be. The capability Symbol was deliberately unimported and
// deliberately unnamed here, and
// tests/a-codex-row-from-august-still-runs-on-claude.test.mjs held that its
// name appeared in no source under main/ or renderer/src, so that the slice
// which finally opened the gate would be a slice somebody had to come here and
// write. This is that slice, and that tripwire now asserts the exact list of
// files allowed to reach the token -- this one -- rather than an empty one, so
// the next file to import it still has to go and argue for itself.
//
// `_engineFor` below is the whole of it. It hands the token over only when
// `config.engineChoice` names the moment she opted in, and there is no other
// caller: with nothing written in zero.config.json the answer is Claude Code
// for every row on every machine, including one she marked `codex` in August.
import {
  engineFor, engineLabel, engineChoiceSince, engineChoiceOnRowIsStale,
  availableEngines, isEngine, modelForEngine, homeEngine,
  ENGINE_CHOICE_ENABLED, DEFAULT_ENGINE, ENGINE_IDS,
} from '../shared/engines.mjs';
// SAYING_CAP LIVES THERE AND NOT HERE. It was a module-private const in this
// file and a second copy in that one, because the slice that wrote the Codex
// readers could not edit this file. Two engines capping the live sentence
// differently would leave one of them sitting under its own traced copy on her
// screen forever, so there is one number and this is the file that moved.
import {
  captureCodexEvent, changeFromCodexTurn, codexStreamingText, rememberCodexChange,
  summarizeCodexEvent, traceCodexEvent, SAYING_CAP,
} from './codex.mjs';
import { createCodexAppServer } from './codex-app-server.mjs';
import { CodexUsage } from './codex-usage.mjs';
import { createCodexWorker, codexTranscriptFile, mcpServerNames, workerThreadParams } from './codex-session.mjs';
import { CODEX_DEFAULT_MODE, isCodexMode } from '../shared/codex-modes.mjs';
import { createCodexApprovals } from './codex-approvals.mjs';
import { approvalPublicKey } from './approvals.mjs';
import { codexDefaultModel, codexHome, codexKnownSlugs, codexModelLevels, codexModels } from './codex-models.mjs';
import { nameRow, wantsName } from './row-label.mjs';
import { LEVELS, latestMessage, sortMessage, wantsPriority } from './message-priority.mjs';
import { NAME, Name, envName, nameSlug, isOurSlug } from '../shared/product-name.mjs';
import { signInFiles, signInStamp } from './sign-in-files.mjs';

const POLL_MS = 15_000;
// HOW LONG SHE WAITS AFTER PRESSING THE BUTTON, and until now it was the line
// above: composing a task and answering a question both wrote a line to the
// store and then nothing looked at that store until the next fifteen second
// tick came round.
//
// Measured on this file, 2026-08-24, twenty tasks composed at random moments
// inside the tick period against a real Supervisor and a real Store with the
// spawn stubbed: median 7.0s, mean 7.2s, longest 15.0s before the spawn was
// even attempted. Twelve replies measured the same way: median 9.1s, mean 7.7s,
// longest 13.9s. Claude Code itself, measured the same afternoon on a trivial
// prompt, takes 0.7s to start and 3.6 to 5.9s to its first word.
//
// So her own actions wake the fleet now (`wake`, and the handlers in
// main/ipc.mjs that call it). The timer stays exactly as it was, because it
// covers everything that is NOT her: a schedule coming due, a repeat, a
// session that died, an answer written by something other than the window.
//
// SETTLE is how long a wake waits before it looks, and it is not a delay for
// its own sake: it lets a burst of writes land as one tick rather than as six.
// FLOOR is the shortest gap allowed between two woken ticks, so that holding a
// key down cannot turn the fleet into a spin loop. A wake inside the floor is
// not dropped, it is scheduled at the end of it.
const WAKE_SETTLE_MS = 120;
const WAKE_FLOOR_MS = 1_000;
// The digest's floor on frequency: "bi-daily" as a minimum gap rather than a
// clock. Read with _digestOwed, which is what collapses an arbitrary stretch of
// downtime into exactly one digest instead of one per missed firing.
const DIGEST_MIN_MS = 12 * 3_600_000;
// How long a digest attempt that wrote nothing waits before being retried. The
// invariant is self-healing, which without this would mean re-spawning every
// fifteen seconds against whatever made the first attempt fail.
const DIGEST_RETRY_MS = 30 * 60_000;
// A spawn that exits faster than this did no real work (limit hit, bad flag,
// untrusted workspace); consecutive fast exits back spawning off exponentially.
const FAST_EXIT_MS = 45_000;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_CAP_MS = 30 * 60_000;
// HOW LONG A SIGNED-OUT LOGIN SITS OUT WHEN NOTHING SAYS IT CAME BACK. It was
// the same half hour as an ambiguous death, and that half hour is exactly how
// long her agents stayed "Queued" after she had signed in again (2026-10-04).
// The app now watches for the login itself (`_noticeSignIns`); this is only the
// fallback for a login that lands somewhere it cannot see. A try on a login
// that is still out costs a two-second run and is charged to nobody.
const SIGNED_OUT_REST_MS = 5 * 60_000;
// How long past a limit's printed reset hour the fleet waits before trying.
const LIMIT_RESET_GRACE_MS = 30_000;
// HOW LONG NOTHING MAY WORK BEFORE THE APP SAYS SO OUT LOUD.
//
// Twenty minutes is chosen against the backoff ladder above, not picked round:
// the delays run 1, 2, 4, 8, 16, 30 minutes, so twenty minutes of unbroken
// failure is five or six consecutive dead spawns with every account already
// out of the rotation. Nothing transient reaches that.
const TROUBLE_QUIET_MS = 20 * 60_000;
// A RUNNING SESSION THAT HAS GONE SILENT, AND WHOSE CLAIM HAS LAPSED, IS DEAD.
// w-3a14ab56d6, 2026-09-23: a Codex turn logged its last line at 19:10:56, its
// store heartbeats stopped the same minute, and the turn never ended, so no
// exit fired and the row sat in In progress for 50 minutes until the user
// noticed it was stuck. Both signals together, never one: a long render is silent but its
// store server keeps beating, and a session that never claimed has no lease.
const HUNG_QUIET_MS = 10 * 60_000;
// A pass this late was not late, the Mac was asleep (forgiveSleep). Eight
// missed passes: past any slow pass, well under the ten minutes above.
const SLEPT_GAP_MS = 2 * 60_000;
// Two hangs on one row inside this window and the app stops restarting it and
// tells her instead, so a row that hangs every time is not killed forever.
const HUNG_REPEAT_WINDOW_MS = 2 * 3_600_000;
// How many times one answer may be handed to a worker that fails to finish
// with it. Past this the item stops respawning and reads as stopped, which is
// then a report of three real failures rather than of one unnoticed death.
const MAX_DELIVERY_ATTEMPTS = 3;

// How long a row we interrupted for an Urgent one is held out of the queue
// before we give up waiting for that Urgent row to start. A BACKSTOP, not the
// mechanism: in the ordinary case the hold is released within one tick, the
// moment the urgent row has a session. Fifteen minutes is long enough to cover
// a spawn cooldown and short enough that a row can never be quietly parked for
// an afternoon by an urgent row that turned out to be unspawnable.
const PREEMPTION_HOLD_MS = 15 * 60_000;

// HOW LONG FRESH WORK RESTS AFTER A RUN THAT MOVED NOTHING.
//
// The continuation pass has always had a memory: one spawn per answer, capped
// at three. The fresh-work pass had none at all, so an item that is open,
// unanswered, founder-labelled and not a question or review spawned a worker
// EVERY TICK, forever, however many workers had already run on it and found
// nothing to do. Nothing counted, so nothing ever stopped.
//
// What that cost, from the row that exposed it (Lantern w-802e11d911): four
// sessions inside twenty-seven minutes, the last starting forty-two seconds
// after the previous one exited, on a row whose only remaining work was a
// decision a human had been sitting on for thirty-three days. Roughly a session
// every nine minutes, indefinitely. Two workers eventually wrote a future
// `runAt` by hand to stop themselves, which is how an agent came to hide its
// own question from the founder (see list-rules.ts, parkedByAgent).
//
// The fast-exit backoff above does not cover this and never could: it fires on
// sessions dying inside 45 seconds, and these ran their full course and did
// real work. They simply did not move the ITEM.
//
// Growing gaps rather than a flat one, and NO HARD STOP: a row that rests
// forever is a row nothing will ever pick up again, and stopped must never mean
// nothing will retry. The last value is the steady state, so a row waiting
// indefinitely on the founder costs one session a day instead of about a
// hundred and sixty.
const FRUITLESS_RESTS_MS = [15 * 60_000, 60 * 60_000, 4 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000];

// THE FIRST RUN'S TWO MARKS (w-0b60195a14). The label is on the walk's own
// example task and means one thing: no session, ever. It is answered by the app
// itself out of the folder she just chose, so a worker picking it up would be a
// second answer to a question already answered.
const FIRST_RUN_LABEL = 'first-run';
// And how long the walk may hold everything else back before the hold lapses on
// its own. Twenty minutes is far longer than any walk and far shorter than a
// day, which is what a hold that never expires would cost someone who closed
// the window halfway through.
const FIRST_RUN_HOLD_MS = 20 * 60_000;

// WHAT THE STORE SERVER IS CALLED, in the one place both engines read it from.
// Claude Code workers are granted `mcp__<this>` and a Codex thread starts a
// server under this key; two spellings of it is how a grant and a server stop
// being the same thing, which is the 2026-08-05 shape.
//
// IT IS THE APP'S OWN NAME NOW, not another product's. The server was borrowed
// from another repo once, and that repo's name reached every worker as its
// tool prefix.
//
// A translation for configs still granting the old spelling lived beside this
// for one round. It is gone: configs were corrected in the same step, and
// keeping the old word in the code so as to keep reading the old word in the
// config would keep alive exactly the reference the rename was meant to remove.
const STORE_SERVER = nameSlug;

/**
 * HER `sessionArgs`, WITH A STORE GRANT SPELLED UNDER AN OLDER NAME OF OURS
 * READ AS THE STORE GRANT IT IS.
 *
 * `--allowedTools mcp__<store>` is how a Claude Code worker is given the store,
 * and the store's name is this app's name. So the day the app is renamed, every
 * zero.config.json on every install still grants the old spelling, which names
 * a server that is not started any more. The worker comes up looking configured
 * and holding nothing: no claim, no checkpoint, no result, and no error either,
 * because a grant for a tool that does not exist is not a failure of anything.
 *
 * THE CONFIG FILE IS NOT REWRITTEN. This is what a session READS, the same way
 * `buildBrief` fills the name into a brief kept in tokens; the config keeps
 * whatever the user typed, and the day they correct it nothing here changes.
 *
 * ONLY OUR OWN NAMES ARE TOUCHED, which is what makes this safe to do at all.
 * A worker also sees the user's own MCP servers (there is no `--strict-mcp-config`
 * on the spawn), so `mcp__playwright` in the args is a live grant for a live
 * server and must survive untouched. `isOurSlug` is the whole of the rule: a
 * name this app has actually answered to, and nothing else.
 */
export function storeGrantUnderAnyOfOurNames(args, storeServer = STORE_SERVER) {
  if (!Array.isArray(args)) return args;
  let changed = false;
  const fixed = args.map((arg) => {
    if (typeof arg !== 'string' || !arg.includes('mcp__')) return arg;
    // A grant can arrive as one token or as a comma-separated list, and it can
    // name a whole server (`mcp__x`) or one of its tools (`mcp__x__claim`).
    const parts = arg.split(',').map((part) => {
      const m = /^(\s*)mcp__([a-z0-9-]+)(__.*)?(\s*)$/i.exec(part);
      if (!m) return part;
      const [, before, slug, tool = '', after] = m;
      if (slug === storeServer || !isOurSlug(slug)) return part;
      changed = true;
      return `${before}mcp__${storeServer}${tool}${after}`;
    });
    return parts.join(',');
  });
  return changed ? fixed : args;
}

// WHICH OF THE TWO A SESSION, A RECORD OR A ROW IS ON, asked in one place so
// that every answer is one of exactly two words.
//
// It matters because the maps this file keys by engine are read from three
// kinds of thing that spell it differently. A live session carries what
// `_engineFor` answered. A `_liveSessions` or `_rowSessions` record written
// before the second engine existed carries NOTHING, and every one of those was
// Claude Code. And a work item carries whatever the ledger holds, which is a
// free string validated against nothing (shared/work-items.mjs).
//
// So anything that is not the literal 'codex' is the default engine. That is
// the same refusal `readersFor` makes at the bottom of this file and for the
// same reason: a fleet that stops, or a cap that counts a session as neither
// engine, because of a name nobody recognises is worse than one that treats an
// unknown name as the engine she is actually running.
function engineOf(engine) {
  return engine === 'codex' ? 'codex' : DEFAULT_ENGINE;
}

export class Supervisor {
  constructor(config, store, appDir, dataDir = appDir, userDir = dataDir) {
    this.config = config;
    this.store = store;
    this.appDir = appDir;
    // Everything the app SHIPS is read from appDir: the worker brief, the
    // permission rules, the approval server. Everything the founder WRITES is
    // read from dataDir, which is the same folder when running from source and
    // the user's data folder inside a packaged app, because a signed bundle
    // cannot be written into without breaking its own signature.
    this.dataDir = dataDir;
    // AND THE TWO FILES THAT ARE ONLY EVER THE USER'S COME FROM userDir, WHICH
    // IS NEVER THE CHECKOUT (w-3dc46f3a67). The standing instructions and the
    // writing rules used to live at `dataDir/briefs`, which running from source
    // IS the git checkout every worker fast-forwards, stashes and checks out, so
    // agent commits could silently replace what the user had written there. A
    // rule the user wrote and lost is worse than no box at all.
    //
    // These are the same two files package.json excludes from the download
    // (`!briefs/founder.md`, `!briefs/writing-rules.md`), and that is the line:
    // a file we SHIP is a default and belongs in the checkout, a file only she
    // writes belongs in her own folder. main.mjs carries the text across once.
    this.userDir = userDir;
    // THE APP SHIPS A TASK THE AGENT MARKED READY, for a project a person
    // turned that on for in this app's own data folder (main/ship-queue.mjs).
    // With no such setting it never runs anything.
    this.onShipped = () => {};
    this.shipQueue = new ShipQueue({
      store,
      userDir,
      folderFor: (item, product) => { try { return taskFolderPath(this.productFolder(product), item.id); } catch { return null; } },
      isLive: (item) => this.sessions.has(item.id),
      handBack: (item, reply) => {
        const fresh = this.store.readItem?.(item.product, item.id) ?? item;
        this.spawnWorker(fresh, { continuation: true, shipFailure: reply });
      },
      afterShip: () => this.onShipped(),
    });
    this._compactionJobs = new Map();
    this.sessions = new Map(); // itemId -> {child, product, startedAt, tail, itemId}
    // Spawns waiting on their row's folder, and folders made for the spawn that
    // is running right now. `_folderFirst` says why both exist.
    this._preparing = new Map(); // itemId -> {item, opts, engine}
    this._madeFolders = new Map(); // itemId -> path
    this.onChange = null;
    this.paused = false;
    // The first run's hold, in memory only and never persisted: firstRunWalking
    // below says why.
    this._firstRunUntil = 0;
    this._stateFile = path.join(config.storeRoot, '.zero-supervisor.json');
    try {
      const state = JSON.parse(fs.readFileSync(this._stateFile, 'utf8'));
      // Persisted: an in-memory-only set re-spawned a continuation for every
      // still-open answered item on every app restart.
      this._handledAnswers = new Set(state.handledAnswers ?? []);
      // `_personalSessions` used to sit here, itemId -> claude session id for a
      // personal project's threads. Personal projects are gone (w-d19d6d387c)
      // and `_rowSessions` below does that job for every row there is.
      // THE SAME COURTESY, FOR EVERY WORKER THERE IS. A product worker's
      // session id used to exist only in memory and only while its process
      // lived, so the moment the machine slept or the app went away it was
      // gone, and the only way back onto the row was a fresh session briefed
      // from nothing. That is the expensive thing she named: "resume the agent,
      // never restart it" (w-d3fa3579e8, and her option 1 on w-a906ef6d25).
      //
      // itemId -> {sessionId, product, cwd, profile, continuation, startedAt}.
      // Written the moment the id arrives on the stream, NOT on exit, because
      // the case this exists for is the one where no exit handler ever runs.
      // An entry still here at startup is, by definition, the wreckage of the
      // last run: a session nothing ever reaped.
      this._liveSessions = state.liveSessions ?? {};
      // A ROW IS A CHAT, AND THIS IS WHAT MAKES IT ONE (w-595f3ccad4).
      //
      // `_liveSessions` above is wreckage: it is deleted the moment a session
      // finishes under its own power, because there is nothing left to rescue.
      // That is right for a rescue and wrong for a conversation. The commonest
      // thing that happens to a row is not a crash, it is the founder writing
      // back on it — and until now that reply threw the finished session away
      // and briefed a stranger with a transcript of the whole thread to catch
      // up on.
      //
      // MEASURED across a few thousand runs: most were replies like that, and in the median one 65% of the first twenty files
      // it opened had already been opened by the run before it on the same row,
      // which then read for 206 seconds before it wrote anything.
      //
      // So this map remembers every product row's session AFTER a clean finish
      // too, and her next reply goes back to it. Same shape as above, plus
      // `lastUsedAt` for the prune. It costs 243 bytes a row, MEASURED on a
      // real entry with her longest product path in it rather than inherited:
      // an earlier estimate of 219 predated this map recording the account and
      // the last-used time. The conversation is a file Claude Code writes for
      // every run whether we go back to it or not.
      this._rowSessions = state.rowSessions ?? {};
      this._compactions = state.compactions ?? {};
      this._nativeCommands = state.nativeCommands ?? {};
      for (const value of Object.values(this._compactions)) if (value.state === 'running') value.state = 'failed';
      // When a digest was last ATTEMPTED, per product. The digest row itself is
      // the real watermark (it lives in the store and survives everything);
      // this only keeps a failed attempt from respawning every fifteen seconds.
      this.lastDigestTry = state.lastDigestTry ?? {};
      // Per answer, how many workers have been handed it and failed to finish.
      // Persisted so a restart cannot reset a task back into an endless retry.
      this._deliveryAttempts = state.deliveryAttempts ?? {};
      // Per item, the fresh-work runs that ended with the row exactly where it
      // started: `{ runs, endedAt, founderAt }`. Persisted for the same reason
      // as the line above, and more sharply: an unpersisted counter would mean
      // every app restart resumed the every-tick loop from zero, and restarts
      // are frequent. It is keyed and cleared exactly like _deliveryAttempts.
      this._fruitless = state.fruitless ?? {};
      // WHAT IS WRONG WITH EACH ACCOUNT, KEPT ACROSS A RESTART (w-cf0e8821b3).
      //
      // The app came back up knowing that nothing was running and no longer
      // knowing the reason, and half a fact is worse than either the whole
      // thing or silence.
      //
      // Restoring it cannot strand her, because nothing here is believed for
      // long: the first session that survives on an account clears it
      // (`_clearProfileTrouble`), and a cooldown is an absolute moment that has
      // usually already passed by the time the app is back.
      this._profileTrouble = state.profileTrouble ?? {};
      this._profileCooldown = state.profileCooldown ?? {};
      // The founder's standing running order over her companies, most
      // important first. Agents never write it. It replaced three buckets
      // (high/normal/low) because buckets left every tie inside a bucket
      // unanswered, and "which of these two comes first" is the actual
      // question the fleet needs settled.
      this.productOrder = normalizeOrder(state.productOrder ?? orderFromTiers(state.productTiers));
      // Hidden from the composer's picker, and from nothing else. A hidden
      // product still ranks, still spawns workers, and its work still reaches
      // the inbox: this is a filing decision about a list that had grown to
      // twenty two chips, not an off switch. Pausing is the off switch.
      this.hiddenProducts = new Set(state.hiddenProducts ?? []);
    } catch {
      this._handledAnswers = new Set();
      this._liveSessions = {};
      this._rowSessions = {};
      this._compactions = {};
      this.lastDigestTry = {};
      this._deliveryAttempts = {};
      this._fruitless = {};
      this._profileTrouble = {};
      this._profileCooldown = {};
      this.productOrder = [];
      this.hiddenProducts = new Set();
    }
    // WHICH ROWS NOTHING HAS BEEN ABLE TO RUN ON, as of the last tick, for the
    // line above her list. Deliberately NOT persisted: it is derived from
    // `_fruitless` and from each run's own trace, both of which are on disk, so
    // saving it would only give a restart a chance to disagree with them. Empty
    // until the first tick, which is fifteen seconds and one honest silence.
    this._stranded = [];
    // Rows she asked for a worker on that did not fit in a slot. In memory
    // only, deliberately: this is her intent right now, and a resume that
    // survived a restart would start work she asked for hours ago.
    this._resumeQueue = new Set();
    // What the wake sweep put back, for whoever draws the toast. Null when
    // nobody is listening, which is every test and every headless run.
    this.onRecovered = null;
    // Set when the sweep ran out of slots rather than out of work, so the next
    // tick finishes it. Never set for a row it simply cannot resume: those wait
    // for her, and retrying them every fifteen seconds would be a lie.
    this._recoverPending = false;
    // WHAT WE INTERRUPTED FOR AN URGENT ROW, AND WHAT WE INTERRUPTED IT FOR.
    //
    // itemId -> { at, forItem, forProduct }. In memory only, and that is the
    // safe direction: forgetting across a restart leaves an ordinary stranded
    // session, which the wake sweep already knows how to put back. Remembering
    // a stale one would hold a row out of the queue for work that finished
    // days ago.
    //
    // It exists because the freed slot has to reach the URGENT row. Without
    // it, recoverInterrupted runs at the top of the next tick, sees a row whose
    // session is on disk and not running, and resumes it straight back into the
    // slot we just made — which is a kill that cost her a session and bought
    // her nothing.
    this._preempted = new Map();
    // TASKS SHE PUSHED WITH "RUN NOW", from the three-dot menu on a waiting
    // task (`runNow` below). itemId -> { product, at, started }.
    //
    // In memory only, for the reason `_resumeQueue` gives: this is her intent
    // right now, and a push that survived a restart would jump a task she
    // asked for hours ago over everything filed since. The entry stays while
    // the pushed task runs, so a second push cannot pause the first, and goes
    // the moment that run ends (`_settleRunNow`).
    this._runNow = new Map();
    // Rows the toast has already spoken about. In memory only: a restart is a
    // sweep she has not been told about yet, so it gets to speak once.
    this._announcedRecovery = new Set();
    this._timer = null;
    // THE WAKE, and the guard that makes it safe to have one. Before this the
    // only caller of tick() was a timer, so two passes could not overlap in
    // practice; a wake can arrive in the middle of one, and two passes reading
    // the same open queue would each hand it a slot. `_ticking` is what stops
    // that, and it is on tick() itself rather than on the wake, so the rarer
    // case the timer could always have hit (a pass that runs past fifteen
    // seconds) is covered by the same line.
    this._wakeTimer = null;
    this._ticking = false;
    this._tickAgain = false;
    this._lastTickAt = 0;
  }

  /**
   * SHE HAS JUST DONE SOMETHING. LOOK NOW.
   *
   *  Called from the handlers for the things only she does: composing a task,
   *  answering a question, reopening a row, taking the pause off. Never from
   *  anything a worker writes, and that restraint is the point: workers write
   *  to the store constantly, every checkpoint and every note, and a wake on
   *  each of those would be a tick several times a second doing no new work.
   *
   *  It is safe to call twice, it is safe to call while a tick is running, and
   *  it is safe to call fifty times in a second. Nothing here throws. */
  wake() {
    if (this._wakeTimer) return;
    const since = Date.now() - this._lastTickAt;
    const wait = Math.max(WAKE_SETTLE_MS, WAKE_FLOOR_MS - since);
    this._wakeTimer = setTimeout(() => {
      this._wakeTimer = null;
      this.tick().catch((e) => console.warn('supervisor:', e.message));
    }, wait);
    // So a wake pending at quitting time cannot hold the process open. Node
    // only; Electron's timers have it too, and a runtime without it loses
    // nothing but the courtesy.
    this._wakeTimer.unref?.();
  }

  // `isPersonal` used to live here. A personal project ran its sessions on the
  // founder's message alone, with no brief, no store and no digest, and every
  // path in this file that touched a spawn had a branch for it. All of that is
  // deleted (w-d19d6d387c), because there is no case where a project should
  // run without its brief and store. Every project is now a project, and a reply on any row still goes back to the
  // session that wrote it through `_rowSessions`.

  /**
   * NOTHING EVER RUNS IN THE PRACTICE PROJECT, AND THIS IS THE ONE PLACE THAT
   * SENTENCE IS WRITTEN.
   *
   *  It was four `if (product.practice) continue` lines in four loops, and four
   *  copies of a safety rule is four chances for a fifth path to be added
   *  without one. There now IS a fifth caller and it is the one that matters:
   *  `spawnWorker`, which every other path in this file funnels into — the
   *  fresh-work pass, continuations, `resumeItems`, `resumeStopped`, the
   *  interrupted-session recovery, a mid-flight reply and the digest.
   *  A skip while a queue is being built is an optimisation; a refusal at the
   *  spawn is the rule.
   *
   * A session that will never start and a session that is about to start look
   * identical from an inbox.
   *
   *  A practice project also points at NO FOLDER, so a session that did start in
   *  one would take the product's own documents directory as its working
   *  directory and go looking for code that was never there.
   *
   *  It takes a product record rather than a slug because that is what every
   *  caller already has, and because the flag is read off project.json by
   *  `listProducts` — never matched on a name, which is a thing somebody could
   *  reasonably give a real project of their own. A product this process cannot
   *  find at all is not worked in either: that is `spawnWorker`'s existing
   *  refusal and it stays where it is. */
  worksHere(product) {
    return !!product && product.practice !== true;
  }

  start() {
    // THE SWEEP RUNS BEFORE THE FIRST TICK, and the ordering is the whole point.
    // The wreckage of the last run is sitting in the store as rows that are
    // still `claimed` by workers that no longer exist; the tick re-pulls those
    // the moment their lease lapses and puts a FRESH session on them, which is
    // the restart she ruled out. The sweep gets there first and hands each row
    // back to the session that was doing it.
    try { this.recoverInterrupted('startup'); } catch (e) { console.warn('zero: startup recovery:', e.message); }
    this._timer = setInterval(() => this.tick().catch((e) => console.warn('supervisor:', e.message)), POLL_MS);
    this.tick().catch(() => {});
  }

  // EVERY KILL OF OURS GOES THROUGH HERE, because the exit that follows cannot
  // be told apart from a worker dying on its own. The claude CLI traps SIGTERM
  // and exits with status 143 under its own power, so Node reports
  // `{code: 143, signal: null}` and the signal we used to read intent from is
  // never there. Measured, not assumed. So the intent is written down at the
  // one moment it is known: here.
  //
  // What it was costing her, both invisible: every archive, snooze, stop, pause
  // and app restart charged the item a failed delivery attempt.
  /** HER OWN HAND OUTRANKS A TIMER (2026-09-22).
   * Called for the things only she does that mean "run this now": a reply,
   * Resume, reopening a row. The streak count is kept, so a real outage still
   * escalates.
   *
   * AN ACCOUNT WAITING ON A PERSON (signed out, switched off by an admin) IS
   * LIFTED TOO WHEN NOTHING ELSE ON ITS ENGINE COULD RUN (2026-10-04). It used
   * to stay out on the theory that retrying cannot help, but she IS the person:
   * she signs back in, presses Resume, and that is the only signal the app
   * gets. Her one login was parked from 11:30:29 to 12:00:29 and every Resume
   * and "continue" in between left her rows queued. If she is still signed out
   * the trial dies in two seconds and parks it again on the spot. Where another
   * login is working, the dead one stays out: the work is moving without it. */
  liftBrakeForHer() {
    this._spawnCooldownUntil = 0;
    for (const account of Object.keys(this._profileCooldown ?? {})) {
      if (needsHerHands(this._profileTrouble?.[account]?.cause) && this._anotherAccountCanRun(account)) continue;
      this._profileCooldown[account] = 0;
    }
  }

  /**
   * A LOGIN THAT LANDED PUTS ITS ACCOUNT STRAIGHT BACK.
   *
   * Trouble on an account is only cleared by a session surviving on it, and a
   * signed-out account was benched so that no session could start on it. So
   * nothing she did could bring it back, and the bench ran out on its own half
   * an hour later (2026-10-04). Here every tick asks whether the files a login
   * writes have moved since the account was found signed out. If they have,
   * the account gets one try now. The trouble itself stays until that try
   * survives, so a write that was not a login (another Claude window touching
   * the same file) buys one two-second try and no more: the stamp moves with
   * it, and the next lift needs the next write.
   */
  _noticeSignIns() {
    let lifted = false;
    for (const [key, trouble] of Object.entries(this._profileTrouble ?? {})) {
      if (trouble?.cause !== 'signed-out') continue;
      const stamp = signInStamp(this._signInFilesFor(key));
      if (!stamp || stamp <= (trouble.stamp ?? trouble.at ?? 0)) continue;
      trouble.stamp = stamp;
      if (this._profileCooldown) this._profileCooldown[key] = 0;
      if (!key.startsWith('codex:')) this._spawnCooldownUntil = 0;
      lifted = true;
    }
    if (lifted) this._saveState();
    return lifted;
  }

  /** Which files one account's login writes, by the key its trouble is kept under. */
  _signInFilesFor(key) {
    const home = this.config.home || os.homedir();
    if (key.startsWith('codex:')) {
      const profile = key.slice('codex:'.length);
      return signInFiles({ engine: 'codex', folder: this._codexProfileHome(profile), home });
    }
    return signInFiles({ folder: key === 'default' ? null : key, home });
  }

  // Whether some OTHER login on this account's engine could run once her hand
  // has lifted what time alone would lift, i.e. one not waiting on a person.
  _anotherAccountCanRun(account) {
    const engine = String(account).startsWith('codex:') ? 'codex' : DEFAULT_ENGINE;
    return this._profilesFor(engine)
      .map((p) => this._accountKey(engine, p))
      .some((key) => key !== account && !needsHerHands(this._profileTrouble?.[key]?.cause));
  }

  _kill(session) {
    if (!session) return false;
    session.stoppedByUs = true;
    try { session.child.kill(); } catch {}
    return true;
  }

  stop() {
    clearInterval(this._timer);
    // The shared `codex app-server` goes with them. An orphaned one keeps every
    // thread it is holding alive after the supervisor that answers their
    // approvals has gone, which is the 2026-08-06 orphan incident in the other
    // engine's words: workers still running under permission rules no new spawn
    // would produce.
    this._closeCodex();
    // A wake scheduled a moment before the app quits would otherwise fire into
    // a stopped fleet and spawn one more worker on the way out.
    clearTimeout(this._wakeTimer);
    this._wakeTimer = null;
    // And a spawn still waiting on its folder never starts.
    this._preparing?.clear();
    for (const s of this.sessions.values()) this._kill(s);
    this.sessions.clear();
  }

  // Founder interrupt: kill the child now. The exit handler reaps the session;
  // heartbeats stop with the process, so the claim lapses on its own.
  stopSession(itemId) {
    if (this._preparing?.delete(itemId)) return true;
    const session = this.sessions.get(itemId);
    if (!session) return false;
    return this._kill(session);
  }

  // App quit: take the workers down with the supervisor. Killing the app used
  // to orphan every running claude session; six orphans from before a restart
  // kept working under stale permission rules and flooded the founder with
  // approval cards no new spawn would produce (2026-08-06). Items respawn on
  // next boot; an orphan just misbehaves invisibly.
  killAll() {
    for (const session of this.sessions.values()) this._kill(session);
    this._closeCodex(`${Name} is quitting`);
  }

  // PUT A WORKER BACK ON THESE ROWS, WHATEVER STATE THEY ARE IN.
  //
  // resumeStopped below recovers rows that are still open and merely stranded.
  // This one exists because the rows that most need reviving are the ones it
  // cannot see: `done`. Every path that spawns anything carries the same guard,
  // `status !== 'open'` and out — the continuation pass, resumeStopped, the
  // fresh-work pass — so a finished row was unreachable by every one of them,
  // and the only thing that revived it was a new reply, which reopens the
  // thread as a side effect. One such row was the live thread for a whole workstream when a
  // worker answered a one-word status question and filed it; she could see it,
  // name it, and had no way to say "carry on with this".
  //
  // So this takes ids and only ids. It is her pointing at named rows, never a
  // sweep: an empty ask resumes nothing rather than reviving the whole ledger.
  //
  // A finished row is reopened first, because open is what everything
  // downstream reads, and it is written as HER handback (source founder), which
  // is exactly what it is. Her explicit resume outranks the delivery mark and
  // the three-failure cap, the same way resumeStopped's does.
  resumeItems(ids = null) {
    const only = new Set(Array.isArray(ids) ? ids : []);
    const out = { resumed: 0, queued: 0, working: 0, missing: 0 };
    if (!only.size) return out;
    this.liftBrakeForHer();

    for (const item of this.store.listItems(Date.now())) {
      if (!only.has(item.id)) continue;
      only.delete(item.id);
      // A row with a worker on it is already resumed. Saying so is the honest
      // answer; killing the session to restart it would throw away the work in
      // flight, which is never what "resume" meant.
      if (this.sessions.has(item.id)) { out.working += 1; continue; }

      if (item.status !== 'open') this.store.answerItem(item.product, item.id, { status: 'open' });
      const prefix = `${item.product}:${item.id}:`;
      for (const key of [...this._handledAnswers]) if (key.startsWith(prefix)) this._handledAnswers.delete(key);
      for (const key of Object.keys(this._deliveryAttempts)) if (key.startsWith(prefix)) delete this._deliveryAttempts[key];
      // Resuming a row by name is her saying run this now, which outranks a
      // rest the fleet earned on it exactly as it outranks the attempt cap.
      delete this._fruitless[`${item.product}:${item.id}`];

      if (this._hasSlotFor(this._engineFor(item))) {
        this._spawnResume(item);
        out.resumed += 1;
      } else {
        // Over capacity. The queue is what keeps this honest: without it the
        // row would sit open and nothing would ever pick it up, because tick's
        // own filters do not spawn on a question with no fresh answer.
        this._resumeQueue.add(item.id);
        out.queued += 1;
      }
    }
    out.missing = only.size;
    this._saveState();
    return out;
  }

  // A resumed row spawns as a continuation when she has words on it that the
  // worker has not answered: that is what puts "the founder has answered" in
  // the brief instead of briefing a stranger about a thread she is mid-way
  // through. Otherwise it is an ordinary session on the item.
  _spawnResume(item) {
    const live = item.answer && item.answer !== '(withdrawn)';
    if (live) this._handledAnswers.add(this._answerKey(item));
    this.spawnWorker(item, { continuation: !!live });
  }

  // The recovery command. When every worker dies at once (the founder's plan
  // hitting its usage limit is the observed case), each continuation's answer
  // was already marked delivered, so nothing respawns when capacity returns.
  // Resume forgets those delivery marks for any item still waiting (a live
  // answer, no session on it) and ticks immediately. Claimed items with dead
  // workers need nothing: the lease lapses and the tick re-pulls them.
  //
  // `ids` narrows it to a chosen few. Resuming is not always what she wants for
  // everything that stopped: some of those rows are work she has moved past or
  // does not want spending her plan again, and an all-or-nothing recovery made
  // her choose between restarting things she had written off and restarting
  // nothing (2026-08-07). Omitted means all of them, which is still the right
  // default the morning after a usage limit took the whole fleet down.
  resumeStopped(ids = null) {
    this.liftBrakeForHer();
    const only = ids && ids.length ? new Set(ids) : null;
    const items = this.store.listItems(Date.now());
    let cleared = 0;
    for (const item of items) {
      if (only && !only.has(item.id)) continue;
      if (!item.answer || item.answer === '(withdrawn)') continue;
      if (item.status !== 'open' && item.status !== 'claimed') continue;
      if (this.sessions.has(item.id)) continue;
      // A row whose answer has already been acted on is not stranded, so this
      // command does not touch it and does not count it. Clearing its mark
      // would send a worker at a settled word and report a recovery that
      // recovered nothing, which is how one round of resuming everything cost
      // an hour of her plan on no-ops. resumeItems is the door for those: she
      // names the row, and her word still outranks all of this.
      if (answerSettled(item)) continue;
      const prefix = `${item.product}:${item.id}:`;
      for (const key of [...this._handledAnswers]) {
        if (key.startsWith(prefix)) { this._handledAnswers.delete(key); cleared += 1; }
      }
      // Her explicit "try again" outranks the attempt cap; otherwise the one
      // command for un-sticking things cannot un-stick the things that most
      // need it.
      //
      // Nothing to clear here for a fresh-work rest: this pass only ever sees
      // ANSWERED rows (the guard above), and an answered row is not fresh work.
      // resumeItems, which takes any row by name, is where that is cleared.
      for (const key of Object.keys(this._deliveryAttempts)) {
        if (key.startsWith(prefix)) delete this._deliveryAttempts[key];
      }
    }
    if (cleared) this._saveState();
    this.tick().catch(() => {});
    return cleared;
  }

  /* ---------------------- coming back after the lid ----------------------- */
  // WHAT HAPPENS WHEN SHE OPENS THE LAPTOP, and at every startup, which is what
  // covers a crash rather than a sleep.
  //
  // Measured across her whole store, 08-03 to 08-14: 1,488 sessions, 144 of
  // them with no last line at all because the app went away before it could
  // reap them, in 34 mass die-offs. About three a day.
  //
  // Nothing in the app knew the machine had ever slept, and the damage is silent by
  // construction: an answered row LEAVES her inbox, because an answer means a
  // worker is on it, and that promise is exactly what sleep breaks. So a
  // stranded row is a row she cannot see.
  //
  // THE RULE, and the only reason this is not three lines: resume, never
  // restart. A row whose session is still on disk gets that session back, with
  // everything it had read and written. A row whose session is not gets NOTHING
  // done to it: no fresh worker, no cleared mark, no stranger briefed from
  // zero. It waits for the user, which is deliberately preferred over
  // restarting it.
  recoverInterrupted(reason = 'startup') {
    const out = { reason, resumed: 0, waiting: 0, queued: 0, running: 0, resting: 0, missing: 0, resumedIds: [], waitingIds: [], missingIds: [] };
    this._recoverPending = false;
    let items;
    try { items = this.store.listItems(Date.now()); } catch { return out; }
    let dirty = false;
    for (const [itemId, rec] of Object.entries(this._liveSessions)) {
      // A worker is on it. Nothing is stranded and killing it to resume it
      // would throw away the work in flight, which is never what resume meant.
      // A resume that STUCK also re-arms the announcement: the next time this
      // row is interrupted is a fresh piece of news, not the same one.
      if (this.sessions.has(itemId)) {
        out.running += 1;
        this._announcedRecovery.delete(itemId);
        continue;
      }
      const item = items.find((i) => i.id === itemId && i.product === rec.product);
      // Gone, finished, archived, or parked waiting on her: there is no
      // stranded work here, so the memory of the session goes too.
      if (!item || (item.status !== 'open' && item.status !== 'claimed')) {
        delete this._liveSessions[itemId];
        this._announcedRecovery.delete(itemId);
        dirty = true;
        continue;
      }
      // WE ARE THE REASON THIS ONE IS NOT RUNNING, and the slot it would take
      // is the slot we made for an Urgent row. Resuming it here would undo the
      // interruption within one tick and leave her exactly where she was, one
      // session poorer. The hold is released by `_settlePreemptions` the
      // moment the urgent row is running, and this sweep picks the row up on
      // that same tick. `_recoverPending` keeps the sweep coming back.
      if (this._preempted.has(itemId)) {
        out.queued += 1;
        this._recoverPending = true;
        continue;
      }
      if (!this.transcriptFile(rec)) {
        // No session on disk means no session to resume, only a stranger to
        // brief. Her answer to that case was: it waits for me. The delivery
        // mark is left exactly as it is, deliberately, because clearing it is
        // what would let the ordinary tick restart the row behind her back.
        out.waiting += 1;
        out.waitingIds.push(itemId);
        continue;
      }
      // AN ACCOUNT THAT CANNOT START A SESSION CANNOT RESUME ONE EITHER.
      //
      // Resume forces the row's own profile, and it has to: the session lives
      // in that account's home and in no other, so a resume is only a resume on
      // the account that made it. That is exactly why this path walked past the
      // quarantine `_pickProfile` respects, and that once cost seven and a
      // half hours. A second subscription's login expired; two rows had their
      // sessions on it; every sweep resumed both, both died in two seconds,
      // both were still stranded for the next sweep. Four dead spawns a minute,
      // two of three slots gone to them on every pass, and the healthy account
      // never got to start anything.
      //
      // Resting is not `waiting`. Waiting is her word for a session that is
      // gone off disk and needs a person; this session is intact and this
      // account comes back on its own (thirty minutes, or the moment a spawn on
      // it survives), so nothing is asked of her and the row is simply asked
      // about again. Judged on the cooldown alone rather than `_healthyProfiles`
      // — trouble is only cleared by a session surviving, so judging on it would
      // strand these rows forever on an account she had already fixed.
      if (this._profileResting(this._accountKey(rec.engine, rec.profile))) {
        out.resting += 1;
        this._recoverPending = true;
        continue;
      }
      // AND THE SLOT IT NEEDS IS ITS OWN ENGINE'S. A Codex session waiting to
      // be put back must not queue behind a full Claude fleet: the account it
      // resumes onto is not the one that is busy.
      //
      // ASKED SECOND, BECAUSE "NO ROOM RIGHT NOW" IS NOT "CANNOT RUN HERE"
      // (2026-09-05). `_capacityFor` answers zero for an engine `engineChoices`
      // does not offer, and a Mac with no Codex offers none -- so a stranded
      // Codex row failed this test, was counted as queued, re-armed the sweep,
      // and `_resumeInterrupted`'s own guard, which is the line that writes
      // "install Codex and the same session picks up where it stopped", was
      // never reached. The row sat in her In Progress list with nothing on it
      // while the sweep came back every fifteen seconds to decide the same
      // nothing again. Only one of the two facts ever changes on its own, so
      // only one of them is worth queueing for.
      const engine = engineOf(rec.engine);
      if (this._engineCanRun(engine) && !this._hasSlotFor(engine)) {
        out.queued += 1;
        this._recoverPending = true;
        continue;
      }
      // A HARNESS THIS MAC DOES NOT HAVE IS THE ONE WAY THIS COMES BACK FALSE,
      // and it has already said so on the row. Not queued and not re-armed: the
      // sentence is about the machine rather than about the run, so repeating
      // it on every tick is the banner problem this app has paid for once
      // already (CLAUDE.md, 2026-08-12). The record is kept either way, so the
      // resume really does happen the day the engine is back.
      if (!this._resumeInterrupted(item, rec)) {
        out.missing += 1;
        out.missingIds.push(itemId);
        continue;
      }
      out.resumed += 1;
      out.resumedIds.push(itemId);
      dirty = true;
    }
    if (dirty) this._saveState();
    if (out.resumed || out.waiting || out.queued || out.resting || out.missing) {
      this._lastRecovery = { ...out, at: Date.now() };
    }
    // A TOAST IS NEWS. THE SAME NEWS IS NOT NEWS TWICE.
    //
    // The sweep runs on a fifteen-second tick for as long as any row is
    // unfinished, so its numbers are a STATE, and reporting a state through a
    // channel built for an event is how "1 agent picked up where it left off"
    // ended up flashing in the middle of her screen every fifteen seconds for
    // two days running. The account fix above stops the one loop we found; this
    // stops the SHAPE of it, for any resume that keeps dying on arrival — a
    // crash loop, a folder that vanished, something we have not met yet.
    //
    // Once per row, and re-armed the moment a resume on that row STICKS (a
    // worker is seen on it above), so a genuine second interruption hours later
    // is genuinely announced.
    const fresh = { ...out, resumed: 0, waiting: 0, resumedIds: [], waitingIds: [] };
    for (const id of out.resumedIds) {
      if (this._announcedRecovery.has(id)) continue;
      this._announcedRecovery.add(id);
      fresh.resumed += 1;
      fresh.resumedIds.push(id);
    }
    for (const id of out.waitingIds) {
      if (this._announcedRecovery.has(id)) continue;
      this._announcedRecovery.add(id);
      fresh.waiting += 1;
      fresh.waitingIds.push(id);
    }
    if (fresh.resumed || fresh.waiting) {
      try { this.onRecovered?.(fresh); } catch {}
    }
    return out;
  }

  // AN URGENT ROW TAKES A SLOT INSTEAD OF WAITING FOR ONE.
  //
  // Ordering was already fixed and was not enough. put every spawnable row into
  // one scored queue, which decides who gets the NEXT FREE slot; nothing frees
  // one. Measured over the five days after that fix landed: about a third of
  // answers on Urgent rows waited longer than five minutes to start, most of
  // them behind a lower-priority session that was already running, the worst
  // single wait an hour, and the sessions in front of them ran a median of 21
  // minutes.
  //
  // WHAT MAKES THIS SAFE IS THAT THE WORK IS KEPT, and it is kept by machinery
  // that already existed rather than anything invented here. `_kill` marks the
  // session `stoppedByUs`, which is what stops the exit being read as a fast
  // exit or a fruitless run; `_liveSessions` deliberately REMEMBERS any session
  // that did not finish under its own power; `settleDelivery` hands a killed
  // continuation its answer back; and `recoverInterrupted` puts the very same
  // claude session back on the row, with everything it had read and written,
  // the moment a slot frees. resume, never restart.
  //
  // So the only session we may take is one we can demonstrably give back, and
  // every guard below is a way of failing that test. A session whose id has
  // not reached us yet, or whose transcript is not on disk, would be a kill
  // with no resume behind it — that is not an interruption, it is throwing the
  // work away, and it is the one thing her sentence rules out.
  //
  // Returns the id of the row we interrupted, or null if nothing here is worth
  // taking. Null is the ordinary answer and means the urgent row simply waits
  // for the next free slot, exactly as it does today. AND THE SLOT IT FREES IS
  // ONE ENGINE'S SLOT. Killing a Claude session frees a Claude slot, which is
  // no use whatsoever to an urgent Codex row: the row would still not fit, and
  // she would have lost a running worker for nothing. So the candidate list is
  // scoped to the engine the urgent row is going to spawn on, and a full fleet
  // on the OTHER engine is simply not this row's problem.
  //
  // A ROW SHE PUSHED WITH "RUN NOW" TAKES A SLOT TOO, by the same door and with
  // the same promise that what it pauses comes back as itself. Two things are
  // different, both because she asked for this row by name, this minute: it
  // may pause anything that is not itself pushed, whatever its project or tag,
  // and the empty-runs rule below does not apply to it.
  _preemptFor(item, items, engine = DEFAULT_ENGINE) {
    const pushed = this._runNow.has(item.id);
    if (pushed) return this._takeSlotFor(item, items, engine, (victim) => !this._runNow.has(victim.id));
    if (!isUrgent(item)) return null;
    // A ROW WORKERS KEEP LEAVING ALONE MAY NOT KILL ANYTHING.
    //
    // This is the price of the cap in `restingUntil`. An Urgent row now wakes
    // every fifteen minutes forever rather than climbing to a day, which is
    // what she asked for; without this line it would also take a slot off a
    // running session every fifteen minutes, forever, on a row three sessions
    // have already looked at and found nothing to do. That is not urgency, it
    // is a productive session killed four times an hour for a row that needs
    // HER rather than another worker.
    //
    // ONE empty run is still allowed to interrupt: a single session that got
    // nowhere proves nothing (it may have died on a signed-out account, which
    // is capped at this same rung). The second is the evidence. And because
    // `_emptyRuns` forgives everything the moment she writes on the row, her
    // answer restores the interrupt immediately — which is the case that
    // matters most, an Urgent row she has just replied to.
    if (this._emptyRuns(item) > 1) return null;
    // STRICTLY lower. Equal scores do not interrupt each other: two Urgent
    // rows in the same product would otherwise take turns killing each
    // other for as long as they both existed. Nor does it pause a row she
    // pushed with Run now, which she asked for by name.
    const want = this._score(item);
    return this._takeSlotFor(item, items, engine,
      (victim) => this._score(victim) < want && !this._runNow.has(victim.id));
  }

  // The half of an interruption both doors share: pick the session to pause,
  // pause it, and hold it out of the queue until `item` is running.
  // `mayTake(victim)` is the door's own rule about whom it may pause.
  _takeSlotFor(item, items, engine, mayTake) {
    // A slot taken for a row that cannot take it is a kill that buys her
    // nothing. The queue's own guards cover the answered case; this covers a
    // lease somebody else still holds, which would refuse this worker the
    // claim whatever we killed to make room for it.
    if (this.claimHeldElsewhere(item)) return null;
    const candidates = [];
    for (const session of this.sessions.values()) {
      const id = session.itemId;
      if (!id || id === item.id) continue;
      // A session on the other engine is holding a slot this row cannot use.
      if (engineOf(session.engine) !== engineOf(engine)) continue;
      // Already interrupted for someone else. Taking it twice would be taking
      // a session that is not running.
      if (this._preempted.has(id)) continue;
      const victim = items.find((i) => i.id === id && i.product === session.product);
      // A session with no row behind it is a digest, or a row that has
      // since been archived. We cannot score it and we cannot resume it onto
      // anything, so it is left alone.
      if (!victim) continue;
      if (!mayTake(victim)) continue;
      const rec = this._liveSessions[id];
      // The two halves of "the work is kept". Without the record there is no
      // session id to resume; without the transcript the CLI's --resume exits
      // in about a second, which this file reads as a fast exit and answers
      // with a fleet-wide spawn cooldown.
      if (!rec?.sessionId || !this.transcriptFile(rec)) continue;
      candidates.push({ id, session, victim, score: this._score(victim) });
    }
    if (!candidates.length) return null;
    // Lowest score first, and the YOUNGEST of a tie. Age is the only thing we
    // know about how much of a session's work is in flight, and interrupting
    // the one that has been going twenty minutes to save one that started two
    // minutes ago is the wrong way round.
    candidates.sort((a, b) => a.score - b.score
      || (b.session.startedAt ?? 0) - (a.session.startedAt ?? 0));
    const taken = candidates[0];
    this._kill(taken.session);
    this._preempted.set(taken.id, {
      at: Date.now(),
      forItem: item.id,
      forProduct: item.product,
    });
    // The row we just interrupted is now a stranded session, which is the wake
    // sweep's business. Arming it here is what carries the second half of the
    // promise: the moment the urgent row is running and the hold lifts, the
    // sweep is already scheduled to put this one back.
    this._recoverPending = true;
    return taken.id;
  }

  // GIVE THE INTERRUPTED ROWS THEIR SLOT BACK once the urgent row has one.
  //
  // A preemption is a promise with two halves and this is the second: the row
  // we interrupted stops being held out of the queue the moment the row we
  // interrupted it FOR is actually running, or has finished, or has stopped
  // being urgent, or has left the store. The timeout is a backstop and not the
  // mechanism — without it, an urgent row that can never spawn (a lease that
  // never lapses, a product she pauses a second later) would hold its victim
  // out of the queue for as long as the app stayed up.
  _settlePreemptions(items, now = Date.now()) {
    for (const [id, rec] of [...this._preempted]) {
      const target = items.find((i) => i.id === rec.forItem && i.product === rec.forProduct);
      const done = this.sessions.has(rec.forItem)
        || !target
        || (target.status !== 'open' && target.status !== 'claimed')
        || (!isUrgent(target) && !this._runNow.has(target.id))
        || now - rec.at > PREEMPTION_HOLD_MS;
      if (done) this._preempted.delete(id);
    }
  }

  /**
   * RUN THIS ONE NOW: the three-dot menu's row on a waiting task.
   *
   * Her tag on a task could not do this. A project's place in her order is
   * worth a hundred times any tag (shared/rank.mjs), so an Urgent task in a
   * lower project waited behind a Low one in a higher project and could not
   * interrupt it either; lowering the other tasks only reordered the waiting
   * line, never a running one. So this is not a priority at all. It is a
   * one-time push: the task goes to the front of the line, and if every slot
   * on its engine is full the tick pauses the least important running task to
   * make room (`_preemptFor`), which comes back as its own session afterwards.
   * The task's tag and everything else's order are left exactly as they were.
   */
  runNow(product, id) {
    const item = this.store.listItems(Date.now()).find((i) => i.id === id && i.product === product);
    if (!item) return { ok: false, reason: 'missing' };
    if (this.sessions.has(id)) return { ok: false, reason: 'running' };
    this._runNow.set(id, { product, at: Date.now(), started: false });
    // Asking for a row by name outranks a rest the fleet earned on it, the
    // same way `resumeItems` treats it.
    if (this._fruitless[`${product}:${id}`]) {
      delete this._fruitless[`${product}:${id}`];
      this._saveState();
    }
    this.onChange?.();
    this.wake();
    return { ok: true };
  }

  // A push lasts while its task runs, so a second push cannot pause the first,
  // and ends with that run. One that never starts ends when the row stops being
  // open work: finished, archived, or gone.
  _settleRunNow(items) {
    for (const [id, rec] of [...this._runNow]) {
      const item = items.find((i) => i.id === id && i.product === rec.product);
      if (!item || (item.status !== 'open' && item.status !== 'claimed')) { this._runNow.delete(id); continue; }
      if (this.sessions.has(id)) rec.started = true;
      else if (rec.started) this._runNow.delete(id);
    }
  }

  // AN ACCOUNT THAT IS OUT OF THE ROTATION RIGHT NOW.
  //
  // The cooldown and nothing else, deliberately. `_liveProfiles` falls back to
  // ['default'] when everything is resting, which is right for picking somewhere
  // to try and wrong here; `_healthyProfiles` also excludes an account whose
  // trouble has not been cleared, and trouble is only ever cleared by a session
  // surviving on it — which for these rows would never come, because they are
  // the sessions.
  _profileResting(profile) {
    return (this._profileCooldown?.[profile || 'default'] ?? 0) > Date.now();
  }

  /*
   * AN ACCOUNT ONLY A PERSON CAN MEND HOLDS NO CHAT.
   *
   * A row is a chat, and a chat lives on one account: `_rowSessions` records
   * which, and every reply the user writes goes back there, because a transcript
   * sits under one profile's home and under no other.
   *
   * It was. Chats remembered on an account whose organization had Claude Code
   * switched off died again and again, each death about twenty seconds after a
   * reply on the row, while another subscription worked throughout. Some of
   * those spawns went out INSIDE the thirty-minute
   * quarantine this file had already put that account in: `_recoverPending`'s
   * sweep checks the quarantine and the reply path never did.
   *
   * TWO HALVES, AND THE SECOND ONE IS WHY THIS IS NOT SIMPLY `_profileResting`.
   * An account that comes back ON ITS OWN keeps its chat — a limit that resets,
   * a run the network cut off, a plain cooldown are all worth waiting out, and
   * the wake sweep makes that same judgment in the same words. Only an account
   * waiting on a PERSON loses it, because that wait has no end we can see.
   *
   * And it never fires when there is nowhere better to go: with no healthy
   * account left, dropping the chat would lose the thread and buy nothing.
   * Losing a chat costs one fresh brief, which is what every row got before
   * chats existed, so the worst case of this guard is the old normal.
   *
   * A USAGE LIMIT IS NOW A THIRD HALF, and a PER-ENGINE one (w-ca48e69535).
   * "Worth waiting out" was written about a five-hour limit. A Codex login
   * that hits a WEEKLY one can be days from resetting, and a reply sat on it
   * while the other login was at 0%. A user who has switched accounts expects
   * the work to run on the new one. So an account resting on its
   * limit gives the chat up too, when another account on the SAME engine can
   * run. This used to read `_healthyProfiles` and an unkeyed trouble entry,
   * both Claude-only, so it could never fire for a Codex row at all. */
  _profileCannotHoldAChat(profile, engine = DEFAULT_ENGINE) {
    const word = profile || 'default';
    const key = this._accountKey(engine, word);
    const elsewhere = this._liveProfilesFor(engine)
      .filter((p) => (p || 'default') !== word && !this._profileTrouble?.[this._accountKey(engine, p)]);
    if (!elsewhere.length) return false;
    const cause = this._profileTrouble?.[key]?.cause;
    if (needsHerHands(cause)) return true;
    return cause === 'at-limit' && this._profileResting(key);
  }

  // Put the session that was doing this work back on it, and say whether it
  // went. False means the harness that wrote this session is not on this Mac,
  // which the caller counts apart from a row that is merely waiting for a slot:
  // one of those two changes on its own and the other does not.
  _resumeInterrupted(item, rec) {
    // The delivery mark and the attempt count both record that A WORKER WAS
    // HANDED HER ANSWER. The worker being handed it is the one that already
    // had it, so they are cleared and immediately re-made by the spawn below,
    // exactly as resumeStopped does for the rows it revives. Without the clear
    // a second interruption would strand the row for good.
    const prefix = `${item.product}:${item.id}:`;
    for (const key of [...this._handledAnswers]) if (key.startsWith(prefix)) this._handledAnswers.delete(key);
    for (const key of Object.keys(this._deliveryAttempts)) if (key.startsWith(prefix)) delete this._deliveryAttempts[key];
    const live = item.answer && item.answer !== '(withdrawn)';
    // THE ENGINE THAT WROTE THIS SESSION IS THE ENGINE THAT RESUMES IT.
    //
    // `rec.engine` was already in hand here and was not passed on, so the engine
    // was decided again from scratch inside `spawnWorker` and could disagree
    // with the very session being resumed. This is the path that runs after
    // every restart and every lid close, which is the moment the most rows are
    // waiting, and a crossed harness there is a continuation that dies on
    // arrival over and over rather than carrying on her chat.
    const engine = engineOf(rec.engine);
    // AND IF THAT ENGINE CANNOT RUN HERE, THE ROW WAITS AND SAYS SO. She may
    // have marked the row on a Mac that has Codex and be reading it on one that
    // does not. Falling back to the other harness would hand it an id from a
    // different world; falling back to silence is the failure CLAUDE.md is
    // built around. So it is said on the row, in our own words, and the record
    // is kept so the resume still happens the day the engine is back.
    if (!this._engineCanRun(engine)) {
      this._sayTheHarnessIsMissing(item, engine);
      return false;
    }
    if (live) this._handledAnswers.add(this._answerKey(item));
    this.spawnWorker(item, {
      continuation: !!live, resumeSessionId: rec.sessionId, profile: rec.profile, engine,
    });
    return true;
  }

  /**
   * Whether this Mac has the harness at all, which is a different question
   *  from whether it has a free slot. Claude Code answers yes for itself unless
   *  this Mac runs on Codex alone: with neither, the app refuses to open an
   *  inbox and says so in its own words, so a second sentence here is noise. */
  _engineCanRun(engine) {
    return engineOf(engine) === DEFAULT_ENGINE ? this._homeEngine() === DEFAULT_ENGINE : !!this.config.codexBin;
  }

  /**
   * THE ROW WHOSE CHAT LIVES IN A HARNESS THIS MAC DOES NOT HAVE.
   *
   * Written once per sweep at most, because `_resumeInterrupted` is only
   * reached for a row whose record is still live, and the sentence is about the
   * machine rather than about the run, so repeating it every fifteen seconds
   * would be the banner problem again. The status does not move: the work still
   * wants doing and a row blocked over a missing binary is a row taken out of
   * rotation for something that may be installed a minute later.
   */
  _sayTheHarnessIsMissing(item, engine) {
    const word = engineLabel(engine);
    try {
      this.store.recordSessionResult(item.product, item.id, {
        result: `This task was being worked on in ${word}, which is not installed on this Mac, so ${NAME} has not put a session back on it. It is not lost: install ${word} and the same session picks up where it stopped.`,
        status: 'open',
      });
    } catch (e) { console.warn('zero: could not say the harness is missing:', e.message); }
  }

  /**
   * THE ROW WHOSE MODEL IS THE OTHER HARNESS'S WORD, AND WHY IT IS WAITING.
   *
   * THE MIRROR OF `codexModelRefusal`, WHICH ONLY EVER GUARDED ONE DIRECTION.
   * That one stops a Claude alias reaching a Codex run. Nothing stopped the
   * reverse, and `engineFor`'s fallback to Claude Code on a Mac with no Codex --
   * which is correct and stays -- is what produces it. Measured 2026-09-05:
   * `engine: "codex", model: "gpt-5.6-sol"` resolved to `--model gpt-5.6-sol` on
   * a Claude Code command line, a run that cannot start and retries into the
   * same wall.
   *
   * THREE ANSWERS WERE POSSIBLE AND ONLY ONE IS HONEST.
   *
   *   CARRY THE WORD -> the bug: a run that dies on arrival, silently, forever.
   *   DROP IT AND RUN -> the workspace's own Claude model, which is a
   *     substitution she did not pick. `codexModelRefusal` refused exactly that
   *     on the other side and the reason is stronger here: a run that goes ahead
   *     and SUCCEEDS has no channel to tell her, and on a one-engine Mac there
   *     is no channel at all -- the byline names no engine there by design
   *     (tests/one-coding-agent-draws-nothing-new.test.mjs) and
   *     `_sayTheChoiceIsOld` is a console.warn.
   *   STOP AND SAY SO -> the only outcome she can see.
   *
   * AND THE LINE IS AT THE MODEL, NOT AT THE ENGINE. A row naming Codex with no
   * model still runs here on Claude Code, unchanged and unremarked, because
   * there is no word of hers to swallow on such a row and `engineFor`'s fallback
   * exists precisely so a row marked on her laptop still gets worked on the Mac
   * in front of her. `spawnWorker` only reaches this when the row carries a
   * model.
   *
   * THE STATUS DOES NOT MOVE, for the two reasons `_sayTheHarnessIsMissing` and
   * `sayTheRunDied` both give: the work still wants doing, and a row blocked
   * over this is a row out of rotation for something that clears the moment she
   * installs the harness or clears the model.
   *
   * ONCE PER ROW. `spawnWorker` is reached from the queue, which re-reads every
   * open row every fifteen seconds; a line per pass is the staleness-banner
   * failure again (CLAUDE.md, 2026-08-12).
   */
  _sayTheModelIsForAnotherEngine(item, engine) {
    this._crossModelSaid ??= new Set();
    if (this._crossModelSaid.has(item?.id)) return;
    this._crossModelSaid.add(item?.id);
    const asked = engineLabel(item?.engine);
    const running = engineLabel(engine);
    try {
      this.store.recordSessionResult(item.product, item.id, {
        result: `This task asks for ${asked} and for the model "${item.model}", and ${asked} is not what would run it here. ${Name} has ${running} to run it on, and a ${asked} model is not a word ${running} knows. Nothing here will pick a stand-in for you, so this task is waiting rather than running on a model you did not choose. Either way out works: install ${asked} and it runs as written, or clear the model on this task and it runs now on ${running}.`,
        status: 'open',
      });
    } catch (e) { console.warn('zero: could not say the model is for another engine:', e.message); }
  }

  // WHERE THE SESSION ACTUALLY IS, checked rather than assumed. The CLI keeps
  // one transcript per session under its profile's home, in a directory named
  // after the working directory with every character that is not a letter or a
  // digit turned into a dash.
  //
  // Checked, because `--resume` on an id whose transcript has been cleaned up
  // exits in about a second, and this file reads a spawn that dies in seconds
  // as a fast exit: three of those strike the subscription and arm a fleet-wide
  // spawn cooldown of up to thirty minutes. A sweep that tried to resume ten
  // vanished sessions would take the whole fleet down with it.
  transcriptFile(rec) {
    if (!rec?.sessionId) return null;
    // AND WHICH CLI WROTE IT, because the two keep their transcripts in places
    // with nothing in common. Claude Code's is one path we can test outright;
    // Codex writes `<home>/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl` with
    // the id INSIDE the filename, so finding one means a bounded newest-first
    // search -- there were 1,700 of them on the machine this was written on.
    //
    // An entry with no engine is Claude Code, which is right for every record
    // written before this line existed: they were all Claude Code, and the
    // ledger had no second engine to write. AND UNDER WHICH LOGIN, which is the
    // same question the Claude branch below asks and this one did not. It read
    // `_codexHome` for every record, so a session that ran on a second Codex
    // login was searched for in the first and answered null -- and a null here
    // is `resumeStopped` writing the row off as a session that no longer
    // exists.
    if (rec.engine === 'codex') {
      return codexTranscriptFile(rec.sessionId, { home: this._codexProfileHome(rec.profile) });
    }
    const home = rec.profile && rec.profile !== 'default' ? rec.profile : path.join(os.homedir(), '.claude');
    const projects = path.join(home, 'projects');
    const slug = String(rec.cwd ?? '').replace(/[^a-zA-Z0-9]/g, '-');
    const direct = path.join(projects, slug, `${rec.sessionId}.jsonl`);
    if (fs.existsSync(direct)) return direct;
    // The slug rule is the CLI's and it may change under us, so a miss is
    // answered by looking rather than by writing off a session that is plainly
    // sitting on disk.
    try {
      for (const dir of fs.readdirSync(projects)) {
        const candidate = path.join(projects, dir, `${rec.sessionId}.jsonl`);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {}
    return null;
  }

  /* `rememberPersonalSession` and `personalSessionFor` were a pair here: one
     map of itemId -> session id, so that a reply on a personal row resumed the
     session that wrote what she was replying to. `_rowSessions` does exactly
     that for every row in the app and is what remains (w-d19d6d387c). */

  /* ------------------- the folder a task works in ------------------------- */
  // WHERE A SESSION ACTUALLY RUNS, since 2026-09-22.
  //
  // Until this, every session on a product ran in the one checkout the product
  // registers, and staying out of each other's way was a rule in the worker
  // brief rather than anything the app did. Measured: 25 leftover copies of
  // this repository holding 26 GB, twelve of them carrying edits committed
  // nowhere, because the rule's first half (make a copy) is kept by almost
  // every session and its second half (fold it back, delete it) by almost
  // none. So the app makes the folder, for both engines. main/task-folders.mjs
  // is the whole of how.
  //
  // THE PRODUCT'S OWN CHECKOUT IS STILL THE ANSWER for a product with no
  // repository, for a personal chat, and any time making the
  // folder fails. Nothing here may ever stop a spawn: a session that runs in
  // the shared checkout is what happened yesterday, and a session that does not
  // run is a row she never hears back on.

  /**
   * THE CONVERSATION A FORKED ROW STARTS FROM, or null for every ordinary row.
   *
   * `/fork` labels the new row `fork:<source row>` and that label is the whole
   * of the mechanism (MP-08, w-5ebf7bf7bb). The source row's chat is looked up
   * through `rowSessionFor`, which is the same gate every resume passes: right
   * product, right engine, transcript still on disk, folder unmoved. A source
   * whose chat has aged out answers null here, and the fork is then briefed
   * fresh rather than handed an id its account has never heard of.
   */
  forkSourceFor(item, product = null) {
    const label = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith('fork:'));
    if (!label) return null;
    // ONCE, AND ONLY ONCE. The label stays on the row forever, so the test that
    // stops a second fork is whether this row has a conversation of its own
    // yet. Without it a row that ran, said nothing and was picked up again
    // would fork the source a second time and leave two threads where she
    // asked for one.
    if (this._rowSessions?.[item.id]?.sessionId) return null;
    const sourceId = label.slice(5).trim();
    if (!sourceId || sourceId === item.id) return null;
    let source = null;
    try { source = this.store.readItem?.(item.product, sourceId) ?? null; } catch { source = null; }
    if (!source) return null;
    const chat = this.rowSessionFor(source, product ?? this.store.listProducts?.().find((p) => p.slug === item.product) ?? null);
    return chat?.sessionId ? { sessionId: chat.sessionId, profile: chat.profile ?? null, sourceId } : null;
  }

  /** The base checkout: what every session used before folders existed. */
  productFolder(product) {
    return product?.repoPath && fs.existsSync(product.repoPath) ? product.repoPath : product?.dir;
  }

  /** Does this row get a folder of its own at all? */
  _folderRow(item, product) {
    return Boolean(item?.id && product?.repoPath
      && this.productFolder(product) === product.repoPath);
  }

  /**
   * Where this row's work lives, made if it is not there yet and UNPARKED if
   * the row was closed and she has come back to it: a reopened task finds the
   * files exactly as the last session left them, uncommitted work included.
   */
  workFolderFor(item, product) {
    const base = this.productFolder(product);
    if (!this._folderRow(item, product)) return base;
    // Already made, off this thread, by the spawn that is asking (`_folderFirst`).
    const made = this._madeFolders?.get(item.id);
    if (made) return made;
    try { return restoreTaskFolder(base, item.id)?.path ?? base; }
    catch (error) {
      console.warn(`zero: ${item.id} is running in the shared checkout:`, error.message);
      return base;
    }
  }

  /**
   * Every folder a session on this row may legitimately have run in.
   *
   * All of them, because a record written before task folders existed names the
   * checkout and refusing those would throw away every chat she is in the
   * middle of. Both SPELLINGS of the checkout too: on a Mac `/tmp` and `/var`
   * are symlinks into `/private`, git answers with the resolved spelling, and
   * an old record holds whatever the product registered.
   *
   * MAKES NOTHING. This runs on every resume check, where a side effect would
   * leave a folder behind for every row she ever replied to.
   */
  workFolders(item, product) {
    const base = this.productFolder(product);
    if (!base) return [];
    const spellings = [...new Set([base, real(base)])];
    if (!this._folderRow(item, product)) return spellings;
    try { return [...spellings, taskFolderPath(base, item.id)]; } catch { return spellings; }
  }

  /**
   * Hand the folder back when the session lets go of it. It is only deleted
   * when losing it costs nothing, so the ordinary answer here is that it stays,
   * holding work she has not approved yet. The sweep then takes it on a later
   * exit, once its branch is in main.
   */
  //
  // OFF THE WINDOW'S THREAD (main/task-folders-offthread.mjs). Removing one is
  // a `git worktree remove` of a gigabyte of cloned files, measured at six
  // seconds of spinning wheel on her Mac as a session exited, and nothing
  // waits for the answer.
  async releaseWorkFolder(item, product) {
    if (!this._folderRow(item, product)) return null;
    const base = this.productFolder(product);
    try {
      const out = await folderJob('releaseTaskFolder', base, item.id);
      await this.parkClosedFolders(product);
      return out;
    } catch (error) {
      console.warn('zero: could not tidy the task folders:', error.message);
      return null;
    }
  }

  /**
   * A SESSION LETS GO OF ITS ROW, AND ONLY OF ITS OWN ROW.
   *
   * One entry in the session map per row, so two sessions on one row share it,
   * and an exit used to delete that entry whoever it belonged to. Measured on
   * w-4d722ecf92, 2026-09-30: the row's folder had been built at the path a
   * session runs in, a tick mid-build started a worker in it, the finished
   * build started a second worker on the same row, and when the first exited it
   * deleted the entry belonging to the one still running and handed its folder
   * back. A folder freshly made at main is clean and already in main, which is
   * exactly the case `releaseTaskFolder` DELETES rather than keeps, so the
   * ground went out from under a live agent about a minute in.
   *
   * The build is atomic now (`buildingFolderPath`) so two sessions should not
   * reach one row at all. This is the second lock on the same door, because the
   * cost of being wrong here is an agent's work deleted mid run.
   */
  endSession(item, session, product) {
    if (session && this.sessions.get(item.id) !== session) {
      console.warn(`zero: a later session is on ${item.id}, so this one leaves its folder alone`);
      return Promise.resolve(null);
    }
    this.sessions.delete(item.id);
    // The row's folder goes back. It is only deleted when losing it costs
    // nothing, so the usual answer is that it stays, holding work she has not
    // approved. The same call sweeps the folders whose work has since landed in
    // main, which is what stops them piling up unseen.
    return Promise.resolve(this.releaseWorkFolder(item, product));
  }

  /**
   * THE ROW'S FOLDER, MADE BEFORE THE SPAWN AND NOT ON THIS THREAD.
   *
   * Making one is a worktree plus a block clone of the checkout, measured at
   * 9.6 seconds for astral-video and seen as a 19 second freeze of her window
   * on 2026-09-27 with three agents running. So a spawn whose row has no folder
   * yet is parked here, the folder is made on the folder thread, and the spawn
   * runs again once it exists. Returns true when it has taken the spawn.
   *
   * WHILE IT WAITS THE ROW IS SPOKEN FOR. A second spawn of the same row only
   * replaces the arguments, so the one that runs is the latest ask (her reply
   * landing mid-wait is a continuation, and that is the one that should run).
   * It holds its slot too (`_loadFor`), or the tick would hand that slot to
   * another row while this one waits.
   *
   * A folder already on disk is not parked: reusing one is three short git
   * calls, and a remote-control spawn is read back the moment it returns.
   */
  _folderFirst(item, product, engine, opts) {
    if (opts.remoteOnly || !this._folderRow(item, product)) return false;
    this._preparing ??= new Map();
    this._madeFolders ??= new Map();
    if (this._madeFolders.has(item.id)) return false;
    const base = this.productFolder(product);
    let folder = null;
    try { folder = taskFolderPath(base, item.id); } catch { return false; }
    // WHO IS ALREADY MAKING ONE IS ASKED BEFORE THE DISK IS, and that order is
    // the whole of it. A build takes about ten seconds, and it used to leave a
    // directory at this path for all of them, so a tick arriving mid-build read
    // "the folder is there" and started a session in a folder holding almost
    // none of the code. The build then finished and started its own session on
    // the same row: two workers, and the second one's claim refused
    // (2026-09-30, w-4d722ecf92). The folder is built elsewhere and moved in
    // now, so the disk no longer lies here, and this answers first anyway
    // because a row somebody is already preparing is never a row to spawn on.
    const held = this._preparing.get(item.id);
    if (held) { held.item = item; held.opts = opts; return true; }
    if (fs.existsSync(folder)) return false;
    const entry = { item, opts, engine };
    this._preparing.set(item.id, entry);
    folderJob('restoreTaskFolder', base, item.id)
      .then((made) => made?.path ?? base, (error) => {
        console.warn(`zero: ${item.id} is running in the shared checkout:`, error.message);
        return base;
      })
      .then((cwd) => {
        // Stopped, or the app quit, while the folder was being made.
        if (this._preparing.get(item.id) !== entry) return;
        this._preparing.delete(item.id);
        // AND A SESSION THAT ARRIVED WHILE WE WERE BUILDING ALREADY HAS THIS
        // ROW. Starting a second one here is what gave w-4d722ecf92 two workers
        // and had the second one's claim refused. A spawn cannot reach this
        // point through `_folderFirst` any more, but a remote-control spawn
        // skips it entirely, so the one place that starts a worker without
        // anybody having just checked asks for itself.
        if (this.sessions.has(item.id)) { this.onChange?.(); return; }
        this._madeFolders.set(item.id, cwd);
        try { this.spawnWorker(entry.item, entry.opts); }
        catch (error) { console.warn(`zero: could not start ${item.id}:`, error.message); }
        finally { this._madeFolders.delete(item.id); }
        this.onChange?.();
      });
    return true;
  }

  /**
   * THE CHECKOUT, PHOTOGRAPHED OFF THE MAIN THREAD BEFORE THE RUN STARTS
   * (2026-10-01, main/git-change-offthread.mjs says why). The same pending
   * entry `_folderFirst` uses, so a row being photographed counts against its
   * slot and Stop cancels it exactly as it cancels a folder being made.
   */
  _photoFirst(item, product, engine, opts) {
    if (opts.remoteOnly) return false;
    this._photos ??= new Map();
    if (this._photos.has(item.id)) return false;
    const held = this._preparing?.get(item.id);
    if (held) { held.item = item; held.opts = opts; return true; }
    let cwd = null;
    try { cwd = this.workFolderFor(item, product); } catch { return false; }
    // Only a folder that is itself a checkout (a task folder carries a `.git`
    // file, a repository a `.git` folder). Anything else has nothing to
    // photograph, and keeps starting in the same call as before.
    if (!cwd || !fs.existsSync(path.join(cwd, '.git'))) return false;
    this._preparing ??= new Map();
    const entry = { item, opts, engine, madeFolder: this._madeFolders?.get(item.id) };
    this._preparing.set(item.id, entry);
    gitJob('snapshotRepo', cwd)
      .then((photo) => photo ?? null, () => null)
      .then((photo) => {
        if (this._preparing.get(item.id) !== entry) return;
        this._preparing.delete(item.id);
        this._photos.set(item.id, photo);
        if (entry.madeFolder !== undefined) { this._madeFolders ??= new Map(); this._madeFolders.set(item.id, entry.madeFolder); }
        try { this.spawnWorker(entry.item, entry.opts); }
        catch (error) { console.warn(`zero: could not start ${item.id}:`, error.message); }
        finally {
          this._photos.delete(item.id);
          if (entry.madeFolder !== undefined) this._madeFolders?.delete(item.id);
        }
        this.onChange?.();
      });
    return true;
  }

  /**
   * THE FOLDERS OF ROWS THAT ARE FINISHED, PUT AWAY.
   *
   * A closed row's folder is worth reclaiming, and the risk is that a row gets
   * closed by accident and the code in it is wanted back.
   *
   * Parking is what makes that safe rather than a timer: whatever is
   * uncommitted goes onto the row's own branch first, and reopening the row
   * takes that commit apart again, so an accidental close costs ten seconds and
   * never a line of work. `main/task-folders.mjs` is where the whole argument
   * is written down.
   *
   * A folder whose row has gone from the store entirely is parked too: its
   * branch keeps everything, and a row that no longer exists cannot be the
   * thing holding a gigabyte.
   */
  /**
   * Ten minutes between sweeps: this reads the disk, and a tick is fifteen
   *  seconds. Nothing depends on it being prompt, because a folder holding work
   *  is not costing her anything until it is holding a lot of them. */
  static get PARK_SWEEP_MS() { return 10 * 60 * 1000; }

  parkOnATimer(now = Date.now()) {
    if (now - (this._lastParkSweep ?? 0) < Supervisor.PARK_SWEEP_MS) return;
    this._lastParkSweep = now;
    (async () => {
      for (const product of this.store.listProducts()) await this.parkClosedFolders(product);
    })().catch((error) => console.warn('zero: could not put the finished folders away:', error.message));
  }

  /** This product first, then anything else registering the same checkout. */
  _productsSharing(product) {
    let all = [];
    try { all = this.store.listProducts() ?? []; } catch { all = []; }
    return [product, ...all.filter((p) => p.slug !== product.slug && p.repoPath === product.repoPath)];
  }

  // Off the window's thread like the rest of the folder work, which is why a
  // row is asked about again right before its folder goes: the listing is a
  // moment old by then, and a session may have started in it meanwhile.
  async parkClosedFolders(product) {
    const base = this.productFolder(product);
    if (!product?.repoPath || base !== product.repoPath) return 0;
    const busy = (id) => this.sessions.has(id) || !!this._preparing?.has(id);
    let put = 0;
    for (const folder of await folderJob('listTaskFolders', base)) {
      // OUR OWN PID IS NOT SOMEBODY ELSE. Every folder is locked by the process
      // that made it, which is this one, so treating any lock as a live holder
      // would mean the app could never put away a folder it opened itself. What
      // actually says a session is standing in it is the session map.
      if ((folder.heldBy && folder.heldBy !== process.pid) || busy(folder.id)) continue;
      // Merged and clean is the cheaper case and `releaseTaskFolder` already
      // covers it, branch and all. This is only about rows that are finished.
      // ACROSS EVERY PRODUCT, not just this one. Two products may register the
      // same checkout, and a folder belonging to the other one's open row would
      // otherwise read as a row that no longer exists and be put away under it.
      let item = null;
      for (const p of this._productsSharing(product)) {
        try { item = this.store.readItem?.(p.slug, folder.id) ?? null; } catch { item = null; }
        if (item) break;
      }
      if (item && item.status !== 'done') continue;
      // AND NEVER A ROW SOMEBODY IS STILL HOLDING, which is the rule the bug
      // report asked for: whatever cleans folders up must not remove one whose
      // row is claimed by a live session. The session map above is only
      // the sessions THIS process started, so a worker the app has lost track
      // of, or one whose lease has not run out yet, is invisible to it. The
      // claim in the ledger is the fact that outlives this process. The cost of
      // reading it is that a finished folder waits out a lease; the cost of not
      // reading it is an agent's folder deleted while it works (w-4d722ecf92).
      if (item?.claim && !item.claimExpired) continue;
      if (busy(folder.id)) continue;
      if ((await folderJob('parkTaskFolder', base, folder.id)).parked) put += 1;
    }
    return put;
  }

  profileHoldingSession(sessionId, itemId, product) {
    if (!sessionId) return null;
    const remembered = this._rowSessions?.[itemId]?.profile;
    if (remembered) return remembered;
    const cwd = product?.repoPath && fs.existsSync(product.repoPath) ? product.repoPath : product?.dir;
    for (const profile of this._profiles()) {
      if (this.transcriptFile({ sessionId, profile, cwd })) return profile;
    }
    return null;
  }

  /* ------------------------- a row is a chat ------------------------------ */
  // WHAT IS FORGOTTEN, AND WHY THE AGE IS THE REAL LIMIT RATHER THAN THE COUNT.
  //
  // Forgetting an entry here deletes NO work: the row, its results and her
  // answers live in the store forever, and the transcript is a file Claude Code
  // owns. All that goes is the pointer, so the row's next reply gets a fresh
  // session briefed with the thread, which is what every row got before this
  // existed.
  //
  // She was still right to push on the number. MEASURED on her real store,
  // 2026-08-30: 832 product rows in 28 days, 29.8 a day, so a 500 cap is a
  // seventeen day memory and she has already been over it once.
  //
  // But a bigger cap is not what makes it safe either, because CLAUDE CODE
  // DELETES ITS OWN TRANSCRIPTS AT THIRTY DAYS and an entry whose transcript
  // is gone is already refused by `rowSessionFor`. Measured the same day
  // across both her logins: 3,808 transcript files, oldest 31.0 days, exactly
  // one over 30. So thirty days is the true life of a chat whatever we set
  // here, and the honest prune is by age, with the count left as a backstop
  // far above where it can bite: replaying her 1,605 real replies through this
  // rule, every cap from 300 up loses none of them, and the deepest reply she
  // has ever made sat 228 rows down. At 243 bytes a row, 2,000 rows is about
  // 486 KB, and the state file's sync write measures 0.16 ms against 0.08 ms
  // at 500. Re-run it all with `scripts/replay-the-forgetting-rule.mjs`.
  static get ROW_SESSION_CAP() { return 2000; }

  // Claude Code's own `cleanupPeriodDays`, which neither of her settings files
  // overrides. Past this the transcript is gone and the entry is dead weight.
  static get ROW_SESSION_MAX_AGE_MS() { return 30 * 24 * 60 * 60 * 1000; }

  rememberRowSession(item, { sessionId, cwd, profile, engine, startedAt }) {
    if (!sessionId || !item?.id) return;
    // The map can be missing on a supervisor that did not come up through the
    // constructor, and forgetting a chat is never worth throwing over. Same
    // reasoning as `rowSessionFor`: everything here fails soft.
    if (!this._rowSessions) this._rowSessions = {};
    this._rowSessions[item.id] = {
      // `engine` for the same reason `_liveSessions` carries it: this map is
      // read after a restart, by `rowSessionFor`, which asks `transcriptFile`
      // whether the chat is still on disk. Without it a Codex row's chat is
      // looked for under `~/.claude/projects`, found missing, and quietly
      // forgotten -- so her next reply on that row briefs a stranger.
      sessionId, product: item.product, cwd, profile, engine, startedAt, lastUsedAt: Date.now(),
    };
    this.pruneRowSessions();
  }

  // Forget a chat once its transcript has aged out from under it, and forget
  // the oldest ones past the cap as a backstop. Deliberately NOT a walk of the
  // store or of the disk: this runs on every spawn, and a chat whose row or
  // whose transcript has gone is already refused by `rowSessionFor` below,
  // which checks both at the moment it matters. The age test here is the cheap
  // version of that check, so the map stays about the size of thirty days of
  // her work rather than growing forever.
  //
  // An entry with no `lastUsedAt` predates this map recording one, so it is
  // treated as old rather than as new: guessing it fresh would keep a dead
  // pointer forever, and the cost of dropping it is one fresh brief.
  pruneRowSessions() {
    if (!this._rowSessions) return;
    const cutoff = Date.now() - Supervisor.ROW_SESSION_MAX_AGE_MS;
    for (const id of Object.keys(this._rowSessions)) {
      if ((this._rowSessions[id].lastUsedAt ?? 0) < cutoff) delete this._rowSessions[id];
    }
    const ids = Object.keys(this._rowSessions);
    const cap = Supervisor.ROW_SESSION_CAP;
    if (ids.length <= cap) return;
    ids.sort((a, b) => (this._rowSessions[a].lastUsedAt ?? 0) - (this._rowSessions[b].lastUsedAt ?? 0));
    for (const id of ids.slice(0, ids.length - cap)) delete this._rowSessions[id];
  }

  /**
   * THE SESSION THIS ROW IS ALREADY HAVING, or null for a row that has none.
   *
   * Null is the ordinary answer for a row nobody has worked yet, and null means
   * what it always meant: brief a fresh session. So every guard here fails
   * safe, and the worst case of every one of them is the behaviour we had
   * before this existed.
   */
  rowSessionFor(item, product = null) {
    if (!item?.id) return null;
    const rec = this._rowSessions?.[item.id];
    if (!rec?.sessionId) return null;
    // A row id is unique per product in the store, but the map is keyed on the
    // id alone, so this is what stops a chat being handed to the wrong product.
    if (rec.product !== item.product) return null;
    // THE SAME GUARD THE WAKE SWEEP HAS, AND FOR THE SAME MEASURED REASON.
    // `--resume` on an id whose transcript has been cleaned up exits in about a
    // second, this file reads a spawn that dies in seconds as a fast exit, and
    // three of those arm a fleet-wide spawn cooldown of up to thirty minutes.
    // Claude Code deletes its own transcripts after a month, so this is a case
    // that WILL arrive on any row she comes back to later.
    // AND WHICH HARNESS WROTE IT. A session id is meaningless without the
    // engine that issued it: Claude Code's is a UUID in a JSONL under
    // `~/.claude/projects`, Codex's is a thread id whose rollout is somewhere
    // under `~/.codex/sessions`, and the two are the same shape. Handing a
    // Codex thread id to `--resume` gets "No conversation found with session
    // ID" and an exit in about a second, which this file reads as a fast exit --
    // three of those strike her subscription and arm a fleet-wide cooldown of up
    // to thirty minutes. So her reply on that row would not merely fail, it
    // would take the fleet with it.
    //
    // A record with no engine is Claude Code, which is right for every one
    // written before the second engine existed: they were all Claude Code.
    if (engineOf(rec.engine) !== engineOf(this._engineFor(item))) return null;
    if (!this.transcriptFile(rec)) return null;
    // The folder moved under us (a repo cloned somewhere else, a product's dir
    // changed). The transcript lives under a name made from the old path, so
    // resuming would run the session in one place with a memory of another.
    // Either the row's own folder or the shared checkout: a record written
    // before task folders existed names the checkout, and refusing those would
    // throw away every chat she is in the middle of.
    const folders = product ? this.workFolders(item, product) : [];
    if (folders.length && rec.cwd && !folders.includes(rec.cwd)) return null;
    // The account this chat lives on cannot run anything until somebody acts.
    // Null here is the fresh brief, which is exactly what this row needs: it
    // goes to a working account carrying its own thread.
    if (this._profileCannotHoldAChat(rec.profile, rec.engine)) return null;
    return rec;
  }

  // WHAT A WORKER IS TOLD WHEN SHE REPLIES ON A ROW IT ALREADY FINISHED.
  //
  // Not the same thing as `resumeBrief` below, and the difference is the whole
  // point: that one wakes a session that was INTERRUPTED and has to work out
  // where it stopped. This one is a session that finished cleanly, said its
  // piece on the row, and is now being handed her answer to it. It is a chat.
  //
  // Three lines of it are load-bearing. It does not re-brief: everything the
  // session read is still in it, and a second copy of the brief arriving after
  // all of that reads as an instruction to start over, which is the restart
  // this exists to avoid. It says the claim is gone, because the claim is
  // released when a session exits and the session cannot know that. And it says
  // the row may have been rewritten since, because a later session or the
  // founder herself may have changed the title and the body underneath it.
  replyBrief(item, { product = null } = {}) {
    const parts = [
      'The founder has replied on the work item you were just working on. This is',
      'that same session: everything you read and wrote is still here, so do not go',
      'back over the files or the item to catch up. Read their words and carry on.',
      '',
      'Two things did change while you were stopped. Your claim on the row was',
      'released when your last run ended, so claim it again before you write to it.',
      'And the row itself may have been rewritten since, by them or by another',
      'session, so read it back before you trust what you remember of it.',
      '',
      'What they said:',
      '',
      String(item?.answer ?? ''),
    ];
    // The one thing a session genuinely cannot already have: whatever she
    // attached to the reply that woke it.
    const files = product ? this.attachmentBlock({ ...item, body: '', result: '', note: '' }, product) : '';
    if (files) parts.push(files);
    // A resumed session never saw the full brief's ship section if it began
    // before the project shipped through the app, and her "merge it" is
    // exactly when it needs it.
    if (product && this.shipsThroughTheApp(product)) parts.push(this.shipBrief());
    return parts.join('\n');
  }

  /** Whether this Mac ships this project's tasks itself (main/ship-queue.mjs). */
  shipsThroughTheApp(product) {
    return !!shipScriptFor(product, readShipSettings(this.userDir));
  }

  // HOW A TASK SHIPS, when the app does it. The agent's last step is a label,
  // not a push: a push or a move of another checkout from inside an agent
  // session is what Claude Code's safety check refuses, and a refusal asks
  // nobody, so the task just stopped.
  shipBrief() {
    return [
      '',
      '# How this task ships',
      '',
      `${Name} ships this project's work itself. When the work is done and its tests`,
      'pass, commit it on your branch in your task folder, then add the label',
      `\`${SHIP_LABEL}\` to this work item (update_work_item, keeping its other labels)`,
      'and end your turn as usual. Whether to wait for approval first is set by the',
      'instructions you were given, not by this.',
      '',
      `Do NOT push, do NOT merge into main, and do NOT touch any other folder. ${Name}`,
      'merges the latest main into your branch, runs the tests, pushes, and updates',
      'the app folder. If that fails you will be woken with its exact words.',
    ].join('\n');
  }

  // WHAT A RESUMED WORKER IS TOLD, and why it is six lines rather than a brief.
  // Everything it knew is still in the session it is being handed back: the
  // work item, her instructions, every file it read. A second copy of
  // the brief would arrive after all of that and read as a new instruction to
  // start over, which is the restart this whole path exists to avoid.
  resumeBrief(item, { continuation, product = null } = {}) {
    const parts = [
      `Your session on this work item was interrupted. The machine slept, or ${NAME}`,
      'restarted. You did not fail, and nothing you did is lost: this is that same',
      'session, with everything you had read and written still in it.',
      '',
      'Carry on from where you stopped. If you are not certain where that was, check',
      'whether the step you were part-way through actually landed before you redo it,',
      'and re-read the work item if you need to.',
    ];
    if (continuation && item?.answer && item.answer !== '(withdrawn)') {
      parts.push('', 'The founder has answered since you stopped:', '', String(item.answer));
      // A resumed session has everything it read still in it, EXCEPT anything
      // she attached to the reply that woke it. That is new, and it is the one
      // thing a six-line wake-up can genuinely be missing.
      const files = product ? this.attachmentBlock({ ...item, body: '', result: '', note: '' }, product) : '';
      if (files) parts.push(files);
    }
    if (product && this.shipsThroughTheApp(product)) parts.push(this.shipBrief());
    return parts.join('\n');
  }

  /**
   * THE FIRST WORDS A FORK HEARS, AND WHY IT NEEDS DIFFERENT ONES.
   *
   * A forked session is the old conversation continued under a new id, so it
   * remembers everything, INCLUDING which work item it was on. That is exactly
   * what it did: the fork of `w-5ebf7bf7bb` kept writing its results onto
   * `w-5ebf7bf7bb`, so one thread in the inbox had two agents talking in it and
   * the fork's own row sat silent, which looked as if forking did not work.
   *
   * It was working. Nobody had told it that it had moved. So the fork's first
   * message says which row it is on now, that the row it remembers belongs to
   * somebody else, and what it was asked to try. Everything else it knows is
   * still true and is not repeated here.
   */
  forkBrief(item, { product = null, from = null } = {}) {
    const parts = [
      'THIS IS A FORK, AND YOU HAVE MOVED. The founder took the conversation you',
      'are in and started a second task from it, so everything you remember is',
      'still true and none of it is finished work you need to redo.',
      '',
      `Your work item is now ${item.id}: ${item.title}`,
      ...(from ? [`The row you remember, ${from}, belongs to another session now. Do not`, 'write on it, claim it, or answer on it. Everything you have to say goes on', 'your own row.'] : []),
      '',
      'What they asked this fork to try:',
      '',
      String(item.body ?? '').trim() || '(nothing beyond the fork itself)',
    ];
    const files = product ? this.attachmentBlock({ ...item, result: '', note: '' }, product) : '';
    if (files) parts.push(files);
    return parts.join('\n');
  }

  // Which delivery this is. Keyed on WHEN the user wrote, not only on what
  // they wrote: two identical nudges four minutes apart are two asks, and a key made
  // of the words alone made the second one already-handled, silently and
  // permanently. The old text-only key is still honoured on read so the marks
  // already on disk keep suppressing the spawns they were written for; they age
  // out of the saved window on their own.
  _answerKey(item, answer = item.answer) {
    return `${item.product}:${item.id}:${String(answer ?? '').slice(0, 80)}:${item.wrote?.answer?.ts ?? 0}`;
  }

  _legacyAnswerKey(item, answer = item.answer) {
    return `${item.product}:${item.id}:${String(answer ?? '').slice(0, 80)}`;
  }

  _answerDelivered(item, answer = item.answer) {
    return this._handledAnswers.has(this._answerKey(item, answer))
      || this._handledAnswers.has(this._legacyAnswerKey(item, answer));
  }

  // SOMEONE ELSE IS STILL HOLDING THIS ROW, so a worker sent to it now would be
  // refused it and could do nothing at all.
  //
  // A lease outlives the session that took it: the store expires it on read,
  // not on the worker's exit, so a session that dies or exits without releasing
  // leaves the row locked for the rest of its lease. Agentbox, 2026-08-15: the
  // working session exited at 12:36:25 with its lease running to 12:40:04, she
  // answered at 12:36:22, and the tick spawned the continuation to carry that
  // word four seconds later. It was refused the claim, exited having written
  // nothing, and her answer was marked delivered at spawn, which is one spawn
  // per answer and it was spent. Nothing would ever have looked at that answer
  // again; she noticed 24 minutes later, and only because she came back to the
  // row herself.
  //
  // Waiting costs a pass. The lease is minutes at the outside, the tick comes
  // round every fifteen seconds, and the answer is carried late instead of never.
  // The retry counter cannot do this job: a refused session exits inside
  // FAST_EXIT_MS, so its three attempts fall inside the same lease that refused
  // the first, and they take the fleet-wide spawn cooldown with them.
  //
  // OUR OWN session on the row is not this: the loops below skip a row we are
  // running on before they ask, and a worker's own lease must never read as the
  // thing blocking its own work.
  claimHeldElsewhere(item) {
    return !!(item?.claim && !item.claimExpired && !this.sessions.has(item.id));
  }

  // WAS HER ANSWER ACTUALLY DELIVERED? Asked of every continuation as its
  // session exits, and the reason "stopped · 5h" rows existed at all.
  //
  // The mark is written at SPAWN, which is a promise that a worker will carry
  // the user's words, not a record that one did. Releasing it was already
  // understood to be necessary and was wired to the wrong predicate: sessions
  // dying inside 45 seconds. Items sat stranded for hours against that, because
  // they died at two to four minutes with `error_during_execution`, past the
  // window, so the mark stood, so no tick would ever look at them again. Nothing
  // retried and nothing said so. The user's words were in the ledger and no
  // worker would ever read them.
  //
  // Duration was never the question. A SESSION THAT DID NOT FINISH DELIVERED
  // NOTHING, however long it took not to finish, so the predicate is the
  // session's own result: present, and not an error.
  //
  // A session WE killed (app restart, pause, her stop, an archive, a snooze) is
  // not the item's failure and does not spend an attempt. That is what makes a
  // restart stop stranding every continuation older than 45 seconds, which until
  // now had to be repaired by hand or by finding "Resume interrupted agents" in
  // the palette.
  //
  // `session.stoppedByUs` is how that is known, and the signal is not. The CLI
  // traps SIGTERM and exits itself, so `signal` arrives null on our own kills
  // and this branch never once ran in production; three ordinary user actions
  // on one row exhausted its retries and stranded it for good. The signal is
  // still honoured for a child that dies without handling one.
  //
  // Retries are capped, because a task that cannot succeed must not respawn
  // forever. Past the cap the item stays marked and reads as stopped, which is
  // then an honest report of three real failures rather than of one death
  // nobody noticed.
  //
  // AND "FINISHED" IS ABOUT THE ROW, NOT ABOUT THE PROCESS. A session that
  // exits with a result and no error has told us nothing about her item; the
  // only proof her answer was carried is a word an agent left on the row after
  // the user wrote. Without that check the mark was written on sessions that touched
  // nothing, and the row came straight back to her inbox saying what it said
  // before she answered (five times in two days; 22 seconds on). Treated as a
  // delivery that did not happen, which is what the retry counter below is
  // already for: another session gets her word, capped at three.
  spokeOnTheRow(item, since) {
    try {
      const fresh = this.store.readItem?.(item.product, item.id);
      return fresh ? agentSpokeSince(fresh, since) : true; // unreadable: do not punish the row
    } catch { return true; }
  }

  // WHICH OF THE USER'S WORDS THIS SESSION ACTUALLY RECEIVED, which is not always the
  // one it was spawned for.
  //
  // A reply typed at a session that is RUNNING is steered straight into it
  // (live-replies.mjs). The worker reads it, acts on it and writes its result,
  // and the run is finished in every sense. But the item this exit path holds
  // is the snapshot taken at SPAWN, so what got written down as settled was the
  // answer BEFORE the one she had just been answered on. `answerSettled` then
  // reads the row as still owing her a worker forever: out of the inbox,
  // "stopped" on the row, and nothing coming, because the live reply is marked
  // delivered and no continuation will ever be spawned for it.
  //
  // MEASURED on real ledgers: a few percent of all settlements recorded an older
  // answer than the newest one on the row at that moment. On one row
  // (w-72aa8c0b8d) three rounds in a row settled the answer before the one just
  // sent, so a finished round with the result written on it never once reached
  // the inbox.
  //
  // So the newest word the session held, which is the spawn's answer or the
  // last one steered into it, whichever was written later.
  carriedThrough(item, session) {
    return Math.max(answerTs(item), answerTs(session?.lastLiveReply));
  }

  // And put a live reply back in the queue when this run did not answer it.
  // The mark is written the moment it is steered in, so without this the word
  // is remembered as carried by a run that never spoke after it.
  releaseLiveReply(session) {
    const reply = session?.lastLiveReply;
    if (reply) this.redeliverAnswer(reply, reply.answer);
  }

  // A REPLY THE USER TYPED INTO A RUN THAT WAS NOT CARRYING AN ANSWER AT ALL.
  //
  // `settleDelivery` is only reached on a continuation, a session spawned
  // BECAUSE she had spoken. The other half of the same day is ordinary fresh
  // work: a worker is running on a task, she reads the thread and sends a
  // correction into it, the worker acts on it and finishes. Nothing in that
  // path ever wrote the settlement, so the row sat in exactly the state above.
  //
  // Same three outcomes as a continuation, without the retry counter: this
  // delivery was never a spawn, so there is nothing to count and nothing to
  // give up on. Either the run spoke after the user's words, or the word goes back in
  // the queue for the next one.
  settleLiveReply(item, session) {
    const carried = answerTs(session?.lastLiveReply);
    if (!carried || carried <= answerTs(item)) return 'nothing to settle';
    const ranClean = session?.result != null && !session.resultIsError;
    if (!ranClean || !this.spokeOnTheRow(item, carried)) {
      this.releaseLiveReply(session);
      return 'undelivered';
    }
    try { this.store.settleAnswer?.(item.product, item.id, carried); }
    catch (e) { console.warn('zero: could not record the settled answer:', e.message); }
    return 'delivered';
  }

  /**
   * @param {{ command?: boolean }} [how] `command` means her reply WAS one of
   * Claude Code's own commands and the run was that command, not a worker. Such
   * a run answers in the thread and deliberately writes nothing on the row, so
   * the ordinary test below (did an agent speak on the row since the user wrote)
   * is one it can never pass. Without this it would be redelivered to the retry
   * cap and she would read the same context table three times.
   */
  settleDelivery(item, answerAtSpawn, session, signal, { command = false } = {}) {
    const key = this._answerKey(item, answerAtSpawn);
    const ranClean = session?.result != null && !session.resultIsError;
    const carried = this.carriedThrough(item, session);
    const finished = ranClean && (command || this.spokeOnTheRow(item, carried));
    if (finished) {
      delete this._deliveryAttempts[key];
      this._saveState();
      // AND WRITE IT ON THE ITEM, not only in here. This memory is invisible to
      // her inbox and is wiped by every resume, so a finished thread read as a
      // stranded one everywhere she could actually see it: out of the inbox,
      // red in In progress, and respawnable forever (shared/answers.mjs).
      try { this.store.settleAnswer?.(item.product, item.id, carried); }
      catch (e) { console.warn('zero: could not record the settled answer:', e.message); }
      return 'delivered';
    }
    // THE WORD THE USER TYPED INTO THE RUNNING SESSION IS NOT SETTLED EITHER, so it
    // must go back in the queue with the one this session was spawned for.
    // Steering it in marks it delivered (live-replies.mjs), and a mark nothing
    // releases is a word no worker will ever be sent to carry.
    this.releaseLiveReply(session);
    // NOT THIS ITEM'S FAILURE, SO NOT THIS ITEM'S ATTEMPT. Three facts with one
    // meaning: the child died on a signal, we killed it, or the shared
    // `codex app-server` went down underneath it. The third is new and is the
    // one that scales badly: ONE process carries the whole Codex fleet, so a
    // single unreadable frame reaches every live thread at once and used to
    // spend an attempt on every one of them. Three of those and rows she had
    // answered read "stopped", which CLAUDE.md says must never mean "and
    // nothing will retry". The account health of the engine is still charged
    // for it, in `noteExitForBackoff`; only the delivery is spared.
    // AND A FOURTH: the ACCOUNT refused it (signed out, out of usage, switched
    // off). Her words never reached a worker, so they wait for the account
    // rather than being spent on it (`accountFault`, noteExitForBackoff).
    if (signal || session?.stoppedByUs || session?.transportFault || session?.accountFault) {
      this.redeliverAnswer(item, answerAtSpawn); // saves state
      return 'interrupted';
    }
    const attempts = (this._deliveryAttempts[key] ?? 0) + 1;
    this._deliveryAttempts[key] = attempts;
    if (attempts < MAX_DELIVERY_ATTEMPTS) {
      this.redeliverAnswer(item, answerAtSpawn);
      return 'retrying';
    }
    this._saveState();
    return 'given up';
  }

  /**
   * SETTLE THE DELIVERY, AND WHEN WE STOP TRYING TO CARRY HER ANSWER, SAY SO.
   *
   * This is the worst shape of silence, because the user did something
   * first. They answer a row, a session is spawned to carry the
   * answer, it dies, three attempts go by and `settleDelivery` returns 'given
   * up' having written nothing anywhere she can see. The row goes on showing
   * the message she was replying to, so it reads exactly like a row nobody has
   * got to yet, and it reads that way forever.
   *
   * MEASURED by scripts/what-her-answers-got-back.mjs: it is rare, but it
   * happens, and a row it happens to has several dead runs and nothing said back.
   *
   * ONLY ON 'given up'. A retry that is still coming may well work, and a
   * sentence written before then would be undone by the next run.
   *
   * A method rather than three lines in the exit handler so a test can drive
   * the real decision instead of a copy of it.
   */
  settleDeliveryAndSay(item, answerAtSpawn, session, signal, { command = false } = {}) {
    const settled = this.settleDelivery(item, answerAtSpawn, session, signal, { command });
    if (settled !== 'given up') return settled;
    // GIVEN UP MEANS SOMETHING IS SAID, WHATEVER THE PROCESS DID.
    //
    // 'given up' is only ever reached when the delivery lacked a qualifying row
    // write, and there are two ways to get there. A run that DIED gets the
    // dead-run sentence, which is about dying. A run that exited CLEANLY and
    // still never put her answer on the row used to get nothing at all, because
    // this line was gated on `saidNothingSheCanUse`, which is false for a clean
    // exit -- so the answered open row was neither settled nor returned to her
    // with a word on it, and it read like a row nobody had got to yet, forever,
    // after she did something. That is the failure this whole file is named for.
    if (saidNothingSheCanUse(session)) this.sayTheRunDied(item, session);
    else this.sayHerAnswerNeverLanded(item, session, answerAtSpawn);
    return settled;
  }

  /**
   * THE RUN WAS FINE AND HER ANSWER STILL WENT NOWHERE.
   *
   * A different sentence from `sayTheRunDied` because it is a different fact:
   * something really did run, so telling her the agent stopped before it did
   * anything would be false, and it is the kind of false that teaches her to
   * stop reading these.
   *
   * The status does not move, for the same two reasons `sayTheRunDied` gives:
   * the work still wants doing, and a result on an open row already reaches her
   * through `rowSummary`. Never allowed to throw -- this runs inside a child's
   * exit handler.
   */
  sayHerAnswerNeverLanded(item, session, answerAtSpawn) {
    try {
      const attempts = this._deliveryAttempts?.[this._answerKey(item, answerAtSpawn)] ?? MAX_DELIVERY_ATTEMPTS;
      this.store.recordSessionResult(item.product, item.id, {
        result: undeliveredAnswerSentence({ engineWord: engineLabel(session?.engine), attempts }),
        status: 'open',
      });
    } catch (e) { console.warn('zero: could not say that her answer never landed:', e.message); }
  }

  /* ------------------------- fresh work that moved nothing ---------------- */
  // WHEN A ROW MAY BE HANDED TO A WORKER AGAIN, having already had one that got
  // nowhere. 0 means now. See FRUITLESS_RESTS_MS for what this is repairing.
  //
  // Read by BOTH the tick's fresh-work pass and status's `queued` list, from
  // this one method on purpose. A row the tick is resting while `queued` still
  // advertises it is a row that reads as waiting its turn when nothing is going
  // to touch it for four hours, which is the exact confusion `queued` was named
  // to end, and is how "one row, two tabs" happened before (2026-08-07). HOW
  // MANY SESSIONS HAVE ALREADY LOOKED AT THIS ROW AND LEFT IT ALONE.
  //
  // HER WORD RESTARTS EVERYTHING, and that is why this is a method rather than
  // a lookup. Anything she writes to the row (a reply, a new priority, an
  // edited title) is a reason to look again, and it clears the count rather
  // than shortening it. Without this the backoff would make her own nudge
  // slower to act on the longer the fleet had struggled, which is precisely
  // backwards. Two callers now read it, and both need that same forgiveness:
  // the rest below, and whether a row is allowed to interrupt a session.
  _emptyRuns(item) {
    const seen = this._fruitless[`${item.product}:${item.id}`];
    if (!seen?.runs) return 0;
    if (lastFounderWrite(item) > (seen.founderAt ?? 0)) return 0;
    return seen.runs;
  }

  /**
   * THE LAST WORDS ON THIS ROW ARE OURS, ABOUT AN ACCOUNT, NOT AN AGENT'S.
   *
   * A fresh row whose run died on a signed-out login (or a usage limit) gets
   * our own sentence written onto it ("Claude Code could not sign in... it
   * picks straight up"), so she knows. That write is an agent-sourced result,
   * and `awaitingHer` reads any such result as an agent having answered her,
   * so the fresh-work pass walked past the row for good: the account came back
   * and the row never ran, the opposite of what the sentence promised. Proved
   * with real processes in
   * tests/a-signed-out-claude-comes-back-on-its-own-end-to-end (no run at all
   * after signing in, before this). True only when what we said was about the
   * account and nothing has been written on the row since, so a real answer
   * still waits for her. When the row may run is still `restingUntil`'s call.
   */
  _onlyWeSpokeForAnAccount(item) {
    const seen = this._fruitless[`${item.product}:${item.id}`];
    if (!seen?.saidTs || !(needsHerHands(seen.saidWhy) || seen.saidWhy === 'at-limit')) return false;
    return (item.wrote?.result?.ts ?? 0) <= seen.saidTs;
  }

  restingUntil(item) {
    const seen = this._fruitless[`${item.product}:${item.id}`];
    const runs = this._emptyRuns(item);
    if (!runs) return 0;
    // Rested because its ACCOUNT refused it: awake as soon as the account is.
    if (seen?.account && !this._profileResting(seen.account)) return 0;
    // AN URGENT ROW NEVER CLIMBS THE LADDER. Urgent outranks High, and is
    // even meant to INTERRUPT High and below, so it must never end up waiting
    // behind them.
    //
    // Both fixes she already has are about the ORDER of the queue: one scored
    // list, then an Urgent row taking a slot off a lesser session. Neither
    // reaches a row that is not IN the queue, and this is what takes rows out
    // of it — `isFresh` asks this before any score is compared, so a sleeping
    // row is never ranked against anything at all. Priority only ever decided
    // who wins among the awake.
    //
    // Measured: an Urgent row with three empty runs slept for four hours and
    // another with five slept a full twenty-four, while dozens of sessions
    // started on other rows inside that sleep, every one of them High, Medium
    // or Low.
    //
    // The cap is the FIRST RUNG rather than nothing at all, and it is the same
    // answer this file already gives a spawn that died on arrival: fifteen
    // minutes between attempts, forever, until it works or she is told. A row
    // nothing can move must not become a worker every tick; an Urgent row must
    // not vanish for a working day either.
    //
    // HERE AND NOT IN noteFreshRun, so the strike count goes on recording what
    // really happened (`sayTheRunDied` prints it to her), and so this covers
    // the two cases a write-time cap would miss: the strikes a row earned
    // before she raised it, which is the usual way a row becomes urgent, and
    // the ones already sitting in the state file from before this landed.
    const rungs = isUrgent(item) ? 1 : runs;
    const rest = FRUITLESS_RESTS_MS[Math.min(rungs, FRUITLESS_RESTS_MS.length) - 1];
    return (seen.endedAt ?? 0) + rest;
  }

  // A fresh-work session has exited. Did it move the row off the pile it was
  // taken from?
  //
  // The test is deliberately NOT "did the item change": a worker appending its
  // handover note changes `updatedAt` every single time, which is why four
  // sessions in a row each looked like new work to the tick that spawned the
  // next one. What counts is whether the row is still exactly what the
  // fresh-work filter takes: open, and carrying no live answer. A worker that
  // blocked it, finished it, or drew an answer out of the founder has moved it,
  // and the count is dropped.
  /**
   * PUT THE FAILURE ON THE ROW, IN PLAIN WORDS.
   *
   * Whether a run needs this said for it is `saidNothingSheCanUse` at the foot
   * of this file, which is the rule that decides between the two writers.
   *
   * The row is the only place she looks, and a worker that died before writing
   * anything cannot put a word there itself. So the supervisor does it.
   *
   * The result goes on and the STATUS DOES NOT MOVE. Two reasons and both
   * matter. The row is still work that wants doing, so blocking it would take
   * it out of the rotation for a fault that may clear on its own. And a result
   * on an open row already reaches her: `rowSummary` in
   * renderer/src/list-rules.ts shows the result whenever it is newer than the
   * body, which it is, so the sentence lands on the inbox row she is already
   * reading without ending the thread underneath it.
   *
   * Never allowed to throw. This runs inside a child's exit handler, and a
   * write that fails must not take the supervisor down with it; the trace log
   * still has the whole story either way.
   */
  /**
   * STOP A SESSION THAT DIED WITHOUT EXITING, SO THE ROW CAN MOVE AGAIN.
   *
   * The exit handler is the only thing that frees a row from `this.sessions`,
   * and a Codex turn that hangs on a live app-server never fires it. Every
   * other check (`status().stalled`, `_silentRows`, `_strandedNews`) skips a
   * row with a live session, so nothing noticed. This is the one that does.
   *
   * The kill is ours, so the exit handler treats it the way it treats Stop:
   * her answer goes back in the queue uncharged and a fresh worker picks it up.
   * The second hang on one row inside HUNG_REPEAT_WINDOW_MS is not retried. It
   * says so on the row and parks it with her, because a third try is unlikely
   * to go differently and a silent loop is the thing being fixed.
   */
  /**
   * TIME THE MAC SPENT ASLEEP IS NOT SILENCE.
   *
   * Both of the hang check's signals are made by a sleep: no output, because
   * nothing ran, and a lapsed claim, because the heartbeats were frozen too.
   * So the first pass after the lid opened stopped every worker that had been
   * waiting on its helpers (the landing page thread, 2026-10-03: asleep 03:36
   * to 03:52, stopped two seconds after the wake;
   * tests/a-worker-whose-helpers-are-still-working-does-not-come-back-to-you).
   *
   * A pass normally comes every fifteen seconds, so a gap of minutes means the
   * process was not running. Every worker's quiet clock starts again from
   * now, which gives a genuinely hung one ten more minutes, not a pass.
   */
  forgiveSleep(now = Date.now()) {
    if (!this._lastTickAt || now - this._lastTickAt < SLEPT_GAP_MS) return false;
    for (const session of this.sessions.values()) session.lastOutputAt = Math.max(session.lastOutputAt ?? 0, now);
    return true;
  }

  reapHungSessions(items, now = Date.now()) {
    if (!this.sessions.size) return [];
    const byId = new Map((items ?? []).map((i) => [i.id, i]));
    const reaped = [];
    for (const [id, session] of this.sessions) {
      if (session.stoppedByUs) continue;
      const item = byId.get(id);
      if (!item?.claim || !item.claimExpired) continue;
      const quietSince = session.lastOutputAt ?? session.startedAt ?? now;
      if (now - quietSince < HUNG_QUIET_MS) continue;
      this._hungReaps ??= {};
      const key = `${item.product}:${id}`;
      const last = this._hungReaps[key];
      const count = last && now - last.at < HUNG_REPEAT_WINDOW_MS ? last.count + 1 : 1;
      this._hungReaps[key] = { count, at: now };
      const minutes = Math.round((now - quietSince) / 60_000);
      console.warn(`zero: ${id} went quiet ${minutes}m ago with its claim lapsed; stopping it (hang ${count})`);
      if (count >= 2) {
        try {
          this.store.recordSessionResult(item.product, item.id, {
            result: `**Reply to start this task again.**\n\nThe agent stopped responding twice in a row, the last time ${minutes} minutes ago, so ${Name} has stopped it and is not restarting it on its own. Nothing it saved is lost. Your reply puts a fresh agent on it.`,
            status: 'blocked',
          });
        } catch (e) { console.warn('zero: could not say the session hung:', e.message); }
      }
      session.hung = true;
      this._kill(session);
      reaped.push(id);
    }
    return reaped;
  }

  sayTheRunDied(item, session) {
    try {
      // THE STDERR LINES, not simply the last thing in the tail. By the time
      // this runs the exit handler has already appended its own lines, so
      // taking the last entry reads OUR narration instead of the tool's
      // diagnosis and every cause comes back 'unknown'. Measured 2026-08-27: a
      // stub printing the CLI's real refusal was classified 'unknown' this way
      // and 'workspace' once the filter looked for stderr.
      const stderrLines = (session.tail ?? []).filter((l) => typeof l === 'string' && l.startsWith('stderr:'));
      // AND THE ERROR RESULT ITSELF, which on Claude Code is where the
      // diagnosis actually arrives. A refused account does not print to stderr
      // and then die quietly: it reports a failed turn, so the words are in
      // `session.result` with `resultIsError` set and stderr is empty. Reading
      // only stderr classified every one of those as 'unknown' and gave her the
      // generic sentence for a cause we could name exactly. STDERR STAYS
      // AUTHORITATIVE AND THE RESULT IS THE FALLBACK, rather than the two being
      // read as one blob. `troubleCause` tests its three families in a fixed
      // order, so concatenating them lets a limit mentioned in the result
      // outrank a workspace refusal the tool printed on stderr, which is the
      // more specific fact and the one that is actually stopping this run.
      // Falling back only on 'unknown' also leaves every existing path byte for
      // byte as it was.
      const raw = stderrLines.map((l) => l.replace(/^stderr: /, '')).join('\n').slice(-1000);
      const errorResult = session.resultIsError ? String(session.result ?? '').slice(-1000) : '';
      const fromStderr = troubleCause(raw);
      const cause = fromStderr === 'unknown' && errorResult ? troubleCause(errorResult) : fromStderr;
      const runs = this._fruitless[`${item.product}:${item.id}`]?.runs ?? 1;
      // THE RESET TIME COMES OFF THE SAME LINE THAT SAID "limit". Read from
      // both halves in the same order the cause was, so it is always the text
      // that actually named the limit that names the hour too.
      const resetsAt = cause === 'at-limit' ? (limitResetsAt(raw) ?? limitResetsAt(errorResult)) : null;
      const result = deadRunSentence({
        // THE ENGINE THAT ACTUALLY DIED, not the one that usually does. This was
        // the literal 'Claude Code' from the day there was only one, and
        // `deadRunSentence` has taken the parameter the whole time: a Codex run
        // that died would have told her, in our own words, that Claude Code
        // stopped. `engineLabel` answers 'Claude Code' for an absent engine, so
        // every existing session reads exactly as it did.
        engineWord: engineLabel(session?.engine),
        cause,
        runs,
        resetsAt,
      });
      const written = this.store.recordSessionResult(item.product, item.id, { result, status: 'open' });
      // REMEMBER THAT WE SAID IT, keyed on the run we said it about. The pass
      // below re-reads every resting row on every tick, and without a
      // watermark it would write the same sentence onto the same row every
      // fifteen seconds for as long as the row sat there.
      const seen = this._fruitless[`${item.product}:${item.id}`];
      if (seen) {
        seen.saidAt = seen.endedAt ?? Date.now();
        // The stamp of OUR write, so `_onlyWeSpokeForAnAccount` can tell it
        // from anything written on the row afterwards.
        seen.saidTs = written?.wrote?.result?.ts ?? Date.now();
        // AND WHY, WHICH IS THE HALF THE COUNT ABOVE HER LIST READS. Writing
        // the watermark alone told the pass below "this row has been dealt
        // with" and nothing else, so the row went silently uncounted and the
        // line saying how many tasks are stuck could never reach one. The
        // diagnosis is already worked out a few lines up, this is the only
        // place that has the dying session's own words to work it out from, and
        // keeping it costs nothing.
        seen.saidWhy = cause;
        if (resetsAt) seen.resetsAt = resetsAt; else delete seen.resetsAt;
        // WHEN THIS ROW GOT STUCK, which is the first of these failures and not
        // the newest. `sayItOnEveryStrandedRow` gives the reason at length: a
        // row retried every fifteen minutes would otherwise read as fifteen
        // minutes old forever and never reach the twenty minutes the line waits.
        seen.strandedSince = seen.strandedSince ?? seen.saidAt;
        this._saveState();
      }
    } catch (e) {
      console.warn('zero: could not say that the run died:', e.message);
    }
  }

  /**
   * AND IT KEEPS SAYING IT, FOR AS LONG AS IT IS TRUE.
   *
   * That covers exactly one moment and nothing either side of it:
   *
   *  - A row that died BEFORE this code existed is never revisited. Codex rows
   *    that died for the last time shortly before the fix went in still carried
   *    not one word an hour after it.
   *  - A row whose death was noticed while the app was closing loses it with the
   *    process, because the only record was the handler that never finished.
   *
   * So the fact is re-derived from the store and the trace on every tick, which
   * are both on disk and both outlive us. A row we are RESTING is a row nothing
   * is going to touch for up to twenty-four hours; if the run that earned it
   * left her nothing, she is told, now, and told again after a restart.
   *
   * Two things it will not do. It never speaks over a worker: a row whose result
   * is newer than the run is a row somebody already answered. And it never
   * touches status, for the reason `sayTheRunDied` gives above.
   *
   * @param {object[]} items the tick's already-loaded snapshot
   */
  /**
   * NAME ONE ROW A TICK, and leave every other row alone.
   *
   * The whole reason is in main/row-label.mjs. What lives here is the pacing,
   * and every part of it is deliberate:
   *
   *   ONE AT A TIME, ACROSS ALL PRODUCTS. A `_naming` flag rather than a queue,
   *   because the only thing this must never become is a fan-out that spawns a
   *   process per row. On a store nobody has named yet that is one row every
   *   fifteen seconds, which fills an inbox of twenty-five in about six minutes
   *   and then stops for good: `wantsName` is false forever on a row whose
   *   content has not moved since we named it.
   *
   *   NEWEST FIRST, because the rows she is looking at are the ones she just
   *   wrote, and a name that arrives after she has stopped looking is a name
   *   that changed under her for nothing.
   *
   *   NOT AWAITED. The tick is the loop that starts her work; a naming call
   *   takes about fourteen seconds and nothing in the tick may wait on it.
   *
   * Failure is silent and total by design: `nameRow` resolves '' for a missing
   * binary, a bad exit, a timeout or a reply that is not a name, and `nameItem`
   * treats '' as a no-op. A row that cannot be named keeps her own title, which
   * is what every row in her store had before this existed.
   */
  nameTheRows(items) {
    if (this._naming) return;
    const next = items
      .filter((i) => wantsName(i))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    if (!next) return;
    this._naming = true;
    nameRow(next, { claudeBin: this.config?.claudeBin, codexBin: this.config?.codexBin, engine: this._homeEngine() })
      .then((label) => {
        if (label) this.store.nameItem(next.product, next.id, label);
      })
      .catch((e) => console.warn('zero: could not name a row:', e.message))
      .finally(() => { this._naming = false; });
  }

  /**
   * SORT ONE TEAMMATE'S MESSAGE A TICK by how urgent it is
   * (main/message-priority.mjs). Paced like the namer above: one call at a
   * time, newest first, not awaited by the tick. Each message is asked about
   * once per run of the app, so a write that does not take is not retried
   * every fifteen seconds.
   */
  sortTheMessages(items, me) {
    if (this._sortingMessages || !me) return undefined;
    this._sortedMessages ??= new Set();
    const products = new Map((this.store.listProducts?.() ?? []).map((p) => [p.slug, p]));
    const next = items
      .filter((i) => wantsPriority(i, products.get(i.product), me))
      .map((i) => ({ item: i, latest: latestMessage(i) }))
      .filter(({ item, latest }) => !this._sortedMessages.has(`${item.product}:${item.id}:${latest.ts}`))
      .sort((a, b) => b.latest.ts - a.latest.ts)[0];
    if (!next) return undefined;
    this._sortingMessages = true;
    this._sortedMessages.add(`${next.item.product}:${next.item.id}:${next.latest.ts}`);
    return this._askPriority(next.latest)
      .then((level) => {
        if (level) this.store.prioritizeItem(next.item.product, next.item.id, LEVELS[level]);
      })
      .catch((e) => console.warn('zero: could not sort a message:', e.message))
      .finally(() => { this._sortingMessages = false; });
  }

  _askPriority(latest) {
    return sortMessage(latest, { claudeBin: this.config?.claudeBin, codexBin: this.config?.codexBin, engine: this._homeEngine() });
  }

  sayItOnEveryStrandedRow(items, now = Date.now()) {
    let dirty = false;
    // AND THE SAME PASS COUNTS THEM, for the line above her list. The count
    // is taken here rather than in the snapshot because this is the one place
    // that has already paid for the answer: telling a stranded row from a
    // quiet one means reading its trace off disk, and doing that again every
    // time the renderer asks for a snapshot would be the same work several
    // times a second. A row we have ALREADY spoken on still counts, because
    // it is still not running; being told once does not start it.
    const stranded = [];
    for (const [key, seen] of Object.entries(this._fruitless)) {
      if (!seen?.runs) continue;
      try {
        const cut = key.indexOf(':');
        const product = key.slice(0, cut);
        const id = key.slice(cut + 1);
        if (this.sessions.has(id)) continue;          // a worker is on it right now
        const item = items.find((i) => i.id === id && i.product === product);
        if (!item) continue;
        // Only a row still sitting on the pile the dead run was taken from.
        // Anything else has moved on and is somebody else's news.
        if (item.status !== 'open') continue;
        if (item.answer && item.answer !== '(withdrawn)') continue;
        // Already said, about this same run. `saidWhy` is what makes this our
        // own watermark rather than the one below it: the branch that finds
        // somebody ELSE wrote on the row sets the same `saidAt` to stop us
        // speaking, and a row somebody answered is not a stranded row.
        if (seen.saidAt && seen.saidAt === seen.endedAt) {
          // NO REASON RECORDED, SO ASK THE ROW ITSELF. Every watermark on her
          // machine was in exactly this state: written by `sayTheRunDied` at
          // the moment of the exit, which until tonight kept no reason, and
          // therefore never counted. Fixing that alone would have left every
          // row already stuck at that moment invisible until it failed again,
          // and a fix she cannot see for another quarter of an hour is not one
          // she can check. `deadRunCause` reads the sentence on the row: our
          // own words mean nothing has run there, and anything else means a
          // worker spoke and the row is not stranded at all.
          const why = seen.saidWhy ?? deadRunCause(item.result);
          if (why && !seen.saidWhy) {
            seen.saidWhy = why;
            seen.strandedSince = seen.strandedSince ?? seen.saidAt;
            dirty = true;
          }
          if (why) stranded.push({ id, since: seen.strandedSince ?? seen.endedAt, cause: why, resetsAt: seen.resetsAt ?? null });
          continue;
        }
        // Somebody wrote on the row after the run ended: not silent, and the
        // outage clock below goes with it.
        const resultTs = item.wrote?.result?.ts ?? 0;
        if (resultTs >= (seen.endedAt ?? 0)) {
          seen.saidAt = seen.endedAt;
          delete seen.saidWhy;
          delete seen.strandedSince;
          dirty = true;
          continue;
        }

        // WHAT THE LAST RUN ACTUALLY DID, read off its own trace. The session
        // object is long gone by now — often the whole process is — and the
        // trace is the only thing left that knows.
        const trace = this._lastTrace(product, id);
        if (!traceShowsASilentDeath(trace)) continue;

        const cause = troubleCause(trace.stderr);
        // THE HOUR THE LIMIT LETS GO, AND THIS PASS WAS DROPPING IT.
        //
        // `sayTheRunDied` above reads it off the dying session and hands it to
        // the sentence. This pass re-derives the same fact from the trace on
        // disk and did not, so the rows it spoke on — which is ALL of the ones
        // she was looking at, because this is the pass that covers deaths that
        // happened before the app was open — got "when the limit resets"
        // instead of "at 6pm". The trace carries the line that named the limit
        // (`stderr` in shared/dead-run-trace.mjs is stderr AND the error
        // result), so the hour was there to be read the whole time.
        const resetsAt = cause === 'at-limit' ? limitResetsAt(trace.stderr) : null;
        const written = this.store.recordSessionResult(product, id, {
          result: deadRunSentence({
            engineWord: 'Claude Code',
            cause,
            runs: seen.runs,
            resetsAt,
          }),
          status: 'open',
        });
        seen.saidAt = seen.endedAt ?? now;
        seen.saidTs = written?.wrote?.result?.ts ?? now;
        seen.saidWhy = cause;
        // KEPT, because the line above the list wants the same hour and the
        // trace it came off is not read again after this pass.
        if (resetsAt) seen.resetsAt = resetsAt; else delete seen.resetsAt;
        // WHEN THIS ROW GOT STUCK, WHICH IS NOT WHEN IT LAST FAILED.
        //
        // A row on the first rung of the rest ladder is retried every fifteen
        // minutes, and every failure moves `endedAt`. Judged on that, a row
        // stuck all day would read as fifteen minutes old forever and the line
        // below would never reach its twenty minute mark — which is exactly the
        // shape of her Codex rows, capped at the first rung on purpose. So the
        // clock starts at the FIRST failure of this run of them and is only
        // cleared when something actually happens on the row. It is also the
        // honest answer to "since when": she wants the time it stopped working,
        // not the time of the newest of forty identical attempts.
        seen.strandedSince = seen.strandedSince ?? seen.saidAt;
        stranded.push({ id, since: seen.strandedSince, cause, resetsAt: seen.resetsAt ?? null });

        // AND IT DOES NOT GO ON SERVING A SENTENCE THE BUG HANDED IT.
        // `noteFreshRun` caps a died-on-arrival row at one strike, but only for
        // runs it sees; the strikes already on disk when that landed are what
        // put two of her rows to sleep until the following afternoon for a
        // fault that was fixed the same hour. A row we are about to tell her
        // about, whose run never became a session, goes back to the first rung.
        if (!trace.everRan && seen.runs > 1) seen.runs = 1;
        dirty = true;
      } catch (e) {
        console.warn('zero: could not speak for a stranded row:', e.message);
      }
    }
    this._stranded = stranded;
    if (dirty) this._saveState();
  }

  // The newest trace a row has, read once. Null when the row has never been
  // spawned, which is the ordinary case for most of `_fruitless` and is not an
  // error.
  _lastTrace(product, id) {
    const dir = this.store.listProducts().find((p) => p.slug === product)?.dir;
    if (!dir) return null;
    let files;
    try { files = fs.readdirSync(machineryPath(dir, path.join('sessions', id))); }
    catch { return null; }
    const logs = files.filter((f) => f.endsWith('.log')).sort();
    if (!logs.length) return null;
    try {
      const text = fs.readFileSync(machineryPath(dir, path.join('sessions', id, logs[logs.length - 1])), 'utf8');
      return readDeadRunTrace(text);
    } catch { return null; }
  }

  /**
   * @param {object} item
   * @param {{ everRan?: boolean }} [how] `everRan` false means the worker died
   *   on arrival: it never got as far as being a session, so what it proves is
   *   that the machine is broken, not that this row has nothing in it.
   */
  noteFreshRun(item, { everRan = true, account = null } = {}) {
    const key = `${item.product}:${item.id}`;
    // Re-read: `item` is the snapshot taken at spawn, and the whole question is
    // what the session did to the row since.
    let now;
    try { now = this.store.listItems(Date.now()).find((i) => i.id === item.id && i.product === item.product); } catch {}
    const stillOnThePile = now && now.status === 'open'
      && (!now.answer || now.answer === '(withdrawn)');
    if (!stillOnThePile) {
      if (this._fruitless[key]) { delete this._fruitless[key]; this._saveState(); }
      return 'moved';
    }
    const prior = this._fruitless[key] ?? { runs: 0 };
    const founderAt = lastFounderWrite(now);
    // Her word since the spawn is a fresh start, not another strike against a
    // row she has just engaged with.
    let runs = founderAt > (prior.founderAt ?? 0) ? 1 : prior.runs + 1;
    // A SPAWN THAT DIED ON ARRIVAL MAY NOT CLIMB THIS LADDER.
    //
    // The rests double to twenty-four hours, and that is right for a row a
    // worker keeps LOOKING at and leaving alone: the fifth identical look is
    // worth less than the first. It is wrong for a worker that never started,
    // because nobody has looked at the row at all.
    //
    // Measured the day this landed: her Codex tasks could not start, and two
    // of them earned five strikes each and went to sleep for twenty-four
    // hours. The engine was fixed at 15:04 and those two rows would still not
    // have been tried again until 13:48 the following afternoon, serving a
    // sentence earned entirely by a bug that no longer exists.
    //
    // The first rung still applies, so a broken engine is not hammered: fifteen
    // minutes between attempts, forever, until it works or she is told.
    if (!everRan) runs = Math.min(runs, 1);
    // NOR A SPAWN ITS ACCOUNT REFUSED. Nobody looked at the row; the account
    // was out. The rest is remembered against that account and ends the
    // moment it is back (`restingUntil`), rather than fifteen minutes after
    // she has signed in again.
    if (account) runs = Math.min(runs, 1);
    this._fruitless[key] = { runs, endedAt: Date.now(), founderAt, ...(account ? { account } : {}) };
    this._saveState();
    return 'rested';
  }

  // Give an answer its delivery back: the mark is written at spawn, so a
  // worker that died before doing anything leaves it lying about delivery.
  redeliverAnswer(item, answer) {
    this._handledAnswers.delete(this._answerKey(item, answer));
    this._handledAnswers.delete(this._legacyAnswerKey(item, answer));
    this._saveState();
  }

  setProductOrder(slugs) {
    this.productOrder = normalizeOrder(slugs);
    this._saveState();
    this.onChange?.();
  }

  setProductHidden(slug, hidden) {
    if (!slug) return;
    if (hidden) this.hiddenProducts.add(slug);
    else this.hiddenProducts.delete(slug);
    this._saveState();
    this.onChange?.();
  }

  // One score orders every spawn decision: a product's PLACE in the founder's
  // running order is worth a hundred times any item's own priority, so
  // One product's medium outranks another's urgent when it sits above it.
  // Ties break oldest-first so nothing starves. The item's own number is hers
  // alone now (itemPriority); an agent's tag no longer moves anything.
  _score(item) {
    return productRankScore(this.productOrder, item.product) + itemPriority(item);
  }

  /* ----------------------- auth profiles (subscriptions) ------------------ */
  // The founder holds two Claude subscriptions; workers round-robin across
  // them (CLAUDE_CONFIG_DIR per spawn), which roughly doubles throughput. A
  // profile whose spawns keep dying instantly (expired plan, broken login)
  // quarantines itself for 30 minutes, and the fleet behaves as if only the
  // healthy subscription exists; a resubscribe simply starts working again.
  // HERS FIRST, THEN WHATEVER IS SIGNED IN ON THE DISK. It used to be only the
  // config key, and an account she logged into herself could therefore sit
  // unused while the fleet starved on one that was at its limit
  // (main/account-discovery.mjs has the afternoon that cost). One copy of the
  // rule, there, so the fleet and the Agents page can never disagree about
  // which accounts exist.
  _profiles() {
    return effectiveProfiles(this.config.authProfiles, { home: this.config.home });
  }

  // HER CODEX LOGIN, WHICH IS NOT ONE OF HER CLAUDE ONES.
  //
  // Every entry in `authProfiles` is a CLAUDE_CONFIG_DIR: a folder holding a
  // Claude login and no `auth.json` Codex could ever read. Handing one of them
  // to a Codex worker points it at a stranger's folder, which is a session that
  // dies on arrival at best and writes into her Claude profile at worst. So the
  // second engine has its own list and its own default, `~/.codex`, which is
  // where she is already logged in.
  //
  // A SECOND CODEX SUBSCRIPTION IS REAL NOW, AND THAT IS THE CHANGE. It used to
  // be a config key and nothing more: `_codexServer` ran ONE app-server for the
  // whole fleet with `CODEX_HOME` scrubbed out of its environment, so every
  // thread on the Mac billed one login while `_capacityFor('codex')` multiplied
  // its slots by the length of THIS list. A second entry widened the cap
  // without widening what ran -- and that cap rides `zero:snapshot` to Settings
  // and is printed as "Room for N at once". A number that lies to her about her
  // own machine is worse than a feature that is missing.
  //
  // So an entry here is a CODEX_HOME, the way an `authProfiles` entry is a
  // CLAUDE_CONFIG_DIR, and `_codexServer` is keyed by home: a second login is a
  // second process on a second home, and widening the cap and widening what
  // runs are one act again.
  //
  // `default` STAYS THE WORD FOR HER PRIMARY LOGIN on both engines, and it
  // resolves through `_codexProfileHome` to the one home the whole app reads --
  // so a Mac with no `codexProfiles` behaves exactly as it did, and every
  // session record already written saying 'default' still names the right home.
  _codexProfiles() {
    const list = (this.config.codexProfiles ?? []).map((x) => x || 'default');
    return list.length ? list : ['default'];
  }

  /**
   * THE CODEX_HOME ONE PROFILE NAMES, and the only place that mapping is made.
   *
   * `default` is not a folder called "default": it is her primary login, which
   * is whatever `_codexHome` decided. Anything else is a home in its own right.
   * One method, because the spawn, the transcript search and the model list all
   * have to answer this question and two copies of it is how the app came to
   * show one account's models while billing another.
   */
  _codexProfileHome(profile) {
    const word = typeof profile === 'string' ? profile.trim() : '';
    return !word || word === 'default' ? this._codexHome() : word;
  }

  _profilesFor(engine) {
    const all = engineOf(engine) === 'codex' ? this._codexProfiles() : this._profiles();
    return this._narrowToChosen(engine, all);
  }

  /**
   * THE ONE ACCOUNT SHE PICKED, WHEN SHE HAS PICKED ONE.
   *
   * Every account signed in on the Mac used to run, round-robin, and that is
   * still what a workspace she has never touched does. Adding a login widened
   * the pool; it never moved the work off the one she wanted to leave.
   *
   * So a chosen account narrows the pool to itself. The capacity that rides on
   * the pool's length narrows with it, which is correct and is the point: she
   * asked for her work to run on one subscription, and a number that still
   * counted two would be promising slots on an account nothing is allowed to
   * start on.
   *
   * IT IS IGNORED THE MOMENT IT STOPS NAMING SOMETHING REAL. A setting left
   * over from a login she has since removed would otherwise empty the pool and
   * quietly stop the fleet, which is the worst failure available here: the app
   * looks fine and starts nothing. An unknown name falls back to every account,
   * which is exactly what this machine did before she picked.
   */
  _narrowToChosen(engine, all) {
    const chosen = this.config.activeAccount?.[engineOf(engine)];
    if (typeof chosen !== 'string' || !chosen) return all;
    return all.includes(chosen) ? [chosen] : all;
  }

  // THE ACCOUNTS ON ONE ENGINE THAT ARE NOT RESTING. Keyed through
  // `_accountKey`, which is the whole point: both engines call their primary
  // login 'default', and reading one raw name for both would let a quarantined
  // Codex login take her Claude subscription out of the rotation with it.
  //
  // IT IS ALLOWED TO COME BACK EMPTY, and that is the change. It used to end
  // `return live.length ? live: ['default']`, which is right for PICKING --
  // somewhere has to be tried -- and wrong for COUNTING, and this one method
  // was doing both. On her two Claude logins the fallback hid at worst half the
  // truth. On CODEX, which has a single login, it inverted the entire
  // mechanism: quarantining the one account it has put that same account
  // straight back in the pool on the next line, so a login that had run out was
  // struck, cooled down for thirty minutes, and then handed the very next
  // spawn. The cooldown is the only thing keeping a dead Codex account out of
  // her work and it was a no-op on the engine that needs it most.
  //
  // The fallback lives in `_pickProfile` now, which is the caller that actually
  // needs an answer even when there is no good one.
  _liveProfilesFor(engine) {
    const now = Date.now();
    return this._profilesFor(engine)
      .filter((p) => (this._profileCooldown?.[this._accountKey(engine, p)] ?? 0) < now);
  }

  _liveProfiles() {
    return this._liveProfilesFor(DEFAULT_ENGINE);
  }

  // ROUND-ROBIN WITHIN ONE ENGINE. The cursor is per engine because the pools
  // are: one shared counter would have a Codex spawn advance the rotation
  // across her two Claude subscriptions, so a run of Codex tasks could leave
  // one of them doing all the Claude work.
  _pickProfile(engine = DEFAULT_ENGINE) {
    const which = engineOf(engine);
    // SOMEWHERE HAS TO BE TRIED. `_liveProfilesFor` is allowed to answer
    // nothing now, which is the honest answer to "what could run" and no answer
    // at all to "where does this one go". A continuation bypasses the slot
    // check by design (her answer outranks the cap), so this is reachable with
    // every account resting, and a pick of `undefined` there would hand a spawn
    // a CLAUDE_CONFIG_DIR of undefined rather than her default login.
    const live = this._liveProfilesFor(which);
    const pool = live.length ? live : ['default'];
    this._rr = this._rr ?? {};
    this._rr[which] = ((this._rr[which] ?? 0) + 1) % pool.length;
    return pool[this._rr[which]];
  }

  /**
   * WHICH ACCOUNT AN EXIT, A STRIKE OR A COOLDOWN IS EVIDENCE ABOUT.
   *
   * `profile` is a folder name and BOTH ENGINES HAVE A FOLDER CALLED 'default',
   * so without this a Codex session that died would strike her Claude default
   * subscription and quarantine it for thirty minutes. That is exactly the bug
   * of 2026-08-24 -- a fact about one account applied to another, where one
   * signed-out subscription stopped the one that was working, five times
   * between 17:39 and 19:08 -- and the second engine would have reintroduced it
   * for free.
   *
   * An engine nobody recorded is Claude Code, so every key written before the
   * second engine existed still names the account it always named.
   */
  _accountKey(engine, profile) {
    return engineOf(engine) === 'codex' ? `codex:${profile}` : profile;
  }

  // ACCOUNTS THAT CAN ACTUALLY RUN SOMETHING RIGHT NOW, and unlike
  // _liveProfiles this one is allowed to come back empty.
  //
  // _liveProfiles falls back to ['default'] when everything is resting, which
  // is right for picking (somewhere has to be tried) and wrong for judging,
  // because it makes a fleet with no working account look like a fleet with
  // one. IT IS THE CLAUDE FLEET IT JUDGES, and it needs no engine argument to
  // do it: a Claude account's key IS its profile name (`_accountKey`), so these
  // reads name exactly the accounts `_profiles` lists and can never pick up a
  // `codex:` key. That is the right scope for its two callers -- the fleet-wide
  // brake and the sentence above her list -- because both are about having
  // nowhere left to run, and Claude Code is what every row falls back to.
  _healthyProfiles() {
    const now = Date.now();
    return this._profiles().filter((p) => (this._profileCooldown?.[p] ?? 0) < now && !this._profileTrouble?.[p]);
  }

  // WHAT IS WRONG WITH ONE ACCOUNT, remembered until a session on it survives.
  //
  // This exists because the fleet-wide banner was reporting an account-shaped
  // fact as an app-shaped one: her second Claude subscription was signed out,
  // half of every spawn round-robined onto it and died in two seconds, and the
  // screen said all agents were failing while the other half worked the whole
  // time. A fact about one account now stays on that account.
  _noteProfileTrouble(profile, raw) {
    if (!profile) return 'unknown';
    const cause = troubleCause(raw);
    this._profileTrouble = this._profileTrouble ?? {};
    const had = this._profileTrouble[profile];
    this._profileTrouble[profile] = { since: had?.since ?? Date.now(), at: Date.now(), cause, raw: String(raw ?? '').slice(0, 300) };
    // What the login files looked like when it was found out, so that
    // `_noticeSignIns` can tell a login landing afterwards from one before.
    if (cause === 'signed-out') {
      const stamp = signInStamp(this._signInFilesFor(profile));
      this._profileTrouble[profile].stamp = Math.max(stamp, had?.stamp ?? 0);
    }
    return cause;
  }

  _clearProfileTrouble(profile) {
    if (!profile) return;
    if (this._profileTrouble) delete this._profileTrouble[profile];
    if (this._profileStrikes) this._profileStrikes[profile] = 0;
    if (this._profileCooldown) this._profileCooldown[profile] = 0;
  }

  /**
   * WHAT IS WRONG WITH ONE WHOLE ENGINE, or null when nothing is.
   *
   * THE FACT EXISTED AND NOTHING COULD READ IT. `_noteProfileTrouble` files a
   * dead spawn under `_accountKey`, which prefixes the second engine because
   * both engines call their primary login 'default'; `status` exports that book
   * verbatim as `accountTrouble`; and its one reader, the Accounts page in
   * main/settings.mjs, indexes it by a bare Claude folder name and therefore
   * could never match `codex:default`. Her Codex subscription could lapse,
   * every Codex task stop, and Settings show a green Claude row and nothing
   * else -- the fleet brake being deliberately Claude-only, so "No agents can
   * start" cannot be true about Codex either.
   *
   * SO THE KEY RULE IS ASKED RATHER THAN GUESSED. This walks the engine's own
   * profiles through `_accountKey`, which is the only thing that knows how a key
   * is spelled; a caller that built `codex:` itself would be a second copy of
   * that rule one edit away from disagreeing.
   *
   * THE FIRST TROUBLE IS THE ANSWER, not a merge of several. Codex has one
   * login today, so there is nothing to merge; if a second ever arrives, the
   * honest thing for the card to say is that one of them cannot run, and the
   * per-row sentences carry the detail. It is deliberately NOT an identity: it
   * says what is wrong and what to do, and nothing about who is signed in.
   */
  engineTrouble(engine) {
    const book = this._profileTrouble ?? {};
    for (const profile of this._profilesFor(engine)) {
      const trouble = book[this._accountKey(engine, profile)];
      if (trouble) return trouble;
    }
    return null;
  }

  // A SIGNED-OUT ACCOUNT LEAVES THE ROTATION ON THE FIRST SIGHTING, not the
  // third. Three strikes is the right shape for an ambiguous death, where the
  // next spawn might well work. A login that has run out is not ambiguous, and
  // the two spawns it takes to reach three strikes are two real pieces of her
  // work handed to an account that cannot do them.
  _strikeProfile(profile, { hard = false, rest = 30 * 60_000 } = {}) {
    if (!profile) return;
    this._profileStrikes = this._profileStrikes ?? {};
    this._profileCooldown = this._profileCooldown ?? {};
    this._profileStrikes[profile] = (this._profileStrikes[profile] ?? 0) + 1;
    if (hard || this._profileStrikes[profile] >= 3) {
      this._profileCooldown[profile] = Date.now() + rest;
      this._profileStrikes[profile] = 0;
    }
  }

  /*
   * CAPACITY IS PER SUBSCRIPTION, AND SHE HAS TWO KINDS OF SUBSCRIPTION NOW.
   *
   * IT DID NOT. This was one number for the whole Mac and it was built out of
   * `_liveProfiles`, which is the CLAUDE auth-profile pool -- so a Codex task
   * queued behind three Claude workers while her OpenAI subscription did
   * nothing, and logging into Codex could never widen anything, because the
   * multiplier counted Claude logins.
   *
   * Two subscriptions are two rate limits, which is the whole argument the cap
   * rests on: it exists because her plan's limit is split between whatever is
   * running, and a Codex thread does not touch her Claude plan. So the number a
   * spawn is measured against is its OWN engine's, and adding a Codex login
   * widens Codex and nothing else.
   *
   * AN ENGINE NO ROW CAN BE ROUTED TO HAS NO SLOTS, which is what keeps the
   * whole-Mac number below honest -- and that number rides `zero:snapshot` to
   * her screen, where Settings prints it as "Room for N at once".
   *
   * IT ASKS `engineChoices`, WHICH IS TWO FACTS, AND IT USED TO ASK ONE. The
   * test was `!this.config.codexBin`, and the paragraph here said in as many
   * words that the binary "is the same fact `_engineFor` refuses on". That was
   * false. `_engineFor` refuses on the capability gate FIRST and the binary
   * second, and so does `engineChoices`. So every Mac with `codex` on PATH and
   * no `engineChoice` moment written -- which is every Mac before the user opts
   * in -- counted three Codex slots that `engineFor` will never
   * hand a row to, and printed six directly above a row saying three run
   * together.
   *
   * `engineChoices` RATHER THAN THE TWO FACTS SPELLED OUT AGAIN, because the
   * offer and the capacity have to be refused by exactly the same thing: it is
   * the one method that asks the gate before it asks the disk, and the picker,
   * the Settings row and the byline are already drawn off it. Claude Code is
   * always in that list, so the default engine reads as it always did.
   */
  _capacityFor(engine) {
    const which = engineOf(engine);
    if (!this.engineChoices().some((e) => e.id === which)) return 0;
    return this._slotsPerAccount(which) * this._liveProfilesFor(which).length;
  }

  /**
   * HOW MANY SESSIONS ONE ACCOUNT MAY RUN, AND NEVER A NUMBER THAT STOPS HER
   * FLEET IN SILENCE.
   *
   * `zero.config.json` is spread verbatim into `config` (main/config.mjs keeps
   * unknown keys on purpose), so `maxConcurrentSessions` is whatever is in that
   * file: a null, a string, a zero. It used to fail SAFE, because the spawn
   * test was `load >= capacity` and a NaN comparison is false, so the spawn went
   * ahead. The per-engine rewrite turned that into `load < capacity`, where a
   * NaN is false the other way round -- NOTHING EVER SPAWNS, on any engine,
   * with nothing said on any screen. That is the silent stop this codebase
   * minds most, reached by one bad character in a config file.
   *
   * One slot is the floor rather than the default of three: a machine whose
   * setting cannot be read should run her work slowly, not at a number nobody
   * chose. Her own number, whenever it is a real one, is untouched.
   *
   * AND A CLAUDE PLAN'S ANSWER IS NOT AN ANSWER ABOUT CODEX. When nobody sets
   * `maxConcurrentSessions`, main/config.mjs reads the tier out of Claude
   * Code's own `.claude.json` and lowers the number for a plan that is not Max.
   *
   * The cap exists because ONE plan's rate limit is split between whatever is
   * running on it, which is the argument in `_capacityFor` above; a Codex
   * thread spends none of her Claude plan, so the Claude plan is not evidence
   * about it.
   *
   * WHERE CODEX'S NUMBER COMES FROM INSTEAD, AND WHY IT IS NOT AN INVENTED ONE.
   * There is no plan tier for Codex to read anywhere: `~/.codex/auth.json`
   * carries `auth_mode` and an opaque `tokens.account_id`, no tier and no
   * email (measured on this Mac 2026-09-05, codex-cli 0.148.0), and a number
   * dressed up as a Codex plan would be exactly the authoritative-looking
   * invention this codebase refuses. `config.planSlotsFrom` already records
   * which of two cases produced the number: null when SHE set it -- an
   * instruction about this Mac, on a stepper labelled "Agents at once", which
   * both engines obey unchanged -- and the account's label when a Claude plan
   * did. In the second case Codex falls back to the number the app has always
   * used when nobody has said, which is also the number it already gets on
   * every Mac whose Claude plan is Max or unreadable.
   */
  _slotsPerAccount(engine = DEFAULT_ENGINE) {
    const planSpokeForClaude = engineOf(engine) !== DEFAULT_ENGINE && !!this.config.planSlotsFrom;
    const set = Number(planSpokeForClaude ? DEFAULT_SESSIONS_AT_ONCE : this.config.maxConcurrentSessions);
    return Number.isFinite(set) && set >= 1 ? Math.floor(set) : 1;
  }

  // THE MACHINE IS STILL ONE MACHINE: the engines added together. Two caps
  // could otherwise be read as no cap, and everything that asks the fleet as a
  // whole -- what the snapshot tells her, whether a resume has anywhere to go --
  // is asking about this Mac rather than about one subscription.
  _capacity() {
    let n = 0;
    for (const id of ENGINE_IDS) n += this._capacityFor(id);
    return n;
  }

  // HOW MANY SESSIONS ONE ENGINE'S CAP IS COUNTING, and the number every spawn
  // decision in this file is measured against. A command the user typed is not a
  // worker and is not counted as one -- the reason and the measurement are under
  // `_load` below, which is the sum of these. The engine is read off the
  // SESSION, because that is where `_engineFor`'s single answer was written
  // down; reading the row again here would be a second decision.
  _loadFor(engine) {
    const which = engineOf(engine);
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.command || s.remoteIdle) continue;
      if (engineOf(s.engine) !== which) continue;
      n += 1;
    }
    for (const p of this._preparing?.values() ?? []) if (engineOf(p.engine) === which) n += 1;
    return n;
  }

  // IS THERE ROOM FOR ONE MORE SESSION ON THIS ENGINE?
  //
  // THREE QUESTIONS, AND THE SECOND ONE WAS DELETED AS UNREACHABLE WHEN IT IS
  // NOT. The deleted comment argued that `_capacity` is the sum of exactly the
  // per-engine caps and `_load` the sum of exactly these loads, so an engine
  // under its own cap can never put the Mac over its ceiling. That holds only
  // while CAPACITY IS CONSTANT, and it is not: a profile entering cooldown
  // shrinks `_capacityFor` for its engine while the sessions already running on
  // the OTHER engine stay live and keep counting. Two Claude logins and one
  // Codex is 6 + 3; four Claude threads and three Codex threads is seven of
  // nine; quarantine the Codex login and the ceiling falls to six with seven
  // still running -- and Claude, at four of six, was told there was room for an
  // eighth. The conjunct is back, and this comment is the correction: it is a
  // claim the code has to make, because a mutation really can break it.
  //
  // AND THE CLAUDE FLEET'S BRAKE IS ASKED HERE RATHER THAN AT THE TOP OF THE
  // TICK. `_spawnCooldownUntil` is armed only by a fast CLAUDE exit with no
  // healthy Claude account left, and the sentence it stands for -- "nowhere
  // left to run" -- is a sentence about Claude Code. A Codex row runs on a
  // different subscription and a different binary, so a signed-out Claude login
  // used to starve a working Codex account for up to half an hour: the
  // 2026-08-24 mistake (a fact about one account applied to another) with a
  // second engine standing in for the second login. Every spawn decision in
  // this file goes through this method, so scoping it here scopes all of them.
  _hasSlotFor(engine) {
    const which = engineOf(engine);
    if (which === DEFAULT_ENGINE && this._spawnBraked()) return false;
    return this._loadFor(which) < this._capacityFor(which) && this._load() < this._capacity();
  }

  /** The fleet-wide brake, as a clock rather than a state. */
  _spawnBraked() {
    return !!this._spawnCooldownUntil && Date.now() < this._spawnCooldownUntil;
  }

  /**
   * Whether anything OTHER than the braked engine could still start work. What
   *  keeps the tick's early return exactly as it was on every Mac with no Codex
   *  on it, which is every downloaded copy of Agentbox. */
  _anotherEngineCanRun() {
    return ENGINE_IDS.some((id) => id !== DEFAULT_ENGINE && this._capacityFor(id) > 0);
  }

  /*
   * HOW MANY SESSIONS THIS MAC IS RUNNING, which is not the same as how many
   * are up.
   *
   * IT IS `_capacity`'s PARTNER AND NOT THE SPAWN DECISION'S, since capacity
   * became per subscription. What a spawn is measured against is `_loadFor`
   * against `_capacityFor`, one engine at a time; this is the whole Mac's
   * number, the one `_capacity` is the ceiling for. The rule below is written
   * here, and `_loadFor` applies the same exclusion for the same reason.
   *
   * So one of Claude Code's own eight commands is not a worker and is not
   * counted as one. It carries no brief, claims no row, writes no files, and
   * exits as soon as the CLI has printed its table; the runs measured on this
   * row took 2.8, 4.0 and 4.8 seconds. Holding a slot for something that short
   * pushes a real worker's start back for nothing, and queueing it behind a
   * session that has been going twenty minutes is a wait nobody should have.
   *
   * The cap still means what it meant for everything else. It exists because
   * her subscription's rate limit is split between whatever is running, and
   * that argument is about sessions working over minutes, not about a command
   * that prints a table.
   *
   * There is no runaway behind this. `this.sessions` is keyed by row id, so a
   * row holds at most one session, and a command only ever starts because she
   * typed one into a particular row's reply box. */
  _load() {
    let n = 0;
    for (const id of ENGINE_IDS) n += this._loadFor(id);
    return n;
  }

  // WHAT THIS EXIT SAYS ABOUT SPAWNING, which for most exits is nothing.
  //
  // A session that dies within seconds did no work: a hit usage limit, a bad
  // flag, an untrusted workspace. Respawning it every tick turns one outage into
  // a hammer (observed: nine dead spawns in two minutes on a capped plan). Back
  // off, doubling to a ceiling; any session that survives past the threshold
  // resets the streak.
  //
  // A kill of ours is not evidence in either direction, so it is not counted
  // and does not reset a streak a dying fleet earned. It used to be counted,
  // because the CLI exits itself on SIGTERM and looked exactly like a spawn
  // that died on arrival: she archived a row five seconds after a worker picked
  // it up and took the whole fleet down with a cooldown tick refuses to run
  // through, with nothing on screen saying why (store-demo, 2026-08-11).
  noteExitForBackoff(session, { onLine = () => {} } = {}) {
    if (session.stoppedByUs) return;
    // A CODEX RUN CANNOT STRIKE A CLAUDE ACCOUNT, and until this slice the only
    // way to be sure of that was to return here: `_noteProfileTrouble` and
    // `_strikeProfile` took `session.profile`, which was one of her Claude
    // logins whatever engine had died on it, so a Codex failure quarantined her
    // working Claude subscription -- the 2026-08-24 shape, where one signed-out
    // account halted the one that was fine.
    //
    // THAT GUARANTEE IS NOW IN `_accountKey` INSTEAD, which is a better place
    // for it: an early return bought safety by giving Codex no account health
    // at all, so a Codex login that had run out was hammered by every tick with
    // nothing keeping count. The key keeps the two 'default' folders apart, so
    // everything below can run for both engines and land on the right books.
    //
    // The one thing that stays engine-shaped is the fleet-wide brake, and it is
    // asked further down rather than here, because the strike above it is owed
    // either way.
    const engine = engineOf(session.engine);
    // A CAPTURED SUCCESS RESULT IS PROOF OF WORK, NOT A LIMIT HIT, ON EVERY
    // SESSION. `result` is taken off the CLI's own final frame with `is_error`
    // false, and a spawn that hit a usage limit, was handed a bad flag, or
    // landed in an untrusted workspace never reaches that frame at all. A run
    // that finishes in seconds is a quick real run, not a failure: a slash
    // command is exactly that shape.
    //
    // WHAT THE NARROW VERSION COST, measured 2026-09-07 by
    // scripts/prove-the-claude-code-path-is-unchanged.mjs: one ordinary row ran,
    // finished cleanly with its result on the row, and the NEXT row would not
    // start -- `_hasSlotFor` false at a load of 0 against a capacity of 3. One
    // quick success filed trouble against a healthy account, which is what the
    // Accounts screen and `engineTrouble` read; on a one-account Mac it armed
    // the fleet-wide brake, because `_healthyProfiles` excludes an account
    // carrying trouble and zero healthy accounts is what the brake is for; and
    // three of them would have quarantined a working subscription for half an
    // hour. That is the failure CLAUDE.md already records, agents stopping for
    // no apparent reason, wearing a new hat.
    const quickButReal = session.result != null && !session.resultIsError;
    // A RUN THAT ENDS ON ITS ACCOUNT'S LIMIT SAYS SO WHATEVER ITS LENGTH.
    // Measured (w-ca48e69535): a Codex login hit its weekly limit and every
    // reply after that worked for about two minutes, then failed with "You've
    // hit your usage limit". Two minutes is not a fast exit, so each one fell to
    // the branch below that CLEARS the account's trouble, and the row went
    // straight back to the capped login four times while the other account sat
    // at 0%.
    const limitHit = !!session.resultIsError && troubleCause(session.result) === 'at-limit';
    if ((Date.now() - session.startedAt < FAST_EXIT_MS && !quickButReal) || limitHit) {
      // The last words of a fast-dead session are the diagnosis. They are kept,
      // but as EVIDENCE now, not as copy: shared/spawn-trouble.mjs turns them
      // into a cause, and only our own sentence for that cause ever reaches a
      // screen.
      const lastWords = limitHit
        ? String(session.result)
        : (session.tail ?? []).filter((l) => l && !l.startsWith('session exited') && !l.startsWith('fast exit')).slice(-1)[0];
      const raw = lastWords ? lastWords.replace(/^stderr: /, '').slice(0, 300) : '';
      const account = this._accountKey(engine, session.profile);
      const cause = this._noteProfileTrouble(account, raw);
      // A LIMIT THAT NAMES ITS RESET HOUR IS WAITED OUT TO THAT HOUR, no more
      // and no less (2026-09-22). The account sat out a fixed thirty minutes,
      // to 7:03pm, though the hour was on the very line this cause was read
      // from. The grace is for the two clocks disagreeing by a few seconds.
      const resetAt = cause === 'at-limit' ? limitResetMoment(raw) : null;
      if (resetAt) {
        this._profileCooldown = this._profileCooldown ?? {};
        this._profileCooldown[account] = resetAt + LIMIT_RESET_GRACE_MS;
      } else {
        this._strikeProfile(account, {
          hard: needsHerHands(cause),
          rest: cause === 'signed-out' ? SIGNED_OUT_REST_MS : undefined,
        });
      }
      // A DEATH THE ACCOUNT CAUSED IS NOT THE ROW'S. Read by `settleDelivery`
      // (her reply is handed back rather than spending one of its three tries)
      // and by `noteFreshRun` (the row's rest ends when the account is back).
      // Measured 2026-10-04: her "continue" on a row, sent while signed out,
      // died in two seconds and counted against the reply.
      if (needsHerHands(cause) || cause === 'at-limit') session.accountFault = { cause, account };

      // ONLY THE ENGINE SHE IS ACTUALLY RUNNING ON MAY BRAKE THE FLEET.
      //
      // The brake means "nowhere left to run", and that sentence is only true
      // of Claude Code: it is what every row falls back to, so a Mac with no
      // healthy Claude account has nothing to give the queue. Codex is the
      // second engine and a row refused by it still runs. Charging a Codex
      // failure to the whole fleet would slow her WORKING engine down over a
      // failure in the other one, which is the 2026-08-24 mistake wearing a
      // different hat. The per-account cooldown above is Codex's whole answer,
      // and it is the answer that matters: a login that has run out leaves its
      // own rotation and comes back on its own.
      if (engine !== DEFAULT_ENGINE) { this._saveState(); return; }

      // ONLY A FLEET WITH NOWHERE LEFT TO RUN GETS THE FLEET-WIDE BRAKE.
      //
      // This used to fire on every fast exit whatever else was healthy, so one
      // signed-out subscription stopped her working one for a minute, then two,
      // then four, doubling to thirty. Measured: five dead spawns on the second
      // account inside an hour and a half, each one halting the account that
      // was working. The per-account cooldown above
      // already keeps a bad account out of the rotation; the brake is only for
      // when there is no good account left to be kept out of anything.
      const healthy = this._healthyProfiles().length;
      if (healthy === 0) {
        this._fastExits = (this._fastExits ?? 0) + 1;
        const delay = resetAt
          ? Math.max(0, resetAt + LIMIT_RESET_GRACE_MS - Date.now())
          : Math.min(BACKOFF_BASE_MS * 2 ** (this._fastExits - 1), cause === 'signed-out' ? SIGNED_OUT_REST_MS : BACKOFF_CAP_MS);
        this._spawnCooldownUntil = Date.now() + delay;
        this._fleetTroubleSince = this._fleetTroubleSince || Date.now();
        this._lastFastExit = { at: Date.now(), cause, raw };
        onLine(`fast exit #${this._fastExits}; next spawn in ${Math.round(delay / 60000)}m`);
      } else {
        // Her account is fine and it stays fine. Nothing is said on screen and
        // nothing is slowed down; the trace log has the whole story.
        this._fastExits = 0;
        this._spawnCooldownUntil = 0;
        this._fleetTroubleSince = 0;
        this._lastFastExit = null;
        onLine(`spawn died on the ${session.profile === 'default' ? 'default' : 'second'} account; the other one keeps working`);
      }
    } else {
      this._clearProfileTrouble(this._accountKey(engine, session.profile));
      // AND THE BRAKE IS LIFTED BY THE ENGINE THAT EARNED IT, nobody else. A
      // Codex thread running for an hour is not evidence that her Claude
      // subscription came back, and reading it as such would put the fleet
      // straight back into the hammer the brake exists to stop. Its own
      // account's trouble is cleared above, which is the whole of what a
      // surviving Codex run proves.
      if (engine === DEFAULT_ENGINE) {
        this._fastExits = 0;
        this._spawnCooldownUntil = 0;
        this._fleetTroubleSince = 0;
        this._lastFastExit = null;
      }
    }
    // Both directions are worth keeping across a restart, and the clearing one
    // more than the noting one: a stale reason that outlived its fault is the
    // thing that would mislead her.
    this._saveState();
  }

  _saveState() {
    try {
      fs.writeFileSync(this._stateFile, JSON.stringify({
        handledAnswers: [...this._handledAnswers].slice(-500),
        productOrder: this.productOrder,
        hiddenProducts: [...this.hiddenProducts],
        liveSessions: this._liveSessions,
        rowSessions: this._rowSessions,
        compactions: this._compactions,
        nativeCommands: this._nativeCommands,
        lastDigestTry: this.lastDigestTry,
        deliveryAttempts: this._deliveryAttempts,
        fruitless: this._fruitless,
        // Why each account cannot be used, so a restart does not go back to
        // knowing that nothing runs without knowing why.
        profileTrouble: this._profileTrouble,
        profileCooldown: this._profileCooldown,
      }));
    } catch {}
  }

  /* ----------------------------- the first run ---------------------------- */
  // NOTHING FROM CLAUDE CODE STARTS WHILE SOMEBODY IS BEING SHOWN AROUND.
  // Making the project on the name screen composes a real directive, "Take
  // Agentbox from idea toward launch", and on her own walk that directive's
  // session started eight seconds before the example task existed and put it
  // thirteen seconds behind in the queue.
  //
  // So the walk holds the supervisor while it runs, and everything arrives the
  // moment it ends. Two things keep the hold safe:
  //
  //   1. It is IN MEMORY ONLY, so a crash mid-walk cannot leave it set: the
  //      next launch has no hold at all. Pause is persisted; this is not, and
  //      that difference is the whole reason it is a separate flag rather than
  //      a use of `paused`.
  //   2. It EXPIRES. A window left on the folder screen over lunch is a walk
  //      that never ends, and a person who did finish the walk with the app
  //      closed under them would otherwise never get a worker again.
  firstRunWalking(walking, now = Date.now()) {
    this._firstRunUntil = walking ? now + FIRST_RUN_HOLD_MS : 0;
    if (!walking) this.tick().catch(() => { /* the next tick will do it */ });
    this.onChange?.();
  }

  firstRunHolding(now = Date.now()) {
    return !!this._firstRunUntil && now < this._firstRunUntil;
  }

  /* `pauseProduct` stopped one project and left the rest of the fleet running.
     It is gone (w-d19d6d387c): "paused" did not say whether it stopped the
     session, nobody knew the feature existed, and nothing had ever used it.
     Pausing the whole fleet is still a switch in Settings and a row in
     ⌘K, and stopping one task is still S on the row. */

  status() {
    // Stalled: the founder's answer is marked delivered, but nobody is on the
    // item and it never moved. A worker ran and exited without finishing (a
    // refused tool, a crash after the mark, a session that wrote to nowhere).
    // Named so the UI can say "stopped" instead of showing a 16-hour-old row
    // that the founder reads, correctly, as nothing happening.
    //
    // A SESSION THAT FINISHED IS NOT ONE OF THOSE. Without the settled test
    // this predicate covered both, so the ordinary end of the ordinary loop
    // (worker acts on her answer, leaves the live thread open) printed
    // "stopped" in red, and every row that had ever worked ended up there:
    // twelve at once, and she read the whole fleet as broken. Red has to mean
    // something went wrong or it means nothing at all.
    let stalled = [];
    try {
      stalled = this.store.listItems(Date.now())
        .filter((i) => i.status === 'open' && i.answer && i.answer !== '(withdrawn)'
          && !this.sessions.has(i.id)
          && !answerSettled(i)
          && this._answerDelivered(i))
        .map((i) => i.id);
    } catch {}
    // Queued: everything a tick WOULD spawn once a slot frees — an answered
    // item whose delivery mark is still unwritten, or spawnable fresh work.
    // Named so a row waiting its turn never looks like a row nothing will
    // ever touch (the founder could not tell them apart, 2026-08-05).
    // Scheduled: due later, so not queued and not stalled. Without this a
    // "send later" item would read as waiting its turn, which is the exact
    // confusion `queued` was named to end.
    let scheduled = [];
    try {
      const nowTs = Date.now();
      scheduled = this.store.listItems(nowTs)
        .filter((i) => i.status === 'open' && !this.store.isDue(i, nowTs))
        .map((i) => i.id);
    } catch {}
    let queued = [];
    // PAUSED IS NOT QUEUED. `_tick` returns at its first line while
    // `this.paused` is set, so nothing spawns at all, and every row this list
    // named was being advertised as waiting its turn for a turn that was never
    // going to come. The per-product pause was already filtered out below and
    // the global one was not, which is the same lie at a bigger scale. The pane
    // and the row both say "paused" instead, which is the fact and is also the
    // thing she can undo.
    try {
      const nowTs = Date.now();
      const autonomous = new Set(this.config.autonomousProducts ?? []);
      // THE TEAM VERSION: a shared row is queued only on its runner's Mac, and
      // a row a person holds on nobody's, by the same rule the tick obeys.
      const productBySlug = new Map((this.store.listProducts?.() ?? []).map((p) => [p.slug, p]));
      const me = process.env.AGENTBOX_PERSON_ID;
      queued = this.store.listItems(nowTs)
        .filter((i) => mayRunHere(i, productBySlug.get(i.product), me))
        .filter((i) => !this.sessions.has(i.id) && i.status === 'open'
          && this.store.isDue(i, nowTs))
        // The walk's own example task is NOT queued: nothing is going to spawn
        // on it, which is the whole of FIRST_RUN_LABEL. The bug was a row
        // reading "queued" under a sentence saying it was reading, and
        // this list promises exactly the opposite of that.
        .filter((i) => !(i.labels ?? []).includes(FIRST_RUN_LABEL))
        // Leased to someone else, so NOT queued, for the same reason resting is
        // not: the continuation pass will not spawn on it until the lease
        // lapses, and `queued` must never advertise a row the tick is going to
        // walk past (claimHeldElsewhere).
        .filter((i) => !this.claimHeldElsewhere(i))
        .filter((i) => (i.answer && i.answer !== '(withdrawn)'
            && !answerSettled(i) && !this._answerDelivered(i))
          || (!i.answer && i.kind !== 'question' && i.kind !== 'review'
            && ((i.labels ?? []).includes('founder') || autonomous.has(i.product))
            // Resting, so NOT queued: the tick will not spawn it, and a row
            // that reads as waiting its turn while nothing is going to touch it
            // for hours is the confusion this list exists to prevent.
            && this.restingUntil(i) <= nowTs))
        .map((i) => i.id);
    } catch {}
    if (this.paused) queued = [];
    let signInNeeded = {};
    try {
      const productBySlug = new Map((this.store.listProducts?.() ?? []).map((p) => [p.slug, p]));
      const me = process.env.AGENTBOX_PERSON_ID;
      signInNeeded = this._waitingOnSignIn(this.store.listItems(Date.now())
        .filter((i) => mayRunHere(i, productBySlug.get(i.product), me)));
    } catch {}
    return {
      paused: this.paused,
      // ROWS NOTHING CAN START BECAUSE THEIR TOOL IS SIGNED OUT, by id, with the
      // tool's name. The row says so instead of "Queued", which promised an
      // agent "as soon as one is free" while none could be (2026-10-04).
      signInNeeded,
      running: [...this.sessions.values()].filter(s => !s.remoteIdle).map((s) => ({
        itemId: s.itemId,
        product: s.product,
        startedAt: s.startedAt,
        // WHICH CODING AGENT REALLY STARTED THIS ONE. `engineFacts` below is the
        // answer for the NEXT spawn on a row; this is the one that happened, so
        // the byline says what is in front of her rather than what would be next
        // if she changed the row while it ran. `engineOf` because a session
        // record written before the second engine existed carries nothing, and
        // every one of those was Claude Code.
        engine: engineOf(s.engine),
        tail: s.tail.slice(-40),
        activity: currentActivity(s),
        // THE BLOCK OF PROSE BEING TYPED THIS SECOND, and the moment it
        // started, so the thread can put it in time order with everything
        // already in it. Empty on a session that is between sentences,
        // which is most seconds of most runs.
        saying: s.saying ?? '',
        sayingAt: s.sayingAt ?? 0,
        // Absent, not zero, when no helper is out. The line only changes its
        // words when there is something to say, so a run with no helpers
        // reads exactly as it read before this existed.
        helpers: s.helperIds?.size || undefined,
      })),
      stalled,
      queued,
      // Waiting tasks she pushed with Run now that have not started yet, so
      // the task can say it is next rather than merely queued.
      runNow: [...this._runNow].filter(([id, r]) => !r.started && !this.sessions.has(id)).map(([id]) => id),
      scheduled,
      // ROWS WHOSE LAST RUN ENDED WITHOUT SAYING ANYTHING. The row says so.
      // See `_silentRows`.
      silent: this._silentRows(),
      productOrder: this.productOrder,
      hiddenProducts: [...this.hiddenProducts],
      capacity: this._capacity(),
      // Which accounts are in trouble and what kind, for the Accounts page.
      // This is always true the moment it is true: a page you go and look at
      // can afford to be exact, because nothing about it interrupts her.
      accountTrouble: Object.fromEntries(
        Object.entries(this._profileTrouble ?? {}).map(([p, t]) => [p, { cause: t.cause, since: t.since }]),
      ),
      // THE ONE LINE ABOVE HER LIST, and only when it is really true.
      //
      // Two facts can fill it and they are asked in this order, because they
      // are not equally likely to be the one the user needs. First: are there
      // tasks nothing has been able to run on? That is theirs to act on. Second,
      // and only when there are none: the older fleet sentence, which says
      // nothing can start ANYWHERE.
      //
      // Whichever answers, what crosses this line is a sentence of ours, never
      // the tool's text.
      spawnTrouble: this._strandedNews() ?? this._spawnTrouble(queued),
    };
  }

  /**
   * A RUN ENDED AND SAID NOTHING, AND NOW THE ROW ADMITS IT.
   *
   * When a run ends having written nothing, the row says so, in the same voice
   * the four live words use.
   *
   * WHAT THIS IS REPAIRING, and it came from outside.
   *
   * The app has known this the whole time and never said it. `noteFreshRun`
   * writes `_fruitless` at the moment a run ends without moving the row, and the
   * ONLY thing that has ever read it is the backoff: fifteen minutes, an hour,
   * four, twelve, a day. So the row went quiet for up to a day while the pane
   * said "Nothing running", which is true and is not the point. Nothing said a
   * run had HAPPENED and come back empty.
   *
   * WHY THIS IS NOT `stalled`. Stalled means a worker died, and the stopped bar
   * above the conversation owns it in red. This is the opposite kind of event: a
   * run that ended perfectly cleanly and simply wrote nothing down. Red would be
   * wrong and so would silence, so it is its own word.
   *
   * IT SPEAKS ONLY WHILE IT IS STILL TRUE. `_emptyRuns` returns 0 the moment she
   * writes anything on the row, which is exactly right: her word restarts the
   * conversation and a sentence about the last run stops being the news. A row
   * with a live session, or one she has answered, is not here either.
   */
  _silentRows() {
    const out = {};
    let items;
    try { items = this.store.listItems(Date.now()); } catch { return out; }
    for (const item of items) {
      if (item.status !== 'open') continue;
      // Her answer is a different story with its own telling: a run that died
      // carrying it is `sayTheRunDied`, and one still being retried is not
      // news yet.
      if (item.answer && item.answer !== '(withdrawn)') continue;
      // Something is on it right now, so the last run is not what she needs.
      if (this.sessions.has(item.id)) continue;
      // She was looking at a row carrying a finished result and three options,
      // waiting on her, with "Nothing came back" printed under it. Both facts
      // were true and the pair was a lie: an agent HAD come back, at length, and
      // the sentence read as though the app were still chewing on it.
      //
      // The cause is that a row waiting on her gets a run every so often that
      // correctly does nothing, because the next move is hers. Every one of those
      // was a strike in `_fruitless`, so the rows likeliest to be labelled were
      // the ones with the most to read on them, which is exactly backwards.
      //
      // So this state is only ever about a row with NOTHING ON IT TO READ, which
      // is the case it was built for: an engineer whose pull request was created
      // and live while the row sat looking untouched, because the session that
      // did the work never wrote the confirmation back.
      if (String(item.result ?? '').trim() || String(item.note ?? '').trim()) continue;
      const runs = this._emptyRuns(item);
      if (!runs) continue;
      const seen = this._fruitless[`${item.product}:${item.id}`];
      out[item.id] = { runs, endedAt: seen?.endedAt ?? 0, until: this.restingUntil(item) };
    }
    return out;
  }

  /**
   * TASKS NOTHING HAS BEEN ABLE TO RUN, SAID ONCE FOR THE WHOLE APP.
   *
   * The line it fills already existed and it could never have fired for her.
   * `_spawnTrouble` below wants `_fleetTroubleSince`, which is only ever set
   * when NO Claude account is left healthy, and it wants `sessions.size === 0`.
   * Her Claude agents worked all day while four Codex tasks and four on a
   * signed-out second login sat there, so both gates were open the whole time
   * and the app had no way at all to say what she could plainly see. The
   * subject is the tasks now, not the fleet, and a working engine beside a
   * broken one no longer buys the broken one silence.
   *
   * Three gates survive from the old line and they are still hers. It has to be
   * about more than one bad minute, so a row counts only once it has been STUCK
   * for TROUBLE_QUIET_MS, the same twenty minutes the fleet sentence waits out
   * — stuck since it first failed, never since its newest retry, or a row being
   * hammered every fifteen minutes would look permanently new and never
   * qualify. It has to still be true, so every row is re-checked against the
   * store on the way out rather than trusted from the tick that found it. And
   * it never speaks over her own choice: an app she paused is not an app that
   * is failing.
   */
  _strandedNews(now = Date.now()) {
    if (this.paused) return null;
    const found = this._stranded ?? [];
    if (!found.length) return null;
    // Still stranded? The tick that counted these may be minutes old, and it
    // does not run at all while the app is on a spawn cooldown, which is
    // exactly when this line is most likely to be up. A row somebody has since
    // answered, closed or picked up is not news any more.
    let live;
    try { live = this.store.listItems(now); } catch { return null; }
    const open = new Set(live
      .filter((i) => i.status === 'open' && !(i.answer && i.answer !== '(withdrawn)') && !this.sessions.has(i.id))
      .map((i) => i.id));
    const rows = found.filter((r) => open.has(r.id));
    if (!rows.length) return null;
    const since = Math.min(...rows.map((r) => r.since ?? now));
    // THE TWENTY MINUTES ARM THE LINE; THEY DO NOT FILTER THE COUNT.
    //
    // Written the other way round first, and photographing it is what caught
    // it: the line said "4 tasks" over eight rows each carrying a sentence
    // saying nothing had run on it, because the other four had failed twelve
    // minutes earlier and were being held back by the clock. She would have
    // counted the rows. So the wait is only about not shouting over one bad
    // minute: once ANYTHING has been stuck twenty minutes the app is in a state
    // worth a sentence, and the honest number in that sentence is all of them.
    if (now - since < TROUBLE_QUIET_MS) return null;
    const causes = rows.map((r) => r.cause ?? 'unknown');
    // WHAT EACH FAILURE IS, AND NOT JUST HOW MANY THERE ARE.
    //
    // `message` and `remedy` above are one number and one shrug: with two
    // causes in the pile the second line is "They are not all stuck on the same
    // thing. Each row says which", which is this surface declining to say the
    // thing she asked it to say. The breakdown is the same rows counted per
    // cause, so a look that wants a line each has one to draw and does not have
    // to invent the words. Nothing that already reads `message` changes.
    const resetsAt = rows.find((r) => r.cause === 'at-limit' && r.resetsAt)?.resetsAt ?? null;
    return {
      since,
      cause: new Set(causes).size === 1 ? causes[0] : 'mixed',
      message: strandedSentence({ count: rows.length, since, now }),
      remedy: strandedRemedy(causes),
      count: rows.length,
      resetsAt,
      byCause: causeBreakdown(rows, resetsAt),
      // WHICH ROWS, and not only how many. One of the looks she kept is a
      // heading, and a heading over a list grouped by day is a claim about the
      // rows under it that the list does not keep (: the second row under it
      // was from the 23rd and running fine). The alternative that moves them
      // needs to know which they are.
      ids: rows.map((r) => r.id),
      // AND WHICH OF THEM IS STOPPED ON WHICH THING. `ids` stays beside it
      // because it is already read for the grouping and does not want the
      // cause.
      stopped: rows.map((r) => ({ id: r.id, cause: r.cause ?? 'unknown' })),
      retryAt: this._spawnCooldownUntil ?? 0,
    };
  }

  // WHY NOTHING IS SPAWNING ANYWHERE, AND ONLY WHEN THAT IS ACTUALLY TRUE.
  // The whole app and not one account, so it reads `_fleetTroubleSince`, which
  // is only ever set when no healthy account remains; twenty unbroken minutes;
  // and something it is actually stopping, so there is work waiting and nothing
  // running.
  /**
   * WHICH OPEN ROWS ARE WAITING ON A SIGN-IN, and in which tool. True of a row
   * when every account its engine could run it on is sitting out and at least
   * one of them is signed out. One sitting-out account beside a working one is
   * not this: the work goes to the working one.
   */
  _waitingOnSignIn(rows) {
    const out = {};
    const blocked = new Map();
    const isBlocked = (engine) => {
      if (!blocked.has(engine)) {
        blocked.set(engine, !this._liveProfilesFor(engine).length
          && this._profilesFor(engine).some((p) => this._profileTrouble?.[this._accountKey(engine, p)]?.cause === 'signed-out'));
      }
      return blocked.get(engine);
    };
    for (const i of rows ?? []) {
      if (i.status !== 'open' || this.sessions.has(i.id)) continue;
      const engine = engineOf(this._engineFor(i));
      if (isBlocked(engine)) out[i.id] = engineLabel(engine);
    }
    return out;
  }

  _spawnTrouble(queued) {
    const since = this._fleetTroubleSince ?? 0;
    if (!since) return null;
    if (Date.now() - since < TROUBLE_QUIET_MS) return null;
    if (this.sessions.size > 0) return null;
    if (!(queued ?? []).length) return null;
    const cause = this._lastFastExit?.cause ?? 'unknown';
    return {
      since,
      cause,
      message: troubleSentence(cause),
      remedy: troubleRemedy(cause),
      retryAt: this._spawnCooldownUntil ?? 0,
    };
  }

  /* --------------------------------- tick -------------------------------- */
  // One pass: reap dead sessions, spawn continuations for answered questions,
  // fill remaining capacity from the open queue.
  async tick() {
    // ONE PASS AT A TIME. A wake can land in the middle of a running pass, and
    // two passes reading the same open queue would each give the same row a
    // slot. So the second one does not run beside the first; it runs after it.
    // Not dropped, because the line that woke it may have been written after
    // the running pass already read the queue, and a dropped wake there is the
    // fifteen second wait back again for exactly the row that asked for it.
    if (this._ticking) { this._tickAgain = true; return; }
    this._ticking = true;
    this.forgiveSleep(Date.now());
    this._lastTickAt = Date.now();
    try {
      return await this._tick();
    } finally {
      this._ticking = false;
      // Through `wake` rather than straight back into `tick`, so the floor
      // applies and a pass that keeps being woken cannot become a spin.
      if (this._tickAgain) { this._tickAgain = false; this.wake(); }
    }
  }

  async _tick() {
    if (this.paused) return;
    if (this.firstRunHolding()) return;
    // Has a login landed since an account was found signed out? Ahead of the
    // brake below, which would otherwise hold the fleet past the sign-in.
    try { this._noticeSignIns(); } catch (e) { console.warn('zero: could not look for a sign-in:', e.message); }
    // A COOLDOWN STOPS THE SPAWNING AND IT MUST NOT STOP THE TELLING. The brake
    // goes on when there is no healthy account left anywhere, for up to half an
    // hour, which is precisely the half hour her tasks are all stuck and the
    // line above her list has the most to say. Returning here took the count
    // with it, so the app went quiet exactly when it was most broken. Nothing
    // below this is a spawn; it is the pass that puts a sentence on a silent
    // row and counts what is stuck. AND IT ONLY STOPS THE ENGINE THAT EARNED
    // IT. The brake is armed by a fast CLAUDE exit with no healthy Claude
    // account left; a Codex row runs on the other subscription and is not
    // evidence about either. So the pass goes on whenever there is another
    // engine with capacity, and `_hasSlotFor` refuses the Claude rows one at a
    // time instead. With no Codex on the Mac -- every downloaded copy of Agentbox
    // -- nothing about this changes at all.
    if (this._spawnBraked() && !this._anotherEngineCanRun()) {
      const at = Date.now();
      try { this.sayItOnEveryStrandedRow(this.store.listItems(at), at); } catch (e) { console.warn('zero: could not count the stopped rows:', e.message); }
      return;
    }
    const now = Date.now();
    // Repeating tasks first, so a run created on this tick is already in the
    // list the fresh-work pass below reads, rather than waiting for the next.
    await this.serveRepeats(now);
    // And the folders of rows she has finished, put away. On a timer of its own
    // rather than every pass, because it is a walk of the disk and a tick is
    // fifteen seconds: she closes rows while nothing at all is running, which
    // is exactly when no session exit is coming to do this.
    this.parkOnATimer(now);
    const items = this.store.listItems(now);
    // A task its agent marked ready goes out, one at a time, beside the tick.
    try { this.shipQueue.tick(items, this.store.listProducts()); } catch (e) { console.warn('zero: the ship queue:', e.message); }

    // A session that died without exiting still holds its row. Stopping it
    // here lets the passes below put a fresh worker on the row.
    this.reapHungSessions(items, now);

    // BEFORE ANY OF THE SPAWNING: is there a row sitting there silent because
    // the last thing that touched it died without a word? Ahead of the passes
    // below on purpose. This is the one thing in the tick that is about a row
    // NOTHING is going to run on, and it also puts a row wrongly asleep for a
    // day back within reach of the fresh-work pass in this same tick.
    this.sayItOnEveryStrandedRow(items, now);

    // And is there a row still wearing the first line of what she dictated?
    // One a tick, never awaited, silent on every failure (nameTheRows above).
    try { this.nameTheRows(items); } catch (e) { console.warn('zero: could not name a row:', e.message); }
    // And has a teammate written something that needs sorting by urgency?
    try { this.sortTheMessages(items, process.env.AGENTBOX_PERSON_ID); } catch (e) { console.warn('zero: could not sort a message:', e.message); }

    // Before anything is resumed or spawned: has the urgent row we interrupted
    // something FOR actually got its slot? Every hold this clears is a row that
    // becomes resumable again on the passes below, in this same tick. A push
    // whose run has ended is settled first, since it no longer holds anything.
    this._settleRunNow(items);
    this._settlePreemptions(items, now);

    // Interrupted sessions the last sweep could not fit in a slot. Ahead of
    // everything, because a row whose own session is waiting must not have a
    // stranger put on it by the passes below.
    if (this._recoverPending) {
      try { this.recoverInterrupted('capacity'); } catch (e) { console.warn('zero: recovery:', e.message); }
    }

    // Rows she resumed by name that had no slot at the time. First call on the
    // next free slot, ahead of everything: she asked for these out loud, and a
    // resume that quietly never happens is the failure this whole path exists
    // to end.
    for (const id of [...this._resumeQueue]) {
      const item = items.find((i) => i.id === id);
      // A row that has gone or is already running is not waiting for a slot; it
      // leaves the queue whatever capacity says.
      if (!item || this.sessions.has(id)) {
        this._resumeQueue.delete(id);
        continue;
      }
      // NO SLOT ON ITS ENGINE MEANS IT KEEPS ITS PLACE, and the scan goes on to
      // the next one, which may be on the engine that is idle. This used to
      // break out of the loop, which was the same starvation the main queue's
      // `spent` note describes: she asked for these out loud, so a resume that
      // waits behind the OTHER subscription is a resume that never happens.
      if (!this._hasSlotFor(this._engineFor(item))) continue;
      this._resumeQueue.delete(id);
      this._spawnResume(item);
    }

    // ONE QUEUE, ONE ORDER. Everything spawnable this tick is scored by the
    // same rule and the slots go to the top of that one list.
    //
    // This used to be two passes: every continuation first, then fresh work
    // with whatever slots were left. Priority only ever competed INSIDE a
    // pass, so an Urgent task could not outrank a Medium answer, ever. It was
    // not a close call either; it was absolute precedence dressed as ordering.
    //
    // Measured: an Urgent task waited 85 minutes before anything started on
    // it. In that window Agentbox started 36 sessions on that one product and
    // every single one was a continuation; 20 of them were Medium. Not one
    // fresh item spawned until the answer backlog ran dry, and then two
    // started in the same second. That is starvation, and it is also why
    // stopping a task did not help: the freed slot went straight to the next
    // answer in line.
    //
    // Continuations still WIN A TIE, which keeps the old intent (an answer she
    // has already given beats new work of equal standing) without letting it
    // outrank the founder's own tag. Same priority, answer first; higher
    // priority wins outright.
    const autonomous = new Set(this.config.autonomousProducts ?? []);

    // A continuation is anything open carrying a founder answer with nobody
    // acting on it. For a question that answer is the decision; for a review
    // it is the verdict to ENACT (merge, ship, revise); for an agent-filed
    // proposal it is the approval ("run it") that turns the proposal into work.
    const isContinuation = (i) => {
      if (!i.answer) return false;
      // A withdrawn reply (Z after send in the inbox) is a cancel, not an
      // answer; spawning on it would brief a worker with "(withdrawn)".
      if (i.answer === '(withdrawn)') return false;
      // A BLOCKED ROW IS STILL A ROW SHE CAN ANSWER. This used to read "blocked
      // AND personal", because parking as blocked was how a personal thread
      // waited for her. Personal projects are gone (w-d19d6d387c) and the rule
      // behind the clause outlives them: blocked means a session stopped until
      // something outside it changed, and her reply IS that change.
      if (i.status !== 'open' && i.status !== 'blocked') return false;
      // BUT NOT A ROW SHE STOPPED, on the reply she sent before stopping it.
      // The kill hands that reply back to the queue, and this used to start a
      // fresh run on it ten seconds after her stop, on a row sitting in her
      // inbox. Her stop is the newest thing she said; a later reply wakes it.
      if (stoppedByHer(i)) return false;
      return true;
    };

    // Fresh work: HUMAN-IN-THE-LOOP BY DEFAULT. Only founder-initiated items
    // (the 'founder' label, stamped by compose) auto-spawn; everything an agent
    // filed is a proposal that waits in the inbox until the founder's answer
    // arrives (which makes it a continuation above). Autonomy is earned by
    // category later, not assumed now. `autonomousProducts` is that later,
    // granted per product in the config: there, agent-filed TASKS run without
    // waiting, while questions and reviews still hold for the founder. THE
    // WALK'S OWN ROW IS NEVER FRESH WORK. It looks like a real task because it
    // IS one, down to the ledger, and it is answered by the app itself out of
    // the folder she just chose. A worker picking it up would be a second
    // answer to a question already answered, arriving a minute later over the
    // top of it. A REPLY of hers still spawns, because by then the walk is over
    // and the row is an ordinary task in her inbox: this is on `isFresh` alone
    // and deliberately not on `isContinuation`.
    const isFresh = (i) => !(i.labels ?? []).includes(FIRST_RUN_LABEL)
      && i.status === 'open' && i.kind !== 'question' && i.kind !== 'review'
      && ((i.labels ?? []).includes('founder') || autonomous.has(i.product)) && !i.answer
      // A ROW THAT ALREADY HOLDS AN ANSWER FOR HER IS NOT FRESH WORK. This is
      // the same rule as the paragraph above, read from the other end: a
      // proposal waits for her, and a finished answer sitting on an open row
      // IS a proposal, whoever labelled the row.
      //
      // Without this the row is fresh again the moment the rest expires, and
      // the next worker arrives at a question that is already answered, has
      // nothing new to do, and writes the answer a second time.
      //
      // Measured: hundreds of results were written with no reply since the
      // previous one, many opening on a character-identical bold line, and
      // several rows were carrying three answers to one unanswered ask: three
      // sessions, three near-identical results, no reply between any of them.
      //
      // She loses nothing by the wait. `rowSummary` already shows a result
      // newer than the body on an OPEN row, so the answer is in her inbox
      // being read; the only thing that stops is writing it again. Any word
      // from her moves `lastFounderWrite` past it and the row is fresh again.
      // EXCEPT when the words are OURS, about an account that refused the run
      // (`_onlyWeSpokeForAnAccount`): those are not an answer to her.
      && (!awaitingHer(i) || this._onlyWeSpokeForAnAccount(i))
      // A row a worker already took and gave nothing back rests before it is
      // handed to another one. This pass had no memory whatsoever, which is
      // the whole of the every-tick loop (FRUITLESS_RESTS_MS).
      && this.restingUntil(i) <= now;

    // NOTHING EVER RUNS IN THE PRACTICE PROJECT. The walk's own rows are
    // already safe by their label, but a REPLY to one is a continuation, and a
    // continuation spawns a real Claude Code session — in a project with no
    // folder behind it, on a task that was never real. So the whole product is
    // off limits, which is a rule about a place rather than a rule about a row
    // and cannot be got round by writing a new one. `worksHere` is that rule
    // and it is the same one `spawnWorker` refuses on; this set only saves the
    // queue the work of considering rows it would refuse anyway.
    const products = this.store.listProducts();
    const noWorkHere = new Set(
      products.filter((p) => !this.worksHere(p)).map((p) => p.slug),
    );
    // A SHARED PROJECT'S ROW RUNS ON ITS RUNNER'S MAC AND NOWHERE ELSE, and a
    // row a person has been given runs nowhere until they hand it back. Every
    // teammate's supervisor sees every shared row; without this each would
    // start its own worker on it. shared/team-rules.mjs is the rule, and the
    // window reads the same one to decide whose inbox a row is in.
    const productBySlug = new Map(products.map((p) => [p.slug, p]));
    const me = process.env.AGENTBOX_PERSON_ID || null;

    const queue = [];
    for (const item of items) {
      if (noWorkHere.has(item.product)) continue;
      if (!mayRunHere(item, productBySlug.get(item.product), me)) continue;
      if (this.sessions.has(item.id)) continue;
      // Interrupted a moment ago so an Urgent row could have its slot. Putting
      // a worker back on it here — as a stranger, on the fresh-work or
      // continuation path — is exactly the slot we just made going straight
      // back to the row we took it from. It returns to this queue as soon as
      // the urgent row is running, and it returns as a RESUME rather than a
      // stranger, which is the sweep's job and not this one's.
      if (this._preempted.has(item.id)) continue;
      // Anything scheduled waits for its moment like any other. Approving
      // something on Friday and having it run Monday at 6am is the point, not
      // a special case.
      if (!this.store.isDue(item, now)) continue;
      const continuation = isContinuation(item);
      if (!continuation && !isFresh(item)) continue;
      // ONE OF CLAUDE CODE'S OWN EIGHT COMMANDS, typed into this row's reply
      // box, ON A ROW THAT IS GOING TO CLAUDE CODE. `commandPrompt` is null for
      // everything else, so this is false for every ordinary message.
      //
      // THE ENGINE TEST IS THE ONE `spawnWorker` ALREADY MAKES, in the same
      // words, and it was missing here. Being marked `command` buys a row two
      // things -- the front of the queue, ahead of every priority she set, and
      // a pass straight through the cap, since `_load` does not count it either
      // -- and both are paid for by one argument: a command is 2.8 to 4.8
      // seconds of printing a table. None of that is true of a Codex row whose
      // reply happens to begin `/usage`. Codex knows none of the eight, so
      // `spawnWorker` correctly leaves the words in her prompt and runs an
      // ordinary turn; this line meanwhile sorted that turn to the front and
      // spawned it on a full fleet, taking a slot from a row that was waiting.
      //
      // ASKED LAST, so `_engineFor` is only consulted for a reply that really
      // is one of the eight. It is the same pure method the scan below asks
      // again -- two asks, not two decisions -- and its once-per-row warning
      // (`_sayTheChoiceIsOld`) is deduped, so asking earlier says nothing twice.
      queue.push({
        item,
        continuation,
        command: continuation
          && !!commandPrompt(item.answer, this._nativeCommands?.[item.id])
          && this._engineFor(item) === DEFAULT_ENGINE,
      });
    }
    queue.sort((a, b) =>
      // A COMMAND GOES TO THE FRONT, ahead of the priority she set on anything
      // else, because it is not competing with them for anything. It takes no
      // slot (`_load`), the runs measured on took between 2.8 and 4.8 seconds,
      // and she is sitting on the card waiting for a table.
      //
      // It has to sort rather than merely be waved through the cap below: the
      // cap does not skip a row it cannot fit, it BREAKS, so a `/usage` behind
      // two answered rows on a full fleet was never reached at all. Measured as
      // a failing test before this line existed.
      (b.command ? 1 : 0) - (a.command ? 1 : 0)
      // THEN WHAT SHE PUSHED WITH RUN NOW, ahead of every project and tag,
      // the earliest push first. Sorting first is also what gives it this
      // tick's one interruption on its engine (`spent` below).
      || (this._runNow.has(b.item.id) ? 1 : 0) - (this._runNow.has(a.item.id) ? 1 : 0)
      || (this._runNow.get(a.item.id)?.at ?? 0) - (this._runNow.get(b.item.id)?.at ?? 0)
      || this._score(b.item) - this._score(a.item)
      // The tie-break, and the only thing left of "continuations go first".
      || (b.continuation ? 1 : 0) - (a.continuation ? 1 : 0)
      // Oldest first inside a tie so nothing starves: an answer by when it was
      // last touched, a fresh row by when she filed it.
      || (a.continuation ? (a.item.updatedAt ?? 0) - (b.item.updatedAt ?? 0)
        : (a.item.createdAt ?? 0) - (b.item.createdAt ?? 0)));

    /*
     * ENGINES THAT HAVE NOTHING LEFT TO GIVE THIS TICK.
     *
     * The scan below SKIPS a row it cannot fit and keeps going, where it used
     * to break out of the queue entirely. That break was correct while there
     * was one cap -- nothing further down could fit either -- and it is a
     * starvation bug now that there are two: a Codex row sitting behind three
     * unfittable Claude rows would never be reached at all, so her Codex
     * subscription would go on doing nothing with a Codex task in the queue.
     * That is the same shape as the bug the slash-command sort-to-front was
     * written for, and the deleted 2026-08-25 build shipped with it.
     *
     * WHAT THE BREAK WAS ALSO DOING, and what this set keeps: at most one
     * session is interrupted per engine per tick. Nothing further down the
     * queue outranks the row we just made room for, so a second preemption on
     * the same engine could only take a slot for a row that is going to wait
     * anyway. An engine goes in here whether or not `_preemptFor` actually
     * took anything, because that is exactly what the break did.
     */
    const spent = new Set();

    for (const { item, continuation, command } of queue) {
      // The cap is real for both kinds. Uncapped, one restart's respawn wave
      // put ten workers into one tick, which split the founder's rate limit
      // ten ways and slow-motioned everything, twice, before two agents
      // independently flagged it (2026-08-05). Un-spawned answers keep their
      // delivery marks unwritten, so the next tick picks them up as slots free.
      // THE REASONS THIS ROW CANNOT SPAWN COME FIRST, ahead of the cap.
      //
      // They used to sit under it, which was free while a full fleet only ever
      // meant "wait". It is not free now: a full fleet can mean "interrupt
      // something", and interrupting a session for a row that was never going
      // to spawn — its answer already settled, already delivered, its claim
      // still held by somebody else — would be a kill that bought her nothing.
      // All three are pure reads of state we already hold, so asking them
      // earlier costs nothing and changes no answer.
      //
      // A session already finished on this answer, and said so on the item
      // rather than only in this process's memory. The mark below is the same
      // promise, made durable: without it, every restart and every resume
      // handed a worker a word the user said days ago, which it read, recognised as
      // done, and exited on inside a minute. Twenty-three times, on one row.
      //
      // A row still leased to someone else would refuse this worker the claim,
      // and the mark written further down would then be a delivery that never
      // happened, permanently. Wait for the lease instead.
      if (continuation
        && (answerSettled(item) || this._answerDelivered(item) || this.claimHeldElsewhere(item))) continue;
      /*
       * A COMMAND THE USER TYPED NEVER QUEUES, EVEN WITH EVERY SLOT FULL.
       *
       * Asked above the cap, and sorted to the front of the queue above that,
       * because the cap breaks rather than skips. The guards over this line
       * have already sent back anything settled, already delivered, or leased
       * to somebody else, so a command takes exactly the door an ordinary
       * continuation takes and skips only the waiting. spawnWorker's own cap
       * lets a continuation past already. */
      if (command) {
        this._handledAnswers.add(this._answerKey(item));
        this._saveState();
        this.spawnWorker(item, { continuation: true });
        continue;
      }
      // WHICH SUBSCRIPTION THIS ROW WOULD SPEND, asked once here and again
      // inside `spawnWorker`. Two asks of the same pure method, not two
      // decisions: `_engineFor` is the only line in the app that decides, and
      // reading `item.engine` here instead would be a second one that could
      // disagree with it.
      const engine = this._engineFor(item);
      if (!this._hasSlotFor(engine)) {
        // an Urgent row takes a slot rather than queueing behind work that
        // matters less. At most ONE session is interrupted per engine per
        // tick, and the urgent row spawns on the next one — the child has to
        // exit before its slot is really free, and an exit nudges a tick, so
        // the ordinary cost of this is seconds rather than the fifteen-second
        // poll.
        if (!spent.has(engine)) {
          spent.add(engine);
          this._preemptFor(item, items, engine);
        }
        // AND ON DOWN THE QUEUE, because the next row may be on the engine
        // that is still idle. See `spent` above for what this used to be.
        continue;
      }
      if (!continuation) { this.spawnWorker(item); continue; }
      this._handledAnswers.add(this._answerKey(item));
      this._saveState();
      this.spawnWorker(item, { continuation: true });
    }

    // THE HOLD IS ONLY EVER ABOUT GETTING THE URGENT ROW STARTED, so it lets
    // go the moment it is. Asked again here rather than only at the top of the
    // next tick: the row we interrupted becomes resumable in the same pass
    // that spawns the row we interrupted it for, and waiting a tick to notice
    // would leave a slot standing empty for fifteen seconds.
    this._settleRunNow(items);
    this._settlePreemptions(items, now);

    // The digest: NOT a schedule, an INVARIANT. So
    // nothing fires on a clock. Every tick asks whether the invariant holds
    // and, where it does not, spawns the one session that makes it hold.
    //
    // That is what makes downtime free. A machine off from Friday to Monday
    // finds, on Monday, exactly one digest owed, because six were never
    // representable: there is no queue of missed firings to catch up on, only
    // a condition that is currently false. It is also why the one repeat rule
    // the app does have (main/repeats.mjs) is an invariant and not a chain. A
    // chain in which each digest books the next one stops forever the first
    // time a run dies, and the thing that would have noticed is the run that
    // died. Nothing here books anything: a period is owed, or it is not.
    for (const product of this.store.listProducts()) {
      // The practice project is not a project anybody works in (`worksHere`).
      if (!this.worksHere(product)) continue;
      if (this.paused) continue;
      // A digest is what a STANDING GRANT trades an inbox row for. Without a
      // grant, finished work still reaches her as a review, and a digest on
      // top of that would be the second telling, not the only one.
      if (!autonomous.has(product.slug)) continue;
      if ([...this.sessions.values()].some((s) => s.product === product.slug)) continue;
      if (now - (this.lastDigestTry[product.slug] ?? 0) < DIGEST_RETRY_MS) continue;
      // A DIGEST RUNS ON THIS MAC'S HOME ENGINE: Claude Code, or Codex on a Mac
      // with nothing else. It carries a synthetic row with no engine on it, so
      // the slot it checks and the engine `spawnDigest` forces are one answer.
      if (!this._hasSlotFor(this._homeEngine())) break;
      const owed = this._digestOwed(items, product.slug, now);
      if (!owed) continue;
      this.lastDigestTry[product.slug] = now;
      this._saveState();
      this.spawnDigest(product, owed);
    }

    // THE DRIVE RAN HERE AND IT IS GONE (w-d19d6d387c).
    // Self-driving meant the system, not the founder, asking "what next?" when
    // a product went quiet, and spending the user's plan on the answer. An app
    // that spends someone's plan on work they did not ask for should not exist,
    // so the code was removed entirely. It had been off by default since
    // w-8cb4d3ffc3, and the machinery was kept for a paid tier that no longer
    // justifies it.
    //
    // So nothing in this app spawns work the founder did not ask for. What
    // spawns now, and the whole list: her own tasks, her answers, the tasks
    // agents file on a project she has marked autonomous, the repeats she set,
    // and the digests.
  }

  // Repeating tasks: the same INVARIANT the digest is, applied to work she set
  // once. Every tick asks whether the current period has been served and, where
  // it has not, creates the one run that serves it. The run carries the founder
  // label, so the fresh-work pass spawns it: nothing here spawns anything.
  //
  // Nothing fires, which is what makes downtime free. A machine off from Friday
  // to Monday finds ONE period unserved, because four were never representable.
  // And nothing books the next run, so a run that dies costs one day rather
  // than costing the task.
  async serveRepeats(now = Date.now()) {
    if (!this.store.repeats) return;
    for (const product of this.store.listProducts()) {
      // The practice project is not a project anybody works in (`worksHere`).
      if (!this.worksHere(product)) continue;
      let due = [];
      try {
        due = this.store.repeats.due(product.dir, now);
      } catch (err) {
        console.warn(`repeats: could not read ${product.slug}: ${err.message}`);
        continue;
      }
      for (const { rule, key } of due) {
        let out = null;
        try {
          out = await this.store.repeats.serve(product.dir, rule.id, key, now);
        } catch (err) {
          // One unreadable rule must not stop every other product's runs.
          console.warn(`repeats: could not serve ${rule.id} in ${product.slug}: ${err.message}`);
          continue;
        }
        if (!out?.alert) continue;
        this.store.fileItem(product.slug, {
          title: `${rule.title}: the last ${out.misses} runs did not finish`,
          body: [
            'This repeating task has been superseded on each of these days,',
            'meaning the run was still going when the next one came due:',
            '',
            out.alert.map((day) => `- ${day}`).join('\n'),
            '',
            'It is still running every day. Something is stopping it from',
            'finishing, and that is worth a look rather than a quiet stop.',
          ].join('\n'),
          kind: 'review',
        });
      }
    }
  }

  // Whether this product owes the founder a digest right now, and what one
  // would cover. Null means the invariant already holds, which is the ordinary
  // answer: most ticks find nothing owed and do nothing.
  //
  // The last digest row IS the watermark, deliberately. It lives in the store,
  // so it survives an app restart, a reboot, and a store restored onto another
  // machine, and two Zeros reading the same account cannot disagree about when
  // the last one went out.
  _digestOwed(items, slug, now) {
    const mine = items.filter((i) => i.product === slug);
    const isDigest = (i) => (i.labels ?? []).includes('digest');
    const digests = mine.filter(isDigest);
    let newest = null;
    for (const d of digests) if (!newest || (d.createdAt ?? 0) > (newest.createdAt ?? 0)) newest = d;
    // The floor on frequency. Bi-daily read as "no more often than every twelve
    // hours" rather than "at 6 and 18", which is precisely what makes an
    // arbitrary stretch of downtime collapse to one digest instead of six.
    if (newest && now - (newest.createdAt ?? 0) < DIGEST_MIN_MS) return null;
    // A digest with no news is a row that says nothing, which is the thing she
    // asked us to stop. Silence is the correct output for a quiet stretch.
    const since = newest?.createdAt ?? 0;
    // A clean run is not news, here as much as in her inbox: counted, daily
    // quiet runs would manufacture a digest every twelve hours forever.
    const news = mine.filter((i) => !isDigest(i) && !isCleanRun(i)
      && i.status === 'done' && (i.updatedAt ?? 0) > since);
    if (!news.length) return null;
    // An open digest is REWRITTEN to cover the wider window, never joined by a
    // second row.
    const open = digests.find((i) => i.status !== 'done');
    return { openId: open?.id ?? null, since, count: news.length };
  }

  spawnDigest(product, owed) {
    const covering = owed.since
      ? `everything since the last digest was written (${new Date(owed.since).toISOString()})`
      : 'everything this product has finished so far';
    this.spawnWorker({
      id: `digest-${Date.now().toString(36)}`,
      product: product.slug,
      title: `${product.name}: the digest is owed`,
      kind: 'digest',
      body: [
        'This is a DIGEST session. There is no ledger item behind this id, so',
        'skip the claim step entirely; everything else in the brief holds.',
        '',
        `Write the founder ONE digest covering ${covering}.`,
        `${owed.count} item(s) have finished in that window.`,
        '',
        owed.openId
          ? `A digest row is already open: ${owed.openId}. REWRITE ITS BODY so it`
            + ' covers the whole window. Do not create a second row, and do not'
            + ' append to its note. She reads one row; make that row true.'
          : 'No digest row is open, so create one: kind review, label digest.',
        '',
        'THE DIGEST IS NEWS, NOT A GATE. Nothing in it should need an answer.',
        'Anything that genuinely needs her decision is its own item and is not',
        'repeated here beyond a line saying it is waiting.',
        '',
        'Write the body, never the note: the body holds four times as much, and',
        'a note that fills is what put five digests in her inbox on 2026-08-06.',
        'If the news does not fit, summarise harder. It never becomes a second',
        'row. Length is not the measure; she should be able to read it in a',
        'minute and know what her company did.',
        '',
        'Lead with what changed that she would care about, in her own product',
        'vocabulary, not ours. Group by what it means, not by item id. Say what',
        'was spent and what went live, if anything. Where nothing happened in',
        'some lane that matters, saying so plainly is worth more than padding.',
      ].join('\n'),
    }, { engine: this._homeEngine() });
  }

  // A founder reply that lands while a session runs must not die with it: the
  // worker never saw it, and whatever status it wrote (done included) was
  // written in ignorance of the reply. On exit, if the item's answer changed
  // since spawn, a continuation carries the founder's words immediately.
  deliverMidflightReply(spawnedItem, answerAtSpawn) {
    try {
      const current = this.store.listItems().find((i) => i.product === spawnedItem.product && i.id === spawnedItem.id);
      if (!current?.answer) return;
      // Repeating the same words later is a new delivery. Ignore unrelated
      // item updates, but include the ledger's answer timestamp in identity.
      if (current.answer === answerAtSpawn
        && (current.wrote?.answer?.ts ?? 0) === (spawnedItem.wrote?.answer?.ts ?? 0)) return;
      if (current.answer === '(withdrawn)') return; // a cancel, not a reply
      if (this.sessions.has(current.id)) return;
      if (this._answerDelivered(current)) return;
      this._handledAnswers.add(this._answerKey(current));
      this._saveState();
      this.spawnWorker(current, { continuation: true });
    } catch {}
  }

  /* -------------------------------- spawning ------------------------------ */
  // Everything about a spawn that is a decision, separate from process
  // plumbing so tests can pin it.
  //
  // THE PERSONAL BRANCH IS GONE FROM HERE (w-d19d6d387c, 2026-09-22). A
  // personal project's spawn took her message as its whole prompt, with no
  // brief, its own grants and its own session memory, and every paragraph
  // below had a second version for it. Every project is a project now.
  //
  // `engine` DEFAULTS TO CLAUDE CODE so every existing caller reads exactly as
  // it did. It is here for the two resume paths only: a session belongs to the
  // harness that wrote it, and a thread id handed to the wrong CLI dies on
  // arrival with "No conversation found with session ID".
  spawnPlan(item, product, { continuation = false, resumeSessionId = null, engine = DEFAULT_ENGINE, shipFailure = null } = {}) {
    // A ROW'S OWN CHAT. Her reply on a row goes back to the session that wrote
    // what she is replying to. Four guards, and each one falls back to the old
    // behaviour rather than to anything worse:
    //
    //   `continuation` and a live answer, so this is a spawn that exists
    //   BECAUSE the user wrote on the row. Fresh work is briefed as it always was.
    //
    //   `!resumeSessionId`, so the wake sweep still wins outright. That path
    //   knows which session it interrupted and is resuming a run that never
    //   finished; this one is a run that finished and is being written back to.
    //
    //   `rowSessionFor` itself, which returns null unless the row, the product,
    //   the folder and the transcript on disk all still agree.
    const rowChat = continuation && !resumeSessionId
      && item.answer && item.answer !== '(withdrawn)'
      ? this.rowSessionFor(item, product)
      : null;
    // WHICH SESSION THIS IS, if it is not a new one. A worker resumes when the
    // wake sweep hands the id over, and also when the row has a chat of its
    // own; a row picked up fresh has no session to go back to.
    // A FORK STARTS ON SOMEBODY ELSE'S CONVERSATION, ONCE (MP-08). The row
    // carries `fork:<source row>` from `/fork` and has no chat of its own yet,
    // so the SOURCE row's chat is resumed, with `--fork-session` below, which
    // mints a new id and leaves the original thread exactly as it was. The
    // moment this row has a chat of its own, `rowChat` answers first and
    // nothing ever forks twice.
    const forkFrom = !rowChat && !resumeSessionId ? this.forkSourceFor(item, product) : null;
    const resumeIdOnDisk = resumeSessionId ?? rowChat?.sessionId ?? forkFrom?.sessionId ?? null;
    // AND WHICH SUBSCRIPTION IT LIVES ON. A resume is only a resume on the
    // account that started it: the transcript sits under that profile's home
    // and under no other. She holds two Claude logins and spawns round-robin
    // across them, so half of her replies handed `--resume` an id the other
    // home had never heard of. The CLI printed "No conversation found with
    // session ID" and exited in under a second. spawnWorker uses this instead
    // of picking, and null still means pick.
    //
    // A ROW CHAT CARRIES ITS OWN ANSWER TO THIS and needs no disk walk: every
    // entry in that map was written by a session we watched start, so the
    // account it ran on is recorded rather than inferred. `rowSessionFor` has
    // already confirmed the transcript is really in that home.
    const walkedHome = !rowChat && !forkFrom && resumeIdOnDisk
      ? this.profileHoldingSession(resumeIdOnDisk, item.id, product)
      : null;
    // AND THE SAME GUARD FOR A THREAD WHOSE LOGIN HAS GONE. THE ID GOES WITH
    // THE ACCOUNT, never on its own: a resume id handed to whichever login the
    // round robin lands on is an id that home has never heard of, the CLI
    // prints "No conversation found" and dies in a second. So this drops both,
    // and the thread is briefed fresh instead.
    const strandedThread = !!walkedHome && this._profileCannotHoldAChat(walkedHome, engine);
    const resumeId = strandedThread ? null : resumeIdOnDisk;
    // The fork's account is the source conversation's account, for the reason
    // every line above gives: a resume is only a resume on the login whose home
    // holds the transcript.
    const resumeProfile = rowChat
      ? (rowChat.profile ?? null)
      : (forkFrom ? forkFrom.profile ?? null : (strandedThread ? null : walkedHome));
    // Preserve multiple replies queued before a worker starts, including on a
    // resumed session whose native history has not seen them yet.
    if (continuation && item.answer && this.store?.readHistory) {
      const answer = queuedReplyText(item, this.store.readHistory(item.product, item.id), (row) => this._answerDelivered(row));
      if (answer !== item.answer) item = { ...item, answer };
    }
    let prompt;
    // THE TWO KINDS OF RESUME SAY DIFFERENT THINGS, and handing a finished
    // session the interrupted wording would tell it to go looking for a step it
    // never left half-done. `replyBrief` is the one for a chat.
    if (rowChat) prompt = this.replyBrief(item, { product });
    // A FORK IS NOT AN INTERRUPTED SESSION AND MUST NOT BE TOLD IT IS. It is
    // the old conversation under a new id, on a new row, and the one thing it
    // cannot work out for itself is that it has moved.
    else if (forkFrom) prompt = this.forkBrief(item, { product, from: forkFrom.sourceId });
    else prompt = resumeId ? this.resumeBrief(item, { continuation, product }) : this.buildBrief(item, product, { continuation, engine });
    // A BRANCH THE APP COULD NOT SHIP (main/ship-queue.mjs) goes back to the
    // session that wrote it, and that is all it is told: it has everything
    // else already. A fresh session gets its brief first.
    if (shipFailure) prompt = resumeId || rowChat ? shipFailure : `${prompt}\n\n${shipFailure}`;
    // A project may override what its own sessions may do. Absent (the normal
    // case) means the workspace default, which is why this is a lookup with no
    // entry rather than a copy of the default written onto every project: a
    // copy is a grant that stops tracking the one place grants are reviewed.
    const override = this.projectSessionArgs(item.product);
    const base = override ?? this.defaultSessionArgs();
    // WHAT THE USER SAID THIS ONE REPLY MAY DO, which outranks the project and the
    // workspace for exactly this run.
    //
    // It rewrites only the --permission-mode flag; every other grant in her
    // list survives, because buildSessionArgs carries the model, the tools and
    // everything else through untouched. A value that is not one of Claude
    // Code's six is ignored rather than passed to the CLI.
    const oneOff = CLAUDE_MODES.includes(item.answerMode) ? item.answerMode : null;
    // THE USER'S CONFIG GOES TO THE CLI AS WRITTEN, and only a one-off rewrites
    // it. This was briefly the other way round, running every spawn through
    // buildSessionArgs so that exactly one permission flag always reached the
    // CLI, and that was the wrong trade: the parser cannot know the arity of
    // flags it does not own, so a value that happens to look like a flag gets
    // read as one and its owner is left dangling. Rewriting a config the user typed
    // by hand, on every spawn, to fix a display problem is not worth that.
    //
    // The display problem is fixed at the reading end instead: permissionMode
    // now understands the equals form and the bypass shorthand, so the screen
    // names whatever her flags really add up to. Caught in review, 2026-08-23.
    const grants = oneOff ? buildSessionArgs(base, oneOff) : base;
    /*
     * THE USER TYPED ONE OF CLAUDE CODE'S OWN COMMANDS, so the command is the
     * whole prompt and the brief is skipped.
     *
     * The eight supported ones are in the reply box's slash menu;
     * shared/claude-commands.mjs is the list and the reason.
     *
     * IT HAS TO REPLACE THE PROMPT RATHER THAN RIDE IN FRONT OF IT, and that is
     * measured rather than assumed. On 2026-08-27 a prompt of `/context`, a
     * blank line and a real question returned the context table and nothing
     * else: 142 lines, zero mentions of the question. A command eats whatever
     * is attached to it, so a brief wrapped around one would be silently
     * discarded and the worker would look like it had ignored her.
     *
     * THREE GUARDS, AND EACH IS A DIFFERENT WAY OF NOT DOING THIS BY ACCIDENT:
     *
     *   `continuation` means this spawn exists BECAUSE the user wrote on the row.
     *   Without it, `item.answer` sits on the row for good and an ordinary wake
     *   three hours later would run /context instead of the work.
     *
     *   `commandPrompt` returns null for everything that is not exactly one of
     *   the eight, so an ordinary message can never lose its brief. A brief
     *   skipped by accident is a worker that does not know which row it is on.
     *
     *   AND THE ENGINE, because the eight are Claude Code's own words and this
     *   is the last place before they become a prompt. `/context`, `/compact`,
     *   `/usage` and `/mcp` are not words the Codex CLI knows, and on that
     *   engine the prompt is not argv at all: `_spawnCodexWorker` hands
     *   `plan.prompt` straight to a turn's `input`, so one of the eight would
     *   reach it as her message with the brief thrown away. The reply-box menu
     *   does not offer them on a Codex row (renderer/src/slash-menu.ts), and
     *   this is the half that holds when she types one by hand.
     *
     * Measured with the exact flags built below: `/context` emits a real
     * `assistant` text event carrying the table and then result/success, so the
     * trace this app already
     * keeps puts it in the thread with nothing new written to show it. */
    const review = continuation && engine === 'codex' && providerCommand(item.answer, engine)?.name === 'review' ? providerCommand(item.answer, engine) : null;
    const command = continuation && engine === DEFAULT_ENGINE ? commandPrompt(item.answer, this._nativeCommands?.[item.id]) : review ? item.answer.trim() : null;
    if (command) prompt = command;
    // WHICH MODEL. A model named on the task wins; absent that, the workspace
    // setting, which lives in the `--model` flag inside sessionArgs. A PERSONAL
    // SESSION IS NOT GIVEN A TASK'S MODEL: it runs on the workspace's own.
    //
    // AND IT IS ASKED FOR THIS ENGINE, WHICH IS THE HALF THAT WAS MISSING. This
    // read `item.model` outright, so a row marked for the other harness handed
    // its slug to whichever CLI happened to be running -- measured 2026-09-05:
    // `engine: "codex", model: "gpt-5.6-sol"` on a Mac with no Codex resolved to
    // `--model gpt-5.6-sol` on a Claude Code command line. `modelForEngine` in
    // shared/engines.mjs is the rule and says why the two fields are one choice.
    // Nothing here runs on a null it produces: `spawnWorker` refuses the row
    // before this method is reached, so the only null that gets this far is a
    // row with no model on it at all.
    const model = modelForEngine(item, engine);
    // A model on the task rewrites the `--model` already in her session args
    // rather than being appended beside it: two `--model` flags is a coin flip.
    const claudeGrants = model ? setModelArg(grants, model) : grants;
    // HOW HARD IT THINKS. A level named on the task rides beside the model: as
    // `--effort` for Claude Code, as `turn/start`'s `effort` for Codex
    // (`codexTurnParamsFor`). Nothing named sends nothing, and the engine
    // chooses for the model. Same rule as the model above.
    //
    // TWO GATES, ONE PER ENGINE, because the words differ. Claude Code's is the
    // CLI's own five (shared/effort-levels.mjs): a stray word on its command
    // line would stop the run with a usage error instead of running the task,
    // so any other word is dropped here. Codex's levels are per model and read
    // off this Mac, so the plan carries any word SHAPED like a level and
    // `codexEffortRefusal` judges it against the model at `thread/start`, the
    // same place and the same shape as the model refusal.
    const effort = isEffortWord(item?.effort) ? item.effort : null;
    const claudeEffort = engine === DEFAULT_ENGINE && isEffort(effort) ? effort : null;
    // Without it the CLI emits ONE `assistant` event per finished message, so
    // a sentence exists nowhere until the model has written the last word of
    // it. Measured over her 1,664 traces on 2026-08-25: the median wait before
    // a line of an agent's prose appears is 8 seconds, the 90th is 35, and 452
    // of those waits are over a minute. With the flag the same stream carries
    // `stream_event` frames and the text arrives in pieces while it is being
    // written; measured on the real binary (2.1.245) with a two-sentence
    // answer, the first text reached us at 3,279ms against 4,508ms for the
    // finished message, and a long answer is where the whole gap lives.
    //
    // NOTHING DOWNSTREAM OF HERE CHANGED. The trace on disk is still written
    // from the finished `assistant` event only (`traceStreamLine`), so what is
    // kept is whole sentences and never a half-typed one; the pieces live on
    // the session in memory and die with it, which is what `saying` below is.
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages', ...claudeGrants];
    if (claudeEffort) args.push('--effort', claudeEffort);
    // Her standing instructions, on every session there is: workers, digests,
    // and every resumed turn of a thread that started before the user wrote the
    // rule. This is the ONE place a session's arguments are built, which is why
    // they cannot miss a path.
    //
    // They ride in the SYSTEM prompt rather than in the text so that a rule
    // cannot be buried by a 200-line brief that arrives after it.
    //
    // Her PROJECT instructions ride in the same flag, after the standing ones,
    // because the two are the same idea at two altitudes and reading order is
    // the only thing that says which outranks which. One file per project,
    // in its docs dir; a project without one is briefed exactly as it was
    // before this existed, which is why nothing had to migrate.
    //
    // The message rules ride LAST, and last is where the weakest voice
    // belongs: it is the only block here she did not necessarily write, so her
    // standing instructions and her project instructions both sit above it and
    // the framing line inside it says out loud that they win. Emptying the box
    // in settings drops the user's own words; the app's rules stay
    // (w-3ec9f07978), because the inbox reads every message by them.
    //
    // SINCE w-3dc46f3a67 THIS BLOCK IS BOTH MESSAGE DOCUMENTS, not just the
    // finishing half. The writing rules used to be spliced into the worker
    // brief instead, which a personal task never gets; they are one document
    // now and this is the single point every kind of run passes through.
    const standing = this.standingInstructions();
    const project = this.projectInstructions(item.product, product);
    const messages = this.messageRules();
    // ADHD MODE RIDES DIRECTLY UNDER THE MESSAGE RULES, and only while it is on
    // (w-5737fe67cf): its text is appended while the mode is on and removed
    // when it is turned off.
    const adhd = this.adhdRules();
    // {{name}} and {{Name}} become the app's name here too, on the same rule as
    // buildBrief: these blocks are markdown files that cannot import it, and
    // her own copies keep the tokens so a rename reaches her edits as well.
    const system = fillName([standing, project, messages, adhd].filter(Boolean).join('\n\n'));
    if (system) args.push('--append-system-prompt', system);
    if (resumeId) args.push('--resume', resumeId);
    // AND THE ONE FLAG THAT MAKES IT A FORK RATHER THAN A CONTINUATION: the
    // resumed conversation is written on under a NEW id, so the row it came
    // from keeps its own thread untouched (MP-08).
    if (forkFrom && resumeId) args.push('--fork-session');
    /*
     * `command` GOES BACK WITH THE ARGUMENTS, because the exit handler has to
       know what this run was. A command run does not write on the row and is
       not supposed to: its answer is the text in the thread. settleDelivery's
       ordinary test is "did an agent speak on the row since the answer", which
       a command run fails, and failing it means her reply is delivered again —
       so /context would run three times and she would read the same table
       three times. */
    /*
     * AND THE SAME THREE FACTS UNPACKED, FOR AN ENGINE WITH NO ARGV.
       `args` is a Claude Code command line and Codex has none: its prompt is a
       turn's `input`, its system block is a thread's `developerInstructions`,
       and its resume is a thread id handed to `thread/resume`. These are the
       identical values already spliced into `args` above -- read off the same
       three variables and not rebuilt -- so the two engines cannot be briefed
       differently by accident. Every existing caller reads `args` and is
       untouched. */
    // `pictures` rides the plan for the same reason `prompt` does: the Codex
    // turn is built from the plan and nothing downstream of here can walk the
    // row again (MP-09). On Claude Code it is unread, and the brief's paths are
    // that engine's way in.
    const pictures = product ? this.attachedPictures(item, product) : [];
    /*
     * `product` AND `answerMode` RIDE THE PLAN for the same reason `prompt` and
       `system` do: the Codex path reads the plan and never the item, and without
       these two it could not tell which project's setting applied or that she
       had picked a mode for this one message. Caught 2026-09-23 while wiring the
       Codex chip: `effectiveCodexMode(plan?.product ?? '')` was resolving
       against an empty slug on every run, so a per-PROJECT Codex mode silently
       never applied and every worker got the workspace default. The Claude path
       never noticed because it reads `item.answerMode` directly, a few hundred
       lines up.
     */
    return { args, command: !!command, ...(review ? { reviewTarget: reviewTarget(review.args) } : {}), resumeProfile, prompt, system, resumeId, model, effort, product: product?.slug ?? null, answerMode: item?.answerMode ?? null, ...(pictures.length ? { pictures } : {}) };
  }

  commandCatalog(product, id) {
    const item = this.store.readItem(product, id);
    return item && this._engineFor(item) !== 'codex' ? this._nativeCommands?.[id] ?? [] : [];
  }

  remoteControl(product, id, action) { return taskRemoteControl(this, product, id, action); }

  commandItem(product, id, text) { return taskCommand(this, product, id, text); }

  /**
   * THE ANSWER A COMMAND LEFT, WHILE IT IS STILL THE NEWEST THING ON THE ROW.
   *
   * A command's answer must not sit at the bottom of the thread forever. One
   * result per task is published here and the pane draws it at the foot of the
   * thread, and nothing ever took it down. It is saved with the session state,
   * so a restart brought it back too, and a `/fork` answer sat under messages
   * written hours later, reading as though the command had just run again.
   *
   * A PREDICATE RATHER THAN A TIMER, on this codebase's usual rule for anything
   * that expires. The answer belongs to the moment the command ran, so it
   * shows until the row has moved on, and the row's own `updatedAt` is what says
   * that. Nothing fires and nothing sweeps, and a restart cannot resurrect it
   * because the comparison is made every time it is read. A command still
   * RUNNING is exempt: taking that away mid-run would look like it had died.
   */
  compactionStatus(product, id) {
    const value = this._compactions?.[JSON.stringify([product, id])] ?? null;
    if (!value) return null;
    if (value.state === 'running' || value.state === 'pending') return value;
    let item = null;
    try { item = this.store.readItem?.(product, id) ?? null; } catch { item = null; }
    if (!item) return null;
    return (item.updatedAt ?? 0) > (value.at ?? 0) ? null : value;
  }

  compactItem(productSlug, id) {
    const key = JSON.stringify([productSlug, id]);
    if (this._compactionJobs?.has(key)) return this.compactionStatus(productSlug, id);
    const publish = state => {
      this._compactions ??= {};
      const value = { state, at: Date.now() };
      this._compactions[key] = value;
      // One latest result per task, persisted with the existing session state.
      this._saveState(); this.onChange?.();
      return value;
    };
    const item = this.store.readItem(productSlug, id);
    if (!item || this._engineFor(item) !== 'codex') return publish('unavailable');
    if (this.sessions.has(id)) return publish('busy');
    const product = this.store.listProducts().find(p => p.slug === productSlug);
    if (!product) return publish('missing');
    const rec = this.rowSessionFor(item, product);
    if (!rec?.sessionId) return publish('missing');
    this._compactionJobs ??= new Map();
    if ([...this._compactionJobs.values()].some(job => job.threadId === rec.sessionId && job.profile === rec.profile)) return publish('busy');
    this._compactionJobs.set(key, { threadId: rec.sessionId, profile: rec.profile });
    const initial = publish('running');
    Promise.resolve().then(async () => {
      const { client, handshake } = this._codexServer(this._codexProfileHome(rec.profile ?? 'default'));
      const mcpServers = await this._codexIsolation(client, handshake);
      const cwd = product.repoPath && fs.existsSync(product.repoPath) ? product.repoPath : product.dir;
      // Same isolated configuration as a worker, with no store tool needed:
      // compaction summarizes the existing thread and never starts an agent turn.
      const params = workerThreadParams({ cwd, mcpServers, storeServer: null });
      return compactCodexThread({ server: client, threadId: rec.sessionId, threadParams: params });
    }).then(publish, () => publish('failed')).finally(() => {
      this._compactionJobs.delete(key);
      this._releaseIdleCodex(rec.profile ?? 'default');
    });
    return initial;
  }

  /* ------------------------ project instructions -------------------------- */
  // The project layer of her rules. It lives in the project's own docs dir,
  // rather than in this repo: the store is where a project's documents belong,
  // and a rule about Agentbox has no business in the app's git history.
  //
  // `dir` is passed when the caller already has the product record, which the
  // spawn path does; everything else looks it up.
  projectInstructionsFile(slug, product = null) {
    const dir = product?.dir ?? this.store.listProducts().find((p) => p.slug === slug)?.dir;
    return dir ? path.join(dir, 'instructions.md') : null;
  }

  // Read fresh at every spawn, never cached, for the same reason her standing
  // instructions are: she edits these from the app while the fleet is running,
  // and a rule that waits for a restart is one she will rightly believe was
  // ignored. An empty or missing file contributes nothing at all.
  projectInstructions(slug, product = null) {
    const file = this.projectInstructionsFile(slug, product);
    if (!file) return null;
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8').trim();
    } catch {
      return null;
    }
    if (!text) return null;
    // ONE framing line, and it exists to settle precedence out loud. A session
    // reads several documents about a project and has no other way to know
    // that these particular words are the founder's own rules for it, or that
    // the block above them wins where the two disagree.
    const name = product?.name ?? this.store.listProducts().find((p) => p.slug === slug)?.name ?? slug;
    return [
      `Standing instructions for ${name} specifically, from the founder. They apply to`,
      'every session on this project. Where they conflict with her workspace-wide',
      'instructions above, those win.',
      '',
      '---',
      '',
      text,
    ].join('\n');
  }

  readProjectInstructions(slug) {
    const file = this.projectInstructionsFile(slug);
    if (!file) throw new Error('no such project');
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return '';
      throw err;
    }
  }

  // Written whole through a rename, like the standing file: the fleet reads
  // this on every spawn, so a half-written save is a session briefed with half
  // a rule. Emptying the box DELETES the file, so "no instructions" is one
  // state on disk rather than two that behave the same and read differently.
  writeProjectInstructions(slug, text) {
    const file = this.projectInstructionsFile(slug);
    if (!file) throw new Error('no such project');
    if (typeof text !== 'string' || !text.trim()) {
      try { fs.unlinkSync(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
      return;
    }
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
  }

  // Per-project grants, when the founder has set them. Null means the
  // workspace default, and null is the answer for anything malformed: a
  // half-written override must never become a narrower or wider grant by
  // accident.
  projectSessionArgs(slug) {
    const map = this.config.projectSessionArgs;
    if (!map || typeof map !== 'object') return null;
    const args = map[slug];
    return Array.isArray(args) ? args : null;
  }

  // THE STATE PAGE USED TO BE HERE AND IS GONE.It was optional from and off by
  // default, and off is how her own workspace had it while every session went
  // on maintaining the file anyway, 731,396 characters of it.
  // tests/the-state-page-is-gone.test.mjs has the measurements and keeps it
  // out. Nothing replaced it: a row carries its own history.

  // THE RULE ABOUT WHEN WORK GETS ITS OWN ROW had a switch here, read off
  // `subagentRule: false`. It is always on now (w-5737fe67cf), because it is a
  // rule and not a preference. Off only took one paragraph out of the brief,
  // and the paragraph is what keeps one piece of work from reaching the user as
  // several rows. A config that still says false is ignored.

  // HOW AGENTS WRITE TO THE USER: the titles, the opening lines, the questions,
  // and the last message a run sends. ONE document (w-3dc46f3a67).
  //
  // IT WAS TWO AND THE SPLIT WAS OURS, NOT THE USER'S. `writing-rules.md` rode
  // inside the worker brief and shaped the messages during a task;
  // `finishing.md` rode in the system prompt and shaped the final one. Five
  // editable layers of prompts was too many, so some were merged. A person's
  // rules file tends to be mostly about how agents write to them rather than
  // what agents do. That is what somebody types when they sit down; the seam
  // between the two files is an implementation detail.
  //
  // WHERE IT RIDES, AND WHY THAT IS THE WHOLE DOCUMENT NOW. The writing half
  // used to be spliced into the worker brief, which is the one thing some runs
  // never got, and the finishing half rode in the system prompt where every run
  // passes. Joined, all of it goes through the system prompt at spawnPlan, so
  // there is one place to look and one place for it to fail.
  //
  // TWO PATHS, not one, and the reason is that a packaged build cannot write to
  // itself. The default ships inside the bundle where an agent cannot quietly
  // rewrite it; her copy lives in her own data folder and never in the
  // checkout, for the reason written out in the constructor.
  messageRulesDefaultFile() {
    return path.join(this.appDir, 'briefs', 'message-rules.md');
  }

  messageRulesFile() {
    return path.join(this.userDir, 'briefs', 'message-rules.md');
  }

  // OURS AND THEIRS ARE TWO LAYERS, NOT ONE FILE (w-3ec9f07978). The shipped
  // rules are what the inbox reads every message by: the bold first line the
  // list clips at, the Options section the picker draws, the last message
  // being the answer. A person editing those breaks their own inbox, so they
  // ride from the checkout on every run and are never in the box. The box is
  // only what the user wrote, and it rides above ours so their words win.
  shippedMessageRules() {
    try { return fs.readFileSync(this.messageRulesDefaultFile(), 'utf8').trim(); } catch { return ''; }
  }

  // Read fresh at every spawn, never cached, like everything else she can edit
  // while the fleet is running. Emptying the box takes the user's words out,
  // never ours.
  messageRules() {
    let theirs = '';
    if (this.messageRulesFile() !== this.messageRulesDefaultFile()) {
      try { theirs = fs.readFileSync(this.messageRulesFile(), 'utf8').trim(); } catch {}
    }
    const ours = this.shippedMessageRules();
    // ONE framing line each, for the same reason her project instructions carry
    // one: a session has no other way to know whose words these are, or which
    // wins where the two disagree.
    const blocks = [];
    if (theirs) blocks.push([
      'How the person reading this wants agents to write to them, in their own',
      'words. Where these and the app\'s rules below disagree, these win.',
      '',
      '---',
      '',
      theirs,
    ].join('\n'));
    if (ours) blocks.push([
      'How to write to the person reading this, and how to finish, from the app',
      'they read it in. These are its defaults, so any instruction above this one',
      'outranks them.',
      '',
      '---',
      '',
      ours,
    ].join('\n'));
    return blocks.length ? blocks.join('\n\n') : null;
  }

  // ADHD MODE (w-5737fe67cf, 2026-09-25): a short set of writing rules that ride
  // under the message rules while `adhdMode` is on, and not at all while it is
  // off. Her copy in her data folder if she has edited the box, otherwise the
  // shipped one. Read fresh at every spawn, like the rest of what she can edit.
  // An emptied box means no ADHD rules even with the switch on.
  adhdRules() {
    if (this.config.adhdMode !== true) return null;
    let text = null;
    for (const dir of new Set([this.userDir, this.appDir])) {
      try { text = fs.readFileSync(path.join(dir, 'briefs', 'adhd-mode.md'), 'utf8'); break; } catch {}
    }
    const body = (text ?? '').trim();
    if (!body) return null;
    return ['ADHD mode is on. Follow these rules as well.', '', body].join('\n');
  }

  // What the settings box shows: the user's own words and nothing of ours
  // (w-3ec9f07978), so it opens empty until they write something.
  readMessageRules() {
    try {
      return fs.readFileSync(this.messageRulesFile(), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return '';
      throw err;
    }
  }

  // Written whole through a rename, like her standing instructions: the fleet
  // reads this on every spawn and half a rule is worse than none. Emptying the
  // box leaves an EMPTY FILE rather than deleting it, so "she turned it off" is
  // a state on disk that nothing later mistakes for a fresh install and
  // re-seeds.
  writeMessageRules(text) {
    const file = this.messageRulesFile();
    const tmp = `${file}.tmp-${process.pid}`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, typeof text === 'string' ? text : '', 'utf8');
    fs.renameSync(tmp, file);
  }

  // Her standing instructions live in ONE file, in her own data folder rather
  // than in the checkout. It used to sit in git, on the argument that version
  // control would show her an agent quietly rewriting her rules. That argument
  // had it backwards: being in the checkout is what let agents overwrite it,
  // and the history it left behind was four agent commits and not one line of
  // hers (see `userDir` in the constructor). She edits it from the app, so in a
  // packaged build it is also a brief that cannot live in the read-only bundle.
  standingFile() {
    return path.join(this.userDir, 'briefs', 'founder.md');
  }

  // Read at every spawn, never cached: she edits this from the app while the
  // fleet is running, and an instruction that waits for a restart is one she
  // will rightly believe was ignored. An empty or missing file adds no flag at
  // all, rather than an empty one.
  standingInstructions() {
    try {
      return fs.readFileSync(this.standingFile(), 'utf8').trim() || null;
    } catch {
      return null;
    }
  }

  // What the editor shows: her text as she left it, whitespace and all.
  readStanding() {
    try {
      return fs.readFileSync(this.standingFile(), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return '';
      throw err;
    }
  }

  // Written whole, through a rename, because the fleet reads this file on
  // every spawn: a half-written save is a session briefed with half a rule.
  writeStanding(text) {
    const file = this.standingFile();
    const tmp = `${file}.tmp-${process.pid}`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, typeof text === 'string' ? text : '', 'utf8');
    fs.renameSync(tmp, file);
  }

  /* ---------------------------- the second engine ------------------------- */

  /**
   * WHICH CLI THIS ROW RUNS ON, AND WITH NOTHING IN HER CONFIG IT IS CLAUDE
   * CODE FOR EVERY ROW.
   *
   * This is the ONE line in the app that decides, and it is written as a method
   * rather than inlined so that there is exactly one of it: the branches below
   * ask it once and everything downstream reads the answer off the session.
   *
   * AND IT IS THE ONE PLACE THAT HOLDS THE CAPABILITY TOKEN. `engineFor`
   * returns Claude Code for every input unless the caller hands it the Symbol
   * from shared/engines.mjs; this hands it over only when
   * `config.engineChoice` names the moment she opened the gate, which is a line
   * somebody writes in zero.config.json on purpose. Nothing else in main/ or
   * renderer/src names the Symbol, and the last block of
   * tests/a-codex-row-from-august-still-runs-on-claude.test.mjs holds that as an
   * exact list rather than as an intention.
   *
   * THREE INDEPENDENT REFUSALS, AND ANY ONE OF THEM IS ENOUGH.
   *
   *   THE OPT-IN. No moment in the config, no token, and the answer is the
   *   default whatever the row and the workspace say.
   *
   *   THE BINARY. `found` is a real question now rather than a vacuous one:
   *   main/config.mjs resolves `codexBin` through main/codex-bin.mjs -- a
   *   finder, an existence check, and her setting kept apart from what was
   *   found -- and answers null on a Mac with no Codex. She may have opted in
   *   on the laptop that has it and be reading the same store on one that does
   *   not, so this falls back and RUNS rather than spawning something that dies
   *   on arrival.
   *
   *   THE MOMENT. A row she marked `engine: "codex"` between 2026-08-25 and
   *   08-27 -- which the ledger still carries, because `engine` never left
   *   `WORK_ITEM_FIELDS` -- was not chosen since she opted in, so it is not
   *   honoured and the workspace default answers instead. That is what makes
   *   the opt-in mean "Codex may be chosen from now on" rather than "every row
   *   that ever said codex is now live", and it is the hazard the whole gate
   *   exists for. See `engineChoiceSince` in shared/engines.mjs.
   *
   * AND THE THIRD ONE IS SAID OUT LOUD, because a row that asked for something
   * and did not get it is the system doing something she did not ask for, and
   * CLAUDE.md's rule is that she has to be able to tell. `_sayTheChoiceIsOld`
   * below says it once per row, naming the row, both dates and the remedy, and
   * that is still the count nobody could take from this machine: how many
   * August rows she actually has.
   *
   * THE SCREEN NOW SAYS IT TOO, 2026-09-04, and says it the only honest way:
   * `engineFacts` below resolves each row through THIS method, so the byline
   * names the engine the row is really going to, and a stale August choice
   * reads as the workspace answer rather than as the word on the row. The
   * paragraph here used to say there was nowhere on screen for the fact to go.
   */
  _engineFor(item) {
    // A workspace default applies to new work. A saved chat already belongs to
    // a provider, even when its row omitted the then-default engine. Keep that
    // ownership across default changes; an explicit row choice still wins.
    const saved = item?.id ? this._rowSessions?.[item.id] : null;
    const ownsChat = !!saved?.sessionId && saved.product === item?.product;
    const config = ownsChat && !isEngine(item?.engine)
      ? { ...this.config, engine: engineOf(typeof saved === 'string' ? null : saved.engine), engineAt: null }
      : this.config;
    const ranOn = engineFor(item, {
      config,
      found: this._enginesFound(),
      // THE OPT-IN, AND THE ONLY EXPRESSION IN THE APP THAT PRODUCES THE TOKEN.
      // Derived from the same value the staleness rule reads, so the permission
      // and the moment cannot come apart: there is no way to open the gate
      // without also scoping it.
      enabled: this.engineChoiceOpened() ? ENGINE_CHOICE_ENABLED : undefined,
    });
    // SAID AFTER THE ANSWER, NOT BEFORE IT, so the sentence can name the engine
    // this row will REALLY run on. It said "Claude Code" whatever happened,
    // which is wrong on the one machine where the fallback is not Claude Code:
    // a workspace default of codex. Deriving that a second time inside the
    // warning would be a second copy of `engineFor`'s rule, so the answer is
    // passed in instead.
    if (engineChoiceOnRowIsStale(item, this.config)) this._sayTheChoiceIsOld(item, ranOn);
    return ranOn;
  }

  /**
   * WHICH CODING AGENTS SHE MAY ACTUALLY BE OFFERED ON THIS MAC.
   *
   * `availableEngines` in shared/engines.mjs is UNGATED, and its own header says
   * why that is a live hazard: "A future renderer could draw a picker out of
   * them, and the gate would not stop it -- she would be offered a choice that
   * `engineFor` then refuses, which is its own kind of lie." This is that
   * renderer's slice, and this method is the answer to it. It is the FIRST
   * caller those helpers have ever had, and it is here rather than anywhere
   * else because the offer must be refused by exactly the thing that refuses
   * the routing.
   *
   * SO THE GATE ANSWERS FIRST, from the same expression `_engineFor` reads. A
   * Mac with Codex installed and no moment written in `zero.config.json` gets
   * ONE engine back, which is a screen with nothing new on it -- and that is the
   * honest answer, because every row on that Mac is going to run on Claude Code
   * whatever a picker said. Then the binary, which is `availableEngines`'s own
   * question and is a fact about the machine rather than about the build.
   *
   * ONE ENGINE IS NOT A CHOICE, and no caller has to remember that: the picker
   * draws nothing below two rows, the Settings row is not drawn below two, and
   * the byline names nothing below two. What this returns is a list, so there is
   * no second boolean anywhere that could disagree with it.
   */
  engineChoices() {
    // A Mac with only Codex is offered Codex whether or not the gate is open:
    // one engine is not a choice, so there is nothing for the gate to hold.
    if (this._homeEngine() !== DEFAULT_ENGINE) return availableEngines(this._enginesFound());
    if (!this.engineChoiceOpened()) return availableEngines();
    return availableEngines(this._enginesFound());
  }

  /**
   * WHICH CODING AGENTS ARE ON THIS MAC, as the shape `shared/engines.mjs`
   *  reads. `claude` is false only when the search said it is not here
   *  (main/config.mjs `claudeFound`); a config that never said leaves it true,
   *  which is what it always meant. */
  _enginesFound() {
    return { claude: this.config.claudeFound !== false, codex: !!this.config.codexBin };
  }

  /** What runs when nobody chose: Claude Code, or Codex on a Mac without it. */
  _homeEngine() {
    return homeEngine(this._enginesFound());
  }

  /**
   * WHETHER SHE HAS ASKED FOR A SECOND CODING AGENT AT ALL, WHICH IS NOT THE
   * SAME QUESTION AS WHETHER THERE IS ONE.
   *
   * `engineChoices` above conflates the two on purpose -- a picker must be
   * refused by exactly the thing that refuses the routing -- and that is right
   * for a picker and wrong for the one screen that has to explain an ABSENCE.
   * A Mac where she opened the gate and Agentbox cannot see her Codex has one
   * engine, so every picker draws nothing, and until now so did everything
   * else: no status, no install link, and no way to tell "not installed" from
   * "installed somewhere the search cannot reach". That is precisely the case
   * Claude Code's third state exists for next door.
   *
   * SO THIS IS WHAT SETTINGS DRAWS THE CODEX CARD ON. Nothing else reads it,
   * and nothing routes on it: it grants no permission and produces no token.
   * It is the honest answer to "has this person asked to hear about Codex",
   * and the answer is no on every Mac until somebody writes the moment into
   * `zero.config.json` by hand, which is the point of the gate.
   *
   * It is HERE, in the one file allowed to read the opt-in
   * (tests/a-codex-row-from-august-still-runs-on-claude.test.mjs holds that as
   * an exact list), and `_engineFor` derives the token from this same
   * expression so the permission and the screen cannot come apart.
   */
  engineChoiceOpened() {
    return engineChoiceSince(this.config) !== null;
  }

  /**
   * EVERYTHING THE RENDERER IS TOLD ABOUT ENGINES, ANSWERED HERE AND NOWHERE
   * ELSE, because the two rules it rests on are pinned to this file.
   *
   * `choices` is the list above. `workspace` is what a row that names nothing
   * runs on. `byItem` is every row whose answer DIFFERS from that, keyed by id.
   *
   * SPARSE IN BOTH DIRECTIONS, and that is deliberate rather than thrifty. It
   * rides `zero:snapshot`, which the window refetches every few seconds with
   * every row on it; a map naming every item would grow with her inbox for no
   * reading anybody takes. `byItem[id] ?? workspace` is the whole of the rule on
   * the other side, and on her Mac today this is `{}`.
   *
   * Resolve rows with no explicit engine too: a saved conversation may belong
   * to the old workspace default. The byline and the reply must agree about
   * that ownership. This is a memory lookup, not a scan of transcript files.
   */
  engineFacts(items = []) {
    const choices = this.engineChoices();
    const workspace = this._engineFor(null);
    const byItem = {};
    if (choices.length > 1) {
      for (const item of items) {
        const engine = this._engineFor(item);
        if (engine !== workspace) byItem[item.id] = engine;
      }
    }
    return { choices, workspace, byItem };
  }

  /**
   * THE ENGINE ON A TASK SHE IS COMPOSING, OR NULL, and the door writes nothing
   * else (`zero:compose` in main/ipc.mjs).
   *
   * `engine` has been on the work-item contract the whole time and `zero:compose`
   * has accepted it since before the removal, while `composeItem` quietly
   * dropped it -- so nothing has ever been written and the question of who may
   * write it was left, in shared/engines.mjs, to "the slice that draws a
   * picker". This is that slice and this is the answer.
   *
   * A CHOICE SHE COULD NOT HAVE BEEN OFFERED IS REFUSED AT THE DOOR. The picker
   * is not drawn on a one-engine Mac, so nothing SHOULD send one; but the door
   * is reachable by a renderer left open across a config change, and a line
   * written now carries a `wrote.engine.ts` recent enough to be honoured the day
   * she does open the gate. The refusal is on the fact rather than on the
   * expectation.
   *
   * AND NAMING THE ENGINE THE ROW WOULD HAVE RUN ON ANYWAY IS NOT A CHOICE.
   * Every field written is a field the fold carries for ever, so a row marked
   * with the answer it was going to get carries no news.
   *
   * THAT USED TO BE SPELLED `enginePicked`, WHICH MEANS "NOT CLAUDE CODE", AND
   * THE TWO ARE ONLY THE SAME SENTENCE ON A MAC WHERE THE WORKSPACE DEFAULT IS
   * CLAUDE CODE (2026-09-05). Set `config.engine` to Codex in Settings and her
   * explicit "With Claude Code." in the composer was refused here, filed as no
   * engine at all, and then answered by that very default: the composer said
   * one engine and the row ran on the other, and a repeating rule took the same
   * path so every future run inherited it. Claude Code being the DEFAULT is
   * not the same fact as Claude Code being what THIS row resolves to.
   *
   * So the question is asked against the row's own answer -- `_engineFor(null)`
   * is exactly what a row naming nothing gets -- and both directions fall out
   * of the one comparison: her Claude Code is written where the workspace says
   * Codex, her Codex is not written where the workspace already says Codex, and
   * on a Mac with one engine the two can never differ, so nothing is ever
   * written and every row she has sent reads exactly as it did.
   */
  engineOffered(engine) {
    if (!isEngine(engine)) return null;
    if (!this.engineChoices().some((e) => e.id === engine)) return null;
    return engine === this._engineFor(null) ? null : engine;
  }

  /**
   * THE MODEL ON A TASK SHE IS COMPOSING, OR NULL BECAUSE THE ENGINE IT BELONGS
   * TO WAS JUST REFUSED (`zero:compose` in main/ipc.mjs).
   *
   * `engineOffered` above has always refused a choice she could not have been
   * shown, and `model` was forwarded RAW beside it. So a card that remembered
   * Codex, sent from a Mac that does not offer it, filed
   * `{ engine: undefined, model: "gpt-5.6-sol" }`: the engine correctly dropped,
   * the OTHER HARNESS'S SLUG still on the row.
   *
   * AND THAT ROW IS WORSE THAN THE ONE THE GATE REFUSED. With no `engine` on it,
   * `modelForEngine` in shared/engines.mjs has nothing to compare against, so
   * the cross-harness guard in `spawnWorker` cannot see it either -- the row goes
   * straight to `claude --model gpt-5.6-sol`. Correcting one half of a pair and
   * keeping the other is how a refusal becomes a worse row than no refusal.
   *
   * THE TEST IS "DID THE ENGINE SURVIVE", NOT "IS THIS A CODEX WORD". Which
   * slugs each harness knows is a fact about the Mac and is answered where the
   * run is built (`codexModelRefusal`); here the fact in hand is which engine
   * the card was writing FOR, and whether the door filed that engine or another
   * one. Two questions, two answers, and this one needs no list.
   *
   * A MODEL IS RETURNED EXACTLY AS IT ARRIVED, never trimmed or coerced, so a
   * card that sent no engine -- which is every card on every Mac today -- reaches
   * `composeItem` byte for byte as it did.
   *
   * AND A FILED `null` NO LONGER MEANS "THIS ROW RUNS ON CLAUDE CODE", which is
   * what this read it as. `engineOffered` above now also answers null for the
   * engine a row resolves to on its own, so on a Codex-default workspace her
   * Codex model would have been dropped off a row that really does run on
   * Codex. What the pair has to agree about is the engine the row ACTUALLY
   * gets, so that is what both sides of the comparison are: `_engineFor(null)`
   * is a row that named nothing, and it is Claude Code on every Mac with one
   * engine, which is where this line came from.
   */
  modelOffered(engine, model) {
    if (!model) return model;
    // A word that is not an engine has named nothing, so it reads as the row's
    // own answer -- the same as the card that sent no engine at all, which is
    // every card on her Mac today.
    const asked = isEngine(engine) ? engine : this._engineFor(null);
    const filed = this.engineOffered(engine) ?? this._engineFor(null);
    return asked === filed ? model : null;
  }

  /**
   * ONCE PER ROW, AND NEVER MORE. `_engineFor` is asked by the queue, by the
   * cap and by the spawn, so this is asked several times a tick for as long as
   * the row is open; a line per call would be a line every few seconds forever
   * and she would learn to scroll past it, which is the failure the staleness
   * banner already taught this app (CLAUDE.md, 2026-08-12).
   */
  _sayTheChoiceIsOld(item, ranOn = DEFAULT_ENGINE) {
    this._oldChoiceSaid ??= new Set();
    if (this._oldChoiceSaid.has(item?.id)) return;
    this._oldChoiceSaid.add(item?.id);
    const chosen = item?.wrote?.engine?.ts;
    const when = Number.isFinite(chosen) ? new Date(chosen).toISOString().slice(0, 10) : 'at a time the ledger does not record';
    const since = new Date(engineChoiceSince(this.config)).toISOString().slice(0, 10);
    console.warn(`zero: ${item?.id} asks to run on ${engineLabel(item?.engine)}, chosen ${when}, before engine choice was turned on (${since}). It is running on ${engineLabel(ranOn)}; choose the engine on the row again if you meant it.`);
  }

  /**
   * THE ONE `codex app-server` THIS APP EVER RUNS, and the handshake in front
   * of it.
   *
   * One process, many threads: measured 2026-09-04, several workers ran
   * concurrently on a single app-server with independent thread ids, no
   * head-of-line blocking, and one of them parked on an unanswered approval
   * while another started, was approved, ran and completed. So a process per
   * work item would buy nothing and cost her a Codex startup on every spawn.
   *
   * `handshake` is `initialize`, which the protocol requires in front of
   * `thread/start`, and it is done ONCE for the process. It is a promise kept
   * beside the client rather than awaited here, so that starting a worker stays
   * one synchronous call returning a handle, exactly like `spawn`;
   * main/codex-session.mjs awaits it.
   *
   * THE ISOLATION LIST IS NOT KEPT HERE, AND THAT IS THE CHANGE. It used to be
   * read once, beside the handshake, and reused for the life of the app-server.
   * Two things were wrong with that and both are measured on this Mac
   * 2026-09-04 against codex-cli 0.148.0:
   *
   *   A LIST FROM THIS MORNING IS NOT A LIST. A server she adds at lunchtime is
   *   never named, so it is never switched off, and every worker for the rest
   *   of the day starts it. And it fails the other way too: an `enabled: false`
   *   entry is a MERGE onto a server that exists in her config, so a name that
   *   is stale because she DELETED the server refuses the thread outright --
   *   `thread/start` answered -32600 "failed to load configuration: invalid
   *   transport in `mcp_servers.<name>`" for a name with no config entry behind
   *   it. Neither failure has a symptom anybody would read as a stale cache.
   *
   *   AND A FAILED READ USED TO RESOLVE TO NO NAMES, which was written down as
   *   the honest degradation and is the opposite of one. No names is `{}`, and
   *   `{}` was measured by the slice that wrote it as a deep merge that
   *   disables NOTHING: her `playwright` and `context7` both started. So one
   *   unreadable `config/read` silently ran every MCP server she has inside a
   *   headless worker. `mcpServerNames` throws instead now, and the worker's
   *   own promise chain turns that into a run that stops before `thread/start`
   *   with the reason on the pipe `troubleCause` reads.
   *
   * `_codexIsolation` below is therefore asked per START, not per process.
   */
  /**
   * THE ENVIRONMENT A WORKER IS HANDED, WITH EVERY WAY OF REDIRECTING THE BILL
   * TAKEN OUT OF IT.
   *
   * CLAUDE.md's rule: "workers run on the founder's Claude subscription, NEVER
   * an API key", because an inherited `ANTHROPIC_API_KEY` silently moves the
   * charge off her subscription and nothing on screen says so.
   *
   * `OPENAI_*` AND `CODEX_*` ARE THE SAME HAZARD AND NOT A NEW ONE. Her Codex
   * is `auth_mode: "chatgpt"`, so it bills a ChatGPT subscription in exactly
   * the way Claude Code bills hers -- and an inherited `OPENAI_API_KEY` moves
   * that charge to a metered API key just as quietly. `CODEX_HOME` is the same
   * shape as `CLAUDE_CONFIG_DIR`, which this scrub has always removed: it names
   * which login a run bills, so it belongs to the spawn and never to whatever
   * shell launched Agentbox.
   *
   * THE CODEX HALF IS ON THE CODEX SPAWN, AND IT USED TO BE ON BOTH. The
   * argument for one list was that "a scrub with a branch in it is a scrub that
   * can be reached down the wrong side" -- and the price of having no branch
   * was charged to the engine she actually runs. `OPENAI_*` CANNOT REDIRECT
   * CLAUDE CODE'S BILLING; the Anthropic list beside it is what protects that.
   * So stripping them fro they pass in her shell and fail only under Agentbox's
   * Claude worker, with nothing on the row naming what went missing.
   *
   * THE ANTHROPIC LIST IS NOT SYMMETRIC WITH IT, AND THAT IS DELIBERATE RATHER
   * THAN AN OVERSIGHT. CLAUDE.md is durable law and says that scrub runs
   * "before EVERY spawn", with "never pass an API key into a worker's env"
   * beside it, so a Codex worker is not handed her `ANTHROPIC_API_KEY` either.
   * The two halves are not the same kind of claim: the Anthropic one is a rule
   * that is already settled, and the OpenAI one was added by the Codex slice
   * and never asked for. Symmetry is not worth weakening the older of the two.
   *
   * The branch is over the engine the spawn is FOR, which is the one fact this
   * method is called with and the same value `_engineFor` already decided once.
   * The default is Claude Code, so every caller written before there was a
   * second engine reads exactly as it did.
   */
  _workerEnv(engine = DEFAULT_ENGINE) {
    const anthropic = (k) => /^ANTHROPIC_/.test(k) || /^CLAUDE_CODE_/.test(k)
      || k === 'CLAUDECODE' || k === 'CLAUDE_PID' || k === 'CLAUDE_EFFORT' || k === 'CLAUDE_CONFIG_DIR';
    const openai = (k) => /^OPENAI_/.test(k) || /^CODEX_/.test(k);
    const forCodex = engineOf(engine) !== DEFAULT_ENGINE;
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (anthropic(k) || (forCodex && openai(k))) delete env[k];
    return env;
  }

  /**
   * One Codex worker, as a handle `spawnWorker` can hold exactly like a child.
   *
   * The thread's prompt is the SAME brief the Claude path puts behind `-p`, and
   * her standing instructions ride in `developerInstructions` for the same
   * reason they ride in `--append-system-prompt` over there: a rule pasted
   * above a 200-line brief is a rule that gets buried.
   */
  _spawnCodexWorker(plan, { cwd, item, profile = 'default' }) {
    // WHICH LOGIN THIS WORKER BILLS, and it is the same `profile` the session
    // is recorded under and the same one `transcriptFile` will look for its
    // rollout with. One app-server per home, so a second Codex login is a
    // second process rather than a bigger number on the Settings screen.
    const { client, handshake } = this._codexServer(this._codexProfileHome(profile));
    const storeServer = this._codexStoreServer(item);
    // THIS WORKER'S OWN CARDS, SO THEY CAN DIE WITH IT.
    //
    // The scope is made before the worker because the worker needs its handler,
    // and `say` reaches back through a variable filled in on the next line --
    // the handler is only ever CALLED from inside a running turn, long after
    // the worker exists, so there is no window where it is null in practice and
    // the optional call covers the one where it would be.
    let worker = null;
    const cards = this._codexApprovals().scope({
      product: item.product,
      item: item.id,
      // WHICH MCP SERVER IS THE STORE, so a worker's own claim and checkpoint
      // are not cards she has to press before it can speak. Null where there is
      // no store server, and never a name a worker chooses: see the argument in
      // main/codex-approvals.mjs.
      storeServer: storeServer?.name ?? null,
      // Where a refusal Agentbox cannot draw a card for goes: the worker's own
      // stderr, which is what `troubleCause` reads and what the trace records.
      say: (line) => worker?.stderr?.emit?.('data', line),
    });
    worker = createCodexWorker({
      server: client,
      // The handshake AND the isolation list, both of which have to be in hand
      // before `thread/start`: her MCP servers launch at the start, and a
      // thread already running cannot un-launch them. Read fresh for THIS start
      // rather than once per app-server, and never caught: see `_codexIsolation`.
      ready: this._codexIsolation(client, handshake),
      threadParams: (mcpServers) => this.codexThreadParamsFor(plan, cwd, mcpServers, storeServer),
      turnParams: this.codexTurnParamsFor(plan),
      resumeThreadId: plan.resumeId,
      // The card, which is the other half of what a worker needs to be able to
      // do its job at all. Same spool, same shape, same fifteen minutes as a
      // Claude Code worker's (main/codex-approvals.mjs).
      onApproval: cards.handle,
      // A worker that cannot write to her store does not run.
      requireMcpServer: storeServer?.name ?? null,
      ...(Number.isFinite(this.config.codexStoreReadyMs) ? { mcpReadyMs: this.config.codexStoreReadyMs } : {}),
    });
    // AND THE CHANGE ITSELF, SO THE CARD CAN SAY WHAT IT IS. A
    // `item/fileChange/requestApproval` carries an itemId and nothing else --
    // no path, no diff -- but the `item/started` for that same item goes past
    // here first carrying both (measured 2026-09-04, three approvals out of
    // three). Without this line every patch approval is refused again and a
    // Codex worker silently cannot write a file, which has no symptom on any
    // screen. Registered BEFORE `spawnWorker`'s own listener, and it does not
    // matter: the approval reaches the handler on a microtask, long after every
    // listener on this event has run.
    worker.on('event', cards.remember);
    // AND THE CARDS GO WHEN THE WORKER DOES. `end` fires exactly once for every
    // ending there is -- a completed turn, a failed one, our own kill, the
    // app-server dying underneath it -- so this is the one hook that covers a
    // stopped run, a preempted one, an archived row and a lost connection
    // without four separate call sites. Without it the question sits on her
    // screen for fifteen minutes about a command nothing is waiting to run, and
    // because the front card is always the oldest, it sits in front of every
    // real card until it expires.
    worker.once('exit', () => {
      try { cards.close('the run that asked this has stopped'); } catch (e) { console.warn('zero: could not close a codex worker cards:', e?.message ?? e); }
    });
    // THE MODEL SHE PICKED IS NOT SAID HERE, AND THAT IS THE FIX RATHER THAN AN
    // OMISSION. There was a `worker.stderr.emit('data', refusal)` on this line,
    // and measured 2026-09-04 it reached nobody: it fired synchronously, before
    // this method had even returned the worker, and `spawnWorker` attaches
    // `child.stderr.on('data', ...)` 430 lines further down. An EventEmitter
    // buffers nothing, so the only notice she was going to get about her model
    // being dropped was emitted into an emitter with no listeners on it, and
    // the run then went ahead on a model she did not pick. It is now
    // `codexThreadParamsFor` that refuses, by throwing, which lands in
    // `createCodexWorker`'s own catch -- on a microtask, long after every
    // listener is on -- and stops the run instead of narrating past it.
    return worker;
  }

  /**
   * HER STORE, AS A SERVER ONE CODEX THREAD STARTS.
   *
   * The same launcher and the same account the Claude path names in
   * `mcpServers`, under the same name, so the brief's store-tools half and
   * the trace's vocabulary go on meaning one thing across both engines.
   *
   * ALL FOUR VALUES ARE NAMED HERE BECAUSE NOTHING IS INHERITED. A Claude
   * worker is a process per item, so `ZERO_PRODUCT` and `ZERO_ITEM` reach its
   * MCP servers through its own environment. There is no process per item on
   * this engine, and the app-server's environment does not flow through:
   * measured 2026-09-04, a server started this way saw fourteen variables --
   * the ones named here plus HOME, LANG, LOGNAME, PATH, SHELL, TERM, TMPDIR,
   * USER and __CF_USER_TEXT_ENCODING -- and nothing else at all.
   *
   * Null on every install that has no store MCP configured, which is every
   * downloaded copy of Agentbox (`storeMcpCommand` is null in main/config.mjs).
   * `speaksForTheSession` already covers that case for both engines.
   */
  /**
   * THE `thread/start` PARAMS FOR ONE WORKER, AND THE MODEL EITHER RUNS OR THE
   * RUN DOES NOT.
   *
   * `plan.model` used to be forwarded straight into `model` and it can be a
   * CLAUDE model name: the composer's drawer offers Claude Code's own
   * vocabulary -- `opus`, `sonnet`, or a full `claude-*` slug -- and Codex
   * takes an exact slug of its own. None of those words overlap, so a Codex run
   * on a row with a Claude model set was refused at `thread/start` as a
   * protocol error rather than as anything naming the cause.
   *
   * WHAT REPLACED IT WAS WORSE FOR A WHILE, AND THIS IS THE CORRECTION. Every
   * model word on a Codex row was then dropped and the row run on Codex's own
   * default, on the reading that no word could be right. `main/codex-models.mjs`
   * is the fact that reading was missing: this Mac's Codex publishes the slugs
   * it accepts in `<home>/models_cache.json`, so a word can now be CHECKED
   * rather than assumed. `gpt-5.6-sol` -- the model her own config.toml names --
   * was being thrown away as "a Claude Code model name".
   *
   * SO THERE ARE THREE ANSWERS AND NO FOURTH.
   *
   *   CODEX KNOWS THE WORD -> carry it, unchanged and unremarked.
   *   THIS MAC HAS NO LIST  -> carry it too. We refuse on a fact or not at all;
   *     with no readable cache, Codex is the authority on its own slugs and it
   *     answers for them at `thread/start` in its own words.
   *   CODEX DOES NOT KNOW IT -> THROW, which stops the run before the thread.
   *
   * STILL NEVER TRANSLATED, and that half is unchanged. There is no honest map
   * from "opus" to a Codex slug: which model stands in for which is a judgement
   * about cost and capability that belongs to the user, and guessing it would
   * run their work on a model they did not pick.
   *
   * AND RUNNING ON CODEX'S DEFAULT IS THAT SAME GUESS. That is the whole
   * argument for throwing rather than dropping the word and carrying on. A run
   * that goes ahead has no way to tell her what it did with her choice: the
   * worker's stderr only becomes a sentence on her row through `sayTheRunDied`,
   * which fires on a run that DIED, so on the ordinary successful run the
   * notice would exist only in a trace file nobody opens. CLAUDE.md's rule is
   * that when the system swallows something the user said, they cannot tell it
   * from the work not happening. Stopping is the only outcome they can see.
   *
   * A THROW HERE COSTS THE ROW NOTHING. `threadParams` is called inside
   * `createCodexWorker`'s promise chain, so this lands in the catch at the end
   * of it, which says the sentence on the stderr `troubleCause` reads and ends
   * the worker -- the same shape `mcpServerNames` uses when it cannot tell which
   * servers to switch off, and the same one the store-server gate uses two steps
   * later. `worker.emit('spawn')` is further down that chain than either, so no
   * one-off permission mode is spent and no delivery mark is written.
   *
   * AND THE WORKSPACE HAS A PLACE IN THAT RESOLUTION SINCE 2026-09-05, which is
   * what makes the Settings row under "Coding agent" a control rather than a
   * decoration. The founder-side tester, running the real app with Codex
   * chosen: "when Codex is selected as coding agent, below it still shows
   * Claude models." The row that was drawn there wrote `--model` into her
   * Claude session args, so on a Codex workspace it named an engine that was
   * not going to run and set a flag nothing was going to read.
   *
   * THE PRECEDENCE IS CLAUDE CODE'S OWN, so the two engines cannot be reasoned
   * about separately. `spawnPlan` resolves Claude's as `setModelArg(grants,
   * item.model)` -- the row rewrites the workspace flag -- and this is the same
   * order in the shape an engine with no argv can take it:
   *
   *   THE ROW WINS. She chose it on this task against a setting she may have
   *     made in June.
   *   THEN THE WORKSPACE, `config.codexModel`, which is what the Settings row
   *     writes and is the whole reason it is drawn.
   *   THEN NOTHING IS SENT, and `~/.codex/config.toml` decides. That is
   *     "Codex's own" (`CODEX_OWN`, renderer/src/models.ts), and it stays
   *     reachable BY BEING THE ABSENCE of the setting rather than a value of
   *     it -- so a Mac nobody has opened this screen on behaves exactly as it
   *     did, and so her terminal and her fleet follow the same file when she
   *     changes it.
   */
  codexThreadParamsFor(plan, cwd, mcpServers, storeServer) {
    // ASKED HERE RATHER THAN CARRIED ON THE PLAN. A precomputed field would be
    // a second copy of this decision that a caller can forget to set, and the
    // way it fails is a word Codex cannot read reaching `thread/start` -- which
    // is exactly the bug. The one place that builds the params is the one place
    // that decides.
    const onRow = typeof plan?.model === 'string' ? plan.model.trim() : '';
    const workspace = this._codexWorkspaceModel();
    const word = onRow || workspace || '';
    // WHICH SETTING IS BEING REFUSED, because the sentence is the only thing
    // she can act on and it has to send her to the right screen.
    const refusal = this.codexModelRefusal(word, onRow ? 'row' : 'workspace');
    if (refusal) throw new Error(refusal);
    // AND THE LEVEL IS JUDGED HERE TOO, against the model that will actually
    // run, for the same reason and with the same outcome: a level the model
    // does not advertise stops the run before the thread, with the sentence on
    // the pipe `troubleCause` reads, rather than reaching `turn/start` as a
    // protocol error or running at a level she did not pick.
    const level = this.codexEffortRefusal(word, plan?.effort);
    if (level) throw new Error(level);
    return workerThreadParams({
      cwd,
      model: word || null,
      instructions: plan?.system ?? null,
      mcpServers,
      storeServer,
      // WHAT SHE PICKED, AND IT IS ASKED FOR HERE FOR THE SAME REASON THE MODEL
      // IS: the one place that builds the params is the one place that decides,
      // so there is no precomputed field on the plan for a caller to forget.
      // A mode on the row wins over the project's, which wins over the
      // workspace's; `effectiveCodexMode` owns that order.
      // HER ONE-MESSAGE MODE FIRST, then the project's, then the workspace's.
      // `plan.answerMode` carries whatever the reply box set; it holds either
      // engine's word, so this keeps only a Codex one and lets a Claude mode
      // fall through as though nothing were set (main/answer-modes.mjs says
      // why one field serves both).
      mode: (isCodexMode(plan?.answerMode) ? plan.answerMode : null)
        || this.effectiveCodexMode(plan?.product ?? ''),
    });
  }

  /* Whether this * word IS one the model advertises was settled in `codexThreadParamsFor`,
     * which runs first on the same chain and throws when it is not; this method * only
     shapes it. Nothing on the row sends nothing, and then the * `model_reasoning_effort`
     line in her own config.toml decides, exactly as * her terminal does.
  */
  codexTurnParamsFor(plan) {
    if (plan?.reviewTarget) return { reviewTarget: plan.reviewTarget };
    const effort = typeof plan?.effort === 'string' && isEffortWord(plan.effort) ? plan.effort : null;
    // AND THE PICTURES SHE ATTACHED, AS PICTURES (MP-09). `UserInput` is an
    // internally tagged enum in Codex's own protocol schema and one variant is
    // `{"type":"localImage","path":"<absolute>"}`, required type and path. On
    // Claude Code the same pictures reach the session as paths in the brief,
    // which is that engine's way in; this is Codex's.
    const pictures = Array.isArray(plan?.pictures) ? plan.pictures : [];
    return {
      input: [
        { type: 'text', text: plan?.prompt ?? '' },
        ...pictures.map((abs) => ({ type: 'localImage', path: abs })),
      ],
      ...(effort ? { effort } : {}),
    };
  }

  /**
   * WHY A LEVEL ON THIS ROW CANNOT BE HANDED TO CODEX, OR NULL WHEN IT CAN.
   *
   * `codexModelRefusal`'s twin, one field over. The levels are PER MODEL and
   * they really differ (main/codex-models.mjs: six on gpt-6-astra, four on
   * gpt-5.5), so the question is not "is this a level" but "is this a level of
   * the model that is about to run" -- the row's, else the workspace's, else
   * the one her config.toml names, which is the same resolution the thread's
   * `model` gets.
   *
   * Null for every "nothing to refuse": no level on the row, a level the model
   * advertises, no model word at all to check against, or no list on this Mac
   * for that word. We refuse on a fact or not at all; with no list, the word
   * goes to Codex as written and Codex answers for it in its own words.
   */
  codexEffortRefusal(model, effort) {
    const level = typeof effort === 'string' ? effort.trim() : '';
    if (!level) return null;
    const home = this._codexHome();
    const slug = (typeof model === 'string' && model.trim()) || this._codexWorkspaceModel() || codexDefaultModel({ home }) || '';
    if (!slug) return null;
    const levels = codexModelLevels(slug, { home });
    if (!levels || levels.includes(level)) return null;
    const offers = levels.length ? `It offers ${levels.join(', ')}.` : 'It advertises no levels at all.';
    return `this row asks "${slug}" to think at "${level}", which is not a level that model offers on this Mac. ${offers} Nothing here will pick a stand-in for her, so this run is stopping rather than doing her work at a level she did not choose`;
  }

  /**
   * WHAT EVERY CODEX AGENT RUNS ON WHEN THE ROW SAYS NOTHING, OR NULL.
   *
   * Read off `config.codexModel` at the moment of the spawn rather than kept,
   * for the reason `standingInstructions` is read fresh: she changes it from
   * the app while the fleet is running, and a setting that waits for a restart
   * is one she will rightly believe was ignored.
   *
   * AN EMPTY OR BLANK VALUE IS NULL, NOT A MODEL. `CODEX_OWN` is the empty
   * string on the renderer side, and a `model: ""` on the wire is a word Codex
   * has to answer for rather than the silence it means.
   */
  _codexWorkspaceModel() {
    const word = typeof this.config.codexModel === 'string' ? this.config.codexModel.trim() : '';
    return word || null;
  }

  /**
   * WHAT A CODEX WORKER ON THIS PRODUCT MAY DO, resolved in the same order as
   *  the Claude Code side: the project's own setting if it has one, else the
   *  workspace's, else the default.
   *
   *  It sits beside `effectivePermission` rather than in the settings module for
   *  exactly that reason. The reply footer reads both answers together, and two
   *  resolvers in two files drift apart quietly.
   *
   *  AN UNKNOWN WORD FALLS THROUGH rather than throwing. `setProjectSetting` and
   *  `setWorkspaceSetting` refuse a bad word on the way IN, where there is
   *  somebody to tell about it; by the time a worker is starting, the useful
   *  behaviour is to run in the default rather than not to run at all.
   */
  effectiveCodexMode(slug) {
    const project = this.config.projectCodexMode?.[slug];
    if (isCodexMode(project)) return project;
    const workspace = this.config.codexMode;
    if (isCodexMode(workspace)) return workspace;
    return CODEX_DEFAULT_MODE;
  }

  /**
   * WHY A MODEL ON THIS ROW CANNOT BE HANDED TO CODEX, OR NULL WHEN IT CAN.
   *
   * Null is the answer for three different situations and they are all "nothing
   * to refuse": she picked no model, she picked one Codex accepts, or this Mac
   * has no list to check against.
   *
   * CHECKED AGAINST EVERY SLUG IN THE CACHE, NOT AGAINST THE OFFER LIST.
   * `codexModels` drops the two `visibility: "hide"` models because a picker
   * must not offer Codex's internal ones, but Codex would still accept
   * `gpt-reserve` if it were handed it, and refusing a run over a model that
   * exists is a false refusal. Two questions, two answers; see
   * main/codex-models.mjs.
   *
   * THE SENTENCE NAMES THE WORD AND WHAT CODEX OFFERS, AND CLAIMS NOTHING
   * ABOUT WHERE THE WORD CAME FROM. Its predecessor asserted every unknown word
   * was "a Claude Code model name", which is false for `gpt-5.6-slo` and sends
   * her looking in the wrong place for a typo. What she can act on is the list,
   * so the list is what is in it.
   *
   * IT DOES NAME WHICH SETTING ASKED, and that is not the same claim. Since the
   * workspace has a Codex model of its own (`_codexWorkspaceModel`) the word
   * being refused may be one she set on a settings screen and not on any row,
   * and "this row asks to run on ..." would send her hunting on the task for a
   * word that is not on it. Where to go and fix it is the other half of what
   * she can act on.
   */
  codexModelRefusal(model, from = 'row') {
    const word = typeof model === 'string' ? model.trim() : '';
    if (!word) return null;
    const home = this._codexHome();
    const known = codexKnownSlugs({ home });
    if (!known.size || known.has(word)) return null;
    const offered = codexModels({ home }).map((m) => m.id);
    const instead = offered.length ? ` It offers ${offered.join(', ')}.` : '';
    const asked = from === 'workspace'
      ? `every Codex agent here is set to run on "${word}"`
      : `this row asks to run on "${word}"`;
    return `${asked}, which is not a model the Codex on this Mac knows.${instead} Nothing here will pick a stand-in for her, so this run is stopping rather than doing her work on a model she did not choose`;
  }

  /**
   * WHICH CODEX HOME THIS APP'S CODEX ACTUALLY READS, DECIDED IN ONE PLACE.
   *
   * `_workerEnv('codex')` is passed rather than `process.env`, and that is the
   * point of the line. It deletes every `CODEX_*`, because `CODEX_HOME` names which login
   * bills the run in the same way `CLAUDE_CONFIG_DIR` does -- so the env branch
   * inside `codexHome` is dead for us BY CONSTRUCTION, and reading a
   * `CODEX_HOME` Agentbox merely inherited would check her model against, and look
   * for her transcripts in, an account that no Codex of ours ever opens. Written
   * this way rather than as a hardcoded `~/.codex` so that if the scrub ever
   * changes, this follows it.
   *
   * AND THIS ANSWER IS NOW WHAT THE PROCESS READS TOO, which is the whole of the
   * 2026-09-05 fix. `_codexServer` writes it onto the spawn's environment after
   * the scrub, so the home Settings offers models out of, the home a row's model
   * is checked against, the home recovery looks for rollouts in, and the home
   * the app-server authenticates on are one value from one method. They were
   * two, and the disagreement had no symptom.
   */
  _codexHome() {
    return codexHome({ configured: this.config.codexHome, env: this._workerEnv('codex') });
  }

  _codexStoreServer(item) {
    const command = this.storeMcpCommand();
    if (!command) return null;
    return {
      name: STORE_SERVER,
      command,
      env: {
        STORE_ACCOUNT_ID: this.config.accountId,
        ...storeRootEnv(this.config.storeRoot),
        ...teamPersonEnv(),
        ZERO_PRODUCT: item.product,
        ZERO_ITEM: item.id,
      },
    };
  }

  /**
   * ONE `codex app-server` PER LOGIN, ON THE HOME THAT LOGIN IS.
   *
   * IT USED TO BE ONE PROCESS WITH `CODEX_HOME` SCRUBBED, AND THAT WAS TWO
   * DEFECTS IN ONE LINE. The Codex scrub deletes every `CODEX_*`, so this process
   * read whatever `~/.codex` happens to be -- always -- while `_codexHome`
   * answers `config.codexHome || ~/.codex` and Settings offers models out of
   * THAT, the model refusal checks a row's slug against THAT, and restart
   * recovery looks for rollouts under THAT. Set `codexHome` and the screen
   * shows one account while every run authenticates and bills another, and the
   * sessions the runs wrote are searched for in a home they were never in.
   *
   * THE SCRUB IS NOT WEAKENED BY PUTTING ONE VARIABLE BACK. Its job is to
   * remove an INHERITED value: `CODEX_HOME` names which login pays, exactly as
   * `CLAUDE_CONFIG_DIR` does, so one carried in from whatever shell launched
   * Agentbox silently moves the charge. `_workerEnv('codex')` still deletes it, and then
   * the home Agentbox itself decided is written on top -- which is precisely what
   * the Claude path has always done with `CLAUDE_CONFIG_DIR` in `spawnWorker`:
   * scrubbed out of the parent, put back per spawn from the profile that was
   * chosen. Inheriting a login and choosing one are opposite acts.
   *
   * Measured on this Mac 2026-09-05, codex-cli 0.148.0: a real app-server
   * spawned with `CODEX_HOME` at a scratch directory read that directory's
   * `config.toml` for its MCP servers and wrote its rollouts under
   * `<that dir>/sessions/YYYY/MM/DD/`. The variable is the whole of the answer,
   * which is why keying this map by it is enough to make a second login real.
   */
  _codexServer(home = this._codexHome()) {
    this._codexServers = this._codexServers ?? new Map();
    const live = this._codexServers.get(home);
    if (live && !live.client.isClosed()) return live;
    const client = createCodexAppServer({
      spawn: () => spawn(this.config.codexBin, ['app-server'], {
        cwd: this.appDir,
        env: { ...this._workerEnv('codex'), CODEX_HOME: home },
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
      // WHAT IS LEFT OF THIS LOGIN'S LIMIT, ARRIVING UNBIDDEN. `onNotification`
      // is the channel for everything that belongs to no thread, and
      // `account/rateLimits/updated` rides it during every turn. Taking it here
      // is the whole reason the corner never starts a process to draw Codex's
      // meter. The home goes with it because there is one app-server per login
      // and a reading belongs to the one that gave it.
      onNotification: (method, params) => this._codexUsage().saw(method, params, home),
    });
    const handshake = client.initialize();
    // The rejection is kept for the workers that chain off it and ALSO swallowed
    // here, because a handshake nobody happens to await yet is still an
    // unhandled rejection, and an unhandled rejection takes the app down. This
    // is a second branch off the same promise, never a replacement for it: every
    // worker still sees the failure.
    handshake.catch(() => { /* every worker chains its own catch off this */ });
    const entry = { client, handshake, home };
    this._codexServers.set(home, entry);
    return entry;
  }

  /**
   * THE CORNER'S FIGURES, WHICH ARE ONLY EVER THE ONES CODEX VOLUNTEERED.
   *
   * It is handed no app-server on purpose and there is nothing here for it to
   * ask with: the explicit rate-limits read was a request to OpenAI's backend
   * rather than a local lookup, and main/codex-usage.mjs holds the measurement
   * and the reason it is deliberately absent. Everything it knows arrives free
   * on `_codexServer`'s `onNotification` above.
   */
  _codexUsage() {
    if (!this._codexLimits) {
      this._codexLimits = new CodexUsage({
        home: () => this._codexUsageHome(),
        onChange: () => this.onChange?.(),
      });
    }
    return this._codexLimits;
  }

  /**
   * WHOSE LIMIT THE CARD IS ABOUT: the login she picked, else her primary one.
   *
   * This used to be `_codexHome` outright, which is always the primary login.
   * The pick moved her work onto a second account and left the figure behind,
   * so she switched off an account at 99% and the card still said 99%
   * (w-cad7e3e509). With no pick every login runs, and the primary one stays
   * the one the card speaks for, as before.
   */
  _codexUsageHome() {
    const pool = this._profilesFor('codex');
    return pool.length === 1 ? this._codexProfileHome(pool[0]) : this._codexHome();
  }

  /**
   * What is left of the Codex login's limit, or null because nothing has ever
   *  reported one. Null is the honest answer on every Mac that has not run a
   *  Codex worker, and the corner draws nothing rather than a bar at zero. */
  codexUsage() {
    return this._codexUsage().read();
  }

  /**
   * WHICH OF HER MCP SERVERS THIS ONE THREAD HAS TO SWITCH OFF, ASKED NOW.
   *
   * A bare `thread/start` inherits every server in her `~/.codex/config.toml` --
   * measured 2026-09-04, a plain start launched her `playwright` and `context7`
   * unbidden -- and they launch AT the start, so a list that arrives afterwards
   * is a list that arrived too late. Hence a promise handed to the worker rather
   * than a value: `createCodexWorker` awaits it and builds the params from it.
   *
   * NOTHING IS CAUGHT HERE. A read that fails, or answers a shape
   * `mcpServerNames` cannot take names out of, rejects this promise, and the
   * worker's own chain ends the run with the reason on stderr. See
   * `_codexServer` above for what the swallowed version of this did instead.
   *
   * AND IT IS ASKED WITHOUT THE THREAD'S CWD, ON PURPOSE, WHICH LOOKS LIKE THE
   * BUG AND IS THE FIX. `ConfigReadParams` takes a `cwd` that folds in the
   * config layers between it and the repo root, and the obvious reading is that
   * a read without one cannot see a `.codex/config.toml` in the product folder.
   * It cannot -- and naming what it would have found is measured to REFUSE the
   * thread outright, because an `enabled: false` entry is a merge onto a server
   * in the trusted config. `projectIsolation` in main/codex-session.mjs closes
   * that layer instead of enumerating it, so there is nothing there to name,
   * and asking with the cwd would only start producing names that kill the run.
   * The measurements are in that file.
   */
  _codexIsolation(client, handshake) {
    return handshake
      .then(() => client.request('config/read', {}))
      .then((read) => mcpServerNames(read));
  }

  /**
   * THE CARDS A CODEX WORKER RAISES, and there is one of these for the whole
   * fleet rather than one per worker: the request ids are UUIDs, the founder
   * answers them one at a time, and the spool they land in is one directory.
   *
   * `onChange` is the same push the store gets. main/ipc.mjs also watches the
   * spool directory, so this is the belt to that braces -- a card that appears
   * while an fs.watch is asleep still reaches her screen on the next tick.
   */
  _codexApprovals() {
    if (!this._codexCards) {
      this._codexCards = createCodexApprovals({
        storeRoot: this.config.storeRoot,
        onChange: () => this.onChange?.(),
      });
    }
    return this._codexCards;
  }

  /**
   * THE FOUNDER ANSWERED A CODEX CARD. Called from main/ipc.mjs's one
   * answering door, beside `approvals.answer`, so both engines are answered by
   * the same press of the same button.
   *
   * It is the ONLY way a Codex approval is ever allowed: nothing on this path
   * reads an answer off the disk, which is what makes a file a worker wrote
   * for itself worth nothing (main/codex-approvals.mjs). False for a Claude
   * Code worker's card, which this spool has never heard of.
   */
  settleCodexApproval(id, allow, note) {
    return this._codexCards?.settle(id, allow, note) ?? false;
  }

  /**
   * WHETHER THE CARD SHE JUST ANSWERED IS STILL THE QUESTION THE TURN IS PARKED
   * ON. Asked by the same door, before it records anything, so an Allow on a
   * request that was rewritten under its own id becomes a deny rather than an
   * approval of something she never read.
   *
   * False for a Claude Code worker's card and for one no longer open, because
   * this may never invent a refusal: that engine's own check happens where its
   * request actually lives (main/approval-prompt-server.mjs).
   */
  codexCardChanged(id, shown) {
    return this._codexCards?.changed(id, shown) ?? false;
  }

  // A loaded app-server thread holds Codex's writer lock even after its turn
  // finishes. Closing an idle account returns its sessions to the native CLI.
  _releaseIdleCodex(profile = 'default') {
    if ([...this.sessions.values()].some(s => s.engine === 'codex' && (s.profile ?? 'default') === profile)) return;
    if ([...(this._compactionJobs?.values() ?? [])].some(j => (j.profile ?? 'default') === profile)) return;
    const home = this._codexProfileHome(profile);
    const entry = this._codexServers?.get(home);
    if (!entry) return;
    this._codexServers.delete(home);
    entry.client.close('Account idle; release native session ownership');
  }

  /**
   * Take the app-server down with the supervisor, exactly as `killAll` takes
   *  the Claude children down: an orphaned app-server keeps her workers running
   *  under permission rules no new spawn would produce (2026-08-06). And every
   *  card still open goes with it, because a question whose answerer has quit
   *  is a worker parked forever. */
  _closeCodex(why = `${Name} is shutting down`) {
    try { this._codexCards?.close(why); } catch { /* already gone */ }
    // EVERY LOGIN'S PROCESS, not the first one. There is one app-server per
    // CODEX_HOME since a second Codex login became real, and a shutdown that
    // closed one of them would leave the other orphaned -- which is the whole
    // failure this method exists for, reintroduced by the fix for another.
    for (const entry of this._codexServers?.values() ?? []) {
      try { entry.client.close(why); } catch { /* already gone */ }
    }
    this._codexServers?.clear();
  }

  spawnWorker(item, { continuation = false, resumeSessionId = null, profile: forcedProfile = null, engine: forcedEngine = null, remoteOnly = false, shipFailure = null } = {}) {
    if (this._compactionJobs?.has(JSON.stringify([item.product, item.id]))) return;
    // ASKED ONCE, HERE, AND ANSWERED CLAUDE CODE ON EVERY MACHINE TODAY. See
    // `_engineFor` for the two independent reasons why. It is asked ahead of
    // the door rather than after it because the door is the engine's own cap
    // now: this row is measured against the subscription it would actually
    // spend, not against every session on the Mac.
    //
    // `forcedEngine` IS FOR THE SESSIONS WHOSE ENGINE IS NOT A FACT ABOUT A
    // ROW, AND IT IS NEVER A SECOND DECISION.
    //
    // `_resumeInterrupted` passes it because a session belongs to the harness
    // that WROTE it, whatever the rule would answer for the row today: asking
    // the rule again there hands a Codex thread id to `--resume`, or a Claude
    // UUID to `thread/resume`, and the continuation dies on arrival.
    //
    // `spawnDigest` passes it because its row is SYNTHETIC
    // -- there is no ledger line behind either id -- so the rule answered for
    // them out of the workspace default, which is not the engine the tick
    // checked a slot against. Both of those callers say Claude Code out loud
    // and check a Claude Code slot; this is how that one answer reaches the
    // spawn instead of being derived again down here and disagreeing.
    const engine = forcedEngine ? engineOf(forcedEngine) : this._engineFor(item);
    // A ROW WHOSE MODEL BELONGS TO THE OTHER HARNESS DOES NOT RUN, AND SAYS SO.
    // Asked here rather than inside `spawnPlan` because the answer is not a
    // narrower plan, it is no run at all -- and asked before the slot check and
    // before the product lookup, so a refusal costs the fleet nothing.
    if (item?.model && !modelForEngine(item, engine)) {
      this._sayTheModelIsForAnotherEngine(item, engine);
      // THE USER'S WORDS ARE NOT DELIVERED BY A WORKER THAT NEVER STARTED. The queue
      // writes the delivery mark before it calls this method and that mark is
      // persisted, so leaving it standing would record the reply as handed over
      // for good. `redeliverAnswer` is the sanctioned way back.
      if (continuation && item.answer) this.redeliverAnswer(item, item.answer);
      return;
    }
    if (!this._hasSlotFor(engine) && !continuation) return;
    // HER REPLY WAITS FOR AN ACCOUNT THAT CAN CARRY IT. A continuation skips the
    // slot check by design, so with every account on this engine sitting out it
    // would go to one anyway, die in two seconds, and go again next tick. Held
    // here and handed back, it goes out the tick the account returns.
    if (continuation && !this._liveProfilesFor(engine).length) {
      if (item.answer) this.redeliverAnswer(item, item.answer);
      return;
    }
    const product = this.store.listProducts().find((p) => p.slug === item.product);
    if (!product) return;
    // AND THIS IS WHERE "nothing ever runs in the practice project" IS ACTUALLY
    // ENFORCED. Every other path in this file arrives here — the fresh-work
    // pass, continuations, `resumeItems`, `resumeStopped`, the
    // interrupted-session recovery, a mid-flight reply and the digest — so
    // one refusal at the door is worth more than a skip in each of
    // them. Said out loud in the log because the founder watched exactly this
    // happen in silence and read it as the app being broken: a task filed into
    // Practice was accepted and then never picked up by anything.
    if (!this.worksHere(product)) {
      console.warn(`zero: refusing to start a session in ${product.slug}: nothing runs in a practice project`);
      return;
    }
    if (this._folderFirst(item, product, engine, { continuation, resumeSessionId, profile: forcedProfile, engine: forcedEngine, remoteOnly })) return;
    if (this._photoFirst(item, product, engine, { continuation, resumeSessionId, profile: forcedProfile, engine: forcedEngine, remoteOnly })) return;

    const plan = this.spawnPlan(item, product, { continuation, resumeSessionId, engine, shipFailure });
    const { args } = plan;
    // ONE RUN, ONE PAIR OF FILES. The MCP config and the settings used to be a
    // fixed name each in the temp folder, fine while every spawn wrote the
    // same bytes and a race the moment the connector rules made them differ.
    // They are named by this id now and removed when the process ends, or when
    // it never starts.
    const runId = crypto.randomUUID();
    const spawnFiles = [];
    this.prepareClaudePermissions(plan, product, runId, spawnFiles);

    // THE ROW'S OWN FOLDER, and the shared checkout only when it cannot have
    // one. Everything downstream follows this one word: the snapshot the change
    // card is built from, the built-in terminal, /diff, and the folder the next
    // reply resumes into.
    const cwd = this.workFolderFor(item, product);
    // Workers bill to the founder's Claude subscription (the CLI's own OAuth
    // login), never an API key. An ANTHROPIC_API_KEY in the inherited env
    // would silently override that, so strip anything that could redirect
    // auth or billing, plus session markers leaked by whatever launched Zero.
    // A RESUMED SESSION GOES BACK TO THE SUBSCRIPTION THAT STARTED IT. The
    // transcript lives under that profile's home and under no other, so a
    // round-robin pick here would hand `--resume` an id the CLI cannot find and
    // the session would die on arrival.
    //
    // THAT WAS TRUE OF THE WAKE SWEEP ONLY, AND THAT WAS THE BUG.
    // `forcedProfile` is passed by _resumeInterrupted and by nothing else, so
    // the one path that resumes on every reply the user writes, a personal
    // continuation, fell through to the pick and lost the account half of the
    // time. plan.resumeProfile is that same answer for that path.
    const profile = forcedProfile ?? plan.resumeProfile ?? this._pickProfile(engine);
    // A SECOND ACCOUNT ARRIVES EMPTY, AND THIS IS WHERE IT STOPS BEING EMPTY.
    // Our own Accounts page tells a person to log in with a brand new folder,
    // and Claude Code reads a session's skills, commands and subagents out of
    // whichever folder CLAUDE_CONFIG_DIR names, so without this the worker
    // below runs with none of the person's own tooling and nothing says so.
    // Three symlinks back to the first login, made once and then found already
    // made; it never overwrites anything and never throws. See
    // main/account-tooling.mjs for what is shared and what deliberately is not.
    // AND IT IS CLAUDE CODE'S TOOLING, SO IT IS NOT MADE FOR THE OTHER ENGINE.
    // `linkAccountTooling` symlinks `~/.claude/{skills,commands,agents}` into an
    // account folder; a Codex worker reads none of those three and has no
    // account folder to put them in, so running it there would be three
    // symlinks made into a Claude home on behalf of a session that will never
    // open them.
    const tooling = engine === 'codex' ? null : linkAccountTooling(profile);
    const env = this._workerEnv(engine);
    const child = engine === 'codex'
      ? this._spawnCodexWorker(plan, { cwd, item, profile })
      : spawn(this.config.claudeBin, claudeStreamArgs(args), {
        cwd,
        env: {
          ...env,
          STORE_ACCOUNT_ID: this.config.accountId,
          // This app's own store, and the only one there is. Exported under
          // every name this app has had, so a store server or a script written
          // against an older name still finds it.
          ...storeRootEnv(this.config.storeRoot),
          // Which subscription bills this worker. 'default' means the CLI's
          // own home; anything else is a second logged-in profile.
          ...(profile !== 'default' ? { CLAUDE_CONFIG_DIR: profile } : {}),
          // So approval cards can say who is asking and about what.
          ZERO_PRODUCT: item.product,
          ZERO_ITEM: item.id,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

    // `command` RIDES ON THE SESSION so the cap can leave it out (`_load`).
    // The exit handler already needed the same fact from `plan`; this is that
    // fact kept for as long as the process is alive, which is what the tick
    // reads on every pass while it decides who may start next.
    //
    // AND `engine` RIDES ON IT TOO, because everything after this line that has
    // to know which CLI is running -- which readers parse its output, which
    // words a dead run is reported in, where its transcript is -- is reached
    // from the session and not from the item. Reading `item.engine` again down
    // there would be a second decision that could disagree with `_engineFor`.
    const session = {
      child, itemId: item.id, product: item.product, startedAt: Date.now(), tail: [], profile,
      command: !!plan.command, engine,
      // AND THE FOLDER IT IS RUNNING IN, which is now the row's own rather than
      // the product's checkout. Everything that asks a live session where it
      // works reads it from here rather than deriving it from the product a
      // second time and getting the shared checkout back.
      cwd,
      spawnFiles,
    };
    this.sessions.set(item.id, session);
    if (engine !== 'codex') {
      attachClaudeInput(child);
      if (remoteOnly) { child.holdInput(true); session.remoteIdle = true; session.remoteHeld = true; }
      child.on('input-turn', () => {
        if (!session.remoteHeld) return;
        session.remoteIdle = false; session.remoteResultRecorded = false;
        session.result = null; session.resultIsError = false; session.saying = '';
        this.onChange?.();
      });
      child.on('remote-user', event => {
        try {
          const content = event.message?.content;
          const answer = typeof content === 'string' ? content : content.filter(b=>b.type==='text').map(b=>b.text).join('\n');
          const saved = this.store.answerItem(item.product,item.id,{answer,status:'open'});
          if (saved) this._handledAnswers.add(this._answerKey({...saved,product:item.product,id:item.id}));
          this._saveState(); this.onChange?.();
        } catch(error) {
          this._remoteControls?.set(JSON.stringify([item.product,item.id]),{state:'failed',at:Date.now(),mayBeActive:true,text:'A remote message arrived but its local record could not be saved. '+error.message});
          this.onChange?.();
        }
      });
      // The initial prompt is not a correction; failure still follows the
      // ordinary child error/exit path and is never an unhandled rejection.
      if (!remoteOnly) child.once('spawn', () => { void child.steer(args[args.indexOf('-p') + 1]).catch(() => {}); });
    }


    // THE CHECKOUT AS IT WAS BEFORE THIS RUN TOUCHED IT.
    //
    // Taken here rather than at the exit, because at the exit there is nothing
    // left to compare against. It is what lets the card carry the code from a
    // run that changed its files with sed or a script, which is most of them:
    // measured 2026-08-24, 105 runs changed a file over two days and 4 of them
    // would have shown the whole change from the conversation alone.
    //
    // Never allowed to stop a spawn. A product with no repository gets null
    // and the conversation carries the card exactly as it did before.
    // Taken off the main thread a moment ago by `_photoFirst`, before the
    // process existed; read here inline only when that step did not run.
    if (this._photos?.has(item.id)) session.repoBefore = this._photos.get(item.id);
    else { try { session.repoBefore = snapshotRepo(cwd); } catch { session.repoBefore = null; } }

    // A MODE BELONGS TO THE THREAD, NOT TO ONE SEND, AND THIS IS WHERE THAT
    // CHANGED (w-34b7b861b6, 2026-09-24).
    //
    // What stood here spent the mode the moment the child process came up:
    // `clearAnswerMode` on the `spawn` event, so the very next run on the same
    // row went out in the fleet's mode again. An agent put in Manual produced
    // the expected approval cards on its first run, and then every in-progress
    // row's footer read "In Auto Mode" -- which was not a display bug. The grant
    // really was gone. A mode chosen for a thread should hold for every run in
    // that thread until it is switched back.
    //
    // So nothing is spent here any more. The grant sits on the row until the
    // user moves it or clears it, `answerModes()` keeps returning it, and the reply
    // box re-seeds from it on every open, which is what makes the footer tell
    // the truth on run two.
    //
    // WHAT DID NOT CHANGE, because it is the part that matters: the grant is
    // still NOT on the ledger. It lives in the app's own storage, written by
    // main and by nothing else (main/answer-modes.mjs), because a ledger line
    // names its own author as a plain string and nothing checks the string: a
    // worker could once have appended one line claiming to be the user and
    // handed its own next run bypassPermissions. Only the user grants one,
    // through the reply box. What this commit widens is the BLAST RADIUS of a
    // grant made deliberately, which is the point; it does not widen who can
    // make one.
    //
    // What is left here is a touch rather than a clear: it restamps the grant's
    // clock so the month-long sweep counts from this run instead of from the
    // moment the mode was picked, and a thread being worked in therefore keeps
    // its mode for as long as it is worked in. Still on the child's own
    // `spawn` event, and the reason is the reason the clear was there: `spawn`
    // is the only signal the process exists. `spawn()` returns a ChildProcess
    // before an ENOENT arrives asynchronously on 'error'.
    if (item.answerMode) {
      child.once('spawn', () => {
        try { this.store.touchAnswerMode(item.product, item.id, item.answerMode); } catch (err) {
          console.warn(`zero: could not restamp the permission mode on ${item.id}:`, err?.message ?? err);
        }
      });
    }

    const onLine = (line) => {
      if (!line) return;
      session.lastOutputAt = Date.now();
      session.tail.push(line.slice(0, 2000));
      if (session.tail.length > 200) session.tail.splice(0, session.tail.length - 200);
      this.onChange?.();
    };

    // The trace: every session's narrated actions, persisted per item under
    // the product dir. This is how the founder answers "what did the agent
    // actually DO" after the fact; the in-memory tail dies with the process.
    //
    // A TRACE THAT CANNOT BE WRITTEN MUST NOT TAKE THE APP DOWN, AND THE `try`
    // AROUND IT NEVER COVERED THAT (2026-09-04). `mkdirSync` is synchronous and
    // the `try` does catch it. `createWriteStream` is not: it returns a stream
    // and issues the real `open(2)` on a later tick, so the `try` has already
    // been left by the time the syscall runs and the failure arrives as an
    // `'error'` EVENT. An unlistened `'error'` on a stream is re-thrown by Node
    // as an uncaught exception, which in the app is the main process dying and
    // taking every running worker with it, over a diagnostic file. The same is
    // true of every `try { trace?.write(...) }` below: those catch nothing that
    // can actually happen. Measured on this branch as seven unhandled errors in
    // a suite run where `main` reports none; the shapes that produce it outside
    // a test are a product folder moved or deleted mid-run and a full disk,
    // both of which have happened here.
    //
    // AND IT IS SAID, ONCE, ON THE ROW. The trace is the only durable record of
    // what a run did, so losing it in silence is indistinguishable from the run
    // having gone fine -- which is the failure CLAUDE.md's "when the system
    // swallows something, she cannot tell it from the work not happening" is
    // about. The stream is dropped at the same time, so nothing writes into a
    // broken one again and one disk fault cannot become two hundred identical
    // lines on her card.
    let trace = null;
    const traceFailed = (err) => {
      trace = null;
      onLine(`${Name} could not write this run's record to disk (${err?.code ?? err?.message ?? err}). The run itself is unaffected; there will just be nothing to read back afterwards.`);
    };
    try {
      const traceDir = machineryPath(product.dir, path.join('sessions', item.id));
      fs.mkdirSync(traceDir, { recursive: true });
      const opening = fs.createWriteStream(path.join(traceDir, `${session.startedAt}.log`), { flags: 'a' });
      trace = opening;
      // Registered on the stream rather than on `trace`, because `traceFailed`
      // nulls `trace` and a second error on the same dead stream must still
      // find a listener rather than escaping as an uncaught exception.
      opening.on('error', (err) => { if (trace === opening) traceFailed(err); });
      trace.write(`# ${item.title}\n# ${item.id} · spawned ${new Date(session.startedAt).toISOString()}${continuation ? ' · continuation (the founder answered)' : ''}\n\n`);
    } catch (err) { traceFailed(err); }
    // Said once, on the spawn that made the links, and never again after that.
    const toolingSaid = toolingLine(tooling);
    if (toolingSaid) {
      onLine(toolingSaid);
      try { trace?.write(`${toolingSaid}\n`); } catch {}
    }
    // THE READERS, SWAPPED ONCE PER SESSION AND NEVER PER LINE.
    //
    // The two engines say the same four things in two different vocabularies:
    // Claude Code writes one JSON object per line of stdout, `codex app-server`
    // raises a JSON-RPC notification with a method and params. `readersFor`
    // picks the matching set of four, once, and everything below is written
    // against whichever it handed back.
    //
    // The alternative -- re-serialising every Codex notification into a fake
    // stdout line so the Claude readers worked untouched -- was rejected on
    // purpose: it is objects to JSONL and back for no gain, and it would hide
    // the real camelCase/snake_case divergence between app-server and the
    // `codex exec` stream the removed August build parsed, which is exactly the
    // difference a future reader has to be able to see.
    const { capture, stream, summarize, trace: traceOne } = readersFor(engine);
    const activity = engine === 'codex' ? codexActivity : claudeActivity;
    // One frame of a session, whatever a frame is on this engine: a line of
    // stdout, or a method and its params.
    const absorb = (...frame) => {
      session.lastOutputAt = Date.now();
      capture(session, ...frame);
      if (activity(session, ...frame)) this.onChange?.();
      if (session.remoteHeld && engine === DEFAULT_ENGINE) {
        try {
          const event = JSON.parse(frame[0]);
          if (event.type === 'result') {
            session.remoteIdle = true; session.saying = '';
            if (!event.is_error) {
              this.store.recordSessionResult(item.product,item.id,{result:String(event.result || '(the session ended with an empty reply)')});
              session.remoteResultRecorded = true;
              if (session.lastLiveReply) this._handledAnswers.add(this._answerKey(session.lastLiveReply));
            } else {
              this._remoteControls?.set(JSON.stringify([item.product,item.id]),{state:'failed',at:Date.now(),mayBeActive:true,text:String(event.result || 'Claude could not complete the remote turn.')});
            }
            this._saveState(); this.onChange?.();
          }
        } catch(error) { console.warn('zero: remote turn writeback failed:',error.message); }
      }
      if (engine === DEFAULT_ENGINE) {
        try {
          const names = nativeCommandNames(JSON.parse(frame[0]));
          if (names) { this._nativeCommands ??= {}; this._nativeCommands[item.id] = names; this._saveState(); }
        } catch { /* Non-JSON output is handled by the existing readers. */ }
      }
      // THE MOMENT THE ID ARRIVES, AND NOT ON EXIT. Writing it on exit is
      // what threw it away: the interruptions this exists for (the lid, a
      // crash, the app being killed) are precisely the ones where no exit
      // handler ever runs. It costs one small write per session.
      if (session.sessionId && !session.idRemembered) {
        session.idRemembered = true;
        this._liveSessions[item.id] = {
          sessionId: session.sessionId,
          product: item.product,
          cwd,
          profile,
          // WHICH CLI THIS ID BELONGS TO, and without it a restart cannot tell.
          // Both engines record a bare session id here, they keep their
          // transcripts in completely different places, and `transcriptFile`
          // has to find the right one before anything resumes: a Codex id
          // looked for under `~/.claude/projects` is a session that reads as
          // vanished, and the sweep's answer to a vanished session is to leave
          // the row stranded waiting for her.
          engine,
          continuation: !!continuation,
          startedAt: session.startedAt,
        };
        // AND THE ROW'S CHAT, written at the same instant and for the same
        // reason. A resumed session announces the id it is resuming, so this
        // records the same id it already held and the thread keeps its name
        // across as many replies as she writes.
        this.rememberRowSession(item, { sessionId: session.sessionId, cwd, profile, engine, startedAt: session.startedAt });
        this._saveState();
      }
      // THE SENTENCE BEING TYPED, WHILE IT IS BEING TYPED. This is the only
      // reader of the partial frames and it writes nothing to disk; a push
      // is fired for it because `onLine` below sees nothing in those frames
      // and would leave her screen still.
      if (stream(session, ...frame)) this.onChange?.();
      onLine(summarize(...frame));
      const detail = traceOne(...frame);
      if (detail) try { trace?.write(detail + '\n'); } catch {}
    };
    // A Codex worker has no stdout of ours to read: main/codex-session.mjs
    // emits the server's own notifications rather than faking a pipe. See the
    // note at the top of that file for why.
    if (engine === 'codex') {
      child.on('event', (method, params) => {
        // THE CONVERSATION HALF OF THE ARTIFACT, KEPT AS IT GOES PAST. The
        // other engine's is on disk and read once at the exit; this one is
        // delivered as notifications and is gone the moment they are handled,
        // so a Codex card had only the disk half until this line existed.
        rememberCodexChange(session, method, params);
        absorb(method, params);
      });
    }
    else {
      let buffer = '';
      child.stdout.on('data', (d) => {
        buffer += d.toString();
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (!line.trim()) continue;
          absorb(line);
        }
      });
    }
    child.stderr.on('data', (d) => {
      onLine(`stderr: ${String(d).slice(0, 500)}`);
      try { trace?.write(`stderr: ${String(d).slice(0, 1000)}\n`); } catch {}
    });
    const answerAtSpawn = item.answer ?? null;
    let exited = false;
    // `how` IS THE THIRD ARGUMENT ONLY THE CODEX FACADE SENDS, and it is
    // undefined for a real ChildProcess, which is every Claude Code worker.
    // Today it carries one fact: the shared `codex app-server` died under this
    // thread, so the run ended for a reason that has nothing to do with the
    // item. Written onto the session because that is what `settleDelivery`
    // reads, and read there rather than here so the decision stays in the one
    // method that owns it. See `onClosed` in main/codex-session.mjs.
    child.on('exit', (code, signal, how) => {
      if (exited) return;
      exited = true;
      if (how?.transportFault) session.transportFault = true;
      session.exitFailed = !!(signal || code !== 0 || session.transportFault || session.resultIsError || session.result == null);
      onLine(`session exited (${code})`);
      // WHAT THE RUN CHANGED, SAVED WHERE SHE CAN OPEN IT.
      //
      // A tester could not see code on their onboarding call because there was no
      // artifact to open. This is the line that makes one exist: the moment a
      // worker exits, its own transcript is read for the edits it made, the
      // checkout is read for what actually moved on the disk, and the two are
      // written together to `runs/<item>/the-change-it-made.change` inside the
      // product. The disk half is what makes a run that used sed show anything
      // at all; see the top of main/git-change.mjs for why both are read.
      //
      // BEFORE `trace.end`, because the chip on her card is found by reading
      // the run's own trace for paths (renderer/src/run-files.ts). Writing the
      // file and not naming it in the trace would put a change on disk that
      // nothing on the screen can reach, which is the bug we started from.
      //
      // Most runs write nothing here and that is correct: a session that
      // answered a question or drew a page has no code to show, and
      // writeChangeForRun returns null rather than leaving an empty artifact.
      try {
        // AND WHAT THE DISK SAYS, WHICH DOES NOT CARE HOW THE AGENT TYPED.
        // The photograph taken at the spawn, read against the checkout now.
        let repos = [];
        try {
          if (session.repoBefore) repos = [changeFromRepo(session.repoBefore)];
        } catch (e) { console.warn('zero: could not read the repository back:', e.message); }
        const roots = [cwd, product.dir];
        const wrote = writeChangeForRun({
          // WITH THE ENGINE, or this looks for a Codex rollout under Claude
          // Code's projects folder and reads nothing. It is still passed for a
          // Codex run, because `transcriptFile` is also what the wake sweep
          // asks whether a session still exists.
          transcript: this.transcriptFile({ sessionId: session.sessionId, profile, engine, cwd }),
          // AND FOR CODEX THE CONVERSATION HALF COMES FROM THE TURN INSTEAD.
          // `changeFromTranscript` speaks Claude Code's JSONL and nothing else,
          // so a rollout handed to it yields nothing and the card carried the
          // disk half alone: no per-file hunks off the patch tool, and none of
          // the agent's own sentences beside them. The frames were kept as they
          // went past (`rememberCodexChange`), with the same roots this call
          // uses, so the two halves are read against one set of spellings.
          change: engine === 'codex'
            ? changeFromCodexTurn(session.codexChange ?? [], { roots, since: session.startedAt ?? 0 })
            : null,
          docsDir: product.dir,
          itemId: item.id,
          roots,
          since: session.startedAt ?? 0,
          repos,
        });
        if (wrote) {
          const at = new Date().toTimeString().slice(0, 8);
          try { trace?.write(`${at}  [Write] ${wrote}\n`); } catch {}
          onLine(`saved what this run changed (${changePath(item.id)})`);
        }
      } catch (e) { console.warn('zero: could not save what the run changed:', e.message); }
      try { trace?.write(`\n# exited (${code}) ${new Date().toISOString()}\n`); trace?.end(); } catch {}
      this.removeSpawnFiles(session);
      this.endSession(item, session, product);
      if (session.remoteIdle) {
        delete this._liveSessions[item.id];
        this._saveState(); this.onChange?.(); return;
      }
      // AND THE SAME WRITEBACK FOR A PRODUCT ROW WHOSE SESSION HAD NO STORE
      // TOOLS, which is every row on an install that ships without one.
      // Agentbox ships no store MCP (config.storeMcpCommand is null), so on a
      // stranger's Mac a worker runs the whole job and then has no way at all
      // to put its result on the row.
      //
      // The mechanism is the one personal sessions have always used, for the
      // identical reason: the session cannot speak on the row, so the
      // supervisor speaks for it. `blocked` parks the thread in her inbox with
      // the result showing, and her reply reopens it (statusForReply).
      //
      // Only when the session finished cleanly. An error result (a usage cap, a
      // crash) is what the retry and backoff machinery below is for, and writing
      // it as an answer would take the row out of their reach.
      //
      // AND FOR A SLASH COMMAND ON EVERY INSTALL, INCLUDING ONES THAT DO HAVE A
      // STORE MCP, which is the whole of's second half. She was right, and it
      // was only true on a machine like her own. MEASURED end to end on this
      // branch (`scripts/what-usage-shows-her-in-the-app.mjs`, both configs):
      // with no store MCP the table came back on the row in 4.8s and her inbox
      // showed it; with a store MCP configured the identical run left `result:
      // ""`, the row sat in In progress reading "The agent stopped without
      // finishing this", and her inbox read INBOX ZERO. The answer existed only
      // in the trace on disk.
      //
      // The store test asks "does the session own its own row", and for a
      // command the answer is no on any machine: `/usage` is Claude Code's own
      // word, there is no worker inside it, it never reads a brief and it has
      // never heard of the store. So the supervisor speaks for it, exactly as
      // it does for a personal thread.
      if (this.speaksForTheSession(session, { command: !!plan.command })) {
        try {
          this.store.recordSessionResult(item.product, item.id, {
            result: session.result || '(the session ended with an empty reply)',
          });
        } catch (e) { console.warn('zero: writeback for a toolless session failed:', e.message); }
      } else if (this.closingMessageIsTheAnswer(session)) {
        // THE SAME WRITEBACK FOR A WORKER THAT DOES HOLD THE STORE TOOLS, minus
        // the status: that worker owns its row's status and has already set it.
        // `closingMessageIsTheAnswer` says why this is the fix for the answer
        // she read twice, and why it is not one more fold.
        try {
          this.store.recordSessionResult(item.product, item.id, { result: session.result, status: null });
        } catch (e) { console.warn('zero: writing the closing message as the answer failed:', e.message); }
      }
      this.releaseFinishedClaim(item, session);
      // NOTHING HERE TOUCHES `_rowSessions`, and that is the whole change of. A
      // finished session has nothing left to RESCUE, which is what this line is
      // about, but it is exactly the session her next reply should go back to.
      // `pruneRowSessions` is what eventually forgets it.
      this.forgetFinishedSession(item, session);
      this.noteExitForBackoff(session, { onLine });
      const carryingAnswer = continuation && answerAtSpawn;
      if (carryingAnswer) this.settleDeliveryAndSay(item, answerAtSpawn, session, signal, { command: !!plan.command });
      // AND THE REPLY THE USER TYPED INTO A RUN THAT WAS NOT CARRYING ONE. Ordinary
      // fresh work never reached the line above, so a correction steered into a
      // working session was acted on, answered, and then remembered as owed
      // forever (`settleLiveReply`, and the numbers are with it). Its own
      // statement rather than a branch of the chain below: this settles the
      // user's words, and the chain below is about what the RUN did.
      if (!carryingAnswer && session.lastLiveReply) this.settleLiveReply(item, session);
      // Fresh work only. A continuation already has its own memory (one spawn
      // per answer, capped), and a session WE killed is not evidence the row
      // has nothing left in it, the same reasoning settleDelivery uses. Its
      // own `if`: the settle above is about the user's words and this is about the
      // run, and a run that carried a live reply still has to be noted here.
      if (!continuation && !session.stoppedByUs) {
        // A session that never got an id and never said a word never started:
        // Claude Code announces itself with `session_id` on its first line of
        // output, so a session with neither died before the CLI was running.
        const everRan = session.sessionId != null || session.result != null;
        const outcome = this.noteFreshRun(item, { everRan, account: session.accountFault?.account ?? null });
        if (outcome === 'rested') {
          const until = this.restingUntil(item);
          if (until > Date.now()) onLine(`nothing moved on this row; resting ${Math.round((until - Date.now()) / 60_000)}m`);
          // AND IT SAYS SO ON THE ROW. `rested` means the run ended and the row
          // is exactly as it was; a null result means the worker never got far
          // enough to write a word. That pair is the silent failure she was
          // left reading nothing about for a whole day, and this is the only
          // place in the app that can see it, because the worker that would
          // normally speak is the thing that died.
          //
          // Written when the session said NOTHING SHE CAN USE. A worker that
          // ran and chose to leave the row open has spoken for itself and is
          // not overwritten here.
          //
          // AN ERROR RESULT COUNTS AS SAYING NOTHING. This used to read
          // `session.result == null`, and a refused account does not die
          // silently: it reports a failed turn, so `result` is the tool's own
          // error text and this test was false. The other writer,
          // `speaksForTheSession`, excludes an error result too, deliberately,
          // because raw CLI words must never reach her row. So a run that died
          // WITH a diagnosis fell between the two guards and wrote nothing at
          // all, which is the worst of the three outcomes: the run that knew
          // most about what was wrong was the one that said least.
          //
          // MEASURED on her own store, 2026-08-27: 747 runs across 146 rows
          // ended with an error result. On Agentbox alone, 18 of the 74 rows this
          // touched still carried no word about it, one of them after 236 dead
          // runs on the same task. She read an inbox that looked idle.
          if (saidNothingSheCanUse(session)) this.sayTheRunDied(item, session);
        }
      }
      this.onChange?.();
      // Accepted live input is already in the provider conversation. On a
      // failed run release the latest delivery so resuming that same conversation
      // carries the correction again through the ordinary bounded retry path.
      if (session.lastLiveReply && session.exitFailed)
        this.redeliverAnswer(session.lastLiveReply, session.lastLiveReply.answer);
      if (!session.stoppedByUs) this.deliverMidflightReply(item, answerAtSpawn);
      if (engine === 'codex') this._releaseIdleCodex(profile);
      // The item's own status was written by the worker through the MCP; if it
      // died without writing, the lease expires and the next tick re-pulls it.
    });
    this.onChange?.();
  }

  /* --------------------- what she attached, and the thread ---------------- */
  // THE FILES A TASK CARRIES, AS PATHS A STRANGER PROCESS CAN ACTUALLY OPEN.
  //
  // Attached screenshots were reaching the ledger and stopping there. A pasted
  // image lands in the body as `![shot.png](attachments/x-shot.png)`, which is
  // right for the reading pane and useless to a worker: the path is relative to
  // the product dir, the worker's cwd is the code repo when one is registered,
  // and NOTHING IN THE BRIEF EVER SAID TO OPEN IT. Measured by folding each row
  // to the moment each session was spawned and then looking for the file's name
  // anywhere in that session's log: about half the sessions handed a task
  // carrying an attached picture never opened it. The instruction was half in
  // words and half in the picture, and only the words were delivered.
  //
  // Absolute, because relative was the bug. Existence-checked, because a path
  // that 404s teaches a worker to distrust the whole section. Pictures first
  // and named as pictures, because those are the ones carrying an instruction.
  /**
   * Every file this row names that really is on disk inside the product, split
   * into the pictures and the rest. One walk, because two callers want it: the
   * block below, which is prose, and a Codex turn, which carries the pictures
   * themselves.
   */
  attachedFiles(item, product, thread = []) {
    const texts = [item.body, item.answer, item.result, item.note, ...thread.map((t) => t.text)];
    const files = [];
    // `dir` is what lets a path a worker wrote out in full from the root reach
    // the next worker too. It comes back short, so the join below and its
    // guard are unchanged.
    for (const rel of referencedFiles(...texts, { dir: product?.dir ?? '' })) {
      const abs = path.join(product.dir, rel);
      // Never let a crafted path walk out of the product it belongs to.
      if (!abs.startsWith(product.dir + path.sep)) continue;
      let ok = false;
      try { ok = fs.statSync(abs).isFile(); } catch { ok = false; }
      if (ok) files.push({ abs, image: isImagePath(rel) });
    }
    return files;
  }

  /**
   * THE PICTURES SHE ATTACHED THAT ARE NOT THERE ANY MORE, as short paths.
   *
   * A PICTURE THAT WENT MISSING IS NOT THE SAME AS NO PICTURE, and until this
   * the brief could not tell them apart. `attachedFiles` drops anything that
   * does not resolve, deliberately, so the section never names a file a worker
   * cannot open. That is right for the list and wrong for the silence around
   * it: her instruction is half in the image, and a worker handed the words
   * alone has no way to know the other half existed. It does confident work on
   * half an instruction, which is the failure this whole block was written for.
   *
   * ONLY UNDER `attachments/`, which is the difference between a fact and a
   * guess. That folder is where the app itself writes every picture she pastes
   * or attaches, so a name missing from it WAS an attachment and is gone. A
   * `.png` anywhere else in her prose is usually just a word, "the old logo.png
   * was better", and warning about those would teach a reader to skim the one
   * warning that matters.
   */
  lostPictures(item, product, thread = []) {
    if (!product?.dir) return [];
    const texts = [item.body, item.answer, item.result, item.note, ...thread.map((t) => t.text)];
    const lost = [];
    for (const rel of referencedFiles(...texts, { dir: product.dir })) {
      if (!isImagePath(rel) || !rel.startsWith('attachments/')) continue;
      const abs = path.join(product.dir, rel);
      if (!abs.startsWith(product.dir + path.sep)) continue;
      let ok = false;
      try { ok = fs.statSync(abs).isFile(); } catch { ok = false; }
      if (!ok) lost.push(rel);
    }
    return lost;
  }

  /**
   * THE PICTURES THEMSELVES, FOR THE ENGINE THAT CAN BE HANDED ONE (MP-09).
   *
   * Claude Code opens them off the paths in the brief, which is what the block
   * below is for and what the 2026-08-21 measurement was about. Codex takes
   * images in the turn itself, so on that engine the picture rides beside the
   * words instead of being a path in prose it has no Read tool to act on.
   */
  attachedPictures(item, product, thread = []) {
    if (!product?.dir) return [];
    return this.attachedFiles(item, product, thread).filter((f) => f.image).map((f) => f.abs);
  }

  attachmentBlock(item, product, thread = [], engine = DEFAULT_ENGINE) {
    const files = this.attachedFiles(item, product, thread);
    const lost = this.lostPictures(item, product, thread);
    if (!files.length && !lost.length) return '';
    const pictures = files.filter((f) => f.image);
    const others = files.filter((f) => !f.image);
    const lines = ['', '# The files this task carries', ''];
    if (pictures.length) {
      lines.push(
        pictures.length === 1
          ? 'THE FOUNDER ATTACHED A PICTURE. READ IT BEFORE YOU DO ANYTHING ELSE.'
          : `THE FOUNDER ATTACHED ${pictures.length} PICTURES. READ THEM BEFORE YOU DO ANYTHING ELSE.`,
        'Half of what they asked for is in the image and none of it is in the text.',
        // THE TRUE SENTENCE ON EACH ENGINE. `Read` is Claude Code's tool and
        // Codex has nothing by that name, so naming it there sent a worker
        // looking for something that does not exist. Codex is handed the
        // picture in the turn instead (`codexTurnParamsFor`), so the honest
        // instruction is that it is already in front of it.
        engine === 'codex'
          ? 'Each one is attached to this message as an image, and is also on disk at the absolute path below.'
          : 'Open each one with the Read tool, at the absolute path below.',
        '',
        ...pictures.map((f) => `- ${f.abs}`),
      );
    }
    if (others.length) {
      if (pictures.length) lines.push('');
      lines.push('Other files this task refers to, at the paths that resolve:', '', ...others.map((f) => `- ${f.abs}`));
    }
    // Last, and never as a path: what it prints is the short name she would
    // recognise, because an absolute path here would read like somewhere to go
    // and look and there is nothing at the end of it.
    if (lost.length) {
      if (pictures.length || others.length) lines.push('');
      lines.push(
        lost.length === 1
          ? 'THEY ATTACHED A PICTURE THAT IS NO LONGER ON DISK, so you cannot see it.'
          : `THEY ATTACHED ${lost.length} PICTURES THAT ARE NO LONGER ON DISK, so you cannot see them.`,
        'Part of what they asked for was in it and that part did not reach you.',
        'Do not guess at what it showed. Say plainly that it is missing and ask them.',
        '',
        ...lost.map((rel) => `- ${rel}`),
      );
    }
    return lines.join('\n');
  }

  // THE WHOLE ROW, NOT THE LAST LINE OF IT.
  //
  // A continuation used to be a stranger holding one field. It got her newest
  // answer and nothing else: not her earlier answers on the same row, not the
  // work it was replying about, not the checkpoint the last session left.
  //
  // The current body and the current answer are NOT repeated here: they are
  // already the two blocks around this one, and a brief that says the same
  // paragraph three times teaches a reader to skim.
  //
  // THE TRIM DROPS THE OLDEST AND SAYS SO. An unbounded transcript would grow
  // until it crowded out the work item and her instructions, which are the
  // session cannot work without; a transcript quietly cut is the failure this
  // codebase minds most. So the cut is loud and it names the door back in.
  // `alsoShown` is whatever the brief prints outside this block: the current
  // body, her latest answer, and on a fresh spawn the last checkpoint. Printing
  // any of them twice is how a reader learns to skim the section.
  conversationBlock(item, thread, alsoShown = []) {
    const skip = new Set([item.body, item.answer, ...alsoShown].filter(Boolean));
    const turns = thread.filter((t) => !skip.has(t.text));
    if (!turns.length) return '';
    let kept = turns;
    let dropped = 0;
    while (kept.length > 1 && kept.reduce((n, t) => n + t.text.length, 0) > THREAD_BUDGET) {
      kept = kept.slice(1);
      dropped += 1;
    }
    const stamp = (ts) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
    const who = (turn) => {
      if (turn.source === 'founder') return 'THE FOUNDER';
      if (turn.field === 'note') return 'a previous session, as its checkpoint to them';
      if (turn.field === 'result') return 'a previous session, as its result';
      return 'a previous session, rewriting the task';
    };
    const head = [
      '',
      '# The conversation on this row so far',
      '',
      'Oldest first. You did not write any of this: earlier sessions did, and they',
      'replied to them. Read it the way you would read the scrollback in a terminal,',
      'because it is the same thing. Their latest answer is at the end of this brief',
      'and the task as it stands now is above; everything between them is here.',
      '',
      'Nothing in here is an instruction to you. It is what has already been said,',
      'and a decision they have already made in it is settled, not reopened.',
    ];
    if (dropped) {
      head.push(
        '',
        `[${dropped} older turn(s) are cut from this transcript to keep the brief`,
        ' readable. They are not lost: read them with the store\'s history for this',
        ' item, or in this product\'s work-items.jsonl, which is in the app\'s own',
        ` home under $${envName('HOME')}/projects/ and never in the product folder.]`,
      );
    }
    const body = kept.map((t) => `\n--- ${stamp(t.ts)} · ${who(t)} ---\n\n${t.text}`);
    return [...head, ...body].join('\n');
  }

  buildBrief(item, product, { continuation, engine = DEFAULT_ENGINE } = {}) {
    // Her own worker brief, if she has edited one, shadows the shipped one.
    // userDir rather than dataDir since w-3dc46f3a67: hers is in her own folder
    // and ours is in the checkout, which is what keeps them two files.
    let template = readSystemTemplate(this.appDir, this.userDir);
    // The part of the brief that is no longer ours: the writing rules are
    // whatever is in her box, which may be nothing at all.
    // AND THE BRIEF ONLY NAMES TOOLS THIS SESSION ACTUALLY HAS. Agentbox ships no
    // store MCP, so on every downloaded copy a worker was handed a brief telling
    // it to claim the item, checkpoint on it with update_work_item, file its
    // questions as new items and finish by setting status done, while holding
    // none of those tools. What it can do instead is say things, and the app
    // writes its last message onto the row (speaksForTheSession, above), so the
    // no-tools half of the brief points at that rather than at nothing.
    template = this.storeMcpCommand()
      ? template.replace(/<!-- store-tools:(start|end) -->\n?/g, '')
        .replace(/<!-- no-store-tools:start -->[\s\S]*?<!-- no-store-tools:end -->\n?/g, '')
      : template.replace(/<!-- no-store-tools:(start|end) -->\n?/g, '')
        .replace(/<!-- store-tools:start -->[\s\S]*?<!-- store-tools:end -->\n?/g, '');
    // And the third: how to finish one run of a repeating task, which is 1,103
    // characters of the brief and applies to a run that repeats. It was pasted
    // in front of every worker, including the ones on a one-off task that will
    // never run again. A repeat run carries a repeat:<rule> label and nothing
    // else does, so the label is the switch.
    template = ruleIdOf(item)
      ? template.replace(/<!-- repeat-rules:(start|end) -->\n?/g, '')
      : template.replace(/<!-- repeat-rules:start -->[\s\S]*?<!-- repeat-rules:end -->\n?/g, '');
    // And the fourth: her rule about when a piece of work gets its own row.
    // Always kept; only its markers come out.
    template = template.replace(/<!-- subagent-rule:(start|end) -->\n?/g, '');
    // THE WRITING RULES ARE NO LONGER SPLICED IN HERE (w-3dc46f3a67). They are
    // half of one message-rules document now and ride in the system prompt with
    // the rest of it, where a personal task gets them too. The placeholder is
    // gone from the brief we ship; this line stays so that a worker.md somebody
    // customised before the change does not grow a stray HTML comment.
    template = template.replace(/<!-- writing-rules -->\n?/g, '');
    // A SHARED STATE PAGE WAS INJECTED HERE AND IS GONE (w-6aa47c97c1).
    // It carried the product's page in whole, capped at 8000 characters, and
    // the cap is the shape of why it went: over that, a session was handed a
    // state cut off mid-sentence and could not tell. The comment where its
    // gate used to live, a few hundred lines up, has the measurements.
    // THE ROW'S OWN TRANSCRIPT AND THE FILES ON IT. Read once, used twice: the
    // file list scans the whole thread, because a picture she attached three
    // replies ago is still the picture the current instruction is about.
    let thread = [];
    try { thread = this.store.readThread?.(item.product, item.id) ?? []; } catch { thread = []; }
    const files = this.attachmentBlock(item, product, thread, engine);
    const conversation = this.conversationBlock(item, thread, !continuation && item.note ? [item.note] : []);
    const header = [
      `# Your work item`,
      ``,
      `Product: ${product.name} (slug: ${item.product})`,
      `Product docs live in: ${product.dir}`,
      product.repoPath ? `Product code repo (your cwd): ${product.repoPath}` : `No code repo is registered for this product.`,
      this.shipsThroughTheApp(product) ? this.shipBrief() : '',
      `Work item id: ${item.id}`,
      `Title: ${item.title}`,
      item.body ? `\n${item.body}` : '',
      files,
      conversation,
      continuation && item.answer
        ? `\n# The founder has answered\n\nThis item is a ${item.kind === 'review' ? 'review you filed; their answer is the verdict. Enact it (an approval means do the thing the review proposed: merge, ship, send), then update the item' : item.kind === 'question' ? 'question you (or a prior worker) asked' : 'work item the founder has replied to; their reply may have arrived after a prior session finished it, so read the item\'s result and status first'}. The founder's answer:\n\n> ${item.answer}\n\n${item.kind === 'review' ? '' : 'THE ANSWER SETTLES EXACTLY WHAT THE QUESTION ASKED, NOTHING MORE. Record the decision, apply it to the item, and update the item. If acting on it implies new work beyond this item\'s own scope (building something, spending something, a new stage of the product), that work is a PROPOSAL: file it and stop. "Native, not web" authorizes the choice of shell; it does not authorize building the app. This exact overreach already burned a day of the founder\'s trust.'}`
        : item.answer
          ? `\n# The founder has weighed in on this item\n\n> ${item.answer}\n\nThis is steering; follow it.`
          : '',
      !continuation && item.note ? `\nLatest checkpoint from a prior session:\n> ${item.note}` : '',
      // ONE OF THEIR OWN AGENTS, WHEN THE ROW IS ONE. The first run files a
      // row per imported agent asking for its first job, and the reply is that
      // job. Without this the only thing naming the agent is the body, which
      // reads as a description of the app rather than as the instruction it
      // is, and the session would answer as itself. Empty on every other row
      // in the inbox, which is nearly all of them.
      importedAgentBrief(importedAgentName(item)),
    ].join('\n');
    // THE APP'S OWN NAME, LAST. The briefs are markdown and cannot import
    // anything, so they carry {{name}} and {{Name}} and this is where those
    // become words. It runs over the whole assembled brief, so her own edits
    // to the briefs in Settings can use the same two tokens and follow a
    // rename too. Her saved copy keeps the tokens; only what a session reads
    // has the name in it.
    return fillName(`${header}\n\n---\n\n${template}`);
  }

  // What a spawned worker is allowed to do when the founder has not said.
  //
  // This used to be a flat default naming an outside server's tools, which
  // was correct only while an outside MCP server was guaranteed to be there. It
  // is not there any more: Agentbox ships no store server, so on a fresh install
  // that flag named a tool namespace that does not exist, and a worker would
  // come up holding nothing while still looking configured.
  //
  // So the default is derived, not fixed. With a store MCP configured, workers
  // get exactly the grant they always had. With none, they get no tool flags at
  // all, which in headless mode is a session that can read and talk but cannot
  // edit files or run commands. That is a real reduction and it is deliberate:
  // an honest read-only worker beats one that claims tools it cannot call.
  // `sessionArgs` in zero.config.json still overrides this outright.
  defaultSessionArgs() {
    if (Array.isArray(this.config.sessionArgs)) {
      const args = storeGrantUnderAnyOfOurNames(this.config.sessionArgs);
      // SAID ONCE, because a grant that is quietly corrected is a config that
      // stays wrong forever and a behaviour nobody can account for later.
      if (!this._warnedRenamedGrant && args !== this.config.sessionArgs) {
        this._warnedRenamedGrant = true;
        console.warn(
          `${NAME}: sessionArgs grants the store under a name this app used to have. ` +
          `Workers are being given mcp__${STORE_SERVER} instead, which is what the store ` +
          'server is called now. Update sessionArgs in zero.config.json to stop this.'
        );
      }
      // A config that grants the store tools while no store server is
      // configured is the one way this change can bite an existing install:
      // the flag is accepted, the tools are simply not there, and workers
      // quietly fall back to editing files by hand instead of going through
      // the store's write path. Say it once, loudly, rather than let a fleet
      // run for a night on a grant that resolves to nothing.
      if (!this._warnedGrant && args.includes(`mcp__${STORE_SERVER}`) && !this.storeMcpCommand()) {
        this._warnedGrant = true;
        console.warn(
          `${NAME}: sessionArgs grants mcp__${STORE_SERVER} but no storeMcpCommand is configured, ` +
          'so spawned workers will have NO store tools. Set storeMcpCommand in zero.config.json ' +
          `to an MCP launcher, or drop mcp__${STORE_SERVER} from sessionArgs.`
        );
      }
      return args;
    }
    // AND the mode it runs in is stated rather than inherited. With no flag at
    // all, Claude Code falls back to whatever that person's own
    // ~/.claude/settings.json says, so two machines running the same Agentbox
    // could be on two different modes and neither would ever be told. Auto is
    // the one she named: Claude Code checks each tool call for risk and prompt
    // injection, runs the lower-risk ones and blocks the rest. A founder who
    // has set sessionArgs by hand is untouched, because that branch returns
    // above.
    const grant = ['--permission-mode', 'auto'];
    return this.storeMcpCommand() ? ['--allowedTools', `mcp__${STORE_SERVER}`, ...grant] : grant;
  }

  // THE MODE A ROW WILL ACTUALLY RUN IN, resolved exactly the way spawnPlan
  // resolves it, so the reply box can print the truth rather than an
  // approximation of it.
  //
  // Caught in review, 2026-08-23: the footer was being handed the WORKSPACE
  // mode alone, which is wrong on a fresh install (no sessionArgs at all, so
  // the workspace reads `custom` while workers really start in auto), wrong on
  // any project with an override, and wrong on a personal project, which runs
  // its own arg list entirely. A chip that says Manual over a session running
  // in bypass is worse than no chip.
  //
  // It takes the same three branches spawnPlan does and in the same order, and
  // it is right here beside it so the two cannot drift apart quietly.
  effectivePermission(slug) {
    return permissionMode(this.projectSessionArgs(slug) ?? this.defaultSessionArgs());
  }

  // THE STORE SERVER SHIPS WITH THE APP NOW, so this answers without a config.
  //
  // It used to be null unless the founder pointed `storeMcpCommand` at an
  // executable, and hers pointed into another product's checkout, which is how
  // a fix to her inbox had to be merged into that product's repo. The server is
  // 21 files; they live in `mcp/` here.
  //
  // A configured path still WINS, because a founder who set one meant it and a
  // downloaded copy may be running from somewhere the bundled script is not
  // executable. A configured path that no longer exists falls through to the
  // bundled one rather than to null: on this machine that is the difference
  // between every worker having its tools and none of them having any.
  storeMcpCommand() {
    const cmd = this.config.storeMcpCommand;
    if (cmd && typeof cmd === 'string' && fs.existsSync(cmd)) return cmd;
    const bundled = unpacked(path.join(this.appDir, 'mcp', `${nameSlug}-mcp.sh`));
    return fs.existsSync(bundled) ? bundled : null;
  }

  // Whether the supervisor has to write this session's result onto its row,
  // because the session itself had no tool that could. True on any install
  // with no store MCP, which is every downloaded copy of Agentbox. False on a
  // machine that has one: there the worker owns its own row, and a row it
  // deliberately left open is a live thread, not a failure to report.
  //
  // A session that ended in an error is excluded, because that is not a report;
  // it is the case the retry and backoff paths exist for.
  //
  // A COMMAND RUN IS ALWAYS SPOKEN FOR, store MCP or not. The store test above
  // asks whether the session owns its own row, and one of Claude Code's own
  // eight commands does not: it carries no brief, it has never heard of the
  // store, and its whole life is printing a table and exiting. The call site
  // says why this had to change and what it cost her.
  speaksForTheSession(session, { command = false } = {}) {
    if (this.storeMcpCommand() && !command) return false;
    return this.runFinished(session);
  }

  // A CLEAN RESULT IS NOT A FINISHED RUN WHEN THE RUN WAS STOPPED PART-WAY.
  //
  // A result arrives at the end of every turn, and a turn can end with helpers
  // still out: "three builders are working, I'll stack them once they're
  // done". The session stays open for them (main/claude-input.mjs). If it is
  // then stopped, by a hang check fooled by a sleep or an app restart, its last
  // result is a promise, and reading it as the end of the run dropped the
  // record it resumes from and landed the promise on her row as the answer
  // (tests/a-worker-whose-helpers-are-still-working-does-not-come-back-to-you).
  // The input pipe knows: it only closes at a result with nothing out. A child
  // that cannot say (a Codex turn) keeps the old reading.
  runFinished(session) {
    if (session?.result == null || session.resultIsError) return false;
    return session.child?.ranToTheEnd?.() !== false;
  }

  // A session that finished under its own power has nothing left to resume.
  // ANYTHING ELSE STAYS REMEMBERED, and that includes a kill of ours: an app
  // quit is the commonest way her fleet dies, and it is the case where going
  // back to the same session rather than briefing a stranger is worth the
  // most. What keeps that honest is the sweep's own guard: it only ever puts a
  // worker back on a row that is still open or claimed.
  forgetFinishedSession(item, session) {
    if (!this.runFinished(session)) return false;
    delete this._liveSessions[item.id];
    this._saveState();
    return true;
  }

  // A WORKER'S CLOSING MESSAGE IS ITS ANSWER, ON EVERY INSTALL.
  //
  // The answer she read twice (w-23d09d72ce, and w-0184f6e3f8 and w-94b3af4e70
  // before it) was never a writing fault. A worker holding the store tools was
  // told to write its answer to the row's `result` and then, being a Claude
  // Code session, it ended the way every session ends: by saying its answer.
  // Two surfaces, one answer, drawn one under the other. A fold in the thread
  // and two rewrites of the brief tried to stop the second copy after the
  // fact; one run had "the answer is written once" in its
  // own brief and wrote it twice anyway, three seconds apart.
  //
  // So the second surface goes. A downloaded copy with no store tools has
  // always worked this way (`speaksForTheSession`): the run says its answer
  // once, as its last message, and the supervisor lands that message on the
  // row. The same now holds where the tools exist. The worker keeps them for
  // claiming, checkpointing, status and filing, and its answer is simply the
  // last thing it says. The trace's copy and the row's copy are then the same
  // string, and the thread draws a row field and its identical typed copy once.
  //
  // Nothing is written when the run already wrote its own result (a run from
  // before this brief, or one answering on purpose mid-way), because then the
  // run chose its words and they are on the row. And nothing when its claim
  // was refused: that session was told to end saying nothing, and its closing
  // line would land on a row another session is holding.
  closingMessageIsTheAnswer(session) {
    if (!this.storeMcpCommand() || session?.command) return false;
    if (!this.runFinished(session) || !String(session.result).trim()) return false;
    if (session.claimRefused) return false;
    try {
      const fresh = this.store.readItem?.(session.product, session.itemId);
      if (!fresh) return false;
      const wrote = fresh.wrote?.result;
      return !(wrote?.source === 'agent' && (wrote.ts ?? 0) >= (session.startedAt ?? 0));
    } catch { return false; }
  }

  // A clean terminal result ends the run, even if its shared tool server
  // stays alive for other turns. Release the run's claim without choosing a
  // status for the conversation. Failed runs retain the existing retry path.
  releaseFinishedClaim(item, session) {
    if (session.exitFailed || !this.runFinished(session) || session.claimRefused || session.stoppedByUs
      || !String(session.result ?? '').trim()) return;
    try {
      this.store.releaseRunClaim?.(item.product, item.id, {
        afterEpoch: item.epoch ?? 0, startedAt: session.startedAt,
      });
    } catch (error) { console.warn('zero: could not release the finished run:', error.message); }
  }

  // The permission rules handed to a worker, generated fresh at every spawn for
  // the same reason the MCP config is: the folders in them are THIS person's
  // folders. The file we ship carries the rules and an EMPTY
  // additionalDirectories, and the store root is filled in here.
  //
  // It used to ship with one developer's home folder written into it, so every
  // downloaded copy granted its agents a directory that exists on exactly one
  // Mac in the world, and granted the person who downloaded it nothing. Their
  // own store is outside their repo, so every read of their own documents
  // became an approval card.
  //
  // The product's own docs dir rides too when it sits outside the store root,
  // which is what a product with a repo of its own looks like. The worker's cwd
  // needs no grant: Claude Code always has its working directory.
  writeWorkerSettings(product = null, runId = crypto.randomUUID()) {
    const shipped = unpacked(path.join(this.appDir, 'worker-permissions.json'));
    if (!fs.existsSync(shipped)) return null;
    let rules;
    try { rules = JSON.parse(fs.readFileSync(shipped, 'utf8')); } catch { return null; }
    const dirs = [];
    const add = (d) => {
      if (!d || typeof d !== 'string') return;
      if (!dirs.some((seen) => d === seen || d.startsWith(`${seen}${path.sep}`))) dirs.push(d);
    };
    add(this.config.storeRoot);
    if (product?.dir) add(product.dir);
    rules.permissions = { ...(rules.permissions ?? {}), additionalDirectories: dirs };
    // Beside the MCP config, and written the same way: a real file on disk,
    // because the CLI reading --settings is not this process. Named by the
    // run, because two spawns with different rules must never share a file.
    const file = path.join(os.tmpdir(), `${nameSlug}-worker-settings-${runId}.json`);
    try { fs.writeFileSync(file, JSON.stringify(rules)); } catch { return null; }
    return file;
  }

  // Every Claude session can ask the user, and every one of them is a worker
  // now that personal projects are gone (w-d19d6d387c).
  prepareClaudePermissions({ args }, product, runId, spawnFiles) {
    const mcpConfig = this.writeMcpConfig(runId);
    if (!mcpConfig) return;
    spawnFiles.push(mcpConfig);
    args.push('--mcp-config', mcpConfig, '--permission-prompt-tool', 'mcp__zero-approvals__approval_prompt');
    const rules = this.writeWorkerSettings(product, runId);
    if (rules) { spawnFiles.push(rules); args.push('--settings', rules); }
  }

  // The MCP config handed to a worker, generated fresh so the paths always track
  // zero.config.json. The approvals channel is Agentbox's own and always rides;
  // the store server rides only when one is configured. Returns null when there
  // is nothing at all to offer, and the worker then runs with no MCP.
  writeMcpConfig(runId = crypto.randomUUID()) {
    const servers = this.mcpServers();
    if (!servers) return null;
    const file = path.join(os.tmpdir(), `zero-mcp-${runId}.json`);
    fs.writeFileSync(file, JSON.stringify({ mcpServers: servers }));
    return file;
  }

  /** The two per-spawn files, gone once the run is. Removing twice is nothing. */
  removeSpawnFiles(session) {
    for (const f of session?.spawnFiles ?? []) {
      try { fs.unlinkSync(f); } catch (err) { if (err?.code !== 'ENOENT') console.warn('zero: could not remove a spawn file:', err?.message ?? err); }
    }
    if (session?.spawnFiles) session.spawnFiles = [];
  }

  /** The servers themselves, apart from the file. */
  mcpServers() {
    const storeCmd = this.storeMcpCommand();
    const servers = {
      // The approvals channel: gated actions pause here and ask the
      // founder live instead of dying or bouncing back as a paste.
      'zero-approvals': {
        command: unpacked(path.join(this.appDir, 'scripts', 'approval-server.sh')),
        env: {
          ZERO_APPROVALS_DIR: path.join(this.config.storeRoot, '.approvals'),
          // HOW THAT SERVER TELLS HER ANSWER FROM A WORKER'S. The public half
          // of Agentbox's own key: it verifies and cannot sign, so handing it
          // down a channel the worker can read costs nothing. Without it the
          // server denies everything rather than believing a file, which is the
          // right way round. main/approvals.mjs holds the argument.
          ZERO_APPROVALS_PUBKEY: approvalPublicKey(),
        },
      },
    };
    if (storeCmd) {
      servers[STORE_SERVER] = {
        command: storeCmd,
        env: {
          STORE_ACCOUNT_ID: this.config.accountId,
          ...storeRootEnv(this.config.storeRoot),
          ...teamPersonEnv(),
        },
      };
    }
    if (!Object.keys(servers).length) return null;
    if (!fs.existsSync(path.join(this.appDir, 'scripts', 'approval-server.sh')) && !storeCmd) return null;
    return servers;
  }
}

// A PATH A STRANGER PROCESS HAS TO OPEN CANNOT BE INSIDE app.asar. Node's own
// fs pretends the archive is a folder, so anything we read ourselves works
// either way; the Claude CLI reading --settings, and macOS exec'ing the
// approval server, are not Node and see only a single binary file with a
// directory's name. electron-builder's asarUnpack writes real copies of those
// two beside the archive, in app.asar.unpacked, and this is how you address
// them. Outside a packaged app the substring is absent and the path is
// returned untouched.
// How much of a row's own transcript rides in a brief. Generous: the whole
// point is that a session arrives knowing what has been said, and every one of
// her rows to date fits inside this whole. It is a ceiling against a runaway
// row, not a style choice, and hitting it prints a line saying so.
const THREAD_BUDGET = 24000;

export function unpacked(p) {
  return p.includes(`${path.sep}app.asar${path.sep}`)
    ? p.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
    : p;
}

// When the founder last wrote ANYTHING to this row, from the fold's own record
// of who set each field. The app, not undefined, when she never has: this is
// compared against a stored watermark and an undefined would make every
// comparison false, so a row she has never touched would rest forever the
// moment she did touch it.
//
// FILING IS NOT SPEAKING (2026-10-01). Marking a thread Private, moving its
// priority, or editing a summary line or a link is the founder writing to the
// row, and it used to count as a word: a persona test switched a finished
// thread to Private and the agent ran again on its own, unasked and paid for.
// Those fields describe the thread; they never ask it anything.
const NOT_A_WORD = new Set(['visibility', 'priority', 'problem', 'progress', 'solution', 'blockedBy', 'blocks']);
function lastFounderWrite(item) {
  let latest = 0;
  for (const [field, w] of Object.entries(item?.wrote ?? {})) {
    if (NOT_A_WORD.has(field)) continue;
    if (w?.source === 'founder' && w.ts > latest) latest = w.ts;
  }
  return latest;
}

// Does this row already carry an agent's answer that she has not replied to?
//
// Only the RESULT counts, never a note. A note is a worker saying where it has
// got to, and a run that checkpoints and then dies has left the row genuinely
// unfinished; treating that as an answer would strand it. A result is the
// worker's finished word, and a finished word on a row still open is a thing
// waiting on her by definition. See `isFresh` for what it costs and why it
// costs her nothing.
export function awaitingHer(item) {
  const wrote = item?.wrote?.result;
  if (!wrote || wrote.source !== 'agent') return false;
  return wrote.ts > lastFounderWrite(item);
}

// The stream's own metadata, kept on the session object: the session id (what
// a personal reply resumes) and the final result message (what the founder
// reads). Recorded for every session because it is one parse we are already
// paying for; acted on where someone needs it.
function captureStream(session, line) {
  try {
    const obj = JSON.parse(line);
    if (obj.session_id) session.sessionId = obj.session_id;
    if (obj.type === 'result') {
      session.result = String(obj.result ?? '');
      session.resultIsError = !!obj.is_error;
      // A run cannot end with helpers still out. Cleared here as well as on
      // exit so the number can never outlive the thing it counts. Unless
      // something is still out in the background: then this was a turn
      // ending, not the run, and the session stays open for it.
      if (!session.child?.waitingOn?.().length) session.helperIds?.clear();
    }
    noteClaimAnswer(session, obj);
    countHelpers(session, obj);
  } catch {}
}

// Whether this run was refused its own row, off the claim call and its reply.
// `closingMessageIsTheAnswer` reads it: a refused worker is told to end saying
// nothing, and whatever it does say must not land on a row someone else holds.
// A later claim that succeeds clears it.
function noteClaimAnswer(session, obj) {
  const blocks = Array.isArray(obj?.message?.content) ? obj.message.content : [];
  for (const b of blocks) {
    if (obj.type === 'assistant' && b?.type === 'tool_use' && /claim_work_item$/.test(b.name ?? '')
      && (!b.input?.id || b.input.id === session.itemId)) {
      (session.claimCalls ??= new Set()).add(b.id);
    }
    if (obj.type === 'user' && b?.type === 'tool_result' && session.claimCalls?.has(b.tool_use_id)) {
      const text = typeof b.content === 'string' ? b.content
        : (b.content ?? []).map((c) => c?.text ?? '').join('');
      if (/"claimed"\s*:\s*false/.test(text)) session.claimRefused = true;
      else if (/"claimed"\s*:\s*true/.test(text)) session.claimRefused = false;
    }
  }
}

/**
 * `--include-partial-messages` puts `stream_event` frames on the same stdout
 * the finished messages come down. This keeps the CURRENT text block on the
 * session as it grows, and nothing else: no thinking, no tool arguments, and
 * nothing written to disk. It dies with the process, exactly like `tail`.
 *
 * ONE BLOCK AT A TIME, AND THAT IS THE POINT. A finished message becomes ONE
 * trace line per text block (`traceStreamLine`), so holding exactly one block
 * here means the live string and the traced string are the same string, and
 * the thread can drop the live copy the moment the traced one arrives without
 * guessing (`itemThread`, renderer/src/item-thread.ts).
 *
 * IT IS NOT CLEARED WHEN THE MESSAGE FINISHES, and that is deliberate. The
 * trace is written on one channel and read on another, so clearing it here
 * would blink the sentence off her screen for however long the read takes and
 * then put it back. The renderer suppresses it the moment the thread has it,
 * which is a comparison rather than a race.
 *
 * Returns true when the string moved, which is what earns a push.
 */
export function streamingText(session, line) {
  try {
    const obj = JSON.parse(line);
    if (obj.type !== 'stream_event') return false;
    const event = obj.event ?? {};
    // A new message. Whatever the last one ended on is the last one's, and the
    // trace has it by now.
    if (event.type === 'message_start') {
      session.saying = '';
      session.sayingAt = 0;
      return true;
    }
    if (event.type === 'content_block_start') {
      // Only a text block resets it. A tool call or a thought starting means
      // this message has moved on from prose, and the block already typed
      // stays on screen until the trace delivers the same words.
      if (event.content_block?.type !== 'text') return false;
      session.saying = '';
      session.sayingAt = Date.now();
      return true;
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const piece = String(event.delta.text ?? '');
      if (!piece) return false;
      if (!session.sayingAt) session.sayingAt = Date.now();
      const next = (session.saying ?? '') + piece;
      // Past the cap this stops being a sentence she is reading. Dropped
      // rather than cut, because a cut string never matches the traced one and
      // would sit under it on her screen forever.
      session.saying = next.length > SAYING_CAP ? '' : next;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// HOW MANY HELPERS THIS SESSION HAS OUT RIGHT NOW.
//
// THE ONLY TWO EVENTS THAT MATTER, and they bracket a helper exactly. Measured
// on Claude Code 2.1.246 over a real four-helper run (the probe is written up
// in decisions.md, 08-26): `task_started` carries a fresh `task_id`, and
// `task_updated` carries a `patch.status` of `completed` for that same id. Four
// starts, four completions, no id seen twice and none left open. So a set of
// live ids, and its size is the number.
//
// A SET AND NOT A COUNTER, because a counter cannot survive a duplicate: the
// stream is read line by line off a pipe, and one repeated line would leave the
// page saying five helpers are working for the rest of the run with nothing
// able to correct it. Adding an id twice is free.
//
// NESTED HELPERS ARE COUNTED THE SAME. `spawn_depth` says how deep a helper
// sits, and this deliberately ignores it: a helper's helper is still a
// subagent working on her task.
//
// THE LEAD IS NOT IN THIS NUMBER AND NEVER HAS BEEN, which is what the line
// drawn off it was getting wrong until 2026-08-27. Only a `task_started` id is
// ever added, and the lead has no `task_started` of its own.It is, so
// `shortWord` in renderer/src/live-line.ts now says Subagents, unhyphenated on
// her call of 2026-08-27 and on a count of the spelling in the Claude Code
// build she runs. If this ever starts counting the lead as well, that word has
// to move with it. DID THIS RUN LEAVE HER ANYTHING TO READ?
//
// The rule that divides the two writers, kept in one named place because
// getting it wrong is silence, and silence is the failure that matters most:
//
//   - said nothing at all   -> the supervisor speaks for it (sayTheRunDied)
//   - said something wrong  -> the supervisor speaks for it, in OUR words
//   - said something real   -> it speaks for itself, untouched
//
// The middle line is the one that was missing. Both writers used to exclude an
// error result: `speaksForTheSession` because raw CLI text must never reach her
// row, and this one because it only looked for a result that was absent. Each
// was right on its own and together they left the case that matters most with
// no writer at all.
export function saidNothingSheCanUse(session) {
  return session?.result == null || !!session.resultIsError;
}

export function countHelpers(session, obj) {
  if (obj?.type !== 'system') return;
  if (obj.subtype === 'task_started' && obj.task_id) {
    (session.helperIds ??= new Set()).add(obj.task_id);
  } else if (obj.subtype === 'task_updated' && obj.task_id) {
    // Anything that is not still running ends it. The measured value is
    // `completed`, and a helper that fails or is cancelled has equally stopped
    // working, so the test is what it is NOT rather than a list of endings we
    // would have to keep in step with the CLI.
    const status = obj.patch?.status;
    if (status && status !== 'in_progress' && status !== 'running') session.helperIds?.delete(obj.task_id);
  }
}

// The persisted trace line: fuller than the tail. Tool calls carry their key
// input (the file written, the command run), because "tool: Bash" answers
// nothing when the founder asks what a session actually did.
function traceStreamLine(line) {
  try {
    const obj = JSON.parse(line);
    const at = new Date().toISOString().slice(11, 19);
    const hook = hookFailure(obj);
    if (hook) return `${at}  ${hook}`;
    if (obj.type === 'assistant' && obj.message?.content) {
      const parts = [];
      for (const c of obj.message.content) {
        if (c.type === 'text' && c.text?.trim()) parts.push(c.text.trim());
        if (c.type === 'tool_use') {
          const input = c.input ?? {};
          const hint = input.file_path ?? input.path ?? input.command ?? input.title ?? input.description ?? input.id ?? '';
          parts.push(`[${c.name}] ${String(hint).slice(0, 200)}`);
        }
      }
      return parts.length ? parts.map((p) => `${at}  ${p}`).join('\n') : null;
    }
    if (obj.type === 'result') {
      const flavor = `${obj.subtype ?? 'ok'}${obj.is_error ? ' ERROR' : ''} · ${obj.num_turns ?? '?'} turns`;
      return `\n${at}  == RESULT (${flavor}) ==\n${String(obj.result ?? '').slice(0, 4000)}`;
    }
    return null;
  } catch {
    return null;
  }
}

// Stream-json lines are verbose; the In Progress tail wants the gist.
function summarizeStreamLine(line) {
  try {
    const obj = JSON.parse(line);
    const hook = hookFailure(obj);
    if (hook) return hook;
    if (obj.type === 'assistant' && obj.message?.content) {
      const text = obj.message.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ');
      const tools = obj.message.content.filter((c) => c.type === 'tool_use').map((c) => c.name);
      if (tools.length) return `tool: ${tools.join(', ')}`;
      if (text) return text.slice(0, 300);
    }
    if (obj.type === 'result') return `done: ${String(obj.result ?? '').slice(0, 200)}`;
    return null;
  } catch {
    return line.slice(0, 200);
  }
}

/**
 * THE FOUR READERS OF ONE ENGINE'S OUTPUT, PICKED ONCE PER SESSION.
 *
 * Every one of them answers the same question for a different surface: what is
 * the session's ANSWER (`capture`), what is it TYPING right now (`stream`),
 * what goes in the In Progress TAIL (`summarize`), and what is written to the
 * run's own TRACE on disk (`trace`). Claude Code answers all four off one JSON
 * line of stdout; `codex app-server` answers them off a JSON-RPC notification,
 * which is a method and a params object rather than a line.
 *
 * SO THE SWAP IS PER SESSION, NEVER PER FRAME. That is the 08-25 precedent and
 * it is the reason `spawnWorker` stays a file about running sessions: one
 * branch, at the top, and the body below it does not mention either vendor. A
 * per-frame branch would put the same test in four places and would let two of
 * them drift apart, which is how "tool: Bash" and "[Bash]" came to be written
 * by two different rules on the other engine.
 *
 * The engine on a session is whatever `_engineFor` answered, and `_engineFor`
 * already refuses every name it does not recognise; a second refusal here could
 * only fire on a bug, and a fleet that stops because of a bug in a name is
 * worse than one that reads a stream with the default engine's eyes.
 */
export function readersFor(engine) {
  return engine === 'codex'
    ? {
      capture: captureCodexEvent,
      stream: codexStreamingText,
      summarize: summarizeCodexEvent,
      trace: traceCodexEvent,
    }
    : {
      capture: captureStream,
      stream: streamingText,
      summarize: summarizeStreamLine,
      trace: traceStreamLine,
    };
}
