// Codex kept breaking whenever nobody used it for a couple of weeks. Of about
// 55 Codex breakages in the commit history, most were a sign-in or plan that
// lapsed, or a change to shared code tried on Claude Code only, and nothing ran
// the real Codex unless a person did it by hand: its 124 test files all drive
// stand-ins. Measured 2026-11-22, the OpenCode connection had gone the same way
// in six weeks: 37 green tests, and its first call to the real OpenCode 2.3.2
// answered 405.
//
// `npm run check:harnesses` runs one list against the real tool of every
// harness on offer, through a copy of the app. These tests hold the list and
// its verdicts; the real run is the command itself.
import { describe, it, expect } from 'vitest';
import { ENGINES } from '../shared/engines.mts';
import { deadRunSentence } from '../shared/spawn-trouble.mts';
import {
  SCENARIOS, ASKS_FIRST, harnessesToCheck, checkHarness, standingVerdict, verdictsWithoutARun, exitCode, summaryLines, cleanEnv, whyNot,
} from '../scripts/lib/harness-check.mts';
import type { App, Row, Verdict } from '../scripts/lib/harness-check.mts';

const FAST = { answer: 200, start: 100, settle: 0, stop: 100, card: 100, every: 1 };

interface Shape {
  answers?: boolean;
  forgets?: boolean;
  forgetsAfterRestart?: boolean;
  ignoresStop?: boolean;
  neverAsks?: boolean;
  runsWhenRefused?: boolean;
  says?: string;
  runsOn?: string;
}

/** An app whose one harness behaves the way `shape` says. */
function fakeApp(shape: Shape = {}) {
  const rows = new Map<string, Row>();
  const running = new Set<string>();
  const cards = new Map<string, { id: string; file: string }>();
  const files = new Set<string>();
  const sent: { words: string; mode: string | null }[] = [];
  let word = '';
  let restarted = false;
  let n = 0;
  const answer = (id: string, text: string) => { rows.set(id, { id, result: text, wrote: { result: { ts: Date.now() + 1 } } }); running.delete(id); };
  const take = (id: string, words: string, mode: string | null) => {
    sent.push({ words, mode });
    if (shape.says) return answer(id, shape.says);
    if (shape.answers === false) return;
    const said = words.match(/exactly the word (\S+) and/);
    if (said) { word = said[1]; return answer(id, word); }
    if (/sleep \d+/.test(words)) { running.add(id); return; }
    const file = words.match(/echo ok > (\S+)/)?.[1];
    if (file) {
      if (shape.neverAsks) { files.add(file); return answer(id, 'done'); }
      running.add(id);
      cards.set(id, { id: `card-${n += 1}`, file });
      return;
    }
    const forgot = shape.forgets || (shape.forgetsAfterRestart && restarted);
    answer(id, forgot ? 'I do not know which word you mean.' : word);
  };
  const app: App = {
    async start(_harness, words) { const id = `w-${n += 1}`; rows.set(id, { id }); take(id, words, null); return id; },
    async reply(id, words, mode = null) { take(id, words, mode); },
    async stop(id) { if (!shape.ignoresStop) running.delete(id); },
    async decide(cardId, allow) {
      for (const [id, card] of cards) {
        if (card.id !== cardId) continue;
        cards.delete(id);
        if (allow || shape.runsWhenRefused) files.add(card.file);
        answer(id, allow ? 'done' : 'It was refused.');
      }
    },
    async row(id) { return rows.get(id) ?? null; },
    async running(id) { return running.has(id); },
    async card(id) { return cards.get(id)?.id ?? null; },
    ...(shape.runsOn ? { harnessOf: async () => shape.runsOn! } : {}),
    async restart() { restarted = true; },
    wrote: (name) => files.has(`/proof/${name}`),
    proofPath: (name) => `/proof/${name}`,
  };
  return { app, sent };
}

const outcomes = (verdicts: Verdict[]) => Object.fromEntries(verdicts.map((v) => [v.scenario, v.outcome]));
const check = (shape: Shape, harness = 'claude') => checkHarness(fakeApp(shape).app, harness, { waits: FAST, token: 'tok' });

describe('which harnesses are checked', () => {
  it('is every harness on offer, so a newly offered one cannot be left out', () => {
    expect(harnessesToCheck()).toEqual(ENGINES.map((e) => e.id));
  });

  it('takes one by name, and refuses a name that is not on offer', () => {
    expect(harnessesToCheck(['codex'])).toEqual(['codex']);
    expect(() => harnessesToCheck(['opencode'])).toThrow(/not on offer/);
  });

  it('knows which mode makes every harness on offer ask first', () => {
    for (const { id } of ENGINES) expect(ASKS_FIRST[id], id).toBeTruthy();
  });
});

