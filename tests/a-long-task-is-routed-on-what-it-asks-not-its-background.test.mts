// A LONG TASK IS ROUTED ON WHAT IT ASKS, NOT ON ITS BACKGROUND (w-fa44760932).
//
// A dictated task of 2,291 characters went to the Chief of staff, "It needs
// the Loom outreach, a launch-timing check and the YC program's context
// together", when all it asked for was research. routePrompt cut the body at
// 1,500 characters and the ask began at character 2,026, so the small model
// saw only the paragraphs of background, which touch several teammates' jobs,
// and took [P] "only when the task needs several of the teammates above". The
// body below is made up with the same shape, because the real one is private:
// background first that names outreach calls, a launch and post timing, the
// ask in the last paragraph.
import { describe, it, expect } from 'vitest';
import { routePrompt } from '../shared/auto-route.mts';

const mate = (id: string, name: string, job: string) => ({ id, name, role: name, job, goal: null, duties: [], status: 'active', paused: false });
const team = [
  mate('t-loom', 'Loom lead', 'I make the personalized outreach Looms and book the calls they lead to.'),
  mate('t-launch', 'Launch lead', 'I plan our launches and the films and posts that go with them.'),
  mate('t-yc', 'YC Partner', 'I run our own YC-style program and keep a board of the batch.'),
];
const chief = { ...mate('t-chief', 'Chief of staff', 'Be the main point of contact.'), primary: true };

const ASK = "What I want from you is a really good idea of the questions they'll ask in the meeting. Give me lots of examples, real ones people have been asked and ones you think they might ask, so I can practise.";
const background = [
  'I have an investor meeting on Tuesday and I want to prepare properly for it. People keep saying the best thing you can do is show progress between applying and the meeting.',
  'We just shipped team mode. One way to show progress would be to book a lot of sales calls with teams this week from the outreach videos, so I could say we have ten calls lined up since Saturday.',
  'I could also launch the cloud version on Monday, though a Monday post might travel less. I could check the numbers on which day posts tend to do best, which is another way to push before the meeting.',
  'A launch the day before would leave me tired, and I only have two days to prepare, so I would rather not spend them getting a big launch ready and fixing the phone app.',
];
const body = (paras: string[]) => [...paras, ASK].join('\n\n');
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const taskIn = (prompt: string) => prompt.slice(prompt.indexOf('--- the task ---'));

describe('a long task whose ask comes last', () => {
  const long = body([...background, ...background, ...background, ...background, ...background]);

  it('is longer than the old cut, with its ask past it', () => {
    expect(long.length).toBeGreaterThan(3000);
    expect(long.indexOf(ASK)).toBeGreaterThan(1500);
  });

  it('reaches the router with its ask whole', () => {
    expect(taskIn(routePrompt({ title: 'Investor meeting prep', body: long }, team, [], { primary: chief }))).toContain(ASK);
  });

  it('keeps its opening too, so the router knows what it is about', () => {
    expect(taskIn(routePrompt({ title: 'Investor meeting prep', body: long }, team, [], { primary: chief }))).toContain(flat(background[0]));
  });

  it('says where the middle was left out', () => {
    expect(taskIn(routePrompt({ title: 't', body: long }, team, []))).toContain('(the middle of a long task is left out here)');
  });

  it('keeps the task part of the prompt small whatever its length', () => {
    const huge = body(Array(40).fill(background).flat());
    expect(taskIn(routePrompt({ title: 't', body: huge }, team, [])).length).toBeLessThan(3600);
    expect(taskIn(routePrompt({ title: 't', body: huge }, team, []))).toContain(ASK);
  });
});

describe('a task about as long as the one that was misrouted', () => {
  it('is handed over whole, ask and all', () => {
    const real = body(background.map((p) => `${p} ${p.slice(0, 220)}`));
    expect(real.length).toBeGreaterThan(1500);
    expect(real.length).toBeLessThan(3000);
    const task = taskIn(routePrompt({ title: 't', body: real }, team, []));
    expect(task).toContain(flat(real));
    expect(task).not.toContain('left out here');
  });
});

describe('the edge of the cut', () => {
  const sized = (n: number) => `${'word '.repeat(Math.ceil(n / 5)).slice(0, n - ASK.length - 1).replace(/ $/, 's')} ${ASK}`;

  it('hands over a body of exactly 3000 characters whole', () => {
    const b = sized(3000);
    expect(b.length).toBe(3000);
    expect(taskIn(routePrompt({ title: 't', body: b }, team, []))).not.toContain('left out here');
  });

  it('cuts a body of 3001 characters in the middle and keeps the ask', () => {
    const b = sized(3001);
    expect(b.length).toBe(3001);
    const task = taskIn(routePrompt({ title: 't', body: b }, team, []));
    expect(task).toContain('left out here');
    expect(task).toContain(ASK);
  });
});

describe('what the router is told about the primary', () => {
  const prompt = routePrompt({ title: 'Investor meeting prep', body: body(background) }, team, [], { primary: chief });

  it('takes the primary only when the person asks for work from several teammates', () => {
    expect(flat(prompt)).toContain('only when the person asks, in this task, for work from several of the teammates above');
    expect(prompt).not.toContain('only when the task needs several of the teammates above');
  });

  it('says background that mentions their jobs is not that', () => {
    expect(flat(prompt)).toContain('Background that only mentions what teammates do is not that.');
  });

  it('says to decide on what is asked, which a long task often keeps to the end', () => {
    expect(flat(prompt)).toContain("Decide on what the person asks to be done, which a long task often says last. What they tell you along the way, what they did, weighed or might do, is context, not the ask.");
  });

  it('still offers the primary for a task that asks for several teammates’ work', () => {
    const spans = routePrompt({ title: 'Get the launch ready: book ten calls from the Looms, plan the Monday launch, and update the batch board.' }, team, [], { primary: chief });
    expect(spans).toContain('[P] Chief of staff, their primary teammate');
    expect(spans).toContain('  P | It needs a clip, the post and a fix.');
    expect(spans).toContain('book ten calls from the Looms, plan the Monday launch, and update the batch board.');
  });

  it('offers no primary when there is none', () => {
    expect(routePrompt({ title: 't', body: body(background) }, team, [])).not.toContain('[P]');
  });
});
