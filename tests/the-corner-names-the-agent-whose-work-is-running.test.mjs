// THE CORNER MUST SAY WHOSE LIMIT IT IS.
//
// The corner meter and its dropdown were built against `claude -p /usage` and
// nothing else (shared/claude-usage.mjs). They are drawn on every screen,
// unlabelled, and they describe a Claude Code subscription whether or not the
// work in front of her is billing one. That is the same defect he caught on the
// Settings Model row: a control that looks as though it belongs to the coding
// agent named elsewhere on the screen, and does not.
//
// THE RULE, AND IT IS THE ONE ALREADY ON EVERY ROW. renderer/src/byline.ts
// settled this question for the byline a slice ago -- "WHAT IS RUNNING BEATS
// WHAT WOULD RUN" -- and the corner is the same question asked about the whole
// app instead of about one row. So: the corner is about the coding agent MOST
// OF HER LIVE WORK IS ON, and about the workspace's own agent when nothing is
// running or the fleet is level. Two rules for one question is how "Medium" and
// "medium" ended up on adjacent screens; this is one rule, in one function,
// read by the corner and by the byline alike.
//
// WHY NOT THE WORKSPACE AGENT, ALWAYS. It is stabler and it is wrong in exactly
// the case that was reported: four Codex workers running under a workspace that
// defaults to Claude Code would draw Claude Code's meter, at 12%, while the
// thing about to stop her fleet sits at 96% on the other subscription. A meter
// that is stable and describes the wrong account is the defect, not the fix.
//
// WHY NOT BOTH, AS TWO METERS. One corner, one dropdown: a second meter is
// density on a glance surface, and "A DENSE SCREEN IS A FAILED SCREEN".
//
// AND THE TIE IS WHY THIS COUNTS RATHER THAN ASKING "IS ANY CODEX RUNNING". A
// rule that flips the moment one Codex worker starts would change the subject
// of the corner four times a minute on a mixed fleet, and she would be reading a
// history of two different subscriptions in one bar. Counting makes it change
// only when the balance of the fleet really moves, and the level case falls back
// to the one answer that is always available.
//
// THE NAME IS ONLY EVER DRAWN WHERE THERE ARE TWO AGENTS TO TELL APART, which
// is `engineWordFor`'s standing rule in renderer/src/byline.ts and
// EnginePicker's. The Mac almost every copy of Agentbox runs on has one coding
// agent, and nothing there may move -- that is
// tests/the-corner-on-a-mac-with-one-coding-agent-is-exactly-where-it-was.test.mjs.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usageEngine, usageSentence } from '../shared/usage.mjs';
import { readUsage } from '../shared/claude-usage.mjs';
import { UsagePill } from '../renderer/src/components/UsagePill.tsx';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');

const on = (engine, n) => Array.from({ length: n }, (_, i) => ({ itemId: `w-${engine}-${i}`, engine }));

describe('which coding agent the corner is about', () => {
  // NOTHING RUNNING IS THE COMMONEST STATE THERE IS, and the honest answer then
  // is the agent the next task will spend, which main already resolves as the
  // workspace's own (`Supervisor#engineFacts`).
  it('is the workspace agent when nothing is running', () => {
    expect(usageEngine({ workspace: 'claude', running: [] })).toBe('claude');
    expect(usageEngine({ workspace: 'codex', running: [] })).toBe('codex');
  });

  // THE CASE HE REPORTED. Her work is on Codex; the corner may not go on
  // describing the Claude Code subscription it is not spending.
  it('is the agent her running work is really on, over the workspace default', () => {
    expect(usageEngine({ workspace: 'claude', running: on('codex', 3) })).toBe('codex');
    expect(usageEngine({ workspace: 'codex', running: on('claude', 2) })).toBe('claude');
  });

  // THE BOUNDARY EITHER SIDE OF THE COUNT. Three to two is a fleet that is
  // mostly Codex and reads as Codex; two to two is level and has no answer of
  // its own, so the workspace's stands.
  it('follows the balance of a mixed fleet, and falls back when it is level', () => {
    expect(usageEngine({ workspace: 'claude', running: [...on('codex', 3), ...on('claude', 2)] })).toBe('codex');
    expect(usageEngine({ workspace: 'claude', running: [...on('codex', 2), ...on('claude', 3)] })).toBe('claude');
    expect(usageEngine({ workspace: 'claude', running: [...on('codex', 2), ...on('claude', 2)] })).toBe('claude');
    expect(usageEngine({ workspace: 'codex', running: [...on('codex', 2), ...on('claude', 2)] })).toBe('codex');
  });

  // ONE MORE ON EITHER SIDE OF THE TIE, so "level falls back" is a rule about
  // the count rather than a function that always answers the workspace.
  it('moves the moment one worker tips the balance', () => {
    expect(usageEngine({ workspace: 'claude', running: [...on('codex', 3), ...on('claude', 2)] })).toBe('codex');
    expect(usageEngine({ workspace: 'claude', running: [...on('codex', 3), ...on('claude', 4)] })).toBe('claude');
  });

  // A session record written before the second engine existed carries no engine
  // at all, and `Supervisor#status` already resolves every one of those to
  // Claude Code through `engineOf`. Nothing here may turn such a record into a
  // vote for a third thing.
  it('ignores a session that names no agent rather than counting it as one', () => {
    expect(usageEngine({ workspace: 'claude', running: [{ itemId: 'w-1' }, { itemId: 'w-2' }] })).toBe('claude');
    expect(usageEngine({ workspace: 'codex', running: [{ itemId: 'w-1' }] })).toBe('codex');
  });
});

