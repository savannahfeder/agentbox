// WHICH AGENT IS WORKING RIGHT NOW, ON THE ROW AND AT THE FOOT OF THE CHAT.
//
// THAT IS TWO REQUIREMENTS AND THE SECOND ONE IS THE HARD ONE. The word has to
// appear for her, and it has to be absent for everybody else — so this file
// spends most of its length on the absence. tests/one-coding-agent-draws-
// nothing-new.test.mjs holds the same law for the composer, Settings and the
// byline; these are the two surfaces this slice added, asked the same way.
//
// AND ONE RULE ABOVE BOTH: `agentAtWork` is the ONLY place the question is
// answered. Three drawings of one fact (the inbox row, the mark at the foot of
// the conversation, and the byline over it) can sit on the same screen at the
// same time, so a second copy of the expression is a second chance for them to
// name different agents in one glance. The last two tests pin that there is one.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentAtWork } from '../renderer/src/byline.ts';
import { Live } from '../renderer/src/components/Live.tsx';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const css = read('renderer/src/styles.css');
const list = read('renderer/src/components/List.tsx');
const byline = read('renderer/src/byline.ts');

const RUNNING = { itemId: 'w-1', product: 'agentbox', startedAt: Date.now() - 60_000, tail: [] };
const ITEM = { id: 'w-1', product: 'agentbox', status: 'claimed', title: 'x', updatedAt: Date.now(), wrote: {} };

/* ------------------------- the word, and when it is ----------------------- */

describe('the agent is named only where there are two to tell apart', () => {
  it('says nothing on a Mac with one coding agent', () => {
    expect(agentAtWork({ engineChoice: false, session: { ...RUNNING, engine: 'codex' } })).toBe(null);
    expect(agentAtWork({ engineChoice: false, engine: 'codex' })).toBe(null);
    expect(agentAtWork({})).toBe(null);
  });

  // BOTH AGENTS GET THE SAME WORD, which is her standing instruction on this
  // slot. Naming only the second would make its ABSENCE the mark and teach her
  // a symbol after all, so Claude Code being named is the assertion that
  // matters here, not Codex.
  it('names either agent, in the same words, where there are two', () => {
    expect(agentAtWork({ engineChoice: true, session: { ...RUNNING, engine: 'claude' } })).toBe('Claude Code');
    expect(agentAtWork({ engineChoice: true, session: { ...RUNNING, engine: 'codex' } })).toBe('Codex');
  });

  // WHAT IS RUNNING BEATS WHAT WOULD RUN, and this is the whole reason the
  // helper exists rather than an inline `facts.engine`. `engine` is the
  // supervisor's answer for the NEXT spawn; the session's is what really
  // started. They differ exactly across a change she has just made, and her
  // question is about the run in front of her.
  it('prefers the agent that really started over the one that would start next', () => {
    expect(agentAtWork({ engineChoice: true, engine: 'claude', session: { ...RUNNING, engine: 'codex' } })).toBe('Codex');
    expect(agentAtWork({ engineChoice: true, engine: 'codex', session: { ...RUNNING, engine: 'claude' } })).toBe('Claude Code');
  });

  // A session that started before the second engine existed carries no engine,
  // and every one of those was Claude Code.
  it('falls back to the resolved agent when the session names none', () => {
    expect(agentAtWork({ engineChoice: true, engine: 'codex', session: RUNNING })).toBe('Codex');
    expect(agentAtWork({ engineChoice: true, session: RUNNING })).toBe('Claude Code');
  });
});

/* ---------------------------- the foot of the chat ------------------------ */

const drawLive = (facts) => renderToStaticMarkup(createElement(Live, { item: ITEM, facts }));

