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
  dashboard: 'zero:dashboard',
  commandCatalog: 'zero:command-catalog',
  remoteControl: 'zero:remote-control',
  command: 'zero:command',
  compact: 'zero:compact',
  compactionStatus: 'zero:compaction-status',
  answer: 'zero:answer',
  compose: 'zero:compose',
  schedule: 'zero:schedule',
  // The team version: signing in, the team, sharing, routing a given task.
  teamSignIn: 'zero:team-sign-in',
  teamSignOut: 'zero:team-sign-out',
  teamCreate: 'zero:team-create',
  teamInvite: 'zero:team-invite',
  teamAcceptInvite: 'zero:team-accept-invite',
  teamShare: 'zero:team-share',
  teamSync: 'zero:team-sync',
  teamRoute: 'zero:team-route',
  teamMessage: 'zero:team-message',
  threadEdit: 'zero:thread-edit',
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
  importThreads: 'zero:import-threads',
  badge: 'zero:badge',
  bootInfo: 'zero:boot-info',
  updateCheck: 'zero:update-check',
  updateInstall: 'zero:update-install',
  notify: 'zero:notify',
  stopSession: 'zero:stop-session',
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
  codexAddAccount: 'zero:codex-add-account',
  claudeAddAccount: 'zero:claude-add-account',
  setProjectSetting: 'zero:settings-set-project',
  setWorkspaceSetting: 'zero:settings-set-workspace',
  projectRename: 'zero:project-rename',
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
  setProductHidden: 'zero:set-product-hidden',
  approve: 'zero:approve',
};

/** Told rather than asked: the app talks and the screen listens. */
export const PUSH_CHANNELS = {
  onApprovalAnswered: 'zero:approval-answered',
  onChanged: 'zero:changed',
  onFind: 'zero:find',
  onZoomPercent: 'zero:zoom-percent',
  onRecovered: 'zero:recovered',
  onOpenItem: 'zero:open-item',
  onScreenDetail: 'zero:screen-detail',
  onEscapeBrowser: 'zero:escape-browser',
  onKeyInTheFile: 'zero:key-in-the-file',
};

// THE FEW THAT ARE NOT A STRAIGHT HANDOVER. Each is called with bare values
// and the handler on the far side reads an object, so the key each value goes
// under is part of the contract and belongs here beside the channel.
export const WRAPPED_ARGS = {
  notify: ['arrivals'],
  track: ['name'],
  instructionWrite: ['id', 'text'],
  instructionVersion: ['id', 'at'],
};

// Electron can tell you the real path of a file somebody dropped onto the
// window. A browser cannot, by design, and no server can answer it either, so
// this one is absent there rather than wrong. The screen already reads null.
export const DESKTOP_ONLY = ['pathForFile'];
