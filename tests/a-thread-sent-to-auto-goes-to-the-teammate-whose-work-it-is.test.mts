// A THREAD SENT TO AUTO GOES TO THE TEAMMATE WHOSE WORK IT IS (w-b5f23cff71).
//
// "I couldn't remember which agent held which context ... There was a growth
// marketer agent and a video production agent and I was like, 'I don't know
// which one is best.' Routing should probably just be done automatically."
// Approved as drawn (designs 83 to 88): New thread has Auto in To; the small
// model reads each teammate's job and recent threads and names who takes it,
// an agent when nobody's job covers it, or asks the person when two fit. Your
// words go through as written, and the model you picked is the one it runs on.
//
// These are the pure rules (shared/auto-route.mts): the question asked, the
// reply read back, and what the thread's row becomes.
import { describe, it, expect } from 'vitest';
import {
  AUTO_LABEL, AGENT_WHY, isAuto, asksWho, routeCandidates, routePrompt, readRoute, routedPatch,
} from '../shared/auto-route.mts';
import { cleanRouted } from '../shared/work-items.mts';

const mate = (id, name, extra = {}) => ({ id, name, role: null, job: null, goal: null, duties: [], status: 'active', paused: false, ...extra });
const video = mate('t-video', 'Video producer', { job: 'Makes the clips and owns the engine that renders them.' });
const growth = mate('t-growth', 'Growth marketer', { job: "Picks the day's feature and writes the post.", duties: [{ what: 'Pick tomorrow\'s feature' }] });
const team = [video, growth];
const run = (id, by, title, status = 'done', updatedAt = 1) => ({ id, product: 'p', labels: ['founder', `teammate:${by}`], title, status, updatedAt });
const thread = (extra = {}) => ({ id: 'w-new', product: 'p', title: 'Make a clip of Codex picking up a thread when Claude runs out.', body: '', labels: ['founder', AUTO_LABEL], status: 'open', ...extra });

describe('who a thread can go to', () => {
  it('is every teammate that is set up and working', () => {
    expect(routeCandidates([video, growth, mate('t-p', 'Paused', { paused: true }), mate('t-d', 'Draft', { status: 'draft' }), mate('t-e', 'Gone', { endedAt: 5 })]).map((t) => t.id))
      .toEqual(['t-video', 't-growth']);
  });
});

describe('the question the small model is asked', () => {
  const prompt = routePrompt(thread(), team, [run('w-1', 't-video', 'Clip: how much Claude and Codex you have left', 'done', 9), run('w-2', 't-growth', 'Post for the usage meter', 'done', 8)]);

  it('names each teammate with its job, what it does on its own and its newest threads', () => {
    expect(prompt).toContain('[1] Video producer.');
    expect(prompt).toContain('Job: Makes the clips and owns the engine that renders them.');
    expect(prompt).toContain('[2] Growth marketer.');
    expect(prompt).toContain("Does on its own: Pick tomorrow's feature");
    expect(prompt).toContain('Recent threads: "Clip: how much Claude and Codex you have left"');
    expect(prompt).toContain('[0] None of them: an ordinary coding agent does it.');
  });

  it('carries the task as written', () => {
    expect(prompt).toContain('Make a clip of Codex picking up a thread when Claude runs out.');
  });

  it('leaves out a teammate it was not given', () => {
    expect(routePrompt(thread(), [growth], [])).not.toContain('Video producer');
  });
});

describe('the reply, read back', () => {
  it('gives it to the teammate named, with the reason as one sentence', () => {
    expect(readRoute('1 | It made the last four clips and runs the clip engine', team))
      .toEqual({ to: 'mate:t-video', why: 'It made the last four clips and runs the clip engine.' });
  });

  it('gives it to an agent on 0, in the app\'s own words', () => {
    expect(readRoute('0 | -', team)).toEqual({ to: 'agent', why: AGENT_WHY });
  });

  it('asks the person when it names two', () => {
    expect(readRoute('1,2 | Both have worked on the captions.', team))
      .toEqual({ ask: ['mate:t-video', 'mate:t-growth'], why: 'Both have worked on the captions.' });
  });

  it('takes the same teammate named twice as one', () => {
    expect(readRoute('2,2 | It writes the posts.', team)).toEqual({ to: 'mate:t-growth', why: 'It writes the posts.' });
  });

  it('is no answer for a number past the list, an agent paired with a teammate, prose, or nothing', () => {
    for (const reply of ['3 | It does.', '0,1 | Either.', 'I think Video producer should take this.', '', 'Video producer | It does.']) {
      expect(readRoute(reply, team), reply).toBeNull();
    }
  });
});

