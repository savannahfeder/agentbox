// Testing the current onboarding exposed no way back and a status that hid
// Codex whenever Claude Code was ready. Check both routes and probe results.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { previousScreen, readyEngines } from '../renderer/src/first-run';

describe('going back during setup', () => {
  it('returns to the page that preceded this one', () => {
    expect(previousScreen('chats', { chats: 3 })).toBe('welcome');
    expect(previousScreen('task', { chats: 3 })).toBe('chats');
    expect(previousScreen('task', { chats: 0 })).toBe('welcome');
    expect(previousScreen('welcome', { chats: 3 })).toBe(null);
  });
  it('wires a visible Back button into the current flow', () => {
    const source = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');
    expect(source).toContain('className="ob-back"');
    expect(source).toContain('onClick={() => go(backTo)}');
    expect(source).toContain("e.target as Element | null)?.closest('.ob-back')");
  });
});

describe('the ready agents', () => {
  const reading = (engine, found = true, signedIn = true) => ({ engine, found, signedIn });
  it('keeps both ready agents, regardless of probe order', () => {
    expect(readyEngines([reading('claude'), reading('codex')])).toEqual(['claude', 'codex']);
    expect(readyEngines([reading('codex'), reading('claude')])).toEqual(['claude', 'codex']);
  });
  it('only calls agents ready when they are found and signed in', () => {
    expect(readyEngines([reading('claude'), reading('codex', true, false)])).toEqual(['claude']);
    expect(readyEngines([reading('claude', false), reading('codex')])).toEqual(['codex']);
    expect(readyEngines([null, reading('codex')])).toEqual(['codex']);
    expect(readyEngines([null, reading('codex', false, false)])).toEqual([]);
  });
  it('draws all ready names instead of choosing one', () => {
    const source = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');
    expect(source).toContain("ready.map((engine) => ENGINE_NAME[engine]).join(' and ')");
    expect(source).not.toContain("ok(claude) ? 'claude' :");
  });
});

it('offers cloud setup without promising how long it takes', () => {
  const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  const words = fs.readFileSync(new URL('../renderer/src/cloud-setup.ts', import.meta.url), 'utf8');
  expect(pages).not.toContain('SETUP.inviteNote');
  expect(words).not.toContain('About a minute to set up');
});
