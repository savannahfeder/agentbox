// THE ONE LIST OF WHAT THE SCREEN MAY ASK FOR.
//
// preload.cjs is the desktop half of this: it turns each name below into an
// Electron invoke. renderer/src/browser-bridge.ts is the other half and turns
// the same name into a POST to the local server. Both doors read this list, so
// a channel added to one cannot go missing from the other, and
// tests/both-front-doors-offer-the-same-bridge.test.mjs fails the suite if
// preload.cjs and this file ever disagree.
//
// The keys are the screen's own vocabulary, the values are the channels
// main/ipc.mjs registered. Nothing here decides anything; it is a phone book.

/** Asked, and the screen waits for the answer. */
export const REQUEST_CHANNELS = {
  terminal: 'zero:terminal',
  agentUpdate: 'zero:agent-update',
  snapshot: 'zero:snapshot',
  refreshUsage: 'zero:refresh-usage',
  accountUsage: 'zero:account-usage',
  // Whether a screen reader is running, which is the terminal pane's question
  // before it builds xterm's accessibility tree.
  assistiveTech: 'zero:assistiveTech',
  // The next page of old finished threads, at the foot of Done and All.
  olderItems: 'zero:older-items',
  dashboard: 'zero:dashboard',
  commandCatalog: 'zero:command-catalog',
  remoteControl: 'zero:remote-control',
  command: 'zero:command',
  compact: 'zero:compact',
  compactionStatus: 'zero:compaction-status',
  answer: 'zero:answer',
  sendNow: 'zero:send-now',
  compose: 'zero:compose',
  schedule: 'zero:schedule',
  snooze: 'zero:snooze',
  // Feedback to the Agentbox team, from the sidebar's Feedback card.
  sendFeedback: 'zero:send-feedback',
  // The team version: signing in, the team, sharing, routing a given task.
  teamSignIn: 'zero:team-sign-in',
  teamSignInCancel: 'zero:team-sign-in-cancel',
  teamSignInReopen: 'zero:team-sign-in-reopen',
  teamSignOut: 'zero:team-sign-out',
  teamSignInEmail: 'zero:team-sign-in-email',
  teamSignUp: 'zero:team-sign-up',
  teamCreate: 'zero:team-create',
  teamInvite: 'zero:team-invite',
  teamRename: 'zero:team-rename',
  teamRemoveMember: 'zero:team-remove-member',
  teamLeave: 'zero:team-leave',
  teamCancelInvite: 'zero:team-cancel-invite',
  teamAcceptInvite: 'zero:team-accept-invite',
  teamStatus: 'zero:team-status',
  teamShare: 'zero:team-share',
  teamSync: 'zero:team-sync',
  teamRoute: 'zero:team-route',
  teamReact: 'zero:team-react',
  // New words for a message you sent to a teammate, or the message taken back.
  teamEdit: 'zero:team-edit',
  // The microphone, asked for when a voice note starts recording.
  micAccess: 'zero:mic-access',
  teamMessage: 'zero:team-message',
  rooms: 'zero:rooms',
  // Teammates: make, describe, start, edit, write to, and what they remember.
  teammates: 'zero:teammates',
  takeJoin: 'zero:take-join',
  threadEdit: 'zero:thread-edit',
  // Move a thread to another project (shared/move-thread.mjs).
  moveItem: 'zero:move-item',
  repeats: 'zero:repeats',
  composeRepeat: 'zero:compose-repeat',
  setRepeat: 'zero:set-repeat',
  endRepeat: 'zero:end-repeat',
  pauseSupervisor: 'zero:supervisor-pause',
  createProduct: 'zero:create-product',
  firstRunAnswer: 'zero:first-run-answer',
  firstRunExamples: 'zero:first-run-examples',
  firstRunPractice: 'zero:first-run-practice',
  firstRunPracticeEnd: 'zero:first-run-practice-end',
  firstRunWalking: 'zero:first-run-walking',
  openFreshUser: 'zero:open-fresh-user',
  openDemo: 'zero:open-demo',
  chooseFolder: 'zero:choose-folder',
  listFolders: 'zero:list-folders',
  folderExists: 'zero:folder-exists',
  agentFiles: 'zero:agent-files',
  agentFolders: 'zero:agent-folders',
  importAgents: 'zero:import-agents',
  agentThreads: 'zero:agent-threads',
  searchAgentThreads: 'zero:search-agent-threads',
  importThreads: 'zero:import-threads',
  badge: 'zero:badge',
  cornerTag: 'zero:corner-tag',
  bootInfo: 'zero:boot-info',
  updateCheck: 'zero:update-check',
  updateInstall: 'zero:update-install',
  updateMove: 'zero:update-move',
  notify: 'zero:notify',
  stopSession: 'zero:stop-session',
  runNow: 'zero:run-now',
  reopen: 'zero:reopen',
  instructionRead: 'zero:instruction-read',
  instructionWrite: 'zero:instruction-write',
  instructionHistory: 'zero:instruction-history',
  instructionVersion: 'zero:instruction-version',
  standingRead: 'zero:standing-read',
  standingWrite: 'zero:standing-write',
  messageRulesRead: 'zero:message-rules-read',
  messageRulesWrite: 'zero:message-rules-write',
  settingsRead: 'zero:settings-read',
  claudeRecheck: 'zero:claude-recheck',
  codexRecheck: 'zero:codex-recheck',
  // Point at the coding agent yourself, or hand the choice back to the search.
  // The browser tab has no file panel, so main answers it ok-with-nothing-done
  // there (main/serve.mjs stubs showOpenDialog) and the row stays honest.
  engineBin: 'zero:engine-bin',
  engineSetup: 'zero:engine-setup',
  codexAddAccount: 'zero:codex-add-account',
  claudeAddAccount: 'zero:claude-add-account',
  setProjectSetting: 'zero:settings-set-project',
  setWorkspaceSetting: 'zero:settings-set-workspace',
  // The cloud setup's sign-in for one account, made in the cloud (main/cloud/logins.mjs).
  cloudSignIn: 'zero:cloud-signin',
  // Claude's sign-in code, read from the clipboard while one is waiting for it.
  cloudClipboardCode: 'zero:cloud-clipboard-code',
  // Signing in to Agentbox Cloud itself, on the app's sign-in page (main/cloud/account.mjs).
  cloudAccountSignIn: 'zero:cloud-account-sign-in',
  cloudAccountCancel: 'zero:cloud-account-cancel',
  cloudAccountReopen: 'zero:cloud-account-reopen',
  cloudAccountSignOut: 'zero:cloud-account-sign-out',
  cloudAccountPlan: 'zero:cloud-account-plan',
  cloudAccountPay: 'zero:cloud-account-pay',
  cloudAccountBilling: 'zero:cloud-account-billing',
  projectRename: 'zero:project-rename',
  projectArchive: 'zero:project-archive',
  projectSeenBy: 'zero:project-seen-by',
  projectIcon: 'zero:project-icon',
  projectIconClear: 'zero:project-icon-clear',
  projectInstructionsRead: 'zero:project-instructions-read',
  projectInstructionsWrite: 'zero:project-instructions-write',
  saveAttachments: 'zero:save-attachments',
  stageAttachment: 'zero:stage-attachment',
  crash: 'zero:crash',
  track: 'zero:track',
  sessionTrace: 'zero:session-trace',
  itemHistory: 'zero:item-history',
  openArtifact: 'zero:open-artifact',
  folderPictures: 'zero:folder-pictures',
  readDoc: 'zero:read-doc',
  codeChange: 'zero:code-change',
  codeFile: 'zero:code-file',
  saveCodeFile: 'zero:save-code-file',
  writeDoc: 'zero:write-doc',
  railNote: 'zero:rail-note',
  saveRailNote: 'zero:save-rail-note',
  agentReply: 'zero:agent-reply',
  agentReveal: 'zero:agent-reveal',
  agentConversation: 'zero:agent-conversation',
  scheduleAgent: 'zero:schedule-agent',
  closeAgent: 'zero:close-agent',
  unreplyAgent: 'zero:unreply-agent',
  resumeAgents: 'zero:resume-agents',
  resumeItems: 'zero:resume-items',
  redeliver: 'zero:redeliver',
  setProductOrder: 'zero:set-product-order',
  setThreadPlaces: 'zero:set-thread-places',
  setThreadPins: 'zero:set-thread-pins',
  setThreadOnMac: 'zero:set-thread-on-mac',
  setProductHidden: 'zero:set-product-hidden',
  approve: 'zero:approve',
  // The phone door's Settings page (main/phone-link.mjs): its state, on, off,
  // a new key, and which address the QR code carries. The desktop window only.
  phoneLink: 'zero:phone-link',
};

