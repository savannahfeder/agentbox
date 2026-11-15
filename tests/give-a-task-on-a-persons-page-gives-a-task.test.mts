// GIVE A TASK ON A PERSON'S PAGE GIVES A TASK.
//
// Measured on a team copy, 2026-11-02: Give a task on Dev's page opened New
// thread addressed to Dev but set to send a message, so what was written went
// on the end of your conversation with him, and the Team page's Tasks said "No
// open tasks on the team" right after a task had been given.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

it('opens New thread set to send a task', () => {
  const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
  expect(app).toMatch(/setComposeInitial\(\{ to: id, sendAs: 'task' \}\); setModal\('compose'\); \}\} title=\{`A new task for \$\{first\}`\}>Give a task</);
  expect(app).not.toMatch(/setComposeInitial\(\{ to: id \}\); setModal\('compose'\); \}\} title=\{`A new thread for \$\{first\}`\}>Give a task/);
});
