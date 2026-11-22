// ⌘K offered "Rank Direct first" three times on a team copy (a synthetic
// tester on the demo copy, 2026-11-21): every conversation with a teammate is
// kept as a record named Direct, and the rank rows listed each one as if it
// were a project. A conversation is not a project and has no place in the order.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Palette } from '../renderer/src/components/Palette.tsx';

const noop = () => {};
const team = (direct: boolean) => ({ projectId: 'p', teamId: 't', visibility: direct ? 'people' : 'team', people: [], sharedBy: null, ...(direct ? { direct: true } : {}) });
const drawn = (typed: string) => renderToStaticMarkup(createElement(Palette, {
  products: [
    { slug: 'shuttle', name: 'Shuttle', team: team(false) },
    { slug: 'mine', name: 'Mine' },
    { slug: 'direct-1', name: 'Direct', team: team(true) },
    { slug: 'direct-2', name: 'Direct', team: team(true) },
  ],
  supervisorPaused: false, look: 'ember-grid', onSetLook: noop, onOpenFilter: noop, onClearFilter: noop,
  onView: noop, onPause: noop, onResume: noop, onRankFirst: noop, onNewProject: noop, onNewThread: noop, onStanding: noop,
  onSettings: noop, onShortcuts: noop, keyHints: false, onSetKeyHints: noop, onFirstRun: noop, onTutorial: noop,
  onImportAgents: noop, onClose: noop, typed,
} as unknown as Parameters<typeof Palette>[0]));

describe('⌘K ranks projects', () => {
  it('offers every project, shared or not', () => {
    const html = drawn('rank');
    expect(html).toContain('Rank Shuttle first');
    expect(html).toContain('Rank Mine first');
  });

  it('and never a conversation with a teammate', () => {
    expect(drawn('rank')).not.toContain('Rank Direct first');
    expect(drawn('')).not.toContain('Rank Direct first');
  });
});
