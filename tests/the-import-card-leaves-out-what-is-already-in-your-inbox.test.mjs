// THE IMPORT CARD LEAVES OUT WHAT IS ALREADY IN YOUR INBOX.
//
// Found driving the real app on a Mac with only Codex (w-db6f5e331e,
// 2026-10-05). The walk's last screen imported five Codex conversations; ⌘K,
// "Import agents from Claude Code or Codex", then opened on "Five threads in
// two folders. Add all five threads" for those same five. Pressing it filed
// nothing (each store write already refuses a second row per conversation), so
// the inbox stayed at five rows, but the card had offered five things it could
// not add. Claude Code conversations were read the same way.
//
// So a conversation that already has a row is marked, and the card offers only
// the rest. A conversation the person said no to keeps being offered, because
// that is how they get back to it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { markImported } from '../shared/agent-import.mjs';
import { CARD } from '../renderer/src/agent-import-card';

const t = (id, source = 'codex') => ({ id, source, title: `t ${id}`, folder: '/w', when: 1 });

describe('which conversations are already in', () => {
  const items = [
    { id: 'w-1', status: 'open', labels: ['thread-import', 'thread:claude-in'] },
    { id: 'w-2', status: 'open', labels: ['codex', 'codex:codex-mirrored'] },
    { id: 'w-3', status: 'open', labels: ['codex-import', 'codex:codex-asking'] },
    { id: 'w-4', status: 'done', labels: ['not-imported', 'codex:codex-declined'] },
    { id: 'w-5', status: 'done', labels: ['thread-import', 'thread:claude-closed'] },
  ];
  const marked = Object.fromEntries(markImported([
    t('claude-in', 'terminal'), t('codex-mirrored'), t('codex-asking'), t('codex-declined'),
    t('claude-closed', 'terminal'), t('never-seen'),
  ], items).map((x) => [x.id, !!x.imported]));

  it('marks a Claude Code conversation that has a row, open or closed', () => {
    expect(marked['claude-in']).toBe(true);
    expect(marked['claude-closed']).toBe(true);
  });
  it('marks a Codex conversation that was imported, or is asking to be', () => {
    expect(marked['codex-mirrored']).toBe(true);
    expect(marked['codex-asking']).toBe(true);
  });
  it('keeps offering one the person said no to', () => {
    expect(marked['codex-declined']).toBe(false);
  });
  it('leaves a conversation with no row alone', () => {
    expect(marked['never-seen']).toBe(false);
  });
  it('is a no-op on no items, and keeps every field', () => {
    const out = markImported([t('a')], []);
    expect(out).toEqual([t('a')]);
  });
});

describe('the card', () => {
  const card = fs.readFileSync(new URL('../renderer/src/components/ImportAgents.tsx', import.meta.url), 'utf8');
  const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');

  it('is handed the mark by the main process', () => {
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:agent-threads'"), ipc.indexOf("ipcMain.handle('zero:import-threads'"));
    expect(handler).toMatch(/items = store\.listItems\(\)/);
    expect(handler).toMatch(/markImported\(threads, items\)/);
  });
  it('offers only what is not already in', () => {
    expect(card).toMatch(/threads: offered/);
    expect(card).toMatch(/\.filter\(\(t\) => !t\.imported\)/);
  });
  it('says so when everything is already in, instead of saying it found nothing', () => {
    expect(CARD.allIn(5)).toBe('All 5 conversations from the last ten days are already in your inbox.');
    expect(CARD.allIn(1)).toBe('The one conversation from the last ten days is already in your inbox.');
    expect(card).toMatch(/alreadyIn > 0 \? CARD\.allIn\(alreadyIn\)/);
  });
  // Seen in the real app: "No agents to bring across yet." over "All 5 ... are
  // already in your inbox." read as two answers to one question.
  it('heads that card as nothing new, not as nothing at all', () => {
    expect(CARD.headAllIn).toBe('Nothing new to bring across.');
    expect(CARD.laterAllIn).toBe('When there is more, press ⌘K and type import.');
    expect(card).toMatch(/alreadyIn > 0 \? CARD\.headAllIn : CARD\.headNone/);
    expect(card).toMatch(/alreadyIn > 0 \? CARD\.laterAllIn : CARD\.noneLater/);
  });
});