describe('what the thread becomes', () => {
  it('goes to the teammate: Auto comes off, its label goes on, the rest stay', () => {
    const patch = routedPatch(thread({ labels: ['founder', AUTO_LABEL, 'ship'] }), { to: 'mate:t-video', why: 'It made the clips.' }, { now: 5 });
    expect(patch.labels).toEqual(['founder', 'ship', 'teammate:t-video']);
    expect(patch.routed).toEqual({ to: 'mate:t-video', why: 'It made the clips.', at: 5, by: 'auto' });
    expect(patch).not.toHaveProperty('start');
  });

  it('waits behind the teammate\'s own run when it already has one going', () => {
    const patch = routedPatch(thread(), { to: 'mate:t-video', why: 'x' }, { items: [run('w-busy', 't-video', 'Rendering', 'claimed')] });
    expect(patch.start).toBe('later');
  });

  it('goes to an agent with no teammate label at all', () => {
    expect(routedPatch(thread(), { to: 'agent', why: AGENT_WHY }).labels).toEqual(['founder']);
  });

  it('keeps Auto on while it asks, so nothing starts it', () => {
    const patch = routedPatch(thread(), { ask: ['mate:t-video', 'mate:t-growth'], why: 'Both.' });
    expect(patch.labels).toContain(AUTO_LABEL);
    expect(asksWho({ ...thread(), ...patch })).toBe(true);
  });

  it('given to someone else, swaps the teammate rather than adding one', () => {
    const was = thread({ labels: ['founder', 'teammate:t-video'] });
    expect(routedPatch(was, { to: 'mate:t-growth', why: 'You picked it.' }, { by: 'you' }).labels).toEqual(['founder', 'teammate:t-growth']);
    expect(isAuto(was)).toBe(false);
  });

  it('never touches the words', () => {
    const patch = routedPatch(thread(), { to: 'mate:t-video', why: 'x' });
    for (const field of ['title', 'body', 'answer', 'result', 'note', 'model', 'engine']) expect(patch).not.toHaveProperty(field);
  });
});

describe('through the real store', () => {
  it('keeps her words as she wrote them and is the teammate\'s from then on', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { loadStore } = await import('../main/store-modules.mts');
    const { workItemsDisk } = await loadStore();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-route-store-'));
    const made = workItemsDisk.createWorkItem(dir, { title: 'Make a clip', kind: 'directive', labels: ['founder', AUTO_LABEL] }, { source: 'system' });
    workItemsDisk.updateWorkItem(dir, made.id, { title: 'Make a clip', body: 'Make a clip of Codex picking up a thread.', model: 'opus' }, { source: 'founder' });
    const before = workItemsDisk.readWorkItem(dir, made.id);
    workItemsDisk.updateWorkItem(dir, made.id, routedPatch(before, { to: 'mate:t-video', why: 'It made the clips.' }, { now: 7 }), { source: 'system' });
    const after = workItemsDisk.readWorkItem(dir, made.id);
    expect(after.labels).toEqual(['founder', 'teammate:t-video']);
    expect(after.routed).toEqual({ to: 'mate:t-video', why: 'It made the clips.', at: 7, by: 'auto' });
    expect([after.title, after.body, after.model]).toEqual(['Make a clip', 'Make a clip of Codex picking up a thread.', 'opus']);
    // An agent can still put `ship` on it afterwards: the route did not lock the labels.
    workItemsDisk.updateWorkItem(dir, made.id, { labels: [...after.labels, 'ship'] }, { source: 'agent' });
    expect(workItemsDisk.readWorkItem(dir, made.id).labels).toContain('ship');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the routed field as the store keeps it', () => {
  it('keeps a decision and a question', () => {
    expect(cleanRouted({ to: 'mate:t-video', why: 'It does.', at: 3, by: 'auto' })).toEqual({ to: 'mate:t-video', why: 'It does.', at: 3, by: 'auto' });
    expect(cleanRouted({ ask: ['mate:a', 'mate:b'], why: 'Both.', at: 3 })).toEqual({ ask: ['mate:a', 'mate:b'], why: 'Both.', at: 3, by: 'auto' });
  });

  it('refuses anything else', () => {
    for (const bad of [null, 'agent', [], { to: 'someone' }, { ask: ['x y'] }, { to: 'mate:../../etc' }]) expect(cleanRouted(bad)).toBeUndefined();
  });
});
