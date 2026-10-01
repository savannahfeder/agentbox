// The bridge. Everything the renderer may do, spelled out.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('zero', {
  terminal: (payload) => ipcRenderer.invoke('zero:terminal', payload),
  agentUpdate: (payload) => ipcRenderer.invoke('zero:agent-update', payload),
  snapshot: () => ipcRenderer.invoke('zero:snapshot'),
  dashboard: (slug) => ipcRenderer.invoke('zero:dashboard', slug),
  commandCatalog: (payload) => ipcRenderer.invoke('zero:command-catalog', payload),
  remoteControl: (payload) => ipcRenderer.invoke('zero:remote-control', payload),
  command: (payload) => ipcRenderer.invoke('zero:command', payload),
  compact: (payload) => ipcRenderer.invoke('zero:compact', payload),
  compactionStatus: (payload) => ipcRenderer.invoke('zero:compaction-status', payload),
  answer: (payload) => ipcRenderer.invoke('zero:answer', payload),
  compose: (payload) => ipcRenderer.invoke('zero:compose', payload),
  schedule: (payload) => ipcRenderer.invoke('zero:schedule', payload),
  // The team version: signing in, the team, and sharing a project.
  teamSignIn: () => ipcRenderer.invoke('zero:team-sign-in'),
  teamSignOut: () => ipcRenderer.invoke('zero:team-sign-out'),
  teamCreate: (payload) => ipcRenderer.invoke('zero:team-create', payload),
  teamInvite: (payload) => ipcRenderer.invoke('zero:team-invite', payload),
  teamShare: (payload) => ipcRenderer.invoke('zero:team-share', payload),
  teamSync: () => ipcRenderer.invoke('zero:team-sync'),
  teamRoute: (payload) => ipcRenderer.invoke('zero:team-route', payload),
  teamMessage: (payload) => ipcRenderer.invoke('zero:team-message', payload),
  threadEdit: (payload) => ipcRenderer.invoke('zero:thread-edit', payload),
  // Repeating tasks. A rule, not a work item, so it has its own channels
  // rather than a flag on compose.
  repeats: () => ipcRenderer.invoke('zero:repeats'),
  composeRepeat: (payload) => ipcRenderer.invoke('zero:compose-repeat', payload),
  setRepeat: (payload) => ipcRenderer.invoke('zero:set-repeat', payload),
  endRepeat: (payload) => ipcRenderer.invoke('zero:end-repeat', payload),
  pauseSupervisor: (paused) => ipcRenderer.invoke('zero:supervisor-pause', paused),
  createProduct: (payload) => ipcRenderer.invoke('zero:create-product', payload),
  // The first run. Its example task is a real row with no session behind it,
  // and while the walk is up nothing else is allowed to start.
  firstRunAnswer: (payload) => ipcRenderer.invoke('zero:first-run-answer', payload),
  firstRunExamples: (payload) => ipcRenderer.invoke('zero:first-run-examples', payload),
  // The practice project: made with its three rows, archived when the walk ends.
  firstRunPractice: () => ipcRenderer.invoke('zero:first-run-practice'),
  firstRunPracticeEnd: () => ipcRenderer.invoke('zero:first-run-practice-end'),
  firstRunWalking: (payload) => ipcRenderer.invoke('zero:first-run-walking', payload),
  // A second Agentbox, in a throwaway home, as somebody who has never opened it.
  // It adds a window; it removes nothing (main/fresh-user.mjs).
  openFreshUser: (payload) => ipcRenderer.invoke('zero:open-fresh-user', payload ?? {}),
  // The same again, on an invented studio's inbox instead of an empty one, so a
  // demo does not have to be her own screen (main/demo.mjs).
  openDemo: () => ipcRenderer.invoke('zero:open-demo'),
  // The Mac's own folder chooser, for the new project card's "Where's its code?"
  chooseFolder: (payload) => ipcRenderer.invoke('zero:choose-folder', payload ?? {}),
  // The picker the app draws itself, when there is no Mac dialog to open. It
  // walks this machine's disk a folder at a time (main/folders.mjs).
  listFolders: (payload) => ipcRenderer.invoke('zero:list-folders', payload ?? {}),
  folderExists: (payload) => ipcRenderer.invoke('zero:folder-exists', payload ?? {}),
  agentFiles: (payload) => ipcRenderer.invoke('zero:agent-files', payload ?? {}),
  // The folders on this Mac with agents of their own that no project points at
  // yet, so the card can offer to make the project.
  agentFolders: () => ipcRenderer.invoke('zero:agent-folders'),
  // Taking them: saves the ticks and files one inbox row per agent.
  importAgents: (payload) => ipcRenderer.invoke('zero:import-agents', payload ?? {}),
  // The Claude Code threads she started herself in the last few days, which is
  // what she meant by her agents, and taking one as a task.
  agentThreads: () => ipcRenderer.invoke('zero:agent-threads'),
  importThreads: (payload) => ipcRenderer.invoke('zero:import-threads', payload ?? {}),
  badge: (count) => ipcRenderer.invoke('zero:badge', count),
  // Whether this page came up from ⌘R, and which build it is running.
  bootInfo: () => ipcRenderer.invoke('zero:boot-info'),
  // KEEPING AGENTBOX CURRENT (main/updater.mjs). The state of it rides the
  // snapshot, so these two are only the verbs: look again now, and restart onto
  // the version that has already downloaded. Nothing here can start a download,
  // because nothing needs to; that happens on its own in the background.
  updateCheck: () => ipcRenderer.invoke('zero:update-check'),
  updateInstall: () => ipcRenderer.invoke('zero:update-install'),
  // What just arrived, not what to say about it. Whether she is looking at the
  // window is a fact only the main process holds, so the page reports and does
  // not decide (main/notify.mjs).
  notify: (arrivals) => ipcRenderer.invoke('zero:notify', { arrivals }),
  stopSession: (payload) => ipcRenderer.invoke('zero:stop-session', payload),
  reopen: (payload) => ipcRenderer.invoke('zero:reopen', payload),
  // Her standing instructions: the text every session is briefed with.
  instructionRead: (id) => ipcRenderer.invoke('zero:instruction-read', id),
  instructionWrite: (id, text) => ipcRenderer.invoke('zero:instruction-write', {id,text}),
  // Her earlier versions of one box, and one of them read back in full.
  instructionHistory: (id) => ipcRenderer.invoke('zero:instruction-history', id),
  instructionVersion: (id, at) => ipcRenderer.invoke('zero:instruction-version', {id,at}),
  standingRead: () => ipcRenderer.invoke('zero:standing-read'),
  standingWrite: (payload) => ipcRenderer.invoke('zero:standing-write', payload),
  // The message rules: how agents write to her during a task and how a run
  // ends. One document since w-3dc46f3a67, hers to change or empty.
  messageRulesRead: () => ipcRenderer.invoke('zero:message-rules-read'),
  messageRulesWrite: (payload) => ipcRenderer.invoke('zero:message-rules-write', payload),
  // The settings screen: the workspace, and every project's own settings.
  settingsRead: () => ipcRenderer.invoke('zero:settings-read'),
  // Look for Claude Code again, from scratch. The last card of the walk is the
  // only caller: it will not open the inbox without Claude Code, so it owes
  // whoever installs it a search that is really a search.
  claudeRecheck: () => ipcRenderer.invoke('zero:claude-recheck'),
  // And for the second coding agent, from the Codex card on Settings. Finding
  // it is also what makes the Coding agent row appear, because the path the
  // search lands on is the one that row is drawn from.
  codexRecheck: () => ipcRenderer.invoke('zero:codex-recheck'),
  codexAddAccount: () => ipcRenderer.invoke('zero:codex-add-account'),
  // A second login for either agent is a second home folder. Main makes it and
  // hands back the line the built-in terminal runs to sign in.
  claudeAddAccount: () => ipcRenderer.invoke('zero:claude-add-account'),
  setProjectSetting: (payload) => ipcRenderer.invoke('zero:settings-set-project', payload),
  setWorkspaceSetting: (payload) => ipcRenderer.invoke('zero:settings-set-workspace', payload),
  // What a project is CALLED, and the mark beside the name. Not settings: both
  // are written into the project's own project.json and travel with the folder.
  // `projectIcon` opens the picker itself, so no path off her disk ever crosses
  // this bridge in the direction of being trusted.
  projectRename: (payload) => ipcRenderer.invoke('zero:project-rename', payload),
  projectIcon: (payload) => ipcRenderer.invoke('zero:project-icon', payload),
  projectIconClear: (payload) => ipcRenderer.invoke('zero:project-icon-clear', payload),
  // Her rules for one project, briefed after the standing ones.
  projectInstructionsRead: (payload) => ipcRenderer.invoke('zero:project-instructions-read', payload),
  projectInstructionsWrite: (payload) => ipcRenderer.invoke('zero:project-instructions-write', payload),
  saveAttachments: (payload) => ipcRenderer.invoke('zero:save-attachments', payload),
  // A pasted screenshot's bytes, straight to disk, so the draft carries a path
  // and never an image budget.
  stageAttachment: (payload) => ipcRenderer.invoke('zero:stage-attachment', payload),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } },
  // One way, name/message/stack only, scrubbed on the far side before it is
  // written. The window never chooses what a crash report contains.
  crash: (payload) => ipcRenderer.invoke('zero:crash', payload),
  // A COUNT, AND THE NAME IS THE WHOLE MESSAGE. There is no analytics SDK in
  // this window on purpose (a browser one autocaptures the text of what was
  // clicked, and here that text is task titles), so the page can say THAT
  // something happened and can say nothing about what.
  track: (name) => ipcRenderer.invoke('zero:track', { name }),
  sessionTrace: (payload) => ipcRenderer.invoke('zero:session-trace', payload),
  // Everything that happened on one task, as the ledger lines it happened as.
  itemHistory: (payload) => ipcRenderer.invoke('zero:item-history', payload),
  openArtifact: (payload) => ipcRenderer.invoke('zero:open-artifact', payload),
  // The document pane's own two: the text of a file it has open, and her edit
  // going back onto disk. Markdown only on the way back (main/doc-file.mjs).
  readDoc: (payload) => ipcRenderer.invoke('zero:read-doc', payload),
  // The change a run made, read as a built artifact.
  codeChange: (payload) => ipcRenderer.invoke('zero:code-change', payload),
  codeFile: (payload) => ipcRenderer.invoke('zero:code-file', payload),
  saveCodeFile: (payload) => ipcRenderer.invoke('zero:save-code-file', payload),
  writeDoc: (payload) => ipcRenderer.invoke('zero:write-doc', payload),
  railNote: (payload) => ipcRenderer.invoke('zero:rail-note', payload),
  saveRailNote: (payload) => ipcRenderer.invoke('zero:save-rail-note', payload),
  // The shelf: what this product has made, and whether each thing is still the
  // live answer. The status write lands in the store's catalog, not in the inbox.
  // Her Claude Code agents. The list rides the snapshot; these two are the only
  // things Agentbox can do to one, and the second is only "bring its app to the
  // front" because nothing public can focus a pane inside another app.
  agentReply: (payload) => ipcRenderer.invoke('zero:agent-reply', payload),
  agentReveal: (payload) => ipcRenderer.invoke('zero:agent-reveal', payload),
  agentConversation: (payload) => ipcRenderer.invoke('zero:agent-conversation', payload),
  scheduleAgent: (payload) => ipcRenderer.invoke('zero:schedule-agent', payload),
  closeAgent: (payload) => ipcRenderer.invoke('zero:close-agent', payload),
  unreplyAgent: (payload) => ipcRenderer.invoke('zero:unreply-agent', payload),
  resumeAgents: (payload) => ipcRenderer.invoke('zero:resume-agents', payload),
  resumeItems: (payload) => ipcRenderer.invoke('zero:resume-items', payload),
  redeliver: (payload) => ipcRenderer.invoke('zero:redeliver', payload),
  setProductOrder: (payload) => ipcRenderer.invoke('zero:set-product-order', payload),
  setProductHidden: (payload) => ipcRenderer.invoke('zero:set-product-hidden', payload),
  approve: (payload) => ipcRenderer.invoke('zero:approve', payload),
  // What was just decided, and on which card. The Cmd+Y chord is caught in the
  // main process (it has to outrank the game), so this is the only way the page
  // can know a press landed; the card's exit is drawn from it.
  onApprovalAnswered: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('zero:approval-answered', handler);
    return () => ipcRenderer.removeListener('zero:approval-answered', handler);
  },
  onChanged: (fn) => {
    const handler = () => fn();
    ipcRenderer.on('zero:changed', handler);
    return () => ipcRenderer.removeListener('zero:changed', handler);
  },
  // ⌘F (step 0), ⌘G (1) or ⇧⌘G (-1). Caught in the main process so it works
  // with the keyboard inside an open file, and drawn by FindBar.tsx.
  onFind: (fn) => {
    const handler = (_e, payload) => fn(payload ?? {});
    ipcRenderer.on('zero:find', handler);
    return () => ipcRenderer.removeListener('zero:find', handler);
  },
  // The zoom moved, and by how much. The chords are caught in the main process
  // (they have to outrank the game and the junk browser's guest page), so this
  // is the only way the page can know one landed and echo the percentage.
  onZoomPercent: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('zero:zoom-percent', handler);
    return () => ipcRenderer.removeListener('zero:zoom-percent', handler);
  },
  // She opened the lid and the app put the agents back on their work. This is the
  // only trace it leaves, for two and a half seconds. The startup sweep's line
  // arrives on bootInfo instead, because it happens before this page exists.
  onRecovered: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('zero:recovered', handler);
    return () => ipcRenderer.removeListener('zero:recovered', handler);
  },
  // She clicked the banner. The window is already coming forward; this says
  // which row it was about, so she lands on it rather than on wherever she
  // left the cursor.
  onOpenItem: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('zero:open-item', handler);
    return () => ipcRenderer.removeListener('zero:open-item', handler);
  },
  // The window moved to a screen that wants the other set of theme pictures.
  // Only main can see which physical display a window is on, and only main can
  // read a display's density without page zoom folded into it, so this is the
  // only way the page can know. It fires on a change, never on every drag.
  onScreenDetail: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('zero:screen-detail', handler);
    return () => ipcRenderer.removeListener('zero:screen-detail', handler);
  },
  onEscapeBrowser: (fn) => {
    const handler = () => fn();
    ipcRenderer.on('zero:escape-browser', handler);
    return () => ipcRenderer.removeListener('zero:escape-browser', handler);
  },
  // THE KEYS THE APP OWNS, forwarded from below the page, because the file in
  // the document pane is its own document and no key reaches the app's own
  // window listener from inside it.
  //
  // It carried Escape alone until 2026-08-24, which is why ⌘K was dead inside
  // an open page and she reported it. It carries the press now and
  // shared/artifact-keys.mjs decides what the app does with it.
  onKeyInTheFile: (fn) => {
    const handler = (_e, payload) => fn(payload ?? {});
    ipcRenderer.on('zero:key-in-the-file', handler);
    return () => ipcRenderer.removeListener('zero:key-in-the-file', handler);
  },
});
