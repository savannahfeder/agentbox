// The list every harness on offer is checked against, and what a run of it
// comes to. scripts/check-harnesses.mts drives a real copy of the app with it.
import { ENGINES } from '../../shared/engines.mts';
import { HARNESS_DEFINITIONS } from '../../shared/harness-definitions.mts';
import { deadRunCause } from '../../shared/spawn-trouble.mts';

export interface Scenario { id: string; proves: string }

export const SCENARIOS: readonly Scenario[] = Object.freeze([
  { id: 'answers', proves: 'a new thread gets its answer' },
  { id: 'remembers', proves: 'a reply carries on the same conversation' },
  { id: 'restart', proves: 'a reply after the app restarts carries on the same conversation' },
  { id: 'stops', proves: 'a running thread stops when told to, and still answers afterwards' },
  { id: 'approval', proves: 'a command that needs a yes waits for it, then runs' },
  { id: 'denial', proves: 'a command that was refused did not run' },
]);

// The permission mode that makes each harness ask before it runs a command.
// No protocol carries this, so a harness is not checkable until someone says.
export const ASKS_FIRST: Readonly<Record<string, string>> = Object.freeze({ claude: 'default', codex: 'read-only', opencode: 'default' });

export type Outcome = 'passed' | 'failed' | 'unchecked';

export interface Verdict {
  harness: string;
  scenario: string;
  outcome: Outcome;
  /** Why not, in words a person can act on. */
  said?: string;
  /** The app's own name for what stopped the run, when it gave one. */
  cause?: string | null;
}

export interface Row {
  id: string;
  result?: string | null;
  wrote?: { result?: { ts?: number } };
}

/** The running app, as far as the list needs it. */
export interface App {
  /** A new thread on this harness; its id. */
  start(harness: string, words: string): Promise<string>;
  reply(id: string, words: string, mode?: string | null): Promise<void>;
  stop(id: string): Promise<void>;
  decide(cardId: string, allow: boolean): Promise<void>;
  row(id: string): Promise<Row | null>;
  running(id: string): Promise<boolean>;
  /** The card this thread is waiting on, if any. */
  card(id: string): Promise<string | null>;
  /** Which harness the app says this thread runs on. */
  harnessOf?(id: string): Promise<string | null>;
  restart(): Promise<void>;
  /** Where a command is told to write, and whether it did. */
  proofPath(name: string): string;
  wrote(name: string): boolean;
}

export interface Waits { answer: number; start: number; settle: number; stop: number; card: number; every: number }

export const WAITS: Waits = Object.freeze({ answer: 300_000, start: 90_000, settle: 4_000, stop: 60_000, card: 180_000, every: 500 });

/**
 * Every harness on offer, plus any candidate: one that is registered and not
 * offered yet, which the copy of the app is told to put on offer for this run.
 * That is how a harness passes the list before anybody is offered it.
 */
export function harnessesToCheck(only: readonly string[] = [], candidates: readonly string[] = []): string[] {
  for (const id of candidates) if (!HARNESS_DEFINITIONS.some((h) => h.id === id)) throw Error(`${id} is not a harness this app knows. It knows: ${HARNESS_DEFINITIONS.map((h) => h.id).join(', ')}`);
  const offered = [...new Set([...ENGINES.map((e) => e.id), ...candidates])];
  if (!only.length) return offered;
  for (const id of only) if (!offered.includes(id)) throw Error(`${id} is not on offer, so there is nothing to check. On offer: ${offered.join(', ')}. A harness not offered yet is checked with --candidate ${id}`);
  return [...only];
}

