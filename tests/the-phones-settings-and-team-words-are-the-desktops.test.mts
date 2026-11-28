// Three sentences the desktop changed between 2026-11-21 and 2026-11-24 that
// the phone kept, found by the phone parity round of 2026-11-25 reading both
// apps' source side by side: terminal sessions now cover Codex too, Settings ›
// Team with no team says inviting comes with Pro, and AI teammates moved from
// Alpha features to General.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PRO_FOR_INVITES } from '../renderer/src/team/multiplayer-words';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe("the phone's words", () => {
  it('say terminal sessions are Claude Code and Codex, as the desktop does', () => {
    const desk = read('renderer/src/components/Settings.tsx');
    const phone = read('mobile/src/ui/SettingsPages.tsx');
    expect(desk).toContain('Claude Code and Codex, started in a terminal or the Codex app.');
    expect(phone).toContain('desc={`Claude Code and Codex, started in a terminal or the Codex app. ${AGENT_SENTENCE');
    expect(phone).not.toContain('Claude Code started in a terminal, not from here.');
  });

  it('head Settings › Team with no team with the desktop words about Pro', () => {
    const phone = read('mobile/src/ui/TeamPage.tsx');
    expect(PRO_FOR_INVITES).toBe('Inviting people comes with Pro.');
    expect(phone).toMatch(/marginTop: 28 \}\}>\{PRO_FOR_INVITES\}<\/T>/);
    expect(phone).not.toContain('>Start your team<');
  });

  it('send you to Settings, General for AI teammates, where the switch is now', () => {
    const phone = read('mobile/src/app/teammate/new.tsx');
    expect(phone).toContain('Turn on AI teammates there, in Settings, General.');
    expect(phone).not.toContain('Alpha features');
  });
});
