import { openSourceFile } from './open-source-file.mjs';
import {submitReply} from './live-replies.mjs';
// IPC: a thin, typed-by-convention surface. The renderer asks; the main
// process derives from files and answers. Pushes go one way: "state changed,
// refetch." No state is cached on either side of the bridge.

// NOTHING IN THIS FILE IMPORTS ELECTRON, AND THAT IS WHAT THE `host` ARGUMENT
// BELOW IS FOR.
//
// This is the contract between the screen and the half of the app that does
// things: 78 channels, nine lines of code each, nearly all of them wrappers
// over modules that are ordinary Node. Only three Electron things were ever
// reached for in here, `ipcMain` to register a channel, `dialog` for the
// folder picker, and `app` for two flags and the quit hook. They arrive as
// arguments now.
//
// What that buys is a second front door. `main/main.mjs` hands over the real
// Electron three and nothing about the desktop app changes. A plain Node
// process can hand over its own, and the same 78 channels then answer a
// browser over http without one line of this file being written twice.
import {terminalSenderAllowed} from './terminal-access.mjs';
import {TaskTerminals,terminalPlace} from './task-terminals.mjs';
import {SETTINGS_TERMINAL} from '../shared/settings-terminal.mjs';
import {readInstruction,writeInstruction,listVersions,readVersion} from './instruction-settings.mjs';
import path from 'node:path';
import os from 'node:os';
import fsWatch from 'node:fs';
import { listFolders } from './folders.mjs';
import * as approvals from './approvals.mjs';
import { restartNeeded } from './staleness.mjs';
import { artifactRoots, resolveArtifact } from './artifact-path.mjs';
import { docUrl } from './doc-scheme.mjs';
import { readDoc, writeDoc } from './doc-file.mjs';
import { readChange } from './code-change.mjs';
import { findFile, readCodeFile, writeCodeFile } from './code-file.mjs';
import { readNote, writeNote } from './rail-note.mjs';
import { addClaudeAccount, addCodexAccount, outsideAgentsMode, permissionMode, readSettings, recheckClaude, recheckCodex, setProjectSetting, setWorkspaceSetting } from './settings.mjs';
import { ICON_KINDS, clearProjectIcon, setProjectIcon, setProjectName } from './project-identity.mjs';
import { ClaudeUsage } from './claude-usage.mjs';
import { usageEngine } from '../shared/usage.mjs';
import { DEFAULT_ENGINE } from '../shared/engines.mjs';
import * as agents from './agents.mjs';
import { findAgentFolders, readAgentFiles, readFolderAgents } from './agent-files.mjs';
import { readSessionThreads } from './agent-sessions.mjs';
import { readCodexThreads } from './codex-threads.mjs';
import { codexIdOf, importChoice, isCodexImportRow, isNotImportedRow } from '../shared/codex-import.mjs';
import { checkProjectFolder } from '../shared/project-folder-check.mjs';
import { openFreshUser } from './fresh-user.mjs';
import { openDemo } from './demo.mjs';
import { AgentSchedule } from './agent-schedule.mjs';
import { agentKey } from '../shared/agents.mjs';
import { machineryPath } from './store/home.mjs';
import { EVENT_NAMES } from '../shared/analytics-events.mjs';
import { Name } from '../shared/product-name.mjs';

// WHAT A WORKER IS TOLD WHEN HER DECISION COULD NOT BE RECORDED.
const SPOOL_REFUSED = `${Name} could not record the founder's decision, so nothing was allowed. Finish what your grants cover and file the rest as a review.`;

// AND WHAT A CODEX WORKER IS TOLD WHEN THE CARD SHE READ IS NOT THE QUESTION IT
// IS PARKED ON. The request file lives in the spool a Claude Code worker is
// granted, so a card can be rewritten under its own id between being drawn and
// being answered; her Allow was for the other one. Same reading as above, for
// the same reason: this is a no.
const CARD_CHANGED = 'The approval request changed between being drawn and being answered, so the founder\'s decision was for a different action and nothing was allowed. Finish what your grants cover and file the rest as a review with the exact commands.';

// WHAT COUNTS AS SENT WHEN NOTHING IS. Analytics is optional here on purpose:
// every test and every copy without a key gets an object that answers no to
// everything, so no call site has to ask whether it exists.
const NO_ANALYTICS = { enabled: false, track: () => false };

// A copy with no updater wired in: the tests, and any host that constructs the
// IPC surface by hand. It reports the state a build from source really is in
// rather than a cheerful "up to date" nobody checked.
const NO_UPDATER = {
  state: () => ({
    phase: 'unsupported',
    currentVersion: null,
    newVersion: null,
    percent: null,
    error: `${Name} only updates itself when it is installed as an app.`,
    checkedAt: null,
    ready: false,
  }),
  check: async () => NO_UPDATER.state(),
  install: () => false,
};