describe('one harness, the whole list', () => {
  it('passes every scenario when the harness does all of it', async () => {
    const verdicts = await check({});
    expect(verdicts.map((v) => v.scenario)).toEqual(SCENARIOS.map((s) => s.id));
    expect(verdicts.every((v) => v.outcome === 'passed')).toBe(true);
    expect(exitCode(verdicts)).toBe(0);
  });

  it('fails the first scenario when no answer comes, and does not pretend to have tried the rest', async () => {
    const verdicts = await check({ answers: false });
    expect(verdicts[0]).toMatchObject({ scenario: 'answers', outcome: 'failed' });
    expect(verdicts.slice(1).every((v) => v.outcome === 'unchecked')).toBe(true);
    expect(exitCode(verdicts)).toBe(1);
  });

  it('fails a thread the app ran on another harness, however well that one answered', async () => {
    const verdicts = await check({ runsOn: 'claude' }, 'codex');
    expect(verdicts[0]).toMatchObject({ scenario: 'answers', outcome: 'failed' });
    expect(verdicts[0].said).toMatch(/Claude Code instead/);
    expect(verdicts.slice(1).every((v) => v.outcome === 'unchecked')).toBe(true);
  });

  it('fails a harness that answers but forgot the conversation', async () => {
    expect(outcomes(await check({ forgets: true }))).toMatchObject({ answers: 'passed', remembers: 'failed' });
  });

  it('fails only the restart when the conversation is lost across one', async () => {
    expect(outcomes(await check({ forgetsAfterRestart: true }))).toMatchObject({ answers: 'passed', remembers: 'passed', restart: 'failed' });
  });

  it('fails a run that keeps going after it was told to stop', async () => {
    const stops = (await check({ ignoresStop: true })).find((v) => v.scenario === 'stops');
    expect(stops).toMatchObject({ outcome: 'failed' });
    expect(stops?.said).toMatch(/still running/);
  });

  it('fails a harness that ran the command without asking', async () => {
    const verdicts = await check({ neverAsks: true });
    expect(outcomes(verdicts)).toMatchObject({ approval: 'failed', denial: 'failed' });
    expect(verdicts.find((v) => v.scenario === 'denial')?.said).toMatch(/without asking/);
  });

  it('fails a refusal that did not hold, while the approval still passes', async () => {
    const verdicts = await check({ runsWhenRefused: true });
    expect(outcomes(verdicts)).toMatchObject({ approval: 'passed', denial: 'failed' });
    expect(verdicts.find((v) => v.scenario === 'denial')?.said).toMatch(/refused.*ran/);
  });

  it('sends the two command scenarios in the mode that makes this harness ask', async () => {
    const { app, sent } = fakeApp({});
    await checkHarness(app, 'codex', { waits: FAST, token: 'tok' });
    const commands = sent.filter((s) => /echo ok >/.test(s.words));
    expect(commands.map((s) => s.mode)).toEqual([ASKS_FIRST.codex, ASKS_FIRST.codex]);
    expect(sent.filter((s) => !/echo ok >/.test(s.words)).every((s) => s.mode === null)).toBe(true);
  });

  it('fails the command scenarios of a harness nobody gave an ask-first mode', async () => {
    const verdicts = await check({}, 'newcomer');
    expect(outcomes(verdicts)).toMatchObject({ answers: 'passed', approval: 'failed', denial: 'failed' });
    expect(verdicts.find((v) => v.scenario === 'approval')?.said).toMatch(/ASKS_FIRST/);
  });
});

