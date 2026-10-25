// A CLAUDE CODE TOO OLD FOR THE LINE AGENTBOX STARTS IT WITH SAYS "UPDATE IT".
//
// What broke, measured 2026-10-15 (w-6d8c543a43). The worker line Agentbox
// builds was run, flag for flag, against real Claude Code releases installed
// from npm into throwaway folders, signed out, on a stand-in model
// (scripts/lib/claude-stub-model.mjs). 2.1.71 and every later version tried
// (72, 73, 80, 86, 92, 107, 157, 207, 252, 287, 301) started, answered, and
// resumed. 2.1.70 and every earlier version tried (69, 68, 55, 8, 2.0.43,
// 1.0.90) died in under a second, before a single request, on the CLI's own
// argument check:
//
//   error: option '--permission-mode <mode>' argument 'auto' is invalid.
//   Allowed choices are acceptEdits, bypassPermissions, default, dontAsk, plan.
//
// With `auto` swapped out, the next flag to go was `--effort` (unknown on
// 2.1.8 and 2.0.43) and then `--include-partial-messages` (unknown on 1.0.90).
// So 2.1.71, released 2026-03-06, is the oldest Claude Code the line runs on.
//
// None of those words matched anything in shared/spawn-trouble.mjs, so the
// cause was 'unknown': the row read "stopped before it did anything ... it will
// keep failing the same way until this is fixed" without saying what "this"
// was, the Accounts page blamed the account's plan, and each of her replies
// spent one of its three tries on a run that could never start, ending in
// "stopped". A version is not a fault in her task or her account, and it has
// one fix she can type.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  troubleCause, needsHerHands, troubleSentence, troubleRemedy, accountSentence,
  deadRunSentence, deadRunCause, runStoppedLine, causeWord, causeWhat, causeNext, causeAct, causeBreakdown,
} from '../shared/spawn-trouble.mjs';
import { harnessDefinition } from '../shared/harness-definitions.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

// Byte for byte what each release printed on stderr, from the runs above.
const AUTO_REFUSED_2_1_70 = "error: option '--permission-mode <mode>' argument 'auto' is invalid. Allowed choices are acceptEdits, bypassPermissions, default, dontAsk, plan.";
const AUTO_REFUSED_2_1_8 = "error: option '--permission-mode <mode>' argument 'auto' is invalid. Allowed choices are acceptEdits, bypassPermissions, default, delegate, dontAsk, plan.";
const AUTO_REFUSED_1_0_90 = "error: option '--permission-mode <mode>' argument 'auto' is invalid. Allowed choices are acceptEdits, bypassPermissions, default, plan.";
const EFFORT_UNKNOWN_2_0_43 = "error: unknown option '--effort'";
const PARTIAL_UNKNOWN_1_0_90 = "error: unknown option '--include-partial-messages'";

describe('the words an old Claude Code prints', () => {
  it('reads every refusal of the line Agentbox builds as a Claude Code that is too old', () => {
    for (const line of [AUTO_REFUSED_2_1_70, AUTO_REFUSED_2_1_8, AUTO_REFUSED_1_0_90, EFFORT_UNKNOWN_2_0_43, PARTIAL_UNKNOWN_1_0_90]) {
      expect(troubleCause(line)).toBe('too-old');
    }
  });

  it('reads it among other stderr lines, the way the supervisor joins them', () => {
    expect(troubleCause(`some warning first\n${EFFORT_UNKNOWN_2_0_43}\n`)).toBe('too-old');
  });

  it('reads every flag the app itself puts on the line, not only the ones measured', () => {
    for (const flag of ['--fork-session', '--replay-user-messages', '--input-format', '--permission-prompt-tool', '--append-system-prompt', '--settings']) {
      expect(troubleCause(`error: unknown option '${flag}'`)).toBe('too-old');
    }
  });

  // THE CASES THAT MUST NOT MATCH. A flag Agentbox never sends is somebody's
  // own session arguments, and a typo there is not fixed by an update.
  it('does not blame the version for a flag the app never sends', () => {
    expect(troubleCause("error: unknown option '--alowedTools'")).toBe('unknown');
    expect(troubleCause("error: unknown option '--chrome-extension'")).toBe('unknown');
    // Nor for a mode value Agentbox does not send: that is her own setting.
    expect(troubleCause("error: option '--permission-mode <mode>' argument 'acceptedits' is invalid. Allowed choices are acceptEdits, plan.")).toBe('unknown');
  });

  it('does not take the same words from some other program, or from the middle of a sentence', () => {
    // git's own wording, which a worker's error result can quote.
    expect(troubleCause('error: unknown option `effort\'')).toBe('unknown');
    expect(troubleCause("The tests failed: npm printed error: unknown option '--effort' when I ran it")).toBe('unknown');
  });

  it('leaves the causes that already had names where they were', () => {
    expect(troubleCause('Not logged in · Please run /login')).toBe('signed-out');
    expect(troubleCause("You've hit your weekly limit · resets 6pm")).toBe('at-limit');
    expect(troubleCause('econnreset')).toBe('interrupted');
    expect(troubleCause('')).toBe('unknown');
  });
});