export function registerIpc({ store, supervisor, config, window, analytics = NO_ANALYTICS, docGrants = null, updater = NO_UPDATER, host }) {
  // The three Electron things, or a plain Node stand-in for them. There is no
  // default: a caller that forgets says so here rather than throwing eighty
  // lines further down on `ipcMain.handle` of undefined.
  if (!host?.ipcMain || !host?.app || !host?.dialog) {
    throw new Error('registerIpc needs host: { ipcMain, app, dialog }');
  }
  const { ipcMain, app, dialog } = host;
  // Coalesced: the supervisor fires onChange per worker stream line, which is
  // every second or two per running session. Each push makes the renderer
  // refetch the whole snapshot, so unthrottled pushes had the UI visibly
  // re-rendering (flashing images, shifting layout) the entire time any
  // worker was streaming. One push per window is plenty for a live tail.
  let pushTimer = null;
  const push = () => {
    if (pushTimer) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      if (!window.isDestroyed()) window.webContents.send('zero:changed');
    }, 400);
  };
  store.onChange = push;
  supervisor.onChange = push;

  // A worker mid-approval is frozen until the founder answers, so the spool
  // pushes like the store does.
  try {
    const spool = approvals.spoolDir(config.storeRoot);
    fsWatch.mkdirSync(spool, { recursive: true });
    fsWatch.watch(spool, () => push());
  } catch {}

  // THE ONE PLACE AN APPROVAL IS ANSWERED, and there are three ways to reach
  // it: the buttons on the card, the ⌘Y/⌘N chord (which main catches itself,
  // ahead of the page, so it outranks anything holding the keyboard) and
  // Allow/Deny Pending Approval in the Agents menu. All three go through here
  // so all three tell the renderer what was just decided: without that, the
  // card only ever "disappeared" on the next store push and nothing on screen
  // acknowledged the press. The card's exit is drawn
  // from this.
  //
  // THE MENU WAS NOT ONE OF THE THREE UNTIL NOW, AND THIS PARAGRAPH SAID IT
  // WAS. It wrote `<id>.answer.json` itself, which is a real answer to a Claude
  // Code worker in another process and NO answer at all to a Codex worker
  // waiting on a promise in this one -- so her own Allow appeared on disk for a
  // request still waiting, which is the definition of a forgery on that path,
  // and `sweepForgery` deleted it two seconds later while logging that the
  // founder had not written it. `installMenu` runs before this function exists,
  // which is why it did that; main/main.mjs late-binds the door instead, and
  // tests/the-menu-answers-a-card-through-the-one-door.test.mjs holds it.
  //
  // AND IT ANSWERS BOTH ENGINES, in two ways rather than one. A Claude Code
  // worker waits on the answer FILE, in another process, so the file is the
  // whole of its answer. A Codex worker waits on a promise inside THIS process
  // and is told directly: a worker that can write into the store root could
  // otherwise write itself an approval, and on this engine there is a channel
  // that cannot be forged, so that is the one its decision travels down
  // (main/codex-approvals.mjs). The file is still written either way, because
  // it is what takes the card out of `listPending` and what the audit line is
  // made of.
  //
  // AND AN ANSWER THAT COULD NOT BE WRITTEN IS A DENY, NOT A SILENCE
  // (2026-09-04). `approvals.answer` is hardened now -- it will not write
  // through a link a worker planted at `<id>.answer.json`, and it removes
  // whatever is squatting the name instead -- so the only way it can still come
  // back false is a request that is no longer there (she answered it already)
  // or a spool that will not take a write at all. That second case used to
  // THROW, out of an ipc handler and out of the ⌘Y `before-input-event`
  // listener, which is worse than either outcome here. A Codex worker is parked
  // on a promise in this process, so it is told the refusal directly and
  // unblocks; a Claude Code worker has only the file, so it denies on its own
  // deadline, which is the same answer fifteen minutes later. Nothing on this
  // path can turn a failure into an allow, and the deny falls out of the SAME
  // two calls the yes does rather than a second door beside them: `allow` and
  // `note` stop meaning what she pressed the moment the write fails, and start
  // meaning what was actually recorded, which is what everything downstream of
  // here has to be told.
  //
  // AND HER PRESS IS BOUND TO THE CARD SHE READ, NOT TO ITS ID (2026-09-05).
  // The request file is worker-writable and a rewrite keeps the name and the id
  // while replacing the body, so "yes to <uuid>" was an allow for whatever the
  // engine happened to be holding. `approvals.cardShown` is the digest of what
  // was last drawn -- `answer` signs it, so the Claude Code worker's own server
  // can check it against the request IT is holding -- and `codexCardChanged` is
  // the same question asked of the engine holding its request in THIS process,
  // which is the only one that can be asked here. A yes on a card that moved
  // becomes a no, by the same rule and in the same place as a yes the spool
  // would not take: `allow` and `note` stop meaning what she pressed and start
  // meaning what was actually recorded.
  const answerApproval = (id, allow, note) => {
    const shown = approvals.cardShown(config.storeRoot, id);
    if (allow && supervisor.codexCardChanged?.(id, shown)) {
      console.warn(`zero: approval ${id} was drawn from a request that has since been rewritten; the founder's Allow was for a different card and nothing has been allowed`);
      allow = false;
      note = CARD_CHANGED;
    }
    const ok = approvals.answer(config.storeRoot, id, allow, note);
    if (!ok) { allow = false; note = SPOOL_REFUSED; }
    const settled = supervisor.settleCodexApproval?.(id, allow, note) ?? false;
    if (!ok && settled) console.warn(`zero: approval ${id} could not be recorded in the spool; the worker waiting on it has been denied`);
    if ((ok || settled) && !window.isDestroyed()) {
      window.webContents.send('zero:approval-answered', { id, allow: !!allow });
    }
    return ok || settled;
  };

  // THE RENDERER'S ONLY WAY TO COUNT ANYTHING, and it cannot send: it hands a
  // name to the main process, which checks the name against her approved list
  // and attaches the properties itself. This is the reason there is no
  // analytics SDK in the renderer at all (a test fails the build if one
  // appears): a browser SDK autocaptures the text of what was clicked, and in
  // Agentbox that text is task titles.
  ipcMain.handle('zero:track', (_e, { name } = {}) => {
    if (!EVENT_NAMES.includes(name)) return false;
    return analytics.track(name);
  });

  ipcMain.handle('zero:approve', (_e, { id, allow, note }) => {
    return { ok: answerApproval(id, allow, note) };
  });

  // AN AGENT ROW IS NOT A WORK ITEM. Rows for her Claude Code agents are drawn
  // in the same list as her work and carry the same shape, so every keystroke
  // the list already understands is aimed at them too. They belong to no
  // ledger, and a write against `agent:41234` would append a line to a real
  // product's work-items.jsonl for an item that does not exist. The renderer
  // does not offer those actions; this is the second lock, here because the
  // first one is a UI and UIs get edited.
  const isAgentRow = (id) => typeof id === 'string' && id.startsWith('agent:');

  // EVERY CLAUDE CODE AGENT ON THE MACHINE, minus the ones the app started itself.
  // It rides the snapshot because it is exactly the same kind of fact as the
  // rest of it — what is happening right now — and because a second poll would
  // be a second clock the two lists could disagree about. This call NEVER
  // blocks: it hands back the last measurement and asks for a fresh one in the
  // background (main/agents.mjs), because measuring costs a quarter of a second
  // of subprocess and this is the thread the window is drawn on.
  // A newly-stuck agent should reach her without waiting for the renderer's
  // ten-second poll, and the reader only fires this when the list actually
  // changed rather than on every measurement.
  agents.setOnChange(push);

  // The moments she set on agents she is not ready for. Deferring one is about
  // her inbox and nothing else: no message is sent and no process is touched,
  // so this is a moment kept beside the reading rather than a write into
  // somebody else's terminal. See main/agent-schedule.mjs.
  const agentSchedule = new AgentSchedule(config.storeRoot);

  // WHAT IS LEFT OF HER LIMIT. It rides the snapshot for the same reason
  // `restartNeeded` does: it changes WHILE the app is open, and the corner that
  // draws it is on every screen. Reading it costs twenty-five seconds, so
  // nothing here ever waits for it: the object answers instantly out of its
  // last measurement and refreshes itself behind the window
  // (main/claude-usage.mjs).
  const usage = new ClaudeUsage({
    // Asked each time rather than captured, because Claude Code can be installed
    // while the app is running and the settings screen already promises that
    // works without a restart.
    bin: () => config.claudeBin,
    onChange: push,
  });

  // Agents this run has already counted. In memory on purpose: a fresh launch
  // seeing the same agent again is a fresh fact about the app being used.
  const seenAgents = new Set();

  const liveAgents = () => {
    try {
      const live = agentSchedule.decorate(agents.listAgents({
        zeroPid: process.pid,
        sessionIds: Object.values(supervisor._liveSessions ?? {}).map((s) => s?.sessionId),
        products: store.listProducts(),
        claudeBin: config.claudeBin,
      }));
      // "An agent was seen", ONCE per agent per run of the app. This list is
      // rebuilt every few seconds, so counting it here without the set would
      // send one event per agent per tick, all day. The keys are only ever
      // compared in this process; nothing about an agent is sent with the
      // count, which carries no name, no path and no title.
      for (const agent of live) {
        const key = agentKey(agent);
        if (!key || seenAgents.has(key)) continue;
        seenAgents.add(key);
        analytics.track('agent_seen');
      }
      return live;
    } catch {
      // Her inbox is not allowed to fail because a `ps` did. An empty list here
      // reads as "no outside agents", which is the state of most machines.
      return [];
    }
  };

  /*
   * THE FOLDER THE NEXT SIGN IN BELONGS TO, for either coding agent.
     Remembered in main, not passed in from the window, because a terminal's
     working directory is the one thing the renderer must never get to choose:
     `resolve` is the only gate between a key and a shell, and every other key
     goes through a work item that has to exist. w-dc88147919.

     IT IS ONE VARIABLE FOR BOTH ENGINES because there is one settings terminal,
     so there is only ever one sign in going on. Adding a Claude account after a
     Codex one replaces the folder, and the shell the old one was holding is
     closed in the same breath. */
  let pendingLogin=null;

  const terminals=new TaskTerminals({resolve:key=>{
    const {product,id}=JSON.parse(key);
    /*
     * THE SETTINGS TERMINAL, which belongs to no task. There is exactly one of
       it and it opens in the folder main just made for the login; if nothing is
       pending it opens at home, which is where a shell with nothing to do
       belongs. */
    if(product===SETTINGS_TERMINAL.product&&id===SETTINGS_TERMINAL.id){
      return pendingLogin ?? config.home ?? os.homedir();
    }
    const agent=id.startsWith('agent:')?liveAgents().find(a=>'agent:'+a.pid===id && (a.product??'')===product):null;
    return terminalPlace({store,supervisor,product,id,agent});
  }});
  let terminalQuitPending=false,terminalQuitReady=false;
  app.on('before-quit',event=>{
    if(terminalQuitReady||(!terminalQuitPending&&!terminals.sessions.size))return;
    event.preventDefault();
    if(!terminalQuitPending){terminalQuitPending=true;void terminals.shutdown().finally(()=>{terminalQuitReady=true;app.quit();});}
  });
  ipcMain.handle('zero:terminal',(_event,payload={})=>{
    if(_event.senderFrame?.parent || (_event.sender && _event.sender!==window.webContents)) throw Error('Terminal is only available in the main app window.');
    const {product,id,action,data,cols,rows,offset}=payload;
    if(typeof product!=='string'||typeof id!=='string'||!id||id.length>300)throw Error('Invalid task.');
    const key=JSON.stringify({product,id});
    switch(action){
      case 'open':return terminals.open(key);
      case 'read':return terminals.read(key,offset);
      case 'write':terminals.write(key,data);return true;
      case 'resize':terminals.resize(key,cols,rows);return true;
      case 'close':terminals.close(key);return true;
      default:throw Error('Unknown terminal action.');
    }
  });

  ipcMain.handle('zero:snapshot', () => {
    const now = Date.now();
    const items = store.listItems(now);
    const running = supervisor.status();
    const engines = supervisor.engineFacts(items);
    // WHICH CODING AGENT THE CORNER IS ABOUT, ANSWERED ONCE, HERE.
    // `usageEngine` is the rule (shared/usage.mjs) and it is the byline's own
    // -- what is running beats what would run -- asked about the app instead of
    // about a row.
    const usageFor = usageEngine({ workspace: engines.workspace, running: running.running });
    // ASKING IS THE BRANCH, WHICH IS WHY THIS IS NOT TWO READS AND A CHOICE.
    // `usage.read` starts a `claude -p /usage` child whenever its figure has
    // gone stale, so calling it on a snapshot whose corner is about Codex
    // spends twenty-five seconds of somebody's machine on a number nothing will
    // draw -- which is what a Codex-only workflow paid every five minutes until
    // now. The Codex side never starts anything at all (main/codex-usage.mjs).
    const reading = usageFor === DEFAULT_ENGINE ? usage.read() : supervisor.codexUsage();
    return {
      products: store.listProducts(),
      items,
      agents: liveAgents(),
      approvals: approvals.listPending(config.storeRoot),
      supervisor: running,
      // WHETHER THERE ARE TWO CODING AGENTS TO CHOOSE BETWEEN, AND WHICH ONE
      // EACH ROW RUNS ON. Answered whole by the supervisor, because the two
      // rules underneath it -- the capability gate and "an August choice is not
      // a choice she is making now" -- are pinned to that one file, and a screen
      // that worked either of them out for itself could draw "Codex" over a row
      // about to run on Claude Code.
      //
      // It rides the snapshot rather than the settings model for the reason
      // `outsideAgents` does: the INBOX reads it, on every row, and the settings
      // model is only fetched while that screen is open. On a Mac with one
      // coding agent this is one entry and an empty map, and nothing anywhere
      // draws anything new.
      engines,
      // Whether this process is still the app on disk. It rides the snapshot
      // rather than boot-info because the staleness DEVELOPS while the app
      // runs: the case that cost her three times was a process left up for days
      // while fixes landed underneath it, and a boot-time check cannot see
      // that. See main/staleness.mjs.
      restartNeeded: restartNeeded(supervisor.appDir),
      // HER RATE LIMIT, WHICH IS WHAT ACTUALLY CAPS THE FLEET. Null until the
      // first reading lands, and the corner draws nothing at all until then
      // rather than a pill full of dashes.
      //
      // AND IT IS ONE AGENT'S LIMIT, NAMED (2026-09-05). One corner and one
      // dropdown, as before; what is new is that the reading says whose
      // subscription it is about, so the screen can say so too. The name is
      // still only DRAWN where this Mac has two agents to tell apart -- that
      // rule is `engineWordFor`'s, in renderer/src/byline.ts.
      usage: reading && { engine: usageFor, ...reading },
      usageByEngine: engines.choices.map(({ id }) => {
        const value = id === usageFor ? reading : id === DEFAULT_ENGINE ? usage.peek() : supervisor.codexUsage();
        return value ? { engine: id, ...value } : null;
      }).filter(Boolean),
      // WHETHER A NEWER AGENTBOX IS ALREADY DOWNLOADED AND WAITING. It rides the
      // snapshot for the same reason `restartNeeded` above does: it becomes
      // true WHILE the app is open, hours after boot, and the screens that
      // offer the restart are ones she may already be looking at. Settings
      // reads the whole of it; ⌘K reads `ready` alone.
      update: updater.state(),
      config: {
        // How many of her own Claude Code sessions the inbox takes. It rides
        // the snapshot rather than the settings model because the INBOX reads
        // it, and the settings model is only fetched while that screen is
        // open.
        outsideAgents: outsideAgentsMode(config),
        // WHAT AGENTS ARE ALLOWED TO DO, ON THE SNAPSHOT, so the reply box can
        // print it without opening the settings screen.
        //
        // It genuinely was not there: the only way in was a character you had
        // to already know to type. Claude Code's own answer to the same problem
        // is that the mode is printed in the status bar the entire time it is
        // on, so ours is printed on the reply footer the entire time, and this
        // is the value it prints when the message carries no opinion of its
        // own. Per PROJECT, because the mode a reply will run in depends on
        // which project the row belongs to: a project override wins over the
        // workspace, and a personal project runs its own list entirely. The
        // workspace answer is under the empty-string key, for a surface that
        // has no project in hand.
        permission: Object.fromEntries([
          ['', permissionMode(supervisor.defaultSessionArgs())],
          ...store.listProducts().map((p) => [p.slug, supervisor.effectivePermission(p.slug)]),
        ]),
      },
    };
  });

  // THE USER'S WORDS, INTO ONE OF THEIR LIVE AGENTS. The only thing in the app that writes
  // anywhere outside its own store, and it writes into a socket rather than to
  // disk. The reader refuses a send to an agent frozen on a permission box, and
  // reports back whether the agent actually moved rather than assuming it did.
  ipcMain.handle('zero:agent-reply', async (_e, { pid, text }) => {
    try {
      const out = await agents.reply(Number(pid), text);
      // AND THE ROW REMEMBERS THAT THE USER SPOKE. Only on a delivered message: a
      // mark written for a send that failed would move the row into In progress
      // over words that never arrived, which is the failure this codebase cares
      // about most. It does now, until the session stops. AND WHAT THE USER
      // TYPED, not only that they typed. Claude Code marks a message arriving over
      // its socket as machine chatter (`isMeta`), so the transcript reader drops
      // it and the user's own sentence never reached the card: the row went on
      // saying only what the session was started with days before. This is the
      // only process that knows the user said it, so this is where it is written.
      if (out?.ok && out.key) agentSchedule.replied(out.key, out.at ?? Date.now(), Date.now(), String(text ?? ''));
      push();
      return out;
    } catch {
      return { ok: false, reason: 'The message could not be handed over.' };
    }
  });

  // AND UNDOING ONE. Withdrawing a reply cannot un-send the message — it is in
  // somebody else's terminal — so this is honest about what it does: it takes
  // the row out of In progress and puts it back where it was. The session is
  // not touched, exactly as with deferring or closing one.
  ipcMain.handle('zero:unreply-agent', (_e, { key }) => {
    const mark = agentSchedule.replied(String(key ?? ''), 0);
    push();
    return { ok: true, repliedAt: mark };
  });

  // For the agent a reply cannot reach: bring the app it is running inside to
  // the front. Named honestly, because it is the app and not the pane.
  ipcMain.handle('zero:agent-reveal', async (_e, { pid }) => {
    try {
      return await agents.reveal(Number(pid));
    } catch {
      return { ok: false, reason: `${Name} cannot tell which window it is running in.` };
    }
  });

  // HER BUTTON: what the two of them actually said, read off the transcript she
  // already has, only when she presses it. No model, nothing sent, nothing
  // written. It is streamed inside the reader because the biggest transcript on
  // this machine is 160MB.
  ipcMain.handle('zero:agent-conversation', async (_e, payload) => {
    try {
      // Her replies from Agentbox ride in beside the transcript for the same
      // reason the card needs them: they are not IN the transcript as hers.
      // The key is DERIVED here rather than sent, because what identifies an
      // agent is a rule with one copy of it (shared/agents.mjs) and the
      // renderer already hands over both halves it needs.
      const key = agentKey({ sessionId: payload?.sessionId, pid: Number(payload?.pid), startedAt: payload?.startedAt });
      return await agents.conversation({ ...(payload ?? {}), spoke: agentSchedule.spoke(key) });
    } catch {
      return { ok: false, reason: 'That conversation could not be read.' };
    }
  });

  ipcMain.handle('zero:dashboard', (_e, slug) => {
    try {
      return store.readDashboard(slug);
    } catch {
      return null;
    }
  });

  ipcMain.handle('zero:command-catalog', (_e, { product, id }) => supervisor.commandCatalog(product, id));
  ipcMain.handle('zero:remote-control', (_e, {product,id,action}) => supervisor.remoteControl(product,id,action));
  ipcMain.handle('zero:command', (_e, { product, id, text }) => supervisor.commandItem(product, id, text));
  ipcMain.handle('zero:compact', (_e, { product, id }) => supervisor.compactItem(product, id));
  ipcMain.handle('zero:compaction-status', (_e, { product, id }) => supervisor.compactionStatus(product, id));

  ipcMain.handle('zero:answer', async (_e, { product, id, answer, status, priority, permissionMode, model, effort }) => {
    if (isAgentRow(id)) return { ok: false };
    // A CODEX CONVERSATION'S YES OR NO NEVER REACHES A WORKER. The row asking
    // whether to import one is answered by the app itself: yes makes it a row
    // she can read, no parks it in Closed under Not imported, and Import on a
    // parked one is the same yes. Any other reply on such a row falls through
    // to the ordinary path, exactly as before.
    if (product && id) {
      let row = null;
      try { row = store.readItem(product, id); } catch { row = null; }
      if (row && (isCodexImportRow(row) || isNotImportedRow(row))) {
        const choice = importChoice(answer);
        if (choice) {
          let thread = null;
          if (choice === 'yes') {
            try { thread = readCodexThreads({}).threads.find((t) => t.id === codexIdOf(row)) ?? null; } catch { thread = null; }
          }
          const out = store.answerCodexImport(product, id, choice, { thread });
          push();
          return out;
        }
      }
    }
    // ARCHIVING ENDS THE WORK, not just the row. Her archive now outranks
    // anything a straggler writes (shared/work-items.mjs, authorityOf), but a
    // worker left running on work she has ended is still burning her plan on
    // it, so it stops here rather than being merely overruled.
    if (status === 'done') supervisor.stopSession(id);
    // THE MODEL IS WRITTEN BEFORE THE REPLY IS SUBMITTED, deliberately. A reply
    // on an idle row starts a run, and that run reads the model off the item;
    // handing them over in one call and writing the model afterwards would be a
    // race the run usually wins, so she would pick a model and watch the old one
    // take the task. `answerItem` writes both, and it writes the model first.
    const out = await submitReply(supervisor,{product,id,answer,status,permissionMode},()=>store.answerItem(product, id, { answer, status, priority, permissionMode, model, effort }));
    // THAT the user replied and THAT something finished. Never a word of either:
    // in Agentbox the answer IS the prompt (privacy page, section 4).
    if (typeof answer === 'string' && answer.trim()) analytics.track('reply_sent');
    if (status === 'done') analytics.track('task_finished');
    // HER REPLY IS THE OTHER HALF OF THE SAME WAIT, and it is the one she pays
    // on every round trip rather than once: measured 2026-08-24, median 9.1
    // seconds between pressing the key and the continuation being spawned.
    // Archiving is the one answer that starts nothing, and its session was
    // just killed above, so there is nothing to wake for.
    if (status !== 'done') { supervisor.liftBrakeForHer?.(); supervisor.wake(); }
    return out;
  });

  // The product order: the founder's standing running order over her
  // companies, most important first. Persisted in the supervisor's state;
  // agents never set this. The renderer sends the WHOLE order rather than one
  // move, because a drag already knows the finished arrangement, and a move
  // would need both sides to agree about indices only one of them can see.
  ipcMain.handle('zero:set-product-order', (_e, { order }) => {
    supervisor.setProductOrder(order);
    return supervisor.status();
  });

  // Hidden from the composer's picker and nothing else: a hidden product still
  // ranks, still spawns workers, and its work still reaches the inbox.
  ipcMain.handle('zero:set-product-hidden', (_e, { product, hidden }) => {
    supervisor.setProductHidden(product, hidden);
    return supervisor.status();
  });

  ipcMain.handle('zero:compose', (_e, { product, title, body, kind, priority, runAt, labels, engine, model, effort }) => {
    const out = store.composeItem(product, {
      // HOW HARD IT THINKS rides through unjudged: the store keeps any word
      // shaped like a level, and the spawn is the gate that knows each
      // engine's real list (`Supervisor#spawnPlan` for Claude Code,
      // `codexEffortRefusal` for Codex).
      title, body, kind, priority, runAt, labels, effort,
      // WHICH CODING AGENT SHE CHOSE, AND ONLY IF SHE COULD HAVE. `engineOffered`
      // is the supervisor's own test and the door makes no judgement of its own:
      // it answers null on any Mac where the picker is not drawn, so a renderer
      // left open across a config change cannot write a choice she was never
      // shown. This argument used to be forwarded straight through and
      // `composeItem` dropped it in silence.
      engine: supervisor.engineOffered(engine),
      // AND THE MODEL GOES WITH IT, which it did not: `model` was forwarded raw
      // beside a refused engine, so the row was filed carrying the other
      // harness's slug and no engine to explain it -- a row the cross-harness
      // guard downstream cannot even see. `modelOffered` says why the two
      // fields cannot be corrected separately.
      model: supervisor.modelOffered(engine, model),
    });
    // AND LOOK AT IT NOW. Composing used to write the line and stop, so the
    // task sat in the store until the next fifteen second tick: measured
    // 2026-08-24, median 7.0 seconds and up to 15.0 before the spawn was even
    // attempted. A row scheduled for later is not woken for, because it is not
    // due; the timer is what serves those.
    if (!runAt || runAt <= Date.now()) supervisor.wake();
    return out;
  });

  /* ----------------------------- the first run ---------------------------- */
  // THE WALK'S EXAMPLE TASK, ANSWERED BY THE APP RATHER THAN BY A SESSION.
  //
  // The whole of the work is reading the readme in the folder chosen two
  // screens earlier, so this returns in milliseconds. The two second pause
  // before it is called is in the renderer, where the row is being watched.
  ipcMain.handle('zero:first-run-answer', (_e, { product, id }) => {
    return store.finishFirstRunTask(product, id);
  });

  // THE PRACTICE PROJECT.Made when the hand-off screen is pressed, filled with
  // the three rows in the same call, and archived by the handler below it when
  // the walk ends. It is a real project and it is never a project anybody works
  // in: main/store.mjs and main/supervisor.mjs both say what that means.
  ipcMain.handle('zero:first-run-practice', () => {
    const made = store.createPractice();
    let rows = { ids: [] };
    // A store that will not take the three rows is not a reason to strand
    // somebody mid-walk. They land in an empty practice inbox and the beat that
    // clears them is skipped, exactly as beat thirteen already behaves.
    try { rows = store.stagePracticeRows(made.slug); } catch { rows = { ids: [] }; }
    return { ...made, examples: rows.ids };
  });

  // AND TAKING IT BACK OFF THE SCREEN. `sweepPractice` rather than the one
  // slug, so a practice project left behind by a walk somebody quit halfway is
  // cleared by the next one that finishes.
  ipcMain.handle('zero:first-run-practice-end', () => store.sweepPractice());

  // BEAT EIGHT'S THREE EXAMPLE ROWS, written into the project she just
  // made. They are real rows, because the beat teaches clearing an inbox and
  // there is no way to teach that with a picture of one.
  ipcMain.handle('zero:first-run-examples', (_e, { product }) => {
    return store.stageFirstRunExamples(product);
  });

  // AND NOTHING ELSE STARTS WHILE SHE IS BEING SHOWN AROUND.The hold is in
  // memory and it expires; supervisor.firstRunWalking says why both of those
  // matter.
  ipcMain.handle('zero:first-run-walking', (_e, { walking }) => {
    supervisor.firstRunWalking(!!walking);
    return supervisor.status();
  });

  // BEING A BRAND NEW USER, ON THE APP SHE DOWNLOADED.The row above this one
  // is the "at LEAST" half. This is the whole of it: a SECOND Agentbox, with no
  // projects, no settings and no store, standing beside hers rather than
  // replacing it.
  //
  // NOTHING OF HERS IS DELETED HERE, and there is no version of this handler
  // that may delete anything. main/fresh-user.mjs says how it works and why
  // her own window and every agent in it keep running.
  ipcMain.handle('zero:open-fresh-user', (_e, payload) => {
    return openFreshUser({
      withAgents: payload?.withAgents !== false,
      packaged: app.isPackaged,
    });
  });

  // AN INBOX TO STAND IN FRONT OF A ROOM WITH.
  //
  // The same second Agentbox in a throwaway home as the row above, with three
  // invented products and a day of invented work seeded into it first, so it
  // opens on a populated inbox rather than on the welcome screen. It reads none
  // of her folders and it deletes nothing (main/demo.mjs).
  ipcMain.handle('zero:open-demo', () => openDemo({ packaged: app.isPackaged }));

  // "Run this later", the durable half of what snooze used to pretend to be.
  // A worker already running on the item is stopped: deferring work that is
  // happening right now and leaving it running is not deferring it.
  ipcMain.handle('zero:schedule', (_e, { product, id, runAt }) => {
    if (isAgentRow(id)) return { ok: false };
    if (runAt > Date.now()) supervisor.stopSession(id);
    return store.scheduleItem(product, id, runAt);
  });

  // said about an agent instead of about a task. The row it moves stands for
  // somebody's terminal, so this writes to no ledger, sends no message and
  // stops no process: it records the moment her inbox should raise the agent
  // again, and the reader tests it on every measurement. 0 brings it straight
  // back.
  //
  // The KEY comes from the agent, never from the row id: `agent:<pid>` is what
  // the list draws with and a pid is not an identity (shared/agents.mjs).
  ipcMain.handle('zero:schedule-agent', (_e, { key, runAt }) => {
    const set = agentSchedule.set(String(key ?? ''), runAt);
    push();
    return { ok: true, runAt: set };
  });

  // `through` is the agent's own last activity when she closed it, so a session
  // that then does something newer is news again rather than the thing she
  // dismissed; 0 puts the row straight back.
  ipcMain.handle('zero:close-agent', (_e, { key, through }) => {
    const mark = agentSchedule.close(String(key ?? ''), through);
    push();
    return { ok: true, doneThrough: mark };
  });

  /* ---------------------------- repeating tasks --------------------------- */
  // A repeating task is a RULE, so composing one writes no work item at all.
  // That ordering is the point: composeItem appends an open founder item before
  // it applies her content, and another copy of the app can spawn that intermediate state,
  // so a rule that turned out to be unkeepable would leave a one-shot running.
  // The first run arrives on the next tick instead.
  ipcMain.handle('zero:repeats', () => store.listRepeats());

  // THE SAME TWO GATES `zero:compose` USES, because a rule is a standing task
  // and every one of its runs is an ordinary row. `engineOffered` answers null
  // on any Mac where the picker is not drawn, so a rule cannot be marked for an
  // engine she was never shown, and `modelOffered` refuses the model of an
  // engine that was just refused. Both were absent here because neither field
  // reached this handler at all: the whole pair was dropped four times over on
  // the way from her card (main/repeats.mjs says where).
  ipcMain.handle('zero:compose-repeat', (_e, { product, title, body, priority, rule, engine, model }) => {
    return store.composeRepeat(product, {
      title,
      body,
      priority,
      ...rule,
      engine: supervisor.engineOffered(engine),
      model: supervisor.modelOffered(engine, model),
    });
  });

  // THE ONE HANDLER THAT TAKES A FREE-FORM PATCH, so it is the one that has to
  // gate the two new fields by hand. `patchRule` appends whatever it is given
  // and the fold now carries `engine` and `model` (shared/repeats.mjs), so
  // without this the renderer could mark a rule for Codex without ever passing
  // `engineOffered` -- the capability gate, bypassed by the edit screen. A patch
  // that names neither is forwarded exactly as it arrived.
  ipcMain.handle('zero:set-repeat', (_e, { product, id, rule }) => {
    const { engine, model, ...rest } = rule ?? {};
    return store.setRepeat(product, id, {
      ...rest,
      ...(engine === undefined ? {} : { engine: supervisor.engineOffered(engine) }),
      ...(model === undefined ? {} : { model: supervisor.modelOffered(engine, model) }),
    });
  });

  // Ending one is how she stops it, and it is a small durable fact rather than
  // an archive, so it does not collide with what done means on a work item.
  ipcMain.handle('zero:end-repeat', (_e, { product, id }) => store.endRepeat(product, id));

  ipcMain.handle('zero:create-product', (_e, { name, repoPath }) => {
    const out = store.createProduct({ name, repoPath });
    // (privacy page 5.1). The count is the whole payload; the path it was
    // connected to never leaves.
    if (typeof repoPath === 'string' && repoPath.trim()) analytics.track('repo_connected');
    return out;
  });

  // Returns a bare path or null. Cancelling is not an error and never clears
  // what the card already had.
  //
  // AND IT REFUSES THE FOLDERS THAT ARE NOT PROJECTS.The picker opens on the
  // home folder, so pressing Open without navigating anywhere makes the home
  // folder the project, and the worker that starts there lists it within its
  // first few tool calls. macOS then asks about Downloads, Music, Pictures and
  // Application Support one panel at a time, with our name on every one of
  // them.
  //
  // The refusal is HERE rather than on the screens, so the path never reaches
  // the renderer at all and no screen can take it by accident. What comes back
  // is the sentence, which the screens show as it stands.
  ipcMain.handle('zero:choose-folder', async (_e, { startIn } = {}) => {
    const r = await dialog.showOpenDialog(window, {
      title: 'Where is its code?',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory'],
      ...(startIn ? { defaultPath: startIn } : {}),
    });
    // NO MAC DIALOG TO OPEN, WHICH IS THE BROWSER AND NOT AN ERROR. The screen
    // draws its own picker instead, on `zero:list-folders` below, and comes
    // back here with nothing further to ask. Saying so with a flag rather than
    // a sentence is what lets one screen serve both doors.
    if (r.noDialog) return { path: null, browse: true };
    if (r.canceled || !r.filePaths?.length) return { path: null };
    const picked = r.filePaths[0];
    const verdict = checkProjectFolder(picked, { home: os.homedir() });
    if (!verdict.ok) return { path: null, refused: verdict.say };
    return { path: picked };
  });

  // THE PICKER THE APP DRAWS ITSELF, for a tab that has no Mac dialog.
  //
  // The tab cannot be given a path by the operating system. This process can
  // read the disk perfectly well, so the screen walks it a folder at a time
  // through here and sends back the one she stopped on. See main/folders.mjs
  // for why that is the whole of the problem.
  //
  // The verdict rides along so the picker can say, on the folder she is
  // standing in, whether choosing it would be turned down. The Mac's dialog
  // cannot do that and this can, which makes the browser's picker the better
  // of the two on the one thing that actually costs somebody an afternoon.
  ipcMain.handle('zero:list-folders', (_e, { at = null, showHidden = false } = {}) => {
    const home = os.homedir();
    const listed = listFolders({ at, home, showHidden });
    const verdict = checkProjectFolder(listed.at, { home });
    return { ...listed, refused: verdict.ok ? null : verdict.say };
  });

  // Whether the card's sentence may say "a new folder". The card proposes
  // ~/Desktop/dev/<name> from the name typed, and that folder sometimes already
  // exists with somebody's code in it; calling that one new would be a lie in
  // the one sentence on the card.
  ipcMain.handle('zero:folder-exists', (_e, { path: p } = {}) => {
    if (typeof p !== 'string' || !p.trim()) return { exists: false };
    const full = p.trim().startsWith('~')
      ? path.join(os.homedir(), p.trim().slice(1))
      : p.trim();
    try { return { exists: fsWatch.statSync(full).isDirectory() }; } catch { return { exists: false }; }
  });

  // HER CLAUDE CODE AGENTS, for the last screen of the first run. Both of
  // Claude Code's own scopes, because both of them are in her sentence: the
  // home folder set is every project on this Mac, and the one inside the
  // project folder is that project alone.
  //
  // `chosen` comes back with them so the screen can open on what she already
  // took rather than on nothing, which is what makes walking it a second time
  // show her the truth instead of an empty page.
  ipcMain.handle('zero:agent-files', (_e, { folder = null, product = null } = {}) => {
    const found = readAgentFiles({ folder: typeof folder === 'string' && folder.trim() ? folder.trim() : null });
    const map = config.projectAgents ?? {};
    const chosen = product && Array.isArray(map[product]) ? map[product] : null;
    return { ...found, chosen };
  });

  // THE FOLDERS THE CARD CANNOT REACH.
  //
  // So a folder's agents may only ever land in the project that points at that
  // folder, which `zero:agent-files` above already guarantees by reading the
  // chosen project's own `repoPath` and nothing else. The gap her answer leaves
  // open is the folder no project points at: on her Mac that is
  // `~/Desktop/dev/astral-desktop`, four agents that no choice on the card could
  // reach. This says which folders those are so the card can offer to make the
  // project rather than quietly filing them somewhere they do not work.
  //
  // the parent of every project folder she has already connected. A folder a
  // project already owns is dropped, because the card reaches those by name in
  // its own project list.
  ipcMain.handle('zero:agent-folders', () => {
    const products = store.listProducts();
    const owned = new Set();
    const roots = new Set();
    for (const p of products) {
      const repo = typeof p.repoPath === 'string' && p.repoPath.trim() ? path.resolve(p.repoPath.trim()) : null;
      if (!repo) continue;
      owned.add(repo);
      roots.add(path.dirname(repo));
    }
    let folders = [];
    try { folders = findAgentFolders({ roots: [...roots] }); } catch { folders = []; }
    // AND THE AGENTS THEMSELVES, not only how many.A count can only be a clause
    // in a sentence; the card now draws each folder as a heading with its own
    // agents ticked underneath, which is the hierarchy, and that needs the
    // files. They are a handful of small markdown files per folder and the same
    // reader the project side already uses.
    const out = [];
    for (const f of folders) {
      if (owned.has(f.folder)) continue;
      let agents = [];
      try { agents = readFolderAgents(f.folder); } catch { agents = []; }
      out.push({ ...f, agents });
    }
    return { folders: out };
  });

  // AND THE THREADS, WHICH ARE THE AGENTS SHE MEANT.
  //
  // The card was reading `.md` agent definitions, four of them, last edited in
  // March; these are the conversations.
  //
  // The reading itself is main/agent-sessions.mjs and every judgment lives
  // there. This is the window onto it, plus one thing: WHAT IT LAST HANDED OUT
  // IS KEPT. The import below needs the thread objects and it may not trust the
  // renderer's copy of them, and the alternative is walking her whole
  // ~/.claude/projects again per press. Measured on her Mac 2026-08-29: one
  // walk is 1.7 seconds over 2,445 transcripts, and one press can file into
  // several projects, so re-walking would cost seconds of a button that should
  // feel instant. The card read them a moment before pressing, so the last read
  // is the right answer and it is ours rather than the renderer's.
  let lastThreads = [];
  // THE USER'S CODEX CONVERSATIONS ARE ON THE SAME CARD. They carry `source:
  // 'codex'`, land under the project whose folder they ran in exactly as the
  // Claude Code ones do, and the ones the user said not now to are here too, so
  // there is a way back to them.
  const readAllThreads = () => {
    let claude = [];
    let codex = [];
    try { ({ threads: claude } = readSessionThreads({})); } catch { claude = []; }
    try { ({ threads: codex } = readCodexThreads({})); } catch { codex = []; }
    return [...claude, ...codex].sort((a, b) => (b.when ?? 0) - (a.when ?? 0));
  };
  ipcMain.handle('zero:agent-threads', () => {
    const threads = readAllThreads();
    lastThreads = threads;
    return { threads };
  });

  // So this is `zero:import-agents` with the agent taken out of it. No ticks are
  // saved, because there is nothing for the card to remember: an imported thread
  // is a row, and a row is what stops it being imported twice
  // (`threadsNeedingRows`). It does NOT resume the conversation; she was offered
  // that and picked this instead.
  ipcMain.handle('zero:import-threads', (_e, { product, threads } = {}) => {
    if (!product) return { ok: false, added: 0, already: 0, ids: [] };
    const want = new Set(
      (Array.isArray(threads) ? threads : [])
        .filter((id) => typeof id === 'string' && id.trim())
        .map((id) => id.trim()),
    );
    if (!want.size) { return { ok: true, added: 0, already: 0, ids: [] }; }
    // The read is taken again only if nothing has been handed out yet, which is
    // the case a test or a fresh window can reach and a person cannot.
    if (!lastThreads.length) lastThreads = readAllThreads();
    // Two kinds, two rows.
    const chosen = lastThreads.filter((t) => want.has(String(t?.id ?? '')));
    let out = { ids: [], added: 0, already: 0 };
    try {
      // Each store method takes its own kind off the list and leaves the other.
      const claude = store.importThreadRows(product, chosen);
      const codex = store.importCodexThreads(product, chosen);
      out = { ids: [...claude.ids, ...codex.ids], added: claude.added + codex.added, already: claude.already + codex.already };
    } catch (err) {
      push();
      return { ok: false, error: String(err.message), added: 0, already: 0, ids: [] };
    }
    push();
    return { ok: true, ...out };
  });

  // TAKING THEM, which is the half that used to do nothing.
  //
  // Before this, the finish card's button wrote the ticked names into
  // `projectAgents` and stopped. Three occurrences of that key in the whole
  // shipped app, all of them this file and settings.mjs, and none in the
  // renderer: the list was read back only so the card could remember its own
  // ticks the next time somebody walked the setup. Measured on the build a tester
  // used, the store was byte for byte identical before and after pressing it.
  //
  // The names are still saved, because the card still opens on what was taken
  // last time. What is new is the second line: one inbox row per agent, asking
  // for its first job.
  //
  // THE FILES ARE READ AGAIN HERE RATHER THAN SENT IN. The renderer has the
  // whole list already, so it could hand the paths over, but a row that names a
  // file on somebody's disk should name a file that was on the disk a moment
  // ago and not one a screen was holding from earlier in the walk.
  ipcMain.handle('zero:import-agents', (_e, { product, agents } = {}) => {
    if (!product) return { ok: false, added: 0, ids: [] };
    const names = (Array.isArray(agents) ? agents : [])
      .filter((n) => typeof n === 'string' && n.trim())
      .map((n) => n.trim());
    try {
      setProjectSetting({ config, supervisor }, { product, key: 'agents', value: names });
    } catch { /* the ticks are a convenience; the rows are the point */ }
    if (!names.length) { push(); return { ok: true, added: 0, ids: [] }; }
    const keep = new Set(names);
    const repo = store.listProducts().find((p) => p.slug === product)?.repoPath ?? null;
    const found = readAgentFiles({ folder: repo });
    const chosen = [...found.user, ...found.project].filter((a) => keep.has(a.name));
    let out = { ids: [], added: 0, already: 0 };
    try {
      out = store.importAgentRows(product, chosen);
    } catch (err) {
      push();
      return { ok: false, error: String(err.message), added: 0, ids: [] };
    }
    push();
    return { ok: true, ...out };
  });

  ipcMain.handle('zero:supervisor-pause', (_e, paused) => {
    supervisor.paused = !!paused;
    // Taking the pause off is a thing she does expecting work to start, so it
    // starts, rather than after up to another fifteen seconds of a paused-
    // looking app.
    if (!supervisor.paused) supervisor.wake();
    return supervisor.status();
  });

  // Stop a running agent: kill its session and set the item blocked, so it
  // is not instantly re-pulled and sits in the inbox awaiting redirection.
  ipcMain.handle('zero:stop-session', (_e, { product, id }) => {
    if (isAgentRow(id)) return { ok: false };
    supervisor.stopSession(id);
    return store.answerItem(product, id, { status: 'blocked' });
  });

  // Send a stopped/blocked item back to the queue; the fresh worker's brief
  // carries whatever the founder wrote on the item meanwhile.
  ipcMain.handle('zero:reopen', (_e, { product, id }) => {
    if (isAgentRow(id)) return { ok: false };
    const out = store.answerItem(product, id, { status: 'open' });
    supervisor.liftBrakeForHer?.();
    supervisor.wake();
    return out;
  });

  /* -------------------------- standing instructions ------------------------ */
  // Rules the founder writes once that every session reads before its own
  // brief. The supervisor owns the file and the injection (standingFile,
  // standingInstructions, spawnPlan); this is only the window onto it.
  //
  // WHAT SHE TYPES LANDS IN userDir, NEVER IN THE CHECKOUT (w-3dc46f3a67).
  // These boxes wrote to `dataDir/briefs`, which running from source is the git
  // checkout the fleet works in, so a save could be undone by the next
  // worker's `git checkout` with nothing to show it had happened. The shipped
  // defaults still come from appDir; only her own copy moved.
  ipcMain.handle('zero:instruction-read', (_e, id) => {
    try { return readInstruction(supervisor.userDir, id, supervisor.appDir); }
    catch (e) { return {text:'',defaultText:'',error:e.message}; }
  });
  ipcMain.handle('zero:instruction-write', (_e, {id,text}) => {
    try { return writeInstruction(supervisor.userDir, id, text); }
    catch (e) { return {ok:false,error:e.message}; }
  });
  // The restore points behind the Restore link: her own earlier versions of one
  // box. The list carries times and sizes only, because the whole of twenty
  // versions is most of a megabyte and the page needs one of them at a time.
  ipcMain.handle('zero:instruction-history', (_e, id) => {
    try { return {versions: listVersions(supervisor.userDir, id)}; }
    catch (e) { return {versions:[], error:e.message}; }
  });
  ipcMain.handle('zero:instruction-version', (_e, {id,at}) => {
    try { return readVersion(supervisor.userDir, id, at); }
    catch (e) { return {text:'', error:e.message}; }
  });
  ipcMain.handle('zero:standing-read', () => {
    try {
      return { text: supervisor.readStanding() };
    } catch (err) {
      return { text: '', error: err.message };
    }
  });

  ipcMain.handle('zero:standing-write', (_e, { text }) => {
    try {
      supervisor.writeStanding(text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /* ---------------------------- the message rules -------------------------- */
  // How agents write to her: the titles and openings during a task and the last
  // message a run sends, in one document since w-3dc46f3a67. Shipped filled in,
  // hers to change or empty. The supervisor owns the file and the injection
  // (messageRulesFile, messageRules, spawnPlan); this is only the window. The
  // two channels it replaces were zero:writing-rules-* and zero:finishing-*.
  ipcMain.handle('zero:message-rules-read', () => {
    try {
      return { text: supervisor.readMessageRules() };
    } catch (err) {
      return { text: '', error: err.message };
    }
  });

  ipcMain.handle('zero:message-rules-write', (_e, { text }) => {
    try {
      supervisor.writeMessageRules(text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /* -------------------------------- settings ------------------------------ */
  // The settings screen. Reads are derived on every open (nothing is cached on
  // either side of the bridge, same as the snapshot); writes land in whichever
  // system owns the value and push, so the inbox behind the screen updates with
  // it. Every handler answers `{ ok, error }` rather than throwing across the
  // bridge, because the one thing this screen must never do is leave her
  // believing a setting took when it did not.
  ipcMain.handle('zero:settings-read', () => {
    try {
      return { ok: true, ...readSettings({ config, supervisor, store }) };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  // CHECK AGAIN, from the last card of the walk. The card will not open the
  // inbox on a Mac with no Claude Code on it, so the way through it is to
  // install Claude Code and press this. It throws the remembered shell answer
  // away first, because a button that says it looked again and reads a thirty
  // second old memory is the same broken promise as a key that does nothing.
  ipcMain.handle('zero:claude-recheck', () => {
    try {
      return { ok: true, workspace: recheckClaude(config) };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  // AND THE SAME BUTTON FOR THE SECOND CODING AGENT, from the Codex card on
  // Settings. It earns its place for a sharper reason than the walk's: what the
  // search finds lands on `config.codexBin`, which is the fact `engineChoices`
  // reads, so a press that finds Codex is also what makes the Coding agent row
  // appear -- without the restart a main-process fact usually costs.
  ipcMain.handle('zero:codex-recheck', () => {
    try {
      return { ok: true, workspace: recheckCodex(config) };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  /* * ADD A CODEX ACCOUNT: make the folder, register the login, hand back the one line the
     terminal has to run.
  */
  ipcMain.handle('zero:codex-add-account', () => {
    try {
      const made = addCodexAccount({ config, supervisor });
      pendingLogin = made.home;
      // The shell from a previous add is holding the previous folder, so it is
      // ended: a terminal that says one thing in its prompt and signs another
      // account in is the defect this whole row has been about.
      try { terminals.close(JSON.stringify(SETTINGS_TERMINAL)); } catch { /* none open */ }
      return { ok: true, ...made, workspace: readSettings({ config, supervisor, store }).workspace };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  /* * ADD A CLAUDE ACCOUNT, which is the same three steps as its Codex twin above:
     make the folder, register the login, hand back the one line the terminal has to
     run. It exists from 2026-09-22 (w-3498e0cad2), when she withdrew the rule that
     kept the Claude card from offering one.
  */
  ipcMain.handle('zero:claude-add-account', () => {
    try {
      const made = addClaudeAccount({ config, supervisor });
      pendingLogin = made.home;
      try { terminals.close(JSON.stringify(SETTINGS_TERMINAL)); } catch { /* none open */ }
      return { ok: true, ...made, workspace: readSettings({ config, supervisor, store }).workspace };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  ipcMain.handle('zero:settings-set-project', (_e, payload) => {
    try {
      setProjectSetting({ config, supervisor }, payload ?? {});
      push();
      return { ok: true, ...readSettings({ config, supervisor, store }) };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  ipcMain.handle('zero:settings-set-workspace', (_e, payload) => {
    try {
      setWorkspaceSetting({ config, supervisor }, payload ?? {});
      push();
      return { ok: true, ...readSettings({ config, supervisor, store }) };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  /* --------------------- what a project is called, and its mark ------------ */
  // Both of these write into the PROJECT'S OWN project.json rather than into her
  // config, and main/project-identity.mjs says at length why. They are separate
  // handlers rather than two more keys on settings-set-project because that one
  // is handed `{ config, supervisor }`, and neither of these is a preference
  // about a folder: they need the folder itself, which only the store resolves.
  //
  // THE FOLDER IS LOOKED UP HERE AND NOWHERE ELSE. A slug naming no product is
  // refused before anything touches the disk, so a stale sidebar row cannot aim
  // a write at a folder that has been deleted underneath it.
  const productDirOf = (slug) => store.listProducts().find((p) => p.slug === slug)?.dir ?? null;

  ipcMain.handle('zero:project-rename', (_e, { product, name } = {}) => {
    try {
      const dir = productDirOf(product);
      if (!dir) return { ok: false, error: 'That project could not be found.' };
      const saved = setProjectName(dir, name);
      // PUSH, because the name is on far more than the screen it was typed on:
      // the rail, every row's byline, the composer's picker and ⌘K all print it,
      // and a rename that only redrew Settings would leave the rest of the app
      // calling it the old thing until something else happened to refresh.
      push();
      return { ok: true, name: saved, ...readSettings({ config, supervisor, store }) };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  // Opens the picker AND does the copy, in one round trip. Two handlers would
  // mean the renderer briefly holds a path into her Downloads folder and hands
  // it back to be trusted; this way the only path that crosses the bridge is one
  // the open panel itself produced inside this same call.
  ipcMain.handle('zero:project-icon', async (_e, { product } = {}) => {
    try {
      const dir = productDirOf(product);
      if (!dir) return { ok: false, error: 'That project could not be found.' };
      const { dialog } = await import('electron');
      const r = await dialog.showOpenDialog(window, {
        title: 'Pick a picture for this project',
        buttonLabel: 'Use this picture',
        properties: ['openFile'],
        filters: [{ name: 'Pictures', extensions: ICON_KINDS.map((e) => e.slice(1)) }],
      });
      // Cancelling is not a failure and must not draw an error. `ok` with nothing
      // changed is the honest answer: she opened the panel and closed it again.
      if (r.canceled || !r.filePaths?.length) return { ok: true, canceled: true };
      setProjectIcon(dir, r.filePaths[0]);
      push();
      return { ok: true, ...readSettings({ config, supervisor, store }) };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  ipcMain.handle('zero:project-icon-clear', (_e, { product } = {}) => {
    try {
      const dir = productDirOf(product);
      if (!dir) return { ok: false, error: 'That project could not be found.' };
      clearProjectIcon(dir);
      push();
      return { ok: true, ...readSettings({ config, supervisor, store }) };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  // Her rules for ONE project, the layer that did not exist. The supervisor
  // owns the file and the injection (projectInstructionsFile, spawnPlan); this
  // is only the window onto it, exactly as standing-read/write is.
  ipcMain.handle('zero:project-instructions-read', (_e, { product }) => {
    try {
      return { ok: true, text: supervisor.readProjectInstructions(product) };
    } catch (err) {
      return { ok: false, text: '', error: String(err.message) };
    }
  });

  ipcMain.handle('zero:project-instructions-write', (_e, { product, text }) => {
    try {
      supervisor.writeProjectInstructions(product, text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err.message) };
    }
  });

  // Attachments: pasted images (base64) or dropped files (source paths) land
  // in the product's attachments/ dir and come back as relative paths the
  // caller embeds in the body as markdown. Relative paths keep them readable
  // by workers through the MCP and renderable in the message view.
  ipcMain.handle('zero:save-attachments', async (_e, { product, files }) => {
    const fs = await import('node:fs');
    const dir = store.productDir(product);
    const outDir = path.join(dir, 'attachments');
    fs.mkdirSync(outDir, { recursive: true });
    const saved = [];
    for (const file of files ?? []) {
      const safe = String(file.name ?? 'file').replace(/[^\w.-]+/g, '-').slice(0, 80);
      // A RANDOM SUFFIX, THE SAME ONE THE STAGING PATH ALREADY USES. The name
      // was the millisecond plus the filename, so two files saved in the same
      // millisecond with the same name overwrote each other and the message
      // ended up with two links to one picture. Screenshots are often sent in
      // pairs, which is exactly the shape that collides. It has never been observed
      // happening; it is one line to make impossible.
      const rel = `attachments/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
      const abs = path.join(dir, rel);
      if (file.dataBase64) fs.writeFileSync(abs, Buffer.from(file.dataBase64, 'base64'));
      else if (file.srcPath) fs.copyFileSync(file.srcPath, abs);
      else continue;
      saved.push({ rel, name: safe, image: /\.(png|jpe?g|gif|webp)$/i.test(safe) });
    }
    return saved;
  });

  // A PASTED SCREENSHOT GOES TO DISK THE MOMENT IT IS PASTED.
  //
  // The constraint was ours. Pasted bytes used to ride in the draft as base64,
  // and a draft lives in localStorage, whose quota MEASURED on this machine is
  // 5,241,856 characters for the WHOLE app. Ordinary full-screen screenshots
  // are regularly over that; 6 MB is not unusual.
  //
  // Raising the number cannot reach that bar: even the whole quota is under 4 MB
  // of image, and Claude's own limit is 10 MB base64 per image (about 7.5 MB of
  // file) at up to 8000x8000. localStorage is simply the wrong place for image
  // bytes. So they go here instead, and the draft keeps a path — which the draft
  // format ALREADY stores for free, because `srcPath` attachments cost nothing
  // and are never the ones dropped. There is no image budget left to hit.
  //
  // Staged, not saved: this is not the product's attachments dir. A pasted image
  // only becomes an attachment when she sends, and `zero:save-attachments`
  // copies it there. What she pastes and abandons is swept below.
  //
  // A PICTURE SHE DRAGS IN IS STAGED TOO, AND THAT IS `srcPath`.
  //
  // with a shot of the reply box holding a broken thumbnail labelled
  // `fun-mode.png`. A paste was already fine; a DRAG was not, and the two take
  // different routes. A dropped file arrives with a real path from
  // `webUtils.getPathForFile`, so nothing was ever copied and the thumbnail
  // asked for `astral-img://file/Users/you/…` somewhere out on the disk.
  // `servable` in main/img-scheme.mjs answers that with a 403, on purpose: the
  // window may only draw pictures inside the account root or a product's repo,
  // and widening that to the whole disk is the trade that scheme exists to
  // refuse. Measured against the real module, her account root as the only
  // root:
  //
  //   /…/00000000-/.staging/…-pasted-33035.png   servable true
  //   /Users/you/Desktop/fun-mode.png       servable false
  //
  // So the picture comes inside instead. A copy into the same `.staging` folder
  // a paste lands in makes the path servable, gets swept on the same week, and
  // costs nothing at send time because `zero:save-attachments` above already
  // copies from `srcPath`. Bytes are copied on disk rather than carried through
  // this bridge as base64, which a file picked off disk should never need.
  ipcMain.handle('zero:stage-attachment', async (_e, { name, dataBase64, srcPath }) => {
    const fs = await import('node:fs');
    const dir = path.join(config.accountRoot, '.staging');
    fs.mkdirSync(dir, { recursive: true });
    // Sweep on the way in rather than on a timer: an abandoned paste is only
    // ever discovered by the next one, and a week is longer than any draft she
    // has ever left open. Failure to sweep must never fail the paste.
    try {
      const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        try { if (fs.statSync(p).mtimeMs < week) fs.unlinkSync(p); } catch { /* leave it */ }
      }
    } catch { /* a sweep that cannot run is not a paste that failed */ }
    const safe = String(name ?? 'pasted.png').replace(/[^\w.-]+/g, '-').slice(0, 80);
    const abs = path.join(dir, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
    // A path is a drag, bytes are a paste. Already inside the folder we serve
    // from is left alone: copying it would only make a second file to sweep.
    if (typeof srcPath === 'string' && srcPath) {
      if (path.resolve(srcPath) === path.resolve(path.join(dir, path.basename(srcPath)))) return { path: srcPath };
      fs.copyFileSync(srcPath, abs);
      return { path: abs };
    }
    fs.writeFileSync(abs, Buffer.from(String(dataBase64 ?? ''), 'base64'));
    return { path: abs };
  });

  // Unstick ONE stalled item: forget its answer's delivery mark and tick, so
  // a fresh worker picks the answer up now.
  ipcMain.handle('zero:redeliver', (_e, { product, id }) => {
    if (isAgentRow(id)) return { ok: false };
    const item = store.listItems().find((i) => i.product === product && i.id === id);
    if (!item?.answer || item.answer === '(withdrawn)') return { ok: false, error: 'no live answer to redeliver' };
    supervisor.liftBrakeForHer?.();
    supervisor.redeliverAnswer(item, item.answer);
    supervisor.tick?.().catch(() => {});
    return { ok: true };
  });

  // Respawn what a mass die-off (usage limit, crash) left stranded. With `ids`,
  // only those: a selection in the list is her saying which of the stopped rows
  // are still worth her plan.
  ipcMain.handle('zero:resume-agents', (_e, arg) => {
    const ids = Array.isArray(arg?.ids) ? arg.ids : null;
    const cleared = supervisor.resumeStopped(ids);
    return { ok: true, cleared, ...supervisor.status() };
  });

  // Put a worker back on named rows whatever state they are in, including the
  // finished ones no other path can reach. Ids only: this is her pointing.
  ipcMain.handle('zero:resume-items', (_e, arg) => {
    const ids = Array.isArray(arg?.ids) ? arg.ids : [];
    return { ok: true, ...supervisor.resumeItems(ids), ...supervisor.status() };
  });

  // `zero:pause-product` stopped one project and is gone with it
  // (w-d19d6d387c, 2026-09-22). `zero:pause` still holds the whole fleet.

  // Open a worker-written artifact path. Workers write paths relative to
  // whichever root they were thinking about (docs dir, designs/, attachments/,
  // the repo), so a single-root file:// href fails silently on the rest.
  // Images already resolve across these roots to render; links open the same
  // way. Absolute and file:// paths open as-is if they exist.
  // mode 'resolve' returns the found path without opening it, so the renderer
  // can render hrefs that are true (Copy Link must hand out a URL that works).
  //
  // EVERY GUESS STAYS INSIDE THE CARD'S OWN PRODUCT (main/artifact-path.mjs).
  // It used to fall through to every other product's folders, which is how nine
  // of eleven chips on one card opened two other products' files (her answer,
  // 2026-08-19). When it finds nothing it now hands back a sentence she can
  // read, and the renderer shows it.
  ipcMain.handle('zero:open-artifact', async (_e, { product, src, mode }) => {
    const { shell } = await import('electron');
    if (typeof src !== 'string' || !src) return { ok: false, error: 'no path' };
    if (/^https?:/.test(src)) { if (mode !== 'resolve') shell.openExternal(src); return { ok: true, opened: src } }
    const found = resolveArtifact({
      src,
      product,
      products: store.listProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
    });
    if (!found.ok) return { ok: false, error: found.error };
    if (mode === 'resolve') {
      // RESOLVING FOR THE PANE IS WHAT OPENS THE DOOR. An html page is drawn
      // in a frame of its own and its pictures sit beside it on disk, so the
      // file's folder and this product's roots become readable under the
      // document scheme, and the url the frame should point at comes back with
      // the path. Nothing else on disk is reachable from that page. A markdown
      // file is read through zero:read-doc and never needs this.
      if (docGrants && /\.html?$/i.test(found.path)) {
        const prod = store.listProducts().find((p) => p.slug === product) ?? null;
        docGrants.grant(found.path, artifactRoots(prod));
        return { ok: true, opened: found.path, url: docUrl(found.path) };
      }
      return { ok: true, opened: found.path };
    }
    if (mode === 'source') {
      try { await openSourceFile(found.path); return { ok: true, opened: found.path }; }
      catch (error) { return { ok: false, error: error.message || 'The text editor could not be opened.' }; }
    }
    const err = await shell.openPath(found.path);
    return err ? { ok: false, error: err } : { ok: true, opened: found.path };
  });

  // THE DOCUMENT PANE READS AND WRITES THE FILE ITSELF. A path goes through
  // the very same finder the links and the chips use, so the pane opens
  // exactly the file a click would have opened, and then main hands back the
  // text rather than the path. What may be written is decided in
  // main/doc-file.mjs: markdown only, inside this product's own folders only.
  ipcMain.handle('zero:read-doc', async (_e, { product, src }) => {
    const found = resolveArtifact({
      src,
      product,
      products: store.listProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
    });
    if (!found.ok) return { ok: false, error: found.error };
    return readDoc({ file: found.path });
  });

  // THE CHANGE A RUN MADE. Same finder as every other artifact, so a click on
  // the chip and a click on a path in her message open the same file.
  ipcMain.handle('zero:code-change', async (_e, { product, src }) => {
    const found = resolveArtifact({
      src,
      product,
      products: store.listProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
    });
    if (!found.ok) return { ok: false, error: found.error };
    try {
      return { ok: true, change: readChange(found.path) };
    } catch (e) {
      return { ok: false, error: `that change could not be read (${e.message})` };
    }
  });

  // ONE FILE INSIDE A CHANGE, READ AND WRITTEN.
  //
  // `src` is the change artifact and `path` is one file inside it, which is the
  // same pair the pane already has on screen. The change is re-read here rather
  // than trusted from the renderer, because it is what says which folders a
  // write may land in and that decision may not come from the window.
  const openChange = (product, src) => {
    const found = resolveArtifact({
      src,
      product,
      products: store.listProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
    });
    if (!found.ok) return { ok: false, error: found.error };
    try {
      return { ok: true, change: readChange(found.path), prod: store.listProducts().find((p) => p.slug === product) ?? null };
    } catch (e) {
      return { ok: false, error: `that change could not be read (${e.message})` };
    }
  };

  ipcMain.handle('zero:code-file', async (_e, { product, src, path: filePath }) => {
    const opened = openChange(product, src);
    if (!opened.ok) return opened;
    const found = findFile({ change: opened.change, product: opened.prod, filePath });
    if (!found.ok) return found;
    return readCodeFile({ file: found.path });
  });

  ipcMain.handle('zero:save-code-file', async (_e, { product, src, path: filePath, text, mtime }) => {
    const opened = openChange(product, src);
    if (!opened.ok) return opened;
    const found = findFile({ change: opened.change, product: opened.prod, filePath });
    if (!found.ok) return found;
    return writeCodeFile({ file: found.path, change: opened.change, product: opened.prod, text, mtime });
  });

  ipcMain.handle('zero:write-doc', async (_e, { product, src, text, mtime }) => {
    const prod = store.listProducts().find((p) => p.slug === product) ?? null;
    const found = resolveArtifact({
      src,
      product,
      products: store.listProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
    });
    if (!found.ok) return { ok: false, error: found.error };
    return writeDoc({ file: found.path, product: prod, text, mtime });
  });

  // The work behind a review, viewable: commits and diff of a branch against
  // main in the product's repo. Read-only, size-capped. THE SIDEBAR NOTE. It
  // is a file in the product's own folder and nothing else, so unlike the
  // document pane there is no path to resolve and no path to check: the slug
  // picks the product, the product owns the path. See main/rail-note.mjs for
  // why it is a file at all.
  ipcMain.handle('zero:rail-note', (_e, { product }) => {
    const prod = store.listProducts().find((p) => p.slug === product) ?? null;
    if (!prod) return { ok: false, error: 'That project could not be found.' };
    return readNote({ product: prod });
  });

  ipcMain.handle('zero:save-rail-note', (_e, { product, text }) => {
    const prod = store.listProducts().find((p) => p.slug === product) ?? null;
    if (!prod) return { ok: false, error: 'That project could not be found.' };
    return writeNote({ product: prod, text });
  });

  // The trace: what each session on this item actually did, from the logs the
  // supervisor persists under <product>/sessions/<item-id>/. Read-only.
  ipcMain.handle('zero:session-trace', async (_e, { product, id }) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = store.listProducts().find((p) => p.slug === product)?.dir;
    if (!dir || !/^[\w-]+$/.test(String(id ?? ''))) return { ok: false, sessions: [] };
    const traceDir = machineryPath(dir, path.join('sessions', id));
    let files = [];
    try {
      files = fs.readdirSync(traceDir).filter((f) => f.endsWith('.log')).sort();
    } catch { return { ok: true, sessions: [] }; }
    const sessions = files.slice(-20).map((f) => {
      let text = '';
      try { text = fs.readFileSync(path.join(traceDir, f), 'utf8'); } catch {}
      if (text.length > 120_000) text = `… truncated (${text.length} bytes total)\n\n${text.slice(-120_000)}`;
      return { startedAt: Number(f.replace('.log', '')) || 0, text };
    });
    return { ok: true, sessions };
  });

  // The thread history behind the time under a task's title. Raw ledger lines,
  // read fresh: the renderer owns what they mean, this owns getting them across.
  ipcMain.handle('zero:item-history', async (_e, { product, id }) => {
    try {
      return { ok: true, lines: store.readHistory(product, id) };
    } catch (err) {
      return { ok: false, error: err.message, lines: [] };
    }
  });

  // UPDATES (main/updater.mjs). Two doors and no more: look now, and install
  // what has been downloaded. There is deliberately no "download" door, because
  // the download already happened on its own; the only thing left for a person
  // to decide is when the app is allowed to disappear and come back.
  ipcMain.handle('zero:update-check', async () => updater.check({ manual: true }));
  ipcMain.handle('zero:update-install', () => ({ started: updater.install() }));

  // Handed back so the Cmd+Y/Cmd+N chord answers through the same door the
  // buttons do, rather than reaching past it into approvals.answer.
  // `push` goes with it so the updater can make the window refetch when a
  // download finishes, without holding the window itself.
  return { answerApproval, push };
}
