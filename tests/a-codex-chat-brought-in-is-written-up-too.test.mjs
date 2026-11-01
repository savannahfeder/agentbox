// A CODEX CHAT BROUGHT IN IS WRITTEN UP TOO (w-31c71743b5, 2026-10-29).
//
// Measured in a fresh window with two Claude Code chats and one Codex chat
// brought in at setup: both Claude Code chats opened on a name, a context and
// a question with three options (main/catch-up.mts), and the Codex chat on its
// raw last message, because only a Claude Code row was marked as owed the
// rewrite. A Codex row is also re-read from Codex once a minute
// (`refreshCodexMirrors`), which would put the raw message back over the
// rewrite; it now does that only when the Codex chat moved on since.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { codexMirrorPatch, codexIdOf } from '../shared/codex-import.mts';
import { CATCH_UP_LABEL, catchUpDue } from '../shared/agent-import.mts';

const NOW = Date.UTC(2026, 9, 29, 9);

async function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-catch-up-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  const s = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  const folder = path.join(root, 'feed');
  const { slug } = s.createProduct({ name: 'Feed', repoPath: folder });
  return { s, slug, folder };
}
const thread = (folder, last, when = NOW - 3600e3) => ({
  id: 'cx1', source: 'codex', folder, folderName: 'feed', short: '~/feed', path: '/x/rollout-cx1.jsonl',
  title: 'Feed jumps', when, startedAt: NOW - 7200e3, prompt: 'why does the feed jump', last, waiting: true, ask: last,
});
const writeUp = (s, slug, id, at) => s.modules.workItemsDisk.updateWorkItem(s.productDir(slug), id,
  { label: 'Feed jump fix', problem: 'The feed jumps when posts load.', result: '**Should I anchor the scroll?**' }, { source: 'agent', now: at });

describe('a Codex chat brought in', () => {
  it('is owed the rewrite, like a Claude Code one', async () => {
    expect(codexMirrorPatch(thread('/w', 'Anchor it, or stop loading?')).labels).toContain(CATCH_UP_LABEL);
    const { s, slug, folder } = await world();
    s.importCodexThreads(slug, [thread(folder, 'Anchor it, or stop loading?')], { now: NOW });
    expect(catchUpDue(s.listItems().find((i) => codexIdOf(i) === 'cx1'))).toBe(true);
  });

  it('keeps its rewrite while the Codex chat has not moved', async () => {
    const { s, slug, folder } = await world();
    s.importCodexThreads(slug, [thread(folder, 'Anchor it, or stop loading?')], { now: NOW });
    const row = s.listItems().find((i) => codexIdOf(i) === 'cx1');
    writeUp(s, slug, row.id, NOW + 20e3);
    expect(s.refreshCodexMirrors([thread(folder, 'Anchor it, or stop loading?')], { now: NOW + 60e3 })).toBe(0);
    expect(s.listItems().find((i) => i.id === row.id).result).toBe('**Should I anchor the scroll?**');
  });

  it('follows Codex again, and is owed a new rewrite, once that chat moves on', async () => {
    const { s, slug, folder } = await world();
    s.importCodexThreads(slug, [thread(folder, 'Anchor it, or stop loading?')], { now: NOW });
    const row = s.listItems().find((i) => codexIdOf(i) === 'cx1');
    writeUp(s, slug, row.id, NOW + 20e3);
    s.modules.workItemsDisk.updateWorkItem(s.productDir(slug), row.id, { labels: row.labels.filter((l) => l !== CATCH_UP_LABEL) }, { source: 'system', now: NOW + 20e3 });
    expect(s.refreshCodexMirrors([thread(folder, 'Anchored it. Done.', NOW + 120e3)], { now: NOW + 180e3 })).toBe(1);
    const after = s.listItems().find((i) => i.id === row.id);
    expect(after.result).toBe('Anchored it. Done.');
    expect(after.labels).toContain(CATCH_UP_LABEL);
    expect(catchUpDue(after)).toBe(true);
  });
});

describe('a reply to a Codex chat brought in', () => {
  // Measured the same night: choosing option 1 on the imported Codex chat ran
  // on Claude Code, the app's default, which was at its weekly limit, so the
  // chat the person had with Codex stopped with "You've hit your weekly limit".
  it('goes to Codex, the agent the chat was with', async () => {
    expect(codexMirrorPatch(thread('/w', 'Anchor it?')).engine).toBe('codex');
    const { s, slug, folder } = await world();
    s.importCodexThreads(slug, [thread(folder, 'Anchor it, or stop loading?')], { now: NOW });
    expect(s.listItems().find((i) => codexIdOf(i) === 'cx1').engine).toBe('codex');
  });
});

describe('the engine it is carried on with', () => {
  // The first fix wrote the engine with the chat's own time, an hour before
  // the app was opened, and a row's engine older than the moment the choice
  // opened is ignored (`engineChoiceOnRowIsStale`): the reply still went to
  // Claude Code. It is written at the moment of the import.
  it('is written when the chat comes in, not when the chat last moved', async () => {
    const { engineChoiceOnRowIsStale } = await import('../shared/engines.mjs');
    const { s, slug, folder } = await world();
    const opened = new Date(Date.now() - 1000).toISOString();
    s.importCodexThreads(slug, [thread(folder, 'Anchor it?', Date.now() - 3600e3)], { now: Date.now() });
    const row = s.listItems().find((i) => codexIdOf(i) === 'cx1');
    expect(engineChoiceOnRowIsStale(row, { engineChoice: opened })).toBe(false);
  });
});
