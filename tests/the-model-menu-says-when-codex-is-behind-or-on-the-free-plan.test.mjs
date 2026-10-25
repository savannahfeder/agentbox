// THE MODEL MENU SAYS WHEN CODEX IS ON THE FREE PLAN, AND WHEN IT IS BEHIND.
//
// What broke (w-62f14f8b3e, 2026-10-22): the composer's model menu showed three
// Codex models with no reason given. The three were the ChatGPT free plan's
// list; the paid plan on that Mac had ended Oct 18. The old model picker
// (renderer/src/components/Model.tsx) had an "Update now" row for an
// out-of-date agent, and this menu, which replaced it in the composer and the
// reply box, never got one. Measured by rendering the menu to markup with the
// plan fact and each update state the app's update checker can report.
//
// The words sit in each column's heading, the placement chosen from five.
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelMenu } from '../renderer/src/threads/ModelMenu';
import { AgentUpdatesContext } from '../renderer/src/components/AgentUpdates';
import { setCodexFreePlan } from '../renderer/src/models';

const OCT_18 = new Date(2026, 9, 18, 12).getTime();
const claude = [{ engine: 'claude', model: 'opus' }, { engine: 'claude', model: 'sonnet' }];
const codex = [{ engine: 'codex', model: 'gpt-6-luna' }, { engine: 'codex', model: 'gpt-5.6-terra' }];

function menu({ page = 'all', every = { claude, codex }, updates = {} } = {}) {
  const props = {
    className: 'tc-menu', page, onPage: () => {}, recent: [claude[0], codex[0]], every, more: 2,
    pick: claude[0], onPick: () => {}, labelOf: (p) => p.model, engineLabel: (id) => (id === 'codex' ? 'Codex' : 'Claude Code'),
    effortRows: [], effortLit: null, onEffort: () => {}, onKeyDown: () => {}, onHover: () => {},
  };
  return renderToStaticMarkup(React.createElement(AgentUpdatesContext.Provider, { value: { updates, start: () => {} } },
    React.createElement(ModelMenu, props)));
}

// The heading over one agent's column, from its name to the first model row.
const heading = (html, name) => html.slice(html.indexOf(`<span>${name}</span>`), html.indexOf('tc-row', html.indexOf(`<span>${name}</span>`)));

afterEach(() => setCodexFreePlan(null));

describe('the free plan is named in the Codex heading', () => {
  it('tags the heading, and says when the paid plan ended on hover', () => {
    setCodexFreePlan({ endedAt: OCT_18 });
    const codexHead = heading(menu(), 'Codex');
    expect(codexHead).toContain('>Free plan</span>');
    expect(codexHead).toContain('title="Your ChatGPT plan ended Oct 18, so Codex offers fewer models."');
  });

  it('names no date when no paid plan ever ended', () => {
    setCodexFreePlan({ endedAt: null });
    const codexHead = heading(menu(), 'Codex');
    expect(codexHead).toContain('>Free plan</span>');
    expect(codexHead).toContain('title="Codex offers fewer models on the ChatGPT free plan."');
  });

  it('says nothing on a paid plan, and nothing over Claude Code', () => {
    expect(menu()).not.toContain('Free plan');
    setCodexFreePlan({ endedAt: OCT_18 });
    expect(heading(menu(), 'Claude Code')).not.toContain('Free plan');
  });

  it('says nothing about Codex on a Mac whose menu has no Codex column', () => {
    setCodexFreePlan({ endedAt: OCT_18 });
    expect(menu({ every: { claude, codex: [] } })).not.toContain('Free plan');
  });
});

describe('an out-of-date agent can be updated from its heading', () => {
  const codexIs = (state) => heading(menu({ updates: { codex: { engine: 'codex', state, installed: '0.160.0', latest: '0.163.0' } } }), 'Codex');

  it('offers the update when a newer Codex is out, while it runs, and after it failed', () => {
    expect(codexIs('available')).toContain('>Update</button>');
    expect(codexIs('running')).toContain('>Updating…</button>');
    expect(codexIs('failed')).toContain('>Retry update</button>');
  });

  it('offers nothing when Codex is current, cannot be checked, or updates itself', () => {
    for (const state of ['current', 'unknown', 'unsupported']) expect(codexIs(state)).not.toContain('<button');
  });

  it('offers Claude Code its own update over its own column, and none on a Mac without it', () => {
    const updates = { claude: { engine: 'claude', state: 'available', installed: '2.1.1', latest: '2.1.2' } };
    const html = menu({ updates });
    expect(heading(html, 'Claude Code')).toContain('>Update</button>');
    expect(heading(html, 'Codex')).not.toContain('<button');
    expect(menu({ updates, every: { claude: [], codex } })).not.toContain('>Update</button>');
  });
});
