// Three power testers (2026-11-09) added a Codex account in Settings, closed
// the "Sign in to Codex" panel with its ×, then added Codex to the cloud and
// were told "Another Codex sign-in is open on this computer. Close it, then try
// again", with nothing on screen to close. The × only hid the panel: the shell
// and the `codex login` in it kept running, holding the port the cloud's
// sign-in returns to (127.0.0.1:1455), until the next Add account replaced it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
const closeButton = settings.match(/className="ac-adding-x"[^>]*onClick=\{([^}]*\}[^}]*)\}/)?.[1] ?? '';

describe("the sign-in panel's ×", () => {
  it('ends the shell its sign-in runs in', () => {
    expect(closeButton).toMatch(/api\.terminal\(\{ \.\.\.SETTINGS_TERMINAL, action: 'close' \}\)/);
  });

  it('still hides the panel and reads the accounts again', () => {
    expect(closeButton).toMatch(/setAdding\(null\)/);
    expect(closeButton).toMatch(/load\(\)/);
  });

  it("the terminal's own hide leaves its shell running, as it always has", () => {
    const task = fs.readFileSync(new URL('../renderer/src/components/TaskTerminal.tsx', import.meta.url), 'utf8');
    const hide = task.match(/function hide\(\)\{[^}]*\}/)?.[0] ?? task.match(/onHide[^;]*;/)?.[0] ?? '';
    expect(hide).not.toMatch(/action:'close'/);
  });
});