const harnessWord = (id: string) => HARNESS_DEFINITIONS.find((h) => h.id === id)?.label ?? id;
const firstLine = (text: unknown) => String(text ?? '').trim().split('\n')[0].slice(0, 240);
const seconds = (ms: number) => Math.round(ms / 1000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(read: () => Promise<T | null | false | undefined>, ms: number, every: number): Promise<T | null> {
  const deadline = Date.now() + ms;
  for (;;) {
    const got = await read();
    if (got) return got;
    if (Date.now() >= deadline) return null;
    await sleep(every);
  }
}

/** How a harness stands on this machine before anything is asked of it, by the app's own account. */
export interface Standing {
  found: boolean;
  /** Null when the tool's own status command never answered. */
  signedIn: boolean | null;
  offered: boolean;
  /** When the plan the app reads as used up comes back, if it is. */
  spentUntil?: number | null;
}

/** Whether the app's own facts name this harness: among the two every screen knows, or among the further ones. */
export function offeredIn(engines: { choices?: { id: string }[]; further?: { id: string }[] } | null | undefined, harness: string): boolean {
  return [...(engines?.choices ?? []), ...(engines?.further ?? [])].some((engine) => engine.id === harness);
}

/**
 * What is already known before a thread is started, or null when the list should run.
 * A signed-out harness is a failure: nobody on this machine can run it. One that
 * is not installed, or whose plan is used up, could not be checked. A used-up
 * plan gets no run because Codex carries on past it on paid credits.
 */
export function standingVerdict(harness: string, { found, signedIn, offered, spentUntil = null }: Standing): Pick<Verdict, 'outcome' | 'said' | 'cause'> | null {
  const word = harnessWord(harness);
  if (!found) return { outcome: 'unchecked', said: `${word} is not installed on this machine` };
  if (signedIn === false) return { outcome: 'failed', cause: 'signed-out', said: `nobody is signed in to ${word} on this machine, by its own status command` };
  if (!offered) return { outcome: 'unchecked', said: `the app does not offer ${word} on this machine` };
  if (spentUntil) return { outcome: 'unchecked', cause: 'at-limit', said: `${word}'s plan is used up until ${new Date(spentUntil).toISOString().slice(0, 16).replace('T', ' ')} UTC, and a check now would spend paid credits` };
  return null;
}

/** The verdicts of a harness nothing was asked of: the reason on the first scenario, the rest not tried. */
export function verdictsWithoutARun(harness: string, known: Pick<Verdict, 'outcome' | 'said' | 'cause'>): Verdict[] {
  return SCENARIOS.map((s, i) => (known.outcome === 'failed' && i > 0
    ? { harness, scenario: s.id, outcome: 'unchecked' as const, said: `not tried: ${known.said}` }
    : { harness, scenario: s.id, ...known }));
}

/** Why a thread that should have answered did not: out of usage is not broken, everything else is. */
export function whyNot(row: Row | null, waitedMs: number): Pick<Verdict, 'outcome' | 'said' | 'cause'> {
  const cause = deadRunCause(row?.result);
  const said = firstLine(row?.result) || `no answer in ${seconds(waitedMs)} seconds`;
  return { outcome: cause === 'at-limit' ? 'unchecked' : 'failed', said, cause };
}

export async function checkHarness(
  app: App,
  harness: string,
  { waits = WAITS, token = Date.now().toString(36), onVerdict = null }: { waits?: Waits; token?: string; onVerdict?: ((verdict: Verdict) => void) | null } = {},
): Promise<Verdict[]> {
  const verdicts: Verdict[] = [];
  const say = (scenario: string, outcome: Outcome, why: Pick<Verdict, 'said' | 'cause'> = {}) => {
    const verdict = { harness, scenario, outcome, ...why };
    verdicts.push(verdict);
    onVerdict?.(verdict);
  };
  const sayWhyNot = (scenario: string, row: Row | null, waited: number) => {
    const { outcome, said, cause } = whyNot(row, waited);
    say(scenario, outcome, { said, cause });
  };
  const rest = (said: string) => { for (const s of SCENARIOS) if (!verdicts.some((v) => v.scenario === s.id)) say(s.id, 'unchecked', { said }); return verdicts; };
  const word = `PINEAPPLE-${token}`;
  const NO_TOOLS = 'Do not use any tools.';

  /** The answer written after `sentAt`, or null when none came in time. */
  const answered = (id: string, sentAt: number) => until(async () => {
    // A turn told to use no tools that asks for one anyway is refused, so it cannot wait on a card nobody will answer.
    const card = await app.card(id);
    if (card) await app.decide(card, false);
    const row = await app.row(id);
    return row && (row.wrote?.result?.ts ?? 0) > sentAt && String(row.result ?? '').trim() ? row : null;
  }, waits.answer, waits.every);

  /** Ask for the word again; pass only when the answer has it. */
  const recalls = async (scenario: string, id: string, words: string) => {
    const sentAt = Date.now();
    await app.reply(id, words);
    const row = await answered(id, sentAt);
    if (row && String(row.result).includes(word)) return say(scenario, 'passed');
    if (row && !deadRunCause(row.result)) return say(scenario, 'failed', { said: `it answered without the word from the first turn: "${firstLine(row.result)}"` });
    sayWhyNot(scenario, row ?? await app.row(id), waits.answer);
  };

  let sentAt = Date.now();
  const id = await app.start(harness, `Reply with exactly the word ${word} and nothing else. ${NO_TOOLS}`);
  const on = await app.harnessOf?.(id) ?? harness;
  if (on !== harness) {
    // Stopped at once, so the mistake spends none of the other harness's plan.
    await app.stop(id);
    say('answers', 'failed', { said: `the app ran the thread on ${harnessWord(on)} instead` });
    return rest(`not tried: the thread did not run on ${harnessWord(harness)}`);
  }
  const first = await answered(id, sentAt);
  if (!first || !String(first.result).includes(word)) {
    sayWhyNot('answers', first ?? await app.row(id), waits.answer);
    return rest('not tried: the first thread got no answer');
  }
  say('answers', 'passed');

  await recalls('remembers', id, `Which word did you just reply with? Answer with only that word. ${NO_TOOLS}`);
  await app.restart();
  await recalls('restart', id, `Once more: which word did you reply with at the start of this thread? Answer with only that word. ${NO_TOOLS}`);

  // Short enough to sit inside a tool's own command time limit, so it is not sent to the background.
  await app.reply(id, 'Run this exact shell command in the foreground and wait for it to finish before you say anything: sleep 100');
  if (!await until(() => app.running(id), waits.start, waits.every)) {
    say('stops', 'failed', { said: `the reply never started a run in ${seconds(waits.start)} seconds` });
  } else {
    await sleep(waits.settle);
    if (!await app.running(id)) {
      say('stops', 'unchecked', { said: 'the run ended by itself before it could be stopped' });
    } else {
      await app.stop(id);
      const stopped = await until(async () => !(await app.running(id)), waits.stop, waits.every);
      if (!stopped) say('stops', 'failed', { said: `still running ${seconds(waits.stop)} seconds after it was told to stop` });
      // A harness may pick a stopped command back up on the next reply (OpenCode 2.3.2 did), so it is told not to.
      else await recalls('stops', id, `Leave the command that was stopped: do not run it or anything else. Which word did you reply with at the start of this thread? Answer with only that word. ${NO_TOOLS}`);
    }
  }

  const mode = ASKS_FIRST[harness];
  for (const [scenario, allow] of [['approval', true], ['denial', false]] as const) {
    if (!mode) { say(scenario, 'failed', { said: `nobody has said which mode makes ${harnessWord(harness)} ask first (ASKS_FIRST in scripts/lib/harness-check.mts)` }); continue; }
    const name = `${scenario}-${harness}-${token}.txt`;
    sentAt = Date.now();
    await app.reply(id, `Run this exact shell command and nothing else, then reply with only the word done: echo ok > ${app.proofPath(name)}`, mode);
    let cards = 0;
    let ranUnasked = false;
    // Every card the run raises gets the same answer, until the run is over.
    const ended = await until(async () => {
      const card = await app.card(id);
      if (card) {
        if (!cards && app.wrote(name)) ranUnasked = true;
        cards += 1;
        await app.decide(card, allow);
        return null;
      }
      const row = await app.row(id);
      return row && (row.wrote?.result?.ts ?? 0) > sentAt && !(await app.running(id)) ? row : null;
    }, waits.card + waits.answer, waits.every);
    const wrote = app.wrote(name);
    if (!cards || ranUnasked) {
      say(scenario, 'failed', { said: wrote ? 'the command ran without asking' : `no card came and the command did not run: ${firstLine(ended?.result) || 'no answer'}` });
    } else if (!ended) {
      say(scenario, 'failed', { said: `the run did not end in ${seconds(waits.card + waits.answer)} seconds after its card was answered` });
    } else if (allow) {
      say(scenario, wrote ? 'passed' : 'failed', wrote ? {} : { said: `it was allowed, but the command did not run: "${firstLine(ended.result)}"` });
    } else {
      say(scenario, wrote ? 'failed' : 'passed', wrote ? { said: 'a command that was refused ran anyway' } : {});
    }
  }
  return verdicts;
}

/** 0 when every scenario of every harness passed, 1 when one failed, 2 when one could not be checked. */
export function exitCode(verdicts: readonly Verdict[]): 0 | 1 | 2 {
  if (verdicts.some((v) => v.outcome === 'failed')) return 1;
  if (!verdicts.length || verdicts.some((v) => v.outcome === 'unchecked')) return 2;
  return 0;
}

export function summaryLines(verdicts: readonly Verdict[], versions: Readonly<Record<string, string | null | undefined>> = {}): string[] {
  const lines: string[] = [];
  for (const harness of [...new Set(verdicts.map((v) => v.harness))]) {
    const mine = verdicts.filter((v) => v.harness === harness);
    const passed = mine.filter((v) => v.outcome === 'passed').length;
    const name = `${harnessWord(harness)}${versions[harness] ? ` ${versions[harness]}` : ''}`;
    // Nothing was tried, for one reason: say it once.
    if (mine.every((v) => v.outcome === 'unchecked' && v.said === mine[0].said)) {
      lines.push(`${name}: NOT CHECKED. ${mine[0].said ?? 'no reason given'}`);
      continue;
    }
    lines.push(`${name}: ${passed} of ${mine.length} passed`);
    // Scenarios that came to the same thing share a line.
    const groups = new Map<string, Verdict[]>();
    for (const v of mine) {
      if (v.outcome === 'passed') continue;
      const key = `${v.outcome}\n${v.said ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), v]);
    }
    for (const group of groups.values()) {
      const [v] = group;
      const which = group.length === 1
        ? `${v.scenario} (${SCENARIOS.find((s) => s.id === v.scenario)?.proves ?? ''})`
        : group.map((g) => g.scenario).join(', ');
      lines.push(`  ${v.outcome === 'failed' ? 'FAILED' : 'NOT CHECKED'} ${which}: ${v.said ?? 'no reason given'}`);
    }
  }
  return lines;
}

/**
 * What the copy of the app starts with. A run of this script is usually an
 * Agentbox worker itself, so everything naming its thread, its store, a login
 * folder or a key comes out, or the copy's agents would write to the real
 * thread and could spend a key.
 */
export function cleanEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (/^(ZERO_|STORE_|AGENTBOX_|ASTRAL_|ANTHROPIC_|CLAUDE_CODE_|OPENAI_|CODEX_)/.test(key)) continue;
    if (['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CONFIG_DIR', 'MCP_CONNECTION_NONBLOCKING'].includes(key)) continue;
    if (/(_KEY|_TOKEN|_SECRET)$/.test(key)) continue;
    out[key] = value;
  }
  return out;
}