describe('the word the panel puts over the reading', () => {
  const NOW = Date.parse('2026-09-01T13:46:00-07:00');
  const limits = readUsage('Current session: 45% used · resets Sep 1 at 4pm (America/Los_Angeles)', NOW, 'America/Los_Angeles');

  // The corner is a bar with no words in it, so the sentence IS the corner for
  // anybody who cannot see it. Naming the subscription in the panel and leaving
  // it out of the sentence would label the reading for one reader and not the
  // other.
  it('names the agent in the sentence read aloud, when there is one to name', () => {
    expect(usageSentence(limits, NOW, 'Codex')).toBe('Codex. This session: 45% used, 2h 14m left.');
  });

  // AND THE CASE THAT MUST NOT MATCH: one coding agent, no word, byte for byte
  // the sentence she has been reading since 2026-09-01.
  it('says exactly what it always said when there is no agent to name', () => {
    expect(usageSentence(limits, NOW, null)).toBe('This session: 45% used, 2h 14m left.');
    expect(usageSentence(limits, NOW)).toBe('This session: 45% used, 2h 14m left.');
  });

  it('still says nothing when there is nothing to say, named or not', () => {
    expect(usageSentence([], NOW, 'Codex')).toBe(null);
    expect(usageSentence(null, NOW, 'Codex')).toBe(null);
  });

  // THE LABEL THE CORNER READS ALOUD, rendered rather than read off the source,
  // because the closed corner is the one part of this the suite can draw.
  it('puts the agent on the label the corner reads aloud', () => {
    const usage = { engine: 'codex', limits, at: NOW };
    expect(renderToStaticMarkup(createElement(UsagePill, { usage, now: NOW, engineWord: 'Codex' })))
      .toContain('aria-label="Codex. This session: 45% used, 2h 14m left."');
    expect(renderToStaticMarkup(createElement(UsagePill, { usage, now: NOW })))
      .toContain('aria-label="This session: 45% used, 2h 14m left."');
  });

  // The dropdown itself. It is `Your limits` on the Mac with one agent and the
  // agent's own name where there are two, so the heading is never a second line
  // added to the panel -- it is the one word it already had, made true. Asserted
  // against the source for the reason tests/the-usage-panel-is-not-settings.test.mjs
  // gives: the suite has no DOM, so a panel that only opens on a pointer cannot
  // be drawn here.
  it('heads the dropdown with the agent when there is a choice, and not otherwise', () => {
    const pill = read('renderer/src/components/UsagePill.tsx');
    expect(pill).toContain("<h3>{engineWord ?? 'Your limits'}</h3>");
    expect(pill).toContain("aria-label={engineWord ?? 'Your limits'}");
  });
});

describe('the corner is handed the answer rather than working it out', () => {
  // The same reason the byline is: whether a choice is real needs the capability
  // gate and the staleness rule, both pinned to main/supervisor.mjs. A corner
  // that derived its own answer could draw "Codex" over a Claude Code reading.
  it('reads the agent off the reading main sent, through the byline\'s own word', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('engineWord={engineWordFor({');
    expect(app).toContain('engine: snap.usage?.engine ?? null,');
    expect(app).toContain('engineChoice: (snap.engines?.choices?.length ?? 1) > 1,');
  });

  // AND THE CORNER STILL DOES NOT SEND HER TO SETTINGS.
  it('is still handed no destination', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).not.toContain('onOpen={() => setSettingsOpen(true)}');
    expect(read('renderer/src/components/UsagePill.tsx')).not.toContain('setSettingsOpen');
  });

  // ONE RULE, ONE COPY. The corner and the byline both name an engine, and two
  // spellings of "which agent is this" is the defect the tester reported in the
  // first place.
  it('has exactly one function that answers which agent the corner is about', () => {
    const ipc = read('main/ipc.mjs');
    expect(ipc).toMatch(/usageEngine\(/);
    expect(read('shared/usage.mjs').match(/export function usageEngine/g)).toHaveLength(1);
  });
});
