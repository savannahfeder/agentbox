// Since 2026-11-10 (af05ef21f) a new task on the desktop opens on "Agent
// decides": three empty bars, sent untagged, and the computer's small model
// gives it High, Medium or Low (main/task-priority.mts). The phone's New
// thread form already sent an untouched card untagged, but its row read
// "Medium" with two bars filled, and its sheet had no Agent decides row to go
// back to once a level was picked. Found by the phone parity audit of
// 2026-11-21, reading NewThreadForm.tsx beside ThreadComposer.tsx.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newThreadChoices } from '../mobile/src/lib/compose';

const form = fs.readFileSync('mobile/src/ui/NewThreadForm.tsx', 'utf8');
const pickers = fs.readFileSync('mobile/src/ui/Pickers.tsx', 'utf8');
const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');

describe('a new thread on the phone opens on Agent decides', () => {
  it('names the choice in the desktop words, Agent decides until a level is picked', () => {
    expect(form).toMatch(/choiceLabelOf\(draft\.priority \?\? null\)/);
    expect(form).not.toMatch(/priorityLabelOf\(draft\.priority \?\? 'medium'\)/);
  });
  it('draws three empty bars for it, as the desktop does', () => {
    expect(form).toMatch(/<PriorityBars level=\{draft\.priority \? barsFor\(priorityValueOf\(draft\.priority\)\) : 0\} \/>/);
    expect(parts).toMatch(/export function PriorityBars\(\{ level \}: \{ level: 0 \| 1 \| 2 \| 3 \| 4 \}\)/);
  });
  it('offers Agent decides first in its sheet, and picking it goes back to no level', () => {
    expect(pickers).toMatch(/agentDecides && <SheetRow key="agent" label=\{AGENT_DECIDES\.label\} on=\{value === null\} lead=\{<PriorityBars level=\{0\} \/>\}/);
    expect(pickers.indexOf('{first}')).toBeLessThan(pickers.indexOf('{PRIORITIES.map('));
    expect(form).toMatch(/value=\{draft\.priority \? priorityValueOf\(draft\.priority\) : null\}/);
    expect(form).toMatch(/agentDecides=\{\(\) => draft\.setPriority\(null\)\}/);
  });
  it('sends no level when the card is left on Agent decides, and the picked level when one is picked', () => {
    expect(newThreadChoices({ priority: null, model: 'opus', effort: null })).not.toHaveProperty('priority');
    expect(newThreadChoices({ priority: 'high', model: 'opus', effort: null })).toMatchObject({ priority: 7 });
  });
});
