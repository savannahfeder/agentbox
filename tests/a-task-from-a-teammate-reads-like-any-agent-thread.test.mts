// A task Lena handed over, once given to an agent, drew as a chat: no title, the column and the reply box
// across the whole window, and the strip naming the agent's thread "Lena wrote: [List page empty state](https://…/w-…)".
// Read in App.tsx: the thread page skipped everything in a conversation's record, and a task lives there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { taskHandOff } from '../renderer/src/threads/composer-rules';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('which pages a conversation\'s record draws as a thread', () => {
  it('a task someone gave you, like any agent thread', () => {
    expect(app).toMatch(/const onePage = !!focused && \(!directSlugs\.has\(focused\.product\) \|\| isTaskRow\(focused\)\);/);
  });
  it('but the talk itself keeps its chat', () => {
    expect(app).toMatch(/!directSlugs\.has\(focused\.product\) \|\|/);
  });
});

const brief = { title: 'List page empty state', body: 'Add an empty state to the list page.', files: [] };
const nameOf = (id: string) => ({ lena: 'Lena', priya: 'Priya' } as Record<string, string>)[id] ?? null;
const link = '[List page empty state](https://app.agentbox.ac/t/9d28b5aa/w-13bcecdebe)';

describe('the thread you start from a message on the task', () => {
  it('is called what the task is called, not the message\'s first line', () => {
    const s = taskHandOff({ from: 'Lena', brief, message: { text: `${link}\n\nTwo commits on this branch, please list them.`, by: 'lena' }, nameOf });
    expect(s.named).toBe('List page empty state');
    expect(s.body.split('\n')[0]).toBe('List page empty state');
  });
  it('keeps the words of the message as they were written', () => {
    const s = taskHandOff({ from: 'Lena', brief, message: { text: 'Two asks: phone width, and 21?', by: 'priya' }, nameOf });
    expect(s.body).toBe('List page empty state\n\nPriya wrote: Two asks: phone width, and 21?\n\n');
    expect(s.named).toBe('List page empty state');
  });
  it('with no name on the task, is named from its words as before', () => {
    const s = taskHandOff({ from: 'Lena', brief: { ...brief, title: '' }, message: { text: 'Two asks.', by: 'lena' }, nameOf });
    expect(s.named).toBeUndefined();
    expect(s.body).toBe('Lena wrote: Two asks.\n\n');
  });
});
