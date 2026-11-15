// A task left on Agent decides is given a level by the small model.
//
// The person left most tasks on Medium when they did not want to choose
// (w-f3683346f9): "it would be nice if the agent could determine the priority
// of a task in those cases." Both new task cards sent an untouched level as 5,
// the same number as a deliberate Medium, so nothing could tell the two apart
// and nothing ever asked. The cards now open on Agent decides and send 0, and
// the supervisor asks the namer's model for High, Medium or Low, written as an
// agent so the person's own pick still wins. Measured by reading the cards'
// send paths (both sent `: 5`) and by the tick, which had no such pass.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanLevel, levelPrompt, levelTask, wantsLevel, GUESSED_LEVELS } from '../main/task-priority.mts';
import { Supervisor } from '../main/supervisor.mts';
import { AGENT_DECIDES, choiceLabelOf, sentPriority, startingPriority } from '../renderer/src/priority.ts';

const ME = 'me-1';
const task = (over = {}) => ({
  id: 'w-1', product: 'app', status: 'open', title: 'Fix the login page', body: '',
  priority: 0, createdBy: ME, createdAt: 1, labels: ['founder'], wrote: { priority: { source: 'system', ts: 1 } }, ...over,
});
const project = { slug: 'app', team: null };
const direct = { slug: 'direct-1', team: { direct: true } };

describe('which tasks are asked about', () => {
  it('a live task with no level is', () => {
    expect(wantsLevel(task(), project, ME)).toBe(true);
    expect(wantsLevel(task({ status: 'claimed' }), project, ME)).toBe(true);
    expect(wantsLevel(task({ priority: undefined }), project, ME)).toBe(true);
    expect(wantsLevel(task(), project, null)).toBe(true);
  });

  it('a task with a level, from anyone, is not', () => {
    expect(wantsLevel(task({ priority: 5 }), project, ME)).toBe(false);
    expect(wantsLevel(task({ priority: 2 }), project, ME)).toBe(false);
    expect(wantsLevel(task({ wrote: { priority: { source: 'founder', ts: 2 } } }), project, ME)).toBe(false);
  });

  it('a finished task, a conversation or a teammate\'s task is not', () => {
    expect(wantsLevel(task({ status: 'done' }), project, ME)).toBe(false);
    expect(wantsLevel(task({ product: 'direct-1' }), direct, ME)).toBe(false);
    expect(wantsLevel(task({ createdBy: 'them' }), project, ME)).toBe(false);
    expect(wantsLevel(task({ title: '', body: '' }), project, ME)).toBe(false);
  });

  it('a task given to a person in a conversation still is', () => {
    expect(wantsLevel(task({ product: 'direct-1', labels: ['founder', 'given-task'] }), direct, ME)).toBe(true);
  });
});

