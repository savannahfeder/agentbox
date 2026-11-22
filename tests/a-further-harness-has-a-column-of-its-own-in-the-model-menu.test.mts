// THE MODEL MENU KNEW TWO HARNESSES BY NAME.
//
// Read off the code on 2026-11-22, before a third could be offered: a model of
// a further harness had no column to be drawn in; a thread that had run on one
// was placed by its model id, so `opencode/big-pickle` came back as a Claude
// Code model in Recent; the model remembered for it would have been written
// over Claude Code's; and Claude Code's five effort levels were offered for a
// tool that lists none. Measured by calling the menu's rules with OpenCode's
// ten free models, as 2.3.2 listed them with nobody signed in, and by drawing
// the menu to markup.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { allModels, moreCount, recentModels, furtherModelLabel } from '../renderer/src/threads/composer-rules';
import { ModelMenu } from '../renderer/src/threads/ModelMenu';
import { AgentUpdatesContext } from '../renderer/src/components/AgentUpdates';
import { lastModelKey } from '../renderer/src/models';
import { lastEffortKey, effortChoicesFor } from '../renderer/src/effort';
import { fixtureSnapshot, fixtureEngineWorld, fixtureSecondEngine, fixtureFurtherHarness, fixtureOpenCodeModels } from '../renderer/src/fixtures';

