// Browser repro September 18: End session followed immediately by Inbox left
// the cached view open. Returning spawned a new shell, despite ending the old one.
// The close acknowledgement must persist visibility without a mounted React effect.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
it('persists the ended view before updating possibly unmounted component state', () => {
  const source = readFileSync('renderer/src/components/TaskTerminal.tsx', 'utf8');
  const end = source.slice(source.indexOf('async function end()'), source.indexOf('async function restart()'));
  expect(end).toMatch(/await api\.terminal\([\s\S]*action:'close'[\s\S]*views\.set\(key,\{open:false,placement\}\)[\s\S]*setOpen\(false\)/);
});
// THREE CONTROLS, THREE DIFFERENT THINGS, AND EACH SAYS WHICH IT TOUCHES.The
// toolbar moved into its own `TerminalToolbar` at the same time, so the hide
// is now a handler passed in rather than an inline `setOpen(false)`; what this
// pins is the part that mattered, which is that the three are still three and
// that the words on them name a command, a shell and a panel respectively.
it('keeps ordinary hiding separate from closing the shell', () => {
  const source = readFileSync('renderer/src/components/TaskTerminal.tsx', 'utf8');
  expect(source).toContain('title="Hide the terminal. The shell keeps running." onClick={onHide}');
  expect(source).toContain('onHide={()=>setOpen(false)}');
  // And the other two, which are what she could not tell apart.
  expect(source).toContain('End shell');
  expect(source).toContain('Stop command');
  expect(source).toContain('onEnd={()=>void end()}');
});
