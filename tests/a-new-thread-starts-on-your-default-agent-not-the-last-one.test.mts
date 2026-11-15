// A NEW THREAD STARTS ON YOUR DEFAULT AGENT, NOT THE LAST ONE PICKED (w-8b637c7802).
//
// A tester switched one thread to Codex for an investor update, pressed N for
// competitor research and sent it: it went to Codex, because the card opened on
// whatever agent was picked last, and the small "Codex" word was easy to miss
// while typing. The card never read the default agent set in Settings at all.
// Measured by drawing the card with the last pick stored as Codex.
//
// The same was done for who sees a thread (w-b989839656): the setting is the
// default, a pick stands for that thread. Each agent's last model is still
// remembered.
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeLastEngine } from '../renderer/src/engines.ts';

const CLAUDE = { id: 'claude', label: 'Claude Code', word: 'Claude Code' };
const CODEX = { id: 'codex', label: 'Codex', word: 'Codex' };
const codexModels = [{ id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol' }];

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
});

const draw = async (props = {}) => {
  const { ThreadComposer } = await import('../renderer/src/threads/ThreadComposer.tsx');
  return renderToStaticMarkup(h(ThreadComposer, {
    products: [{ slug: 'p', name: 'P', dir: '/p', repoPath: '/r' }], items: [], engines: [CLAUDE, CODEX],
    codexModels, codexModelDefault: 'gpt-6.1-sol',
    onClose() {}, onSent() {}, ...props,
  }));
};
const onCodex = (html) => /GPT-6\.1-Sol/.test(html) && !/Opus 5/.test(html);
const onClaude = (html) => /Opus 5/.test(html) && !/GPT-6\.1-Sol/.test(html);

describe('the agent a new thread card opens on', () => {
  it('is Claude Code when that is the default, though Codex was picked last', async () => {
    writeLastEngine('codex');
    expect(onClaude(await draw({ workspaceEngine: 'claude' }))).toBe(true);
  });

  it('is Codex when that is the default, though Claude Code was picked last', async () => {
    writeLastEngine(null);
    expect(onCodex(await draw({ workspaceEngine: 'codex' }))).toBe(true);
  });

  it('is Claude Code when no default is known yet', async () => {
    writeLastEngine('codex');
    expect(onClaude(await draw())).toBe(true);
  });

  it('is never an agent this computer does not offer', async () => {
    expect(onClaude(await draw({ workspaceEngine: 'codex', engines: [CLAUDE] }))).toBe(true);
  });
});
