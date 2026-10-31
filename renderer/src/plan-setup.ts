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
  /** Where the tool is, once something has looked for it. */
  bin?: string | null;
  /** Whether it was on the computer before this setup started. */
  already?: boolean;
  /** Whether this reading established anything: false when the search or the
   *  sign-in check did not answer, which is not the same as a no. */
  certain?: boolean;
}

export const COPY = {
  planHead: 'Which AI plan do you pay for?',
  planLede: `Your agents run on your own plan. Pick it and ${NAME} sets everything up.`,
  claude: 'Claude',
  claudePlans: 'Pro, Max or a team plan',
  chatgpt: 'ChatGPT',
  chatgptPlans: 'A paid ChatGPT plan',
  both: 'Both',
  // NOT "whichever has room left", which was the walk's first word on the
  // subject of usage limits and read as a way around them (w-dac993a554).
  bothPlans: 'A paid plan with each',
  /*
   * THE ANSWER FOR SOMEBODY WHO ALREADY HAS ONE (w-ce8c1a9275). The search asks
   * their own login shell first and then looks in sixteen places, which between
   * them cover every ordinary install; what is left is a copy somewhere nobody
   * would guess, and every one of those used to be a path we ship and a release
   * they wait for. It belongs here, beside the other way out, because "I
   * already have one" is an answer to "which plan do you pay for" and not a
   * separate screen.
   *
   * IT NAMES NO TOOL AND NO FILE. The question above it is asked in words
   * people know -- Claude, ChatGPT -- and this has to stay in them.
   */
  haveOne: 'I already have one, let me show you where',
  /** After the panel refused what came out of it, or found nothing there. */
  notThatOne: 'That is not something agents can run. Try another, or pick a plan above.',
  checking: 'Checking this computer…',
  nothingHere: 'Nothing is set up on this computer yet. Pick the plan you pay for above.',
  privacy: `You sign in on Claude's or OpenAI's own page. ${NAME} never sees your password.`,

  /*
   * THE OTHER HALF OF THIS SCREEN (w-e217e577e5). A computer with a plan
   * already signed in was walked straight past the question, and told nothing,
   * so the first anybody knew of it was an agent spending their tokens. In the
   * founder's words, a new user "was like, 'Oh my God, where are the tokens
   * coming from? I didn't even connect my account.'"
   *
   * It is the same screen, not a new one: you get the question or you get the
   * answer, so no machine walks a step another machine does not.
   */
  foundHead: 'Found on this computer.',
  signedIn: 'Signed in',
  /** On the disk already, so there is nothing to install. */
  signIn: 'Sign in',
  setUp: 'Set up',
  /**
   * The line under the found card. The same promise `privacy` makes, without
   * its second sentence: there is one sign-in left on this screen rather than
   * a whole setup, and the row it belongs to is the one with no tick.
   */
  foundNote: "You sign in on Claude's or OpenAI's own page.",
  /** The same screen with nothing signed in: no plan to claim yet, and the
   *  next press opens a browser, which it has to say before one opens. */
  foundOut: 'Pick the plan you pay for. Signing in opens a page in your browser.',
  /** And its own heading: this screen drew "Found on this computer." over that
   *  lede, which is the two halves of one screen contradicting each other. */
  foundOutHead: 'No plan is signed in yet.',

  setupHead: (name: string) => `Setting up ${name}.`,
  setupLedeWait: 'One step needs you: approve the sign-in in your browser.',
  setupLedeBusy: 'This takes about half a minute. Nothing needs you yet.',
  setupLedeFailed: 'Something stopped the setup. Try again, or skip it for now.',
  setupOf: (n: number, of: number) => `${n} of ${of}`,
  install: (tool: string) => `Install ${tool}`,
  /** The same row when nothing was installed because it was already here. */
  found: (tool: string) => `Found ${tool}`,
  signInStep: (name: string) => `Sign in to your ${name} plan`,
  signInSub: (name: string) => `A ${name === 'Claude' ? 'Claude' : 'ChatGPT'} page opened in your browser. Click Authorize there, then come back here.`,
  ready: 'Check that agents can start',
  done: 'Done',
  working: 'Working…',
  waiting: 'Waiting for you',
  openAgain: 'Open the sign-in page again',
  tryAgain: 'Try again',
  skip: 'Skip for now',
  /** The way past the plan screens. `PlanBar` on the inbox is where somebody
   *  who takes it picks this back up. */
  notNow: 'Not now, I will set this up later',
  /** The in-app answer to Codex's own "on a remote or headless machine" line. */
  copyLink: 'Copy the sign-in link',
  copiedLink: 'Link copied',
  showLog: 'Show what is happening',
  hideLog: 'Hide what is happening',

  barSay: 'Agents cannot start until they have a plan to run on.',
  /** When one tool is already on the disk, so the thing missing has a name. */
  barSignedOut: (name: string) => `Agents cannot start until you sign in to your ${name} plan.`,
  barSub: 'Takes a couple of clicks.',
  barSetUp: (name: string) => `Set up with ${name}`,
  barSignIn: (name: string) => `Sign in to ${name}`,
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
 * AND WHETHER THE BAR MAY SAY SO OUT LOUD. `barSay` is an absolute claim about
 *  what the app will do, so only a certain no raises it.
 *
 *  The walk keeps `needsPlan`: it asks a question and offers a way past, so
 *  asking on an unsure reading costs a click. This tells rather than asks.
 */
export function sureNoPlan(readings: Array<Pick<EngineSetupState, 'found' | 'signedIn' | 'certain'>>): boolean {
  return needsPlan(readings) && readings.every((r) => r.certain !== false);
}

export interface BarWords {
  say: string;
  first: { plan: Plan; label: string };
  second: { plan: Plan; label: string };
}

type BarReading = Pick<EngineSetupState, 'engine' | 'found' | 'signedIn' | 'certain'>;

/**
 * AND WHAT IT SAYS ONCE IT HAS SPOKEN (F-151). Somebody who installed Codex a
 *  screen ago was given Set up with Claude as the loud button and a sentence
 *  naming neither. A tool already on the disk is a choice they have made, so
 *  it leads, and what it is short of is a sign-in rather than a plan.
 *
 *  Null is the whole of "draw nothing", so the bar has one question to ask.
 */
export function planBar(readings: BarReading[]): BarWords | null {
  if (!sureNoPlan(readings)) return null;
  const here = readings.filter((r) => r.found).map((r) => r.engine as Engine);
  const word = (engine: Engine) => (here.includes(engine) ? COPY.barSignIn : COPY.barSetUp)(planName(engine));
  const button = (engine: Engine) => ({ plan: engine as Plan, label: word(engine) });
  // Only one on the disk can lead on being there, and only then can the
  // sentence name the one plan that is a sign-in away.
  const lead = here.length === 1 ? here[0] : 'claude';
  const other: Engine = lead === 'claude' ? 'codex' : 'claude';
  return {
    say: here.length === 1 ? COPY.barSignedOut(planName(lead)) : COPY.barSay,
    first: button(lead),
    second: button(other),
  };
}

/**
 * WHAT A LOOK AT THE COMPUTER FOUND, AND IT NEVER STARTS ANYTHING. There is no
 *  answer here that mounts the setup card, because that card opens the tool's
 *  own login on its first render, and a browser may only be opened by a press
 *  (tests/nothing-signs-you-in-until-you-pick-it).
 *
 *  `ready` is something signed in, so there is nothing to ask. `found` is a
 *  tool on the disk signed out: still the found screen, because the screen
 *  knows which plan is here and which is not, and says so on the rows. Nothing
 *  at all is the question.
 */
export function afterCheck(readiness: Array<Pick<EngineSetupState, 'engine' | 'found' | 'signedIn'>>):
  | { t: 'ready' } | { t: 'found' } | { t: 'nothing' } {
  if (!needsPlan(readiness)) return { t: 'ready' };
  return readiness.some((r) => r.found) ? { t: 'found' } : { t: 'nothing' };
}

/* ---------------- AND THE COMPUTER CHANGES WHILE YOU LOOK ----------------- */
/* The arrival look was the only one, so a login that appeared a minute later
   was found by reloading the page and by nothing else (F-71).

   WHAT IS WORTH LOOKING AGAIN FOR is everything up to a plan that is signed
   in. A tool on the disk signed out is the state that changes next; a plan
   signed in is the end of the question, and no later look could add to it. */

/** Whether another look at the computer could still change this screen. */
export function worthLookingAgain(
  readiness: Array<Pick<EngineSetupState, 'found' | 'signedIn'>> | null | undefined,
): boolean {
  return needsPlan(readiness ?? []);
}

/** How often the plan screen looks again while it is up. */
export const LOOK_AGAIN_MS = 5_000;
/**
 * And how long it keeps that clock. NOTHING RETRIES FOR EVER (CLAUDE.md), and
 *  each look spawns both tools to ask them. After this the screen still looks
 *  on coming back to the window, which is the move somebody signing in
 *  somewhere else makes. */
export const LOOK_AGAIN_FOR_MS = 3 * 60_000;

/* ------------------------- WHAT THE QUESTION OFFERS ----------------------- */
/**
 * A ROW ON A QUESTION CARD: a mark, a name, a sentence, and whether it belongs
 * to the separated group at the foot.
 *
 * These lists used to be built inline in components/PlanSetup.tsx, where no
 * test could read them, so what the one screen a brand new person meets
 * actually offers was eyeballed. Everything else in this file is here for that
 * reason and these were the exception.
 */
export interface AskRow {
  key: string;
  /** The plan this answers with, when it answers with one. */
  plan?: Plan;
  mark?: string;
  name: string;
  sub?: string;
  /**
   * In the group under the rule, which is "a way out" rather than "a plan".
   *
   * AN `other` ROW IS ONE LINE AND CARRIES NO `sub`. That is the shape the
   * screen was drawn in, and the stylesheet means it: `.fr-folder-other
   * .fr-folder-name` spans the sub's own grid column, so a sub on one of these
   * is squeezed against the right edge and clipped mid-word. Say it in the
   * name instead.
   */
  other?: boolean;
  /**
   * WHAT IS TRUE OF THIS ONE ALREADY, at the right of the row: signed in, or
   * the one word for what pressing it would do. Only the found screen has any,
   * because only the found screen knows anything yet.
   */
  right?: string;
  /** With a tick, which is for the one thing that needs nobody to do anything. */
  tick?: boolean;
  /**
   * A REAL LINK, when the row leaves the app. Drawn as an anchor rather than a
   * button so the address is in the page: it can be copied, opened in a new
   * window, and read by anything that reads pages. The gate's install row is
   * the only one, and tests/the-inbox-does-not-open-without-claude-code is
   * what noticed when it briefly stopped being one.
   */
  href?: string;
}

/**
 * WHICH AI PLAN DO YOU PAY FOR, and the one answer that is not a plan.
 *
 * THE COMPUTER IS ASKED BY THE SCREEN ITSELF, NOT BY A ROW (w-ce8c1a9275,
 * 2026-10-09). There used to be a fourth row, "I am not sure, check this
 * computer for me". The founder: "I would think this step is actually better
 * fit also checking first at the same time. Otherwise they may select something
 * we cant run. Best to figure it out now."
 *
 * So `afterCheck` runs when the screen opens, against the reading the welcome
 * step already took, and the question is only asked when asking is honest --
 * see `planNote` below for what the screen says while that is happening. A row
 * that re-runs something the screen has already done is a button that cannot
 * change its own answer.
 *
 * WHAT NO AMOUNT OF LOOKING CAN REPLACE stays: a copy somewhere nobody would
 * guess is exactly the case the search cannot reach, so "I already have one"
 * is still an answer somebody can give.
 */
export function planRows(): AskRow[] {
  return [
    { ...PLAN_ROW.claude },
    { ...PLAN_ROW.codex },
    { key: 'both', plan: 'both', mark: '+', name: COPY.both, sub: COPY.bothPlans },
    { key: 'mine', name: COPY.haveOne, other: true },
    SKIP_ROW,
  ];
}

/** The way past, on every plan screen that can stand between somebody and
 *  their inbox. `PlanBar` on the inbox is where it comes back. */
const SKIP_ROW: AskRow = { key: 'skip', name: COPY.notNow, other: true };

/**
 * ONE PLAN, DRAWN THE SAME WAY WHEREVER IT APPEARS. The question and the
 *  answer are the same screen, so a plan that is asked about and a plan that was
 *  found are the same row with different words at its right edge.
 */
const PLAN_ROW: Record<Engine, AskRow> = {
  claude: { key: 'claude', plan: 'claude', mark: 'C', name: COPY.claude, sub: COPY.claudePlans },
  codex: { key: 'codex', plan: 'codex', mark: 'G', name: COPY.chatgpt, sub: COPY.chatgptPlans },
};

type Reading = Pick<EngineSetupState, 'engine' | 'found' | 'signedIn'>;

/** The plans that can run an agent right now, in the order they are asked in. */
export function readyEngines(readings: Reading[]): Engine[] {
  return (['claude', 'codex'] as Engine[]).filter((e) => {
    const r = readings.find((x) => x.engine === e);
    return !!r?.found && !!r?.signedIn;
  });
}

/**
 * THE HEADING, WHICH ONLY CLAIMS A FIND WHEN THERE IS ONE. Beside `foundLede`
 *  so one reading decides both lines of this screen.
 */
export function foundHead(ready: Engine[]): string {
  return ready.length ? COPY.foundHead : COPY.foundOutHead;
}

/**
 * WHAT WAS FOUND, SAID IN THE PLAN'S OWN NAME. Never a tier: a row reading
 *  "Claude · Max 20x" shipped on 2026-10-07 and came out the same day, and the
 *  question being answered is "did it connect to something of mine", not "what
 *  am I paying for". Null when nothing is ready, because then there is nothing
 *  to claim and the screen is the question instead.
 */
export function foundLede(ready: Engine[]): string | null {
  if (!ready.length) return null;
  const names = ready.map(planName);
  if (ready.length > 1) return `Your agents will run on your own ${names.join(' and ')} plans.`;
  // AND THE OTHER ROW IS ANSWERED TOO (w-04e8d6d6e6). The screen says it
  // found one plan and then draws the other one under it offering to set it
  // up, with nothing saying whether that one was looked for. A tester with
  // ChatGPT signed in read the Claude row as something still to do.
  const other = (['claude', 'codex'] as Engine[]).find((e) => !ready.includes(e));
  const sentence = `Your agents will run on your own ${names[0]} plan.`;
  return other ? `${sentence} You do not need ${planName(other)} as well.` : sentence;
}

/**
 * THE TWO PLANS, EACH CARRYING WHAT IS TRUE OF IT. "Both" is not here: it is a
 *  thing to set up, and one is already set up. Neither is "I already have one",
 *  which answers a question nobody is being asked on this screen.
 *
 *  AND AN INSTALL IS NOT A SIGN-IN. A tool sitting on the disk signed out needs
 *  a sign-in, so offering to "Set up" it offers to install what is installed.
 *
 *  THE WAY OUT IS HERE ONLY WHEN NOTHING CAN RUN YET. With a plan signed in the
 *  ticked row IS the way on, and a second word for the same press is a choice
 *  nobody has to make.
 */
export function foundRows(readings: Reading[]): AskRow[] {
  const ready = readyEngines(readings);
  const plans = (['claude', 'codex'] as Engine[]).map((e) => {
    const r = readings.find((x) => x.engine === e);
    const isReady = ready.includes(e);
    return {
      ...PLAN_ROW[e],
      right: isReady ? COPY.signedIn : r?.found ? COPY.signIn : COPY.setUp,
      ...(isReady ? { tick: true } : {}),
    };
  });
  return ready.length ? plans : [...plans, SKIP_ROW];
}

/**
 * WHERE RETURN RESTS: on the one that is already running agents, and failing
 *  that on the one that is at least on the computer, so a blind Return never
 *  goes off to install a second tool beside the one already sitting there.
 */
export function litRow(rows: AskRow[]): number {
  const at = rows.findIndex((r) => r.tick);
  if (at !== -1) return at;
  const here = rows.findIndex((r) => r.right === COPY.signIn);
  return here === -1 ? 0 : here;
}

/**
 * WHAT A PRESS ON THE FOUND SCREEN MEANS. There are only two things it can
 *  mean, and which one depends on the row rather than on a button: the one that
 *  is ready is a yes, and the other one is a second plan to set up.
 */
export function afterFound(key: string, ready: Engine[]): { t: 'go' } | { t: 'setup'; plan: Plan } {
  return ready.includes(key as Engine) ? { t: 'go' } : { t: 'setup', plan: key as Plan };
}

/**
 * THE ONE LINE UNDER THE CARD, at this moment, and whether it is a complaint.
 *
 * Four states and the newest one wins. A refusal is about the press just made,
 * so it beats everything; then the look, while it is running; then its answer,
 * which is that the computer is empty -- NOT an error, because an empty
 * computer is the ordinary case for this screen and the question above it is
 * exactly the right question to be asking. The resting line is the promise
 * about passwords, which is what this screen said before any of this.
 */
export function planNote(s: { looking?: boolean; looked?: boolean; refused?: boolean }): { text: string; bad: boolean } {
  if (s.refused) return { text: COPY.notThatOne, bad: true };
  if (s.looking) return { text: COPY.checking, bad: false };
  if (s.looked) return { text: COPY.nothingHere, bad: false };
  return { text: COPY.privacy, bad: false };
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
 *  same shape for everyone and nobody wonders what was skipped. It says which
 *  of the two happened, and where, because a ticked Install on a computer
 *  where nothing was installed says the opposite of what happened.
 */
export function setupRows(s: Pick<EngineSetupState, 'engine' | 'phase' | 'bin' | 'already'>): StepRow[] {
  const name = planName(s.engine);
  const install: StepRow = {
    state: 'todo',
    title: s.already ? COPY.found(toolName(s.engine)) : COPY.install(toolName(s.engine)),
    // Only once something has looked. Before that there is no path to name and
    // no honest way to say whether it will be an install or a find.
    ...(s.bin ? { sub: s.bin } : {}),
  };
  const sign: StepRow = { state: 'todo', title: COPY.signInStep(name) };
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

/**
 * Lines of Codex's own that nobody can act on. A warning that says it is
 * proceeding has already proceeded; any OTHER warning is kept. Its device-auth
 * advice is `COPY.copyLink`, as a button.
 */
const LOG_NOISE = [/^WARNING: proceeding/i, /device-auth/i];

/** What a line Codex prints means, said the way a person would say it. */
const LOG_PLAIN: Array<[RegExp, string]> = [
  [/^Starting local login server/i, 'Waiting for your browser to come back.'],
  [/browser did not open/i, `No page opened? ${COPY.copyLink} above.`],
  [/successfully logged in/i, 'Signed in.'],
];

/**
 * THE LOG, READ OUT LOUD, AND THE SIGN-IN LINK PULLED OUT OF IT so it can be a
 * button rather than text nobody can press, which on a machine where no
 * browser opens is the only way through.
 *
 * A LINE THIS DOES NOT RECOGNISE IS KEPT, WORD FOR WORD. Translating what we
 * know and dropping what we do not is how a real failure (`npm error EACCES`)
 * becomes a blank panel, and nothing in this app fails in silence.
 */
export function readLog(log: string): { lines: string[]; url: string | null } {
  const lines: string[] = [];
  let url: string | null = null;
  for (const raw of String(log ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const link = line.match(/https?:\/\/\S*oauth\S*/i)?.[0];
    if (link) { url ??= link; continue; }
    if (LOG_NOISE.some((p) => p.test(line))) continue;
    const plain = LOG_PLAIN.find(([p]) => p.test(line))?.[1] ?? line;
    // Pressing "Open the sign-in page again" runs the same login over the same
    // log, so every sentence in it would otherwise be said twice.
    if (!lines.includes(plain)) lines.push(plain);
  }
  return { lines, url };
}
