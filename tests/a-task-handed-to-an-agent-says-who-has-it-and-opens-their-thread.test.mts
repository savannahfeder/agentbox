// A TASK HANDED TO AN AGENT SAYS WHO HAS IT, AND OPENS THEIR THREAD.
//
// Dev: "Give it to an agent" on Maya's task "Fix LUM-50" started the
// job, and after the toast went nothing on the task said an agent had it or
// where its thread was. Measured with taskHandOff: a task's hand-off carried no
// handFrom, so the new thread had no handed-from label and nothing could find
// it from the task. Now it does, and the task's row and page say "With <name>"
// and open that thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { taskHandOff, handedFromLabel } from '../renderer/src/threads/composer-rules';
import { agentOnTask, teamTasks } from '../renderer/src/team/tasks';

const brief = { body: 'Fix LUM-50: Cancel does not give the seat back.', files: [] };
const task = { id: 'w-task', product: 'dm-maya', status: 'open', title: 'Fix LUM-50', labels: ['given-task'], assignee: 'dev', createdBy: 'maya', people: ['maya', 'dev'], updatedAt: 10 };
const thread = (over = {}) => ({ id: 'w-agent', product: 'lumen', status: 'open', title: 'Maya asked:', label: 'Group slot Cancel button', labels: [handedFromLabel('dm-maya', 'w-task')], updatedAt: 20, ...over });

describe('handing a task over', () => {
  it('marks the new thread with the task it came from', () => {
    const s = taskHandOff({ from: 'Maya', brief, message: null, nameOf: () => null, handFrom: { product: 'dm-maya', id: 'w-task', message: 'first' } });
    expect(s.handFrom).toEqual({ product: 'dm-maya', id: 'w-task', message: 'first' });
  });
  it('the app hands it the task', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/handFrom: \{ product: item\.product, id: item\.id, message: message\?\.uid \?\? 'first' \}/);
  });
});

describe('who has it', () => {
  const mates = [{ id: 't-cancel', name: 'Bug fixer' }];
  it('an agent thread handed from the task: With an agent, opening it', () => {
    const on = agentOnTask([task, thread()], task, mates);
    expect(on.name).toBe('an agent');
    expect(on.item.id).toBe('w-agent');
  });
  it('an AI teammate\'s thread names the teammate', () => {
    const on = agentOnTask([task, thread({ labels: [handedFromLabel('dm-maya', 'w-task'), 'teammate:t-cancel'] })], task, mates);
    expect(on.name).toBe('Bug fixer');
  });
  it('the newest of two hand-offs, an open one first', () => {
    const on = agentOnTask([task, thread({ id: 'w-old', status: 'done', updatedAt: 30 }), thread({ id: 'w-new', updatedAt: 25 })], task, mates);
    expect(on.item.id).toBe('w-new');
  });
  it('a finished one still says where the work went', () => {
    expect(agentOnTask([task, thread({ status: 'done' })], task, mates)?.item.id).toBe('w-agent');
  });
  it('a thread handed from another task is not this one\'s', () => {
    expect(agentOnTask([task, thread({ labels: [handedFromLabel('dm-maya', 'w-other')] })], task, mates)).toBe(null);
    expect(agentOnTask([task, thread({ labels: [handedFromLabel('dm-maya', 'w-task-2')] })], task, mates)).toBe(null);
  });
  it('the Tasks row carries it', () => {
    const products = [{ slug: 'dm-maya', team: { direct: true, people: ['maya', 'dev'] } }];
    const g = teamTasks({ items: [task, thread()], products, cards: [], me: 'dev', now: 100, nameOf: (id) => id, mates });
    expect(g.open[0].agent?.item.id).toBe('w-agent');
  });
  it('the row and the task page draw it', () => {
    const page = fs.readFileSync(new URL('../renderer/src/team/TasksPage.tsx', import.meta.url), 'utf8');
    const focus = fs.readFileSync(new URL('../renderer/src/team/TeamFocus.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/With \{r\.agent\.name\}/);
    expect(focus).toMatch(/With \{on\.name\}/);
  });
});
