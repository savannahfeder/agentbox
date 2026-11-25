// The desktop's command bar, its phone layout included, offers "Show
// terminal sessions: always / when they need you / never", with "On now"
// beside the one in use (2026-11-23). The phone parity round of 2026-11-25
// found the phone's search offering none of them, though Settings › Running
// on the phone changes the same setting.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { commandsFor, phoneCommands } from '../mobile/src/lib/palette';
import { outsideCommands } from '../renderer/src/outside-agents';

const computer = { paused: false, projects: [], order: [], cloud: null, outside: 'waiting' as const };

describe("the phone's search", () => {
  it('offers the three desktop rows, in its words, marking the one on now', () => {
    const rows = commandsFor('terminal', phoneCommands({ team: false, computer }));
    const desk = outsideCommands('waiting');
    expect(rows.map((r) => r.label)).toEqual(desk.map((r) => r.label));
    expect(rows.find((r) => r.label === desk.find((d) => d.hint)!.label)!.aside).toBe('On now');
  });

  it('sends the pick to the computer as the setting Settings › Running changes', () => {
    const rows = commandsFor('terminal', phoneCommands({ team: false, computer }));
    expect(rows.map((r) => r.act)).toEqual(outsideCommands('waiting').map((d) => ({ setting: { scope: 'workspace', key: 'outsideAgents', value: d.to } })));
  });

  it('offers none until the computer has said which is on', () => {
    expect(commandsFor('terminal', phoneCommands({ team: false, computer: { ...computer, outside: undefined } }))).toEqual([]);
  });

  it("reads which is on from the computer's settings", () => {
    expect(fs.readFileSync(new URL('../mobile/src/app/search.tsx', import.meta.url), 'utf8')).toContain("outside: s.reading('workspace', 'outsideAgents', w.outsideAgents).value as AgentMode,");
  });
});