const OPENCODE = { id: 'opencode', label: 'OpenCode', models: fixtureOpenCodeModels };
const CODEX_MODELS = [{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.6-terra' }];
const PICKLE = { engine: 'opencode', model: 'opencode/big-pickle' };
const T = Date.parse('2026-11-22T12:00:00Z');
const two = { codexModels: CODEX_MODELS, codexOffered: true };

describe('All models', () => {
  it('has one more column for the further harness, with its models in its own order', () => {
    const all = allModels({ ...two, further: [OPENCODE] });
    expect(all.others).toHaveLength(1);
    expect(all.others?.[0]).toMatchObject({ engine: 'opencode', label: 'OpenCode' });
    expect(all.others?.[0].models).toEqual(fixtureOpenCodeModels.map((m) => ({ engine: 'opencode', model: m.id })));
  });

  it('leaves the two columns as they were', () => {
    const before = allModels(two);
    const after = allModels({ ...two, further: [OPENCODE] });
    expect(after.claude).toEqual(before.claude);
    expect(after.codex).toEqual(before.codex);
    expect(before.others).toEqual([]);
  });

  it('has no column for a harness that has listed nothing yet', () => {
    expect(allModels({ ...two, further: [{ id: 'opencode', label: 'OpenCode', models: [] }] }).others).toEqual([]);
    expect(allModels({ ...two, further: [{ id: 'opencode', label: 'OpenCode' }] }).others).toEqual([]);
  });

  it('counts the further models in "N more", less the ones Recent already shows', () => {
    const all = allModels({ ...two, further: [OPENCODE] });
    const total = all.claude.length + all.codex.length + fixtureOpenCodeModels.length;
    expect(moreCount([], all)).toBe(total);
    expect(moreCount([PICKLE], all)).toBe(total - 1);
    // A recent row no column lists takes nothing off the count.
    expect(moreCount([{ engine: 'opencode', model: 'opencode/gone' }], all)).toBe(total);
  });
});

describe('Recent', () => {
  const ranOn = (engine: string, model: string, at = T) => ({ createdAt: at, engine, model });
  const rows = (items: ReturnType<typeof ranOn>[], further = [OPENCODE]) => recentModels(items, { ...two, further });

  it('leads with the model of the further harness when that was the last pick', () => {
    expect(rows([ranOn('claude', 'sonnet', T - 1000), ranOn('opencode', 'opencode/big-pickle')])[0]).toEqual(PICKLE);
  });

  it('drops a model the harness no longer lists', () => {
    const got = rows([ranOn('opencode', 'opencode/gone')]);
    expect(got.some((p) => p.model === 'opencode/gone')).toBe(false);
  });

  it('never offers its model under Claude Code once the harness is gone', () => {
    const got = rows([ranOn('opencode', 'opencode/big-pickle')], []);
    expect(got.some((p) => p.model === 'opencode/big-pickle')).toBe(false);
    expect(got.every((p) => p.engine === 'claude' || p.engine === 'codex')).toBe(true);
  });

  it('reads Claude Code and Codex threads exactly as before', () => {
    const items = [ranOn('codex', 'gpt-5.6-terra'), ranOn('claude', 'sonnet', T - 1000)];
    expect(rows(items)).toEqual(recentModels(items, two));
  });
});

describe('what a further model is called, remembered as, and how hard it thinks', () => {
  it('is named in the harness\'s own words, or by its id once the harness stops listing it', () => {
    expect(furtherModelLabel([OPENCODE], PICKLE)).toBe('Big Pickle');
    expect(furtherModelLabel([OPENCODE], { engine: 'opencode', model: 'opencode/gone' })).toBe('opencode/gone');
  });

  it('leaves the naming of a Claude Code or Codex model to the rules that already name it', () => {
    expect(furtherModelLabel([OPENCODE], { engine: 'claude', model: 'opus' })).toBeNull();
    expect(furtherModelLabel([OPENCODE], { engine: 'codex', model: 'gpt-5.6-sol' })).toBeNull();
    expect(furtherModelLabel(undefined, PICKLE)).toBeNull();
  });

  it('is remembered under a key of its own, and the two keys people already have stay where they were', () => {
    expect(lastModelKey('opencode')).toBe('zero.lastModel.opencode');
    expect(lastModelKey('codex')).toBe('zero.lastModel.codex');
    expect(lastModelKey('claude')).toBe('zero.lastModel');
    expect(lastModelKey(null)).toBe('zero.lastModel');
    expect(lastEffortKey('opencode')).toBe('zero.lastEffort.opencode');
    expect(lastEffortKey('codex')).toBe('zero.lastEffort.codex');
    expect(lastEffortKey('claude')).toBe('zero.lastEffort');
  });

  it('is offered no effort levels, where Claude Code keeps its five', () => {
    expect(effortChoicesFor('opencode', 'opencode/big-pickle')).toEqual([]);
    expect(effortChoicesFor('claude', 'opus')).toHaveLength(5);
    expect(effortChoicesFor(null, null)).toHaveLength(5);
  });
});

describe('the menu as drawn', () => {
  const claude = [{ engine: 'claude', model: 'opus' }, { engine: 'claude', model: 'sonnet' }];
  const codex = [{ engine: 'codex', model: 'gpt-5.6-sol' }];
  const column = { engine: 'opencode', label: 'OpenCode', models: fixtureOpenCodeModels.map((m) => ({ engine: 'opencode', model: m.id })) };
  // `others: null` is a menu handed no third list at all, as the reply box of an older build would.
  function menu({ page = 'all', others = [column] as typeof column[] | null, pick = claude[0] } = {}) {
    const props = {
      className: 'tc-menu', page, onPage: () => {}, recent: [claude[0]], every: { claude, codex, ...(others ? { others } : {}) }, more: 2,
      pick, onPick: () => {}, labelOf: (p: { engine: string; model: string }) => furtherModelLabel([OPENCODE], p) ?? p.model,
      engineLabel: (id: string) => (id === 'codex' ? 'Codex' : 'Claude Code'),
      effortRows: [], effortLit: null, onEffort: () => {}, onKeyDown: () => {}, onHover: () => {},
    };
    return renderToStaticMarkup(React.createElement(AgentUpdatesContext.Provider, { value: { updates: {}, start: () => {} } as never },
      React.createElement(ModelMenu, props as never)));
  }
  const columns = (html: string) => html.split(/<div class="tc-col(?: tc-col-more)?">/).slice(1);

  it('draws the further harness as a third column, headed by its name, after Codex', () => {
    const cols = columns(menu());
    expect(cols).toHaveLength(3);
    expect(cols[2]).toContain('<span class="tc-menu-head">OpenCode</span>');
    expect(cols[2].match(/class="tc-row /g)).toHaveLength(fixtureOpenCodeModels.length);
    expect(cols[2]).toContain('>Big Pickle</span>');
    expect(cols[2]).not.toContain('opencode/');
  });

  it('marks the picked model in that column and no other row', () => {
    const html = menu({ pick: PICKLE });
    expect(html.match(/class="tc-row on"/g)).toHaveLength(1);
    expect(html).toContain('class="tc-row on"><span class="tc-row-label">Big Pickle</span>');
  });

  it('draws two columns where there is no further harness', () => {
    expect(columns(menu({ others: [] }))).toHaveLength(2);
    expect(columns(menu({ others: null }))).toHaveLength(2);
    expect(menu({ others: [] })).not.toContain('OpenCode');
  });

  it('keeps the columns behind All models, off the Recent page', () => {
    expect(columns(menu({ page: 'recent' }))).toHaveLength(0);
  });
});

describe('the stand-in world that photographs it', () => {
  const claudeWorld = () => fixtureSecondEngine(structuredClone(fixtureSnapshot), fixtureEngineWorld('claude'));

  it('puts OpenCode on offer with its ten free models, and one thread on it', () => {
    const snap = fixtureFurtherHarness(claudeWorld(), 'opencode');
    expect(snap.engines?.further?.map((e) => e.id)).toEqual(['opencode']);
    expect(snap.engines?.further?.[0].models).toHaveLength(10);
    expect(snap.engines?.byItem?.['w-a1']).toBe('opencode');
    expect(snap.items.find((i) => i.id === 'w-a1')).toMatchObject({ engine: 'opencode', model: 'opencode/big-pickle' });
  });

  // A running thread wears the mark of what it started on, so the mark would not show there.
  it('puts it on a thread that is resting, not on one a session is running', () => {
    const snap = fixtureFurtherHarness(claudeWorld(), 'opencode');
    const running = (snap.supervisor.running ?? []).map((r: { itemId: string }) => r.itemId);
    expect(running.length).toBeGreaterThan(0);
    expect(running).not.toContain('w-a1');
  });

  it('hands the world back untouched when nobody asked for it, or asked for something else', () => {
    const base = claudeWorld();
    expect(fixtureFurtherHarness(base, null)).toBe(base);
    expect(fixtureFurtherHarness(base, 'gemini')).toBe(base);
    expect(base.engines?.further).toBeUndefined();
  });
});
