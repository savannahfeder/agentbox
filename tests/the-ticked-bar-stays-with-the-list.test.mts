// A power tester on 2026-11-04 ticked two threads, opened Settings, and found
// "2 selected  E Done  L Later  esc Clear" over the Shortcuts page, covering
// its last rows. Reproduced in a test copy: the bar was drawn whenever
// something was ticked and no thread, box or note was open. Its keys belong to
// the list, so it is drawn only where the list is: not over Settings, Files or
// Connections. The ticks themselves are kept for the way back.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const gate = app.slice(app.lastIndexOf('{', app.indexOf('<TickedBar ')), app.indexOf('<TickedBar '));

it('is not drawn over Settings, Files or Connections', () => {
  for (const page of ['!settingsOpen', '!filesShown', '!connectionsShown']) expect(gate).toContain(page);
});

it('is still drawn on the list with something ticked', () => {
  expect(gate).toContain('multiSel.size > 0');
  expect(gate).toContain('!focused');
});
