// THE CORNER ON A MAC WITH ONE CODING AGENT IS EXACTLY WHERE IT WAS.
//
// The standing constraint on every slice of the second engine
// (tests/a-mac-with-one-coding-agent-is-exactly-where-it-was.test.mjs holds the
// DECISIONS half of it; tests/one-coding-agent-draws-nothing-new.test.mjs holds
// the composer, Settings and byline half). This file holds the CORNER, because
// the engine slice reached inside it: the reading grew an engine on it, the
// panel grew a heading that can be an engine's name, and the names on the rows
// stopped being derived from Claude Code's own three spans.
//
// The gate is shut by default, so the Mac almost every copy of Agentbox runs on
// has one coding agent and NOTHING about its corner may move. Not "nearly", and
// not "one quiet extra word": this is the surface she photographed and could
// not read, and it is on every screen.
//
// IT IS HELD AS A LITERAL, captured off the build immediately before this slice
// by rendering the component and printing the markup. A test that re-derived the
// expected string from the new code would be re-stating the new code; this one
// is a comparison against what was really on her screen.
//
// The fixture is her own reading, verbatim off her Mac 2026-09-01 13:46
// America/Los_Angeles, which is the one tests/the-corner-fills-as-she-spends.test.mjs
// is built on. Its third limit is worth keeping in view here: "Current week
// (Fable): 0% used" with no reset at all. That is a REAL zero, and it draws a
// row with an empty bar -- which is the fact that has to stay tellable apart
// from a limit nobody has read, the case
// tests/a-codex-limit-nobody-has-read-is-not-zero.test.mjs is about.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { limitRows, sessionLimit, usageEngine, usageSentence } from '../shared/usage.mjs';
import { readUsage } from '../shared/claude-usage.mjs';
import { UsagePill } from '../renderer/src/components/UsagePill.tsx';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const HERS = `You are currently using your subscription to power your Claude Code usage

Current session: 45% used · resets Sep 1 at 4pm (America/Los_Angeles)
Current week (all models): 7% used · resets Sep 3 at 4pm (America/Los_Angeles)
Current week (Fable): 0% used`;

const ZONE = 'America/Los_Angeles';
const NOW = Date.parse('2026-09-01T13:46:00-07:00');
const limits = () => readUsage(HERS, NOW, ZONE);

/* ------------------------- the corner as it was -------------------------- */
// Printed off the 2026-09-05 build BEFORE this slice, by rendering the
// component. Not paraphrased and not regenerated.

const WAS = '<div class="usage-box"><button type="button" class="usage-pill " aria-expanded="false"'
  + ' aria-label="This session: 45% used, 2h 14m left. This week: 7% used, 2d 2h left.'
  + ' This week, Fable: 0% used."><span class="usage-meter" aria-hidden="true">'
  + '<i style="width:45%"></i></span></button></div>';

const WAS_SENTENCE = 'This session: 45% used, 2h 14m left. This week: 7% used, 2d 2h left.'
  + ' This week, Fable: 0% used.';

const WAS_ROWS = [
  { key: 'session:', name: 'This session', used: 45, when: 'Resets 4pm' },
  { key: 'week:all models', name: 'This week', used: 7, when: 'Resets Sep 3 at 4pm' },
  { key: 'week:Fable', name: 'This week, Fable', used: 0, when: null },
];

const draw = (props) => renderToStaticMarkup(createElement(UsagePill, {
  usage: { engine: 'claude', limits: limits(), at: NOW - 4 * 60_000 }, now: NOW, ...props,
}));

describe('the corner she is looking at right now', () => {
  it('draws the same bytes it drew before the second engine reached it', () => {
    expect(draw()).toBe(WAS);
  });

  // The engine rides on the reading now, and a Mac with one coding agent gets
  // no word for it. Handed the word explicitly the corner does change -- that is
  // the point of the slice -- so this is the guard that main never hands one
  // over where there is no choice, asserted from the component's side.
  it('draws the same bytes when the engine is named and nothing else changes', () => {
    expect(draw({ engineWord: null })).toBe(WAS);
    expect(draw({ engineWord: undefined })).toBe(WAS);
  });

  // AND THE BOUNDARY THE OTHER SIDE, so "unchanged" is a rule about the word
  // being absent and not a component that ignores it.
  it('really does change once there are two agents to tell apart', () => {
    expect(draw({ engineWord: 'Claude Code' })).not.toBe(WAS);
    expect(draw({ engineWord: 'Claude Code' })).toContain('aria-label="Claude Code. This session');
  });

  // NOTHING AT ALL UNTIL A READING LANDS, which is the oldest rule on this
  // surface: a launch is exactly when nobody has a figure yet.
  it('still draws nothing at all before a reading has landed', () => {
    expect(renderToStaticMarkup(createElement(UsagePill, { usage: null, now: NOW }))).toBe('');
  });
});

describe('the words inside the panel she opens', () => {
  it('names the three limits exactly as it did, Fable included', () => {
    expect(limitRows(limits(), NOW)).toEqual(WAS_ROWS);
  });

  it('reads the same sentence aloud as it did', () => {
    expect(usageSentence(limits(), NOW)).toBe(WAS_SENTENCE);
  });

  it('picks the same five hour limit for the bar as it did', () => {
    expect(sessionLimit(limits()).percent).toBe(45);
  });
});

describe('the reading main sends is still Claude Code\'s', () => {
  // The corner rule is new; on this Mac it has one answer and it is the answer
  // that was always there. Every shape of fleet such a Mac can have.
  it('resolves to Claude Code whatever is running on a one-agent Mac', () => {
    const fleets = [
      [],
      [{ itemId: 'w-1', engine: 'claude' }],
      [{ itemId: 'w-1', engine: 'claude' }, { itemId: 'w-2', engine: 'claude' }],
      // A session record written before the second engine existed.
      [{ itemId: 'w-1' }],
      [{ itemId: 'w-1', engine: 'claude' }, { itemId: 'w-2' }],
    ];
    for (const running of fleets) expect(usageEngine({ workspace: 'claude', running })).toBe('claude');
  });

  // AND THE SPAWN IS STILL PAID FOR ON THAT MAC. The gate on `claude -p /usage`
  // is the corner's own answer, so a Mac that resolves to Claude Code refreshes
  // exactly as it always did -- and a Codex-only workflow stops paying for a
  // reading nothing will draw.
  it('asks for the Claude reading only where the corner is about Claude Code', () => {
    const ipc = readFileSync(join(root, 'main/ipc.mjs'), 'utf8');
    expect(ipc).toContain("usageFor === DEFAULT_ENGINE ? usage.read() : supervisor.codexUsage()");
  });
});