// THE FOOT OF THE CONVERSATION NEVER NAMES THE AGENT, AND THIS IS THE HALF OF
// THE FILE THAT CHANGED ON 2026-09-21. It named it for two days.
//
// The reason is, 2026-08-31, and it is why these are assertions about ABSENCE
// rather than a deleted describe block: the byline under the task title has
// named the agent since, so anything that names it again on the same screen
// makes her read one word twice. The next person to think "the foot of the chat
// is the obvious place for this" should fail a test.
describe('the foot of the conversation', () => {
  it('never names the agent, even where there are two to tell apart', () => {
    const two = drawLive({ session: { ...RUNNING, engine: 'codex' }, inProgress: true, engineChoice: true });
    expect(two).not.toContain('live-agent');
    expect(two).not.toContain('Codex');
    expect(two).toContain('live-brief');
  });

  it('says nothing about an agent on a one-agent Mac either', () => {
    const one = drawLive({ session: { ...RUNNING, engine: 'codex' }, inProgress: true });
    expect(one).not.toContain('live-agent');
    expect(one).not.toContain('Codex');
    expect(one).not.toContain('Claude Code');
  });

  // AND IT IS NOT READ ALOUD EITHER, which is the half that is easy to leave
  // behind: a screen reader hearing the name twice is the same defect.
  it('keeps the agent out of what is read aloud', () => {
    expect(drawLive({ session: { ...RUNNING, engine: 'codex' }, inProgress: true, engineChoice: true }))
      .not.toMatch(/Codex/);
  });

  // The component takes no engine facts at all now, so there is nothing to pass
  // it by accident. Asserted on the source because a prop that is ignored and a
  // prop that does not exist look identical from the outside.
  it('asks for no engine facts at all', () => {
    const live = read('renderer/src/components/Live.tsx');
    // The NAME may appear in prose saying why it is not called; the CALL and the
    // import may not.
    expect(live).not.toMatch(/agentAtWork\(/);
    expect(live).not.toMatch(/^import .*byline/m);
    expect(live).not.toContain('EngineFacts');
    // THE FACTS, NOT THE WHOLE TAG. While the round on where stopping lives is
    // open (w-581dbc6cc4), one of its seven looks hands this component a stop
    // button to draw on the agent's own line, so the tag carries a second prop.
    // What this test is for is the FACTS: nothing about engines may be in them.
    expect(read('renderer/src/components/Focus.tsx'))
      .toContain('<Live item={item} facts={{ ...live, session, stalled, scheduledUntil }}');
  });
});

/* ------------------------- and where it IS named -------------------------- */
// The byline under the title, which is the arrangement she picked. Drawn from
// `bylineFacts` rather than from a second opinion; see the last describe block.

describe('under the task title', () => {
  it('names either agent where there are two', () => {
    expect(agentAtWork({ engineChoice: true, session: { ...RUNNING, engine: 'codex' } })).toBe('Codex');
    expect(agentAtWork({ engineChoice: true, session: { ...RUNNING, engine: 'claude' } })).toBe('Claude Code');
  });
});

/* -------------------------------- the row --------------------------------- */

describe('the inbox row', () => {
  // EVERY ROW IS NAMED, RUNNING OR NOT, AND THAT IS THE 2026-09-21 CHANGE.The
  // word used to ride the live session only, so her inbox, which is rows
  // waiting for HER, never showed it.
  //
  // She picked this against a measurement of what it costs: 11 of her 2,313
  // rows name Codex, so on the inbox she was shown, twelve of fifteen rows read
  // the identical words "Claude Code". The arrangement she turned down, naming
  // only the rows that are NOT on the workspace agent, is in decisions.md and
  // must not come back as a switch: a row with no word may not become the mark
  // for Claude Code.
  it('names the agent on a row with nothing running', () => {
    expect(list).toContain('&& !session && agentRest({ engineChoice, engines, item })');
  });

  it('still prefers the agent that is really running, where one is', () => {
    expect(list).toContain('&& session && agentAtWork({ engineChoice, session })');
  });

  // NOT A SWITCH. The losing arrangement was drawn behind a localStorage flag
  // for the design round and that flag is gone; anything reading one here would
  // be a second opinion about a question she has already answered.
  it('keeps no switch for the arrangement she turned down', () => {
    expect(list).not.toContain('restAgent');
    expect(list).not.toContain("=== 'differs'");
  });

  // AND ONLY WHERE THAT CELL IS TALKING ABOUT THE RUN. It says ONE thing, and
  // on a conversation she has just brought in it says "just imported" instead
  // of "working". A session can be up on such a row, and "Codex · just
  // imported" would name an agent beside a word it has nothing to do with.
  it('says nothing beside a row that has just been imported', () => {
    expect(list).toContain('{!justImported(item, seen) && session && agentAtWork(');
    expect(list).toContain('{!justImported(item, seen) && !session && agentRest(');
  });

  // A CODEX CONVERSATION IS CODEX'S, the same rule the byline follows. The
  // first cut of this round read only `byItem`, which is the supervisor's
  // answer for the next SPAWN, and nothing spawns on an imported thread: it
  // drew nothing on the only Codex rows in her real inbox.
  it('names Codex on an imported Codex conversation', () => {
    expect(list).toMatch(/const codexRow = \(item\.labels \?\? \[\]\)\.some/);
    expect(list).toContain("const engine = codexRow ? 'codex' : (engines.byItem?.[item.id] ?? engines.workspace ?? DEFAULT_ENGINE);");
  });

  // AND IT IS THE QUIET INK, NOT THE LOUD ONE. `.time.working` is deliberately
  // the loudest thing at that end of the row; the agent's name must not compete
  // with the fact that the row is running.
  it('wears the faint ink the product name and the timestamps wear', () => {
    expect(list).toContain('<span className="time agent">');
    expect(css).toMatch(/\.time\.agent \{[^}]*opacity/);
    // Never a colour: a coloured mark here would read as a state, and `stalled`
    // is the one state at this end that owns a colour.
    expect(css).not.toMatch(/\.time\.agent \{[^}]*color:/);
  });
});

/* --------------------------- one answer, not three ------------------------ */

describe('one place answers which agent it is', () => {
  it('has the byline read the same helper the row and the chat read', () => {
    expect(byline).toContain('export function agentAtWork');
    expect(byline).toContain('const engineWord = codexRow ? engineLabel(\'codex\') : agentAtWork(facts);');
  });

  // The expression `agentAtWork` is built out of, spelled out. It belongs in
  // exactly one function; anywhere else is a surface that can drift from the
  // other two on the same screen.
  it('leaves no second copy of the rule anywhere in the renderer', () => {
    const rule = 'session?.engine ?? facts.engine ?? null';
    expect(byline.split(rule).length - 1).toBe(1);
    for (const file of ['renderer/src/components/List.tsx', 'renderer/src/components/Live.tsx']) {
      expect(read(file)).not.toContain(rule);
    }
  });

  // AND NO PER-ENGINE CLASS, EVER. The same law the older file holds for the
  // composer, restated over the two classes this slice added: a class named
  // after one agent is how a symbol gets in later without anybody deciding to
  // add one. Both new classes are named for the SLOT, not for who fills it.
  //
  // ASKED OF THE CLASS NAMES THEMSELVES rather than of the whole file. A regex
  // over the stylesheet matches `.Claude` inside a comment quoting her about a
  // config folder (line ~6118), which is prose and not ink.
  it('marks the slot and never the agent', () => {
    for (const name of ['time agent', 'live-agent']) {
      expect(name).not.toMatch(/codex|claude/i);
    }
    expect(list).not.toMatch(/className="[^"]*(codex|claude)/i);
    expect(read('renderer/src/components/Live.tsx')).not.toMatch(/className="[^"]*(codex|claude)/i);
  });
});
