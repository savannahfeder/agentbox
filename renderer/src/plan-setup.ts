// ASK WHICH PLAN THEY PAY FOR, THEN DO IT FOR THEM (w-9f6975906c).
//
// Picked 2026-10-05 out of four drawn approaches, in the founder's words:
// "asking which plan, then doing it for them, makes the most sense", and "if we
// can detect it, we should just use it straight up". So a Mac where Claude Code
// or Codex is already found and signed in never sees any of this, and a Mac
// where neither is gets one question in words people know (Claude, ChatGPT),
// never the names of the tools underneath.
//
// Everything here has no window in it, so what the two screens say at every
// moment is tested rather than eyeballed. The screens are in
// components/PlanSetup.tsx.

import { NAME } from '../../shared/product-name.mjs';

export type Engine = 'claude' | 'codex';
export type Plan = 'claude' | 'codex' | 'both';
export type Phase = 'idle' | 'checking' | 'installing' | 'signing-in' | 'ready' | 'failed';

export interface EngineSetupState {
  engine: Engine;
  phase: Phase;
  error: string | null;
  log: string;
  /** Only on a `ready` question: whether the tool is on the Mac at all. */
  found?: boolean;
  signedIn?: boolean;
}

export const COPY = {
  planHead: 'Which AI plan do you pay for?',
  planLede: `Your agents run on your own plan. Pick it and ${NAME} sets everything up.`,
  claude: 'Claude',
  claudePlans: 'Pro, Max or a team plan',
  chatgpt: 'ChatGPT',
  chatgptPlans: 'A paid ChatGPT plan',
  both: 'Both',
  bothPlans: 'Agents use whichever has room left',
  notSure: 'I am not sure, check this computer for me',
  checking: 'Checking this computer…',
  nothingHere: 'Nothing is set up on this computer yet. Pick the plan you pay for above.',
  privacy: `You sign in on Claude's or OpenAI's own page. ${NAME} never sees your password.`,

  setupHead: (name: string) => `Setting up ${name}.`,
  setupLedeWait: 'One step needs you: approve the sign-in in your browser.',
  setupLedeBusy: 'This takes about half a minute. Nothing needs you yet.',
  setupLedeFailed: 'Something stopped the setup. Try again, or skip it for now.',
  setupOf: (n: number, of: number) => `${n} of ${of}`,
  install: (tool: string) => `Install ${tool}`,
  signIn: (name: string) => `Sign in to your ${name} plan`,
  signInSub: (name: string) => `A ${name === 'Claude' ? 'Claude' : 'ChatGPT'} page opened in your browser. Click Authorize there, then come back here.`,
  ready: 'Check that agents can start',
  done: 'Done',
  working: 'Working…',
  waiting: 'Waiting for you',
  openAgain: 'Open the sign-in page again',
  tryAgain: 'Try again',
  skip: 'Skip for now',
  showLog: 'Show what is happening',
  hideLog: 'Hide what is happening',

  barSay: 'Agents cannot start until they have a plan to run on.',
  barSub: 'Takes a couple of clicks.',
  barClaude: 'Set up with Claude',
  barChatgpt: 'Set up with ChatGPT',
} as const;

/** The plan's name, the word on screen. Never "Claude Code" or "Codex" here. */
export function planName(engine: Engine): string {
  return engine === 'claude' ? COPY.claude : COPY.chatgpt;
}

/** The tool's name, only where a tool is really being installed. */
export function toolName(engine: Engine): string {
  return engine === 'claude' ? 'Claude Code' : 'Codex';
}

/** Which tools a plan sets up, in the order they are set up. */
export function enginesFor(plan: Plan): Engine[] {
  return plan === 'both' ? ['claude', 'codex'] : [plan];
}

/**
 * WHETHER THE WALK ASKS AT ALL. One tool that is found and signed in is enough
 *  to run every agent, so any one ready means no question.
 */
export function needsPlan(readiness: Array<Pick<EngineSetupState, 'found' | 'signedIn'>>): boolean {
  return !readiness.some((r) => r.found && r.signedIn);
}

/**
 * WHAT "CHECK THIS MAC FOR ME" FOUND. A ready tool ends the question; one that
 *  is there but signed out goes straight to its sign-in, with no plan asked;
 *  nothing at all is said out loud, under the four rows.
 */
export function afterCheck(readiness: Array<Pick<EngineSetupState, 'engine' | 'found' | 'signedIn'>>):
  | { t: 'ready' } | { t: 'setup'; plan: Plan } | { t: 'nothing' } {
  if (!needsPlan(readiness)) return { t: 'ready' };
  const there = readiness.filter((r) => r.found).map((r) => r.engine);
  if (there.length === 2) return { t: 'setup', plan: 'both' };
  if (there.length === 1) return { t: 'setup', plan: there[0] };
  return { t: 'nothing' };
}

export interface StepRow {
  state: 'done' | 'now' | 'todo';
  title: string;
  sub?: string;
  right?: string;
}

/**
 * THE THREE ROWS OF THE SETUP CARD for one tool, at one moment. Install is
 *  drawn even when the tool was already there, ticked, so the card has the
 *  same shape for everyone and nobody wonders what was skipped.
 */
export function setupRows(s: Pick<EngineSetupState, 'engine' | 'phase'>): StepRow[] {
  const name = planName(s.engine);
  const install: StepRow = { state: 'todo', title: COPY.install(toolName(s.engine)) };
  const sign: StepRow = { state: 'todo', title: COPY.signIn(name) };
  const check: StepRow = { state: 'todo', title: COPY.ready };
  switch (s.phase) {
    case 'idle':
    case 'installing':
      install.state = 'now'; install.right = COPY.working;
      break;
    case 'checking':
      install.state = 'done'; install.right = COPY.done;
      sign.state = 'now'; sign.right = COPY.working;
      break;
    case 'signing-in':
      install.state = 'done'; install.right = COPY.done;
      sign.state = 'now'; sign.sub = COPY.signInSub(name); sign.right = COPY.waiting;
      break;
    case 'ready':
      install.state = 'done'; install.right = COPY.done;
      sign.state = 'done'; sign.right = COPY.done;
      check.state = 'done'; check.right = COPY.done;
      break;
    case 'failed':
      break;
  }
  return [install, sign, check];
}

/** The line under the heading, which is the one thing to do right now. */
export function setupLede(phase: Phase): string {
  if (phase === 'signing-in') return COPY.setupLedeWait;
  if (phase === 'failed') return COPY.setupLedeFailed;
  return COPY.setupLedeBusy;
}
