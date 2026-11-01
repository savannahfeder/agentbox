// A PRESS ON THE SIDEBAR'S USAGE ROW OPENS THAT AGENT'S SETTINGS PAGE (w-07891cd502, 2026-11-01).
//
// "make sure the claude code/codex usage thing in the sidebar is clickable -
// should navigate into the corresponding settings page." Measured on the
// source: a press only pinned the hover panel open, and App.tsx handed the row
// no destination (tests/the-usage-panel-is-not-settings held that). Each
// agent's usage and accounts live on its own Settings page, `claude` or
// `codex`, the page ⌘K's Usage row already opens for Claude Code. The row is
// named for the agent used last, so the press goes to that agent's page. The
// corner bar outside the sidebar still pins its panel.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../renderer/src/App.tsx');
const pill = read('../renderer/src/components/UsagePill.tsx');
const call = app.match(/usage=\{<UsagePill([\s\S]*?)\/>\}/)[1];

describe('the sidebar usage row, pressed', () => {
  it('is handed a way into Settings', () => {
    expect(call).toMatch(/onOpen=\{openAgentSettings\}/);
  });
  it('opens the Codex page for Codex and the Claude Code page for anything else', () => {
    const open = app.match(/const openAgentSettings = \(engine: string\) => \{([^\n]*)\};/)[1];
    expect(open).toContain("setSettingsPane(engine === 'codex' ? 'codex' : 'claude')");
    expect(open).toContain('setSettingsOpen(true)');
    expect(open).toContain('setSettingsVisit((n) => n + 1)');
    expect(open).toContain('setFocused(null)');
  });
  it('names the agent the row is drawn for, the one used last', () => {
    expect(pill).toMatch(/onOpen\(usage\.engine\)/);
    expect(pill).toMatch(/<UsageOne \{\.\.\.props\} usage=\{last\}/);
  });
  it('drops the hover as it goes, so the panel is not standing there on the way back', () => {
    const press = pill.match(/const press = \(\) => \{([\s\S]*?)\n {2}\};/)[1];
    expect(press).toMatch(/setHovering\(false\)/);
    expect(press).toMatch(/clearTimeout\(linger\.current\)/);
  });
  it('still pins the panel where there is no page to go to', () => {
    const press = pill.match(/const press = \(\) => \{([\s\S]*?)\n {2}\};/)[1];
    expect(press).toMatch(/if \(!sidebar \|\| !onOpen \|\| !usage\)/);
    expect(press).toMatch(/setPinned\(!pinned\)/);
  });
});