describe('the answer', () => {
  it('reads the three words, whatever their case or quotes', () => {
    expect(cleanLevel('High')).toBe('high');
    expect(cleanLevel('"low."')).toBe('low');
    expect(cleanLevel('**medium**\nbecause')).toBe('medium');
  });

  it('never takes Urgent, or anything that is not a level', () => {
    expect(cleanLevel('urgent')).toBe('');
    expect(cleanLevel('It depends')).toBe('');
    expect(cleanLevel('')).toBe('');
    expect(Object.values(GUESSED_LEVELS)).toEqual([7, 5, 2]);
  });

  it('asks about the task itself, and only a bounded amount of it', () => {
    const prompt = levelPrompt(task({ body: `Login is down. ${'x'.repeat(5000)}` }));
    expect(prompt).toContain('Fix the login page');
    expect(prompt).toContain('Login is down.');
    expect(prompt).toMatch(/high, medium or low/);
    expect(prompt.length).toBeLessThan(2500);
  });

  it('resolves to nothing on a failed run', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-level-'));
    const bin = path.join(dir, 'claude');
    fs.writeFileSync(bin, '#!/bin/sh\nprintf "high\\n"\nexit 1\n', { mode: 0o755 });
    expect(await levelTask(task(), { claudeBin: bin })).toBe('');
    fs.writeFileSync(bin, '#!/bin/sh\nprintf "High\\n"\nexit 0\n', { mode: 0o755 });
    expect(await levelTask(task(), { claudeBin: bin })).toBe('high');
  });

  it('gets a level from the stand-in the power test runs, by the task\'s own words', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-level-stub-'));
    const bin = path.join(dir, 'claude');
    const stub = new URL('../scripts/lib/stub-claude-worker.mjs', import.meta.url).pathname;
    fs.writeFileSync(bin, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(stub)} "$@"\n`, { mode: 0o755 });
    const ask = (title) => levelTask(task({ title }), { claudeBin: bin });
    expect(await ask('The checkout page is down for everyone')).toBe('high');
    expect(await ask('An idea: tidy the readme someday')).toBe('low');
    expect(await ask('Add a CSV export to the tide table')).toBe('medium');
  });
});

describe('the supervisor ranks one task at a time', () => {
  const rig = (answers) => {
    const writes = [];
    const asked = [];
    const sup = Object.create(Supervisor.prototype);
    sup.config = { claudeBin: '/bin/false' };
    sup._memoryCritical = () => false;
    sup.store = { listProducts: () => [project], prioritizeItem: (slug, id, value) => writes.push({ slug, id, value }) };
    sup._askLevel = async (item) => { asked.push(item.id); return answers.shift() ?? ''; };
    return { sup, writes, asked };
  };

  it('writes the level it was given onto the newest task', async () => {
    const { sup, writes } = rig(['low']);
    await sup.levelTheTasks([task(), task({ id: 'w-2', createdAt: 2 })], ME, 1000);
    expect(writes).toEqual([{ slug: 'app', id: 'w-2', value: 2 }]);
  });

  it('starts no second call while one is out', async () => {
    const { sup, asked } = rig(['high', 'high']);
    const first = sup.levelTheTasks([task()], ME, 1000);
    sup.levelTheTasks([task({ id: 'w-2' })], ME, 1000);
    await first;
    expect(asked).toEqual(['w-1']);
  });

  it('waits ten minutes after a miss, and stops after three', async () => {
    const { sup, asked } = rig([]);
    const min = 60_000;
    await sup.levelTheTasks([task()], ME, 0);
    await sup.levelTheTasks([task()], ME, 9 * min);
    expect(asked).toHaveLength(1);
    await sup.levelTheTasks([task()], ME, 10 * min);
    await sup.levelTheTasks([task()], ME, 20 * min);
    await sup.levelTheTasks([task()], ME, 30 * min);
    await sup.levelTheTasks([task()], ME, 90 * min);
    expect(asked).toHaveLength(3);
  });

  it('is wired into the tick', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    expect(src).toMatch(/this\.levelTheTasks\(items, process\.env\.AGENTBOX_PERSON_ID, now\)/);
  });
});

describe('the new task cards', () => {
  it('open on Agent decides and send it as untagged', () => {
    expect(startingPriority(undefined)).toBe(null);
    expect(choiceLabelOf(null)).toBe(AGENT_DECIDES.label);
    // The approved wording, title case like the four levels under it.
    expect(AGENT_DECIDES.label).toBe('Agent Decides');
    expect(sentPriority(null)).toBe(0);
    expect(sentPriority('medium')).toBe(5);
    expect(sentPriority('urgent')).toBe(9);
  });

  for (const file of ['renderer/src/threads/ThreadComposer.tsx', 'renderer/src/components/Compose.tsx']) {
    it(`${file} sends the card's choice through sentPriority, never a fixed 5`, () => {
      const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(src).toMatch(/sentPriority\(prio\)/);
      expect(src).not.toMatch(/prio \? priorityValueOf\(prio\) : 5/);
    });
  }

  it('offer Agent decides in the menu, and the reply box does not', () => {
    const compose = fs.readFileSync(new URL('../renderer/src/components/Compose.tsx', import.meta.url), 'utf8');
    const threads = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(compose).toMatch(/<PriorityPicker[^>]*\bagent\b/s);
    expect(threads).toMatch(/AGENT_DECIDES\.label/);
    expect(focus).not.toMatch(/<PriorityPicker[^/]*\bagent\b/);
  });
});
