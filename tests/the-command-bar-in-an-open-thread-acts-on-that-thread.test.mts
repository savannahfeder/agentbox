// A power tester on 2026-11-04 ticked two threads, pressed E, pressed Z (which
// re-ticks what it brings back), opened a third thread and pressed Cmd+K. The
// bar's first rows were "Done (2 selected)" and "Later (2 selected)", acting on
// two threads nowhere on screen; the tester put those two off instead of the
// one they were reading. The bar went into its ticked mode whenever anything
// was ticked. With a thread open it now acts on that thread; the ticks wait
// for the list.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const commands = app.slice(app.indexOf('itemCommands={(() => {'), app.indexOf('const sel = selectable.filter((i) => multiSel.has(i.id));', app.indexOf('itemCommands={(() => {')));

it('offers the ticked threads only while no thread is open', () => {
  expect(commands).toContain('if (multiSel.size && !focused) {');
});

it('still offers them on the list', () => {
  expect(commands).not.toMatch(/if \(multiSel\.size\) \{/);
});