describe('what is known about a harness before a thread is started', () => {
  const ready = { found: true, signedIn: true, offered: true };

  it('is nothing when it is installed, signed in, offered and has usage left', () => {
    expect(standingVerdict('codex', ready)).toBeNull();
    expect(standingVerdict('codex', { ...ready, spentUntil: null })).toBeNull();
  });

  it('runs the list when the status command never answered, since the first thread will say', () => {
    expect(standingVerdict('codex', { ...ready, signedIn: null })).toBeNull();
  });

  it('is a failure when nobody is signed in, the commonest way a harness stops working', () => {
    expect(standingVerdict('claude', { ...ready, signedIn: false })).toMatchObject({ outcome: 'failed', cause: 'signed-out', said: expect.stringMatching(/nobody is signed in to Claude Code/) });
  });

  it('is could-not-check when it is not installed or the app does not offer it', () => {
    expect(standingVerdict('codex', { ...ready, found: false })).toMatchObject({ outcome: 'unchecked', said: 'Codex is not installed on this machine' });
    expect(standingVerdict('codex', { ...ready, offered: false })).toMatchObject({ outcome: 'unchecked' });
  });

  // The app read Codex's week as 100% used and a thread still ran, on paid credits (measured 2026-11-22).
  it('is could-not-check when the plan is used up, so a check spends no paid credits', () => {
    const known = standingVerdict('codex', { ...ready, spentUntil: Date.UTC(2026, 10, 23, 2, 10) });
    expect(known).toMatchObject({ outcome: 'unchecked', cause: 'at-limit' });
    expect(known?.said).toMatch(/Codex's plan is used up until 2026-11-23 02:10 UTC.*paid credits/);
  });

  it('puts a failure on the first scenario and marks the rest not tried', () => {
    const verdicts = verdictsWithoutARun('claude', standingVerdict('claude', { ...ready, signedIn: false })!);
    expect(verdicts.map((v) => v.outcome)).toEqual(['failed', ...SCENARIOS.slice(1).map(() => 'unchecked')]);
    expect(exitCode(verdicts)).toBe(1);
  });

  it('marks every scenario could-not-check when nothing could be tried', () => {
    const verdicts = verdictsWithoutARun('codex', standingVerdict('codex', { ...ready, found: false })!);
    expect(verdicts.every((v) => v.outcome === 'unchecked')).toBe(true);
    expect(exitCode(verdicts)).toBe(2);
  });
});

describe('why a thread got no answer', () => {
  // The app's own sentence for a run that never began, so the check reads what a thread really says.
  const dead = (cause: string) => deadRunSentence({ engineWord: 'Codex', cause });

  it('reads a spent plan as could-not-check, never as broken and never as passed', async () => {
    const verdicts = await check({ says: dead('at-limit') });
    expect(verdicts[0]).toMatchObject({ scenario: 'answers', outcome: 'unchecked', cause: 'at-limit' });
    expect(exitCode(verdicts)).toBe(2);
  });

  it('reads a signed-out login, an ended plan and an old version as failures that name the cause', () => {
    for (const cause of ['signed-out', 'subscription-ended', 'too-old', 'model-not-on-plan']) {
      expect(whyNot({ id: 'w-1', result: dead(cause) }, 5000), cause).toMatchObject({ outcome: 'failed', cause });
    }
  });

  it('says how long it waited when the thread says nothing at all', () => {
    expect(whyNot({ id: 'w-1' }, 300_000)).toMatchObject({ outcome: 'failed', cause: null, said: 'no answer in 300 seconds' });
  });
});

describe('the verdict on a whole run', () => {
  const passed = (harness: string): Verdict[] => SCENARIOS.map((s) => ({ harness, scenario: s.id, outcome: 'passed' }));

  it('is green only when every scenario of every harness passed', () => {
    expect(exitCode([...passed('claude'), ...passed('codex')])).toBe(0);
  });

  it('is red when one scenario failed, whatever else passed', () => {
    const verdicts = [...passed('claude'), ...passed('codex')];
    verdicts[9] = { ...verdicts[9], outcome: 'failed', said: 'still running 60 seconds after it was told to stop' };
    expect(exitCode(verdicts)).toBe(1);
  });

  it('is not green when a harness could not be checked or nothing was checked', () => {
    expect(exitCode([...passed('claude'), { harness: 'codex', scenario: 'answers', outcome: 'unchecked', said: 'Codex is not installed on this machine' }])).toBe(2);
    expect(exitCode([])).toBe(2);
  });

  it('names the harness, its version and the scenario that failed', () => {
    const verdicts = [...passed('claude'), ...passed('codex')];
    verdicts[11] = { harness: 'codex', scenario: 'denial', outcome: 'failed', said: 'a command that was refused ran anyway' };
    const text = summaryLines(verdicts, { claude: '2.1.330', codex: '0.171.0' }).join('\n');
    expect(text).toMatch(/Claude Code 2\.1\.330: 6 of 6 passed/);
    expect(text).toMatch(/Codex 0\.171\.0: 5 of 6 passed/);
    expect(text).toMatch(/FAILED denial.*refused ran anyway/);
  });
});

describe('the summary of a harness that failed before anything could be tried', () => {
  it('names the failure, then the scenarios it kept from being tried on one line', () => {
    const known = standingVerdict('claude', { found: true, signedIn: false, offered: true })!;
    expect(summaryLines(verdictsWithoutARun('claude', known), { claude: '2.1.330' })).toEqual([
      'Claude Code 2.1.330: 0 of 6 passed',
      `  FAILED answers (a new thread gets its answer): ${known.said}`,
      `  NOT CHECKED remembers, restart, stops, approval, denial: not tried: ${known.said}`,
    ]);
  });
});

describe('the summary of a harness nothing was tried on', () => {
  it('says why once, not once per scenario', () => {
    const known = standingVerdict('codex', { found: false, signedIn: null, offered: false })!;
    expect(summaryLines(verdictsWithoutARun('codex', known), { codex: '0.171.0' })).toEqual(['Codex 0.171.0: NOT CHECKED. Codex is not installed on this machine']);
  });
});

describe('the copy of the app the check drives', () => {
  it('starts with nothing that names this thread, another store or a key', () => {
    const env = cleanEnv({
      PATH: '/usr/bin', HOME: '/home/me', ZERO_ITEM: 'w-1', STORE_ACCOUNT_ID: 'a', AGENTBOX_HOME: '/x', ANTHROPIC_API_KEY: 'k',
      OPENAI_API_KEY: 'k', CLAUDE_CODE_OAUTH_TOKEN: 't', CLAUDECODE: '1', CLAUDE_CONFIG_DIR: '/y', CODEX_HOME: '/z', GEMINI_API_KEY: 'k', GH_TOKEN: 't',
    });
    expect(Object.keys(env).sort()).toEqual(['HOME', 'PATH']);
  });
});
