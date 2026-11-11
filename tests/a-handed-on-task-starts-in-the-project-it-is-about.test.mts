// A HANDED-ON TASK STARTS IN THE PROJECT IT IS ABOUT, OR ASKS.
//
// A tester pressed Hand to agent on a Web app task given to him and the card
// opened on Payments API, his backend project; sending without looking would
// have run it there. Continue on a teammate's thread did the same when Web app
// was not shared with him. Measured in App.tsx `handToAgent`: `taskHandOff`
// returned no project, so ThreadComposer fell back to the project on screen (the
// Direct record, never offered), then the remembered one, then the first. The
// task's body carries the link to the thread it was given from, and that
// thread's card names its project.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cardProject, handOffProject, taskHandOff } from '../renderer/src/threads/composer-rules';
import { continueStart } from '../renderer/src/threads/continue-thread';

const shared = { projectId: 'p1', teamId: 't1' };
const projects = [
  { slug: 'payments-api', name: 'Payments API' },
  { slug: 'web-app', name: 'Web app', team: shared },
  { slug: 'practice', name: 'Practice', practice: true },
  { slug: 'direct-sam', name: 'Sam', team: { direct: true } },
];
const cards = [
  { personId: 'u-sam', threadId: 'w-checkout', project: 'Web app' },
  { personId: 'u-sam', threadId: 'w-mobile', project: 'Mobile app' },
];
const link = (id) => `[Checkout handoff](https://app.agentbox.ac/t/u-sam/${id})`;

describe('the project a handed-on task runs in', () => {
  it('is the project of the thread it was handed from, when you have it', () => {
    expect(handOffProject({ words: `${link('w-checkout')}\n\nFinish the form.`, cards, offered: projects })).toBe('web-app');
  });
  it('is the project its words name, when the thread says nothing you have', () => {
    expect(handOffProject({ words: 'Wire the refund button in web app to the new endpoint.', cards, offered: projects })).toBe('web-app');
  });
  // Round four: Lena handed Theo a Web app thread whose words also named his Payments API, and it opened on Payments API.
  it('asks when it was handed from a thread in a project you do not have, whatever its words name', () => {
    expect(handOffProject({ words: `${link('w-mobile')}\n\nThe Payments API needs a retry.`, cards, offered: projects })).toBeNull();
  });
  it('is nobody when nothing points at one of yours', () => {
    expect(handOffProject({ words: 'Finish the checkout form.', cards, offered: projects })).toBeNull();
    expect(handOffProject({ words: link('w-gone'), cards, offered: projects })).toBeNull();
  });
  it('never a project you cannot see, the practice one, or a conversation', () => {
    expect(handOffProject({ words: link('w-mobile'), cards, offered: projects })).toBeNull();
    expect(handOffProject({ words: 'Do the practice task', cards, offered: projects })).toBeNull();
    expect(handOffProject({ words: 'Ask Sam about it', cards, offered: projects })).toBeNull();
  });
  it('is nobody when the words name two of yours, rather than a guess', () => {
    expect(handOffProject({ words: 'Move the call from Web app to Payments API.', cards, offered: projects })).toBeNull();
  });
  it('does not take a name inside another word', () => {
    expect(handOffProject({ words: 'the webapp folder', cards, offered: projects })).toBeNull();
  });
});

describe('Hand to agent on a task', () => {
  const nameOf = () => null;
  it('opens on that project', () => {
    const s = taskHandOff({ from: 'Sam', brief: { title: 'Checkout handoff', body: `${link('w-checkout')}\n\nFinish it.`, files: [] }, message: null, nameOf, offered: projects, cards });
    expect(s.product).toBe('web-app');
    expect(s.chooseProject).toBeUndefined();
  });
  it('asks for one when nothing names one of yours', () => {
    const s = taskHandOff({ from: 'Sam', brief: { title: 'Checkout', body: 'Finish it.', files: [] }, message: null, nameOf, offered: projects, cards });
    expect(s.product).toBeUndefined();
    expect(s.chooseProject).toBe(true);
  });
});

describe('Continue on a teammate\'s thread', () => {
  const brief = { title: 'Checkout', body: 'Carry on', files: [], from: { personId: 'u-sam', threadId: 'w-mobile' } };
  it('asks for a project when you have none of its name, rather than taking the first', () => {
    const s = continueStart(brief, { project: 'Mobile app' }, projects);
    expect(s.product).toBeNull();
    expect(s.chooseProject).toBe(true);
  });
  it('asks nothing when you have it', () => {
    expect(continueStart(brief, { project: 'Web app' }, projects).chooseProject).toBeUndefined();
  });
});

describe('the card that must ask', () => {
  it('points at no project until one is picked, whatever was on screen or last used', () => {
    expect(cardProject(projects, { picked: null, defaultProduct: 'payments-api', remembered: 'payments-api', mustChoose: true })).toBeNull();
    expect(cardProject(projects, { picked: 'web-app', defaultProduct: 'payments-api', mustChoose: true })?.slug).toBe('web-app');
    expect(cardProject(projects, { picked: null, defaultProduct: 'payments-api' })?.slug).toBe('payments-api');
  });
  it('opens with the project menu up, Send off until a project is picked, and no "nowhere to send" line', () => {
    const src = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/mustChoose: !!initial\?\.chooseProject/);
    expect(src).toMatch(/useState<MenuKey \| null>\(\(\) => \(initial\?\.chooseProject \? 'project' : null\)\)/);
    expect(src).toMatch(/canSend = [^\n]*!!product/);
    expect(src).toMatch(/const stopper = initial\?\.chooseProject && offered\.length \? null : noProjectYet/);
  });
  it('the app hands the task its projects and the cards that name them', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/taskHandOff\(\{ from, brief: b, message: message \?\? null, nameOf[^\n]*\n[^\n]*offered: snap\?\.products \?\? \[\], cards: snap\?\.team\?\.cards \?\? \[\]/);
  });
});
