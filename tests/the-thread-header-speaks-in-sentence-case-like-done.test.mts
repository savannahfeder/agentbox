// THE THREAD HEADER SPEAKS IN SENTENCE CASE, LIKE DONE (2026-11-01).
//
// On a team thread's page, "ADD PEOPLE" sat in mono caps beside a boxed,
// sentence-case "Done", and the answer at the foot was labelled
// "RESULT · OPUS 5.5" in bold caps over the agent's words. Seen in the light
// mode picture of an agent's launch-plan thread; measured by reading the
// buttons' and the label's rules and words.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rule = (css, sel) => new RegExp(`^${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';
const team = read('renderer/src/team/team.css');
const styles = read('renderer/src/styles.css');

describe('Add people', () => {
  it('is sentence case in the text font, never mono caps', () => {
    expect(rule(team, '.tm-add-people')).not.toMatch(/uppercase|var\(--mono\)/);
  });
  it('in the header it wears Done\'s box: the same height, line, corner and size', () => {
    const done = rule(read('renderer/src/threads/summary.css'), '.ts-done');
    const add = rule(team, '.crumb-aside .tm-add-people');
    for (const part of ['height: 30px', 'border: 1px solid var(--line)', 'font-size: 13px', 'color: var(--text-dim)']) {
      expect(done).toContain(part);
      expect(add).toContain(part);
    }
    expect(read('renderer/src/soft-corners.css')).toMatch(/\.crumb-aside \.tm-add-people/);
  });
});

describe('the answer\'s label', () => {
  it('is quiet sentence case, not bold caps', () => {
    expect(rule(styles, '.appendix-label')).not.toMatch(/uppercase|font-weight: 600/);
  });
  it('a result is signed by its model alone; a checkpoint or an unshipped note keeps its word', () => {
    const view = read('renderer/src/components/ItemThread.tsx');
    expect(view).toMatch(/outcome\.field === 'result' \? ranSaid \?\? 'Result'/);
    expect(view).toContain("'Not shipped'");
    expect(view).toContain("'Latest checkpoint'");
  });
});