describe('the oldest version is written down where the app keeps what it knows about Claude Code', () => {
  it('is 2.1.71, the first release that takes --permission-mode auto', () => {
    expect(harnessDefinition('claude').minVersion).toBe('2.1.71');
  });
});

describe('what she is told', () => {
  const said = () => [
    troubleSentence('too-old'), troubleRemedy('too-old'), accountSentence('too-old', '/Users/you/.claude-work'),
    deadRunSentence({ engineWord: 'Claude Code', cause: 'too-old' }), runStoppedLine(AUTO_REFUSED_2_1_70),
    causeNext('too-old'), causeWhat('too-old', 2),
  ];

  it('says Claude Code is out of date, not that the task or the account is broken', () => {
    expect(troubleSentence('too-old')).toMatch(/Claude Code/);
    expect(troubleSentence('too-old')).toMatch(/too old|out of date|older/i);
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'too-old' })).not.toMatch(/stopped before it did anything/);
    expect(accountSentence('too-old', '/Users/you/.claude-work')).not.toMatch(/plan is active/);
    expect(runStoppedLine(AUTO_REFUSED_2_1_70)).not.toBe(runStoppedLine(''));
  });

  it('gives the one command that fixes it, and the version it needs', () => {
    for (const s of [troubleRemedy('too-old'), accountSentence('too-old', null), deadRunSentence({ engineWord: 'Claude Code', cause: 'too-old' }), causeNext('too-old')]) {
      expect(s).toMatch(/claude update/);
    }
    expect(troubleRemedy('too-old')).toMatch(/2\.1\.71/);
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'too-old' })).toMatch(/2\.1\.71/);
  });

  it('never sends her to /login, to an admin, or to an API key, none of which is the fix', () => {
    for (const s of said()) {
      expect(s).not.toMatch(/\/login|sign (that account|in|back)|admin|api key/i);
    }
  });

  it('never prints the CLI\'s own words', () => {
    for (const s of said()) expect(s).not.toMatch(/Allowed choices|unknown option|--permission-mode/);
  });

  it('opens under 112 characters on her row, and can be read back off it', () => {
    const row = deadRunSentence({ engineWord: 'Claude Code', cause: 'too-old', runs: 2 });
    expect(`${row.split('. ')[0]}.`.length).toBeLessThan(112);
    expect(deadRunCause(row)).toBe('too-old');
    expect(row).toMatch(/happened 2 times/);
  });

  it('is something only she can end, so trying again in half an hour is not the plan', () => {
    expect(needsHerHands('too-old')).toBe(true);
    expect(causeAct('too-old')).toBe(null);
    expect(causeWord('too-old')).not.toBe(causeWord('unknown'));
    const out = causeBreakdown([{ cause: 'too-old' }, { cause: 'at-limit' }, { cause: 'at-limit' }]);
    expect(out[0].cause).toBe('too-old');
    expect(out[0].hers).toBe(true);
  });
});

describe('the supervisor, when a worker dies on it', () => {
  function makeSupervisor() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-too-old-'));
    const store = {
      listItems: () => [], listProducts: () => [{ slug: 'agentbox', name: Name, dir: root }], isDue: () => true,
      written: [], recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); },
      settleAnswer() {},
    };
    const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3, home: root }, store, root);
    sup._saveState = () => {};
    return { sup, store };
  }
  const item = { id: 'w-old', product: 'agentbox', status: 'open', engine: 'claude', title: 'try it', answer: 'go on' };
  const died = (line) => ({ engine: 'claude', profile: 'default', startedAt: Date.now(), tail: [`stderr: ${line}`, 'session exited (1)'] });

  it('does not spend her reply on a run that could never start', () => {
    const { sup } = makeSupervisor();
    const session = died(AUTO_REFUSED_2_1_70);
    sup.noteExitForBackoff(session);
    expect(session.accountFault?.cause).toBe('too-old');
    let handedBack = 0;
    sup.redeliverAnswer = () => { handedBack += 1; };
    expect(sup.settleDelivery(item, 'go on', session, null)).toBe('interrupted');
    expect(handedBack).toBe(1);
  });

  // THE BOUNDARY ON THE OTHER SIDE: a run that died for a reason nobody can
  // name still spends a try, so an impossible task cannot respawn forever.
  it('still spends a try on a death it cannot name', () => {
    const { sup } = makeSupervisor();
    const session = died('Segmentation fault');
    sup.noteExitForBackoff(session);
    expect(session.accountFault).toBeUndefined();
    sup.redeliverAnswer = () => {};
    expect(sup.settleDelivery(item, 'go on', session, null)).toBe('retrying');
  });

  it('writes the update on her row', () => {
    const { sup, store } = makeSupervisor();
    sup.sayTheRunDied(item, died(EFFORT_UNKNOWN_2_0_43));
    expect(store.written[0].result).toMatch(/claude update/);
    expect(store.written[0].result).not.toMatch(/unknown option/);
  });
});