/** Told rather than asked: the app talks and the screen listens. */
export const PUSH_CHANNELS = {
  onApprovalAnswered: 'zero:approval-answered',
  onChanged: 'zero:changed',
  onFind: 'zero:find',
  onZoomPercent: 'zero:zoom-percent',
  onRecovered: 'zero:recovered',
  onJoinRoom: 'zero:join-room',
  onOpenItem: 'zero:open-item',
  onOpenSettings: 'zero:open-settings',
  onScreenDetail: 'zero:screen-detail',
  onEscapeBrowser: 'zero:escape-browser',
  onKeyInTheFile: 'zero:key-in-the-file',
  // A phone connected, left, or the key changed.
  onPhoneChanged: 'zero:phone-changed',
};

// THE FEW THAT ARE NOT A STRAIGHT HANDOVER. Each is called with bare values
// and the handler on the far side reads an object, so the key each value goes
// under is part of the contract and belongs here beside the channel.
export const WRAPPED_ARGS = {
  notify: ['arrivals', 'needsYou'],
  track: ['name'],
  instructionWrite: ['id', 'text'],
  instructionVersion: ['id', 'at'],
};

// Electron can tell you the real path of a file somebody dropped onto the
// window. A browser cannot, by design, and no server can answer it either, so
// this one is absent there rather than wrong. The screen already reads null.
//
// `onWriteHeld` is the desktop's ⌘R asking the page to write what the undo
// window holds before it reloads (main/write-before-reload.mjs). A browser
// reload asks nobody; the page writes on `pagehide` there instead.
export const DESKTOP_ONLY = ['pathForFile', 'onWriteHeld'];
