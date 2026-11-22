// AUTO GIVES A TEAMMATE ONLY WHAT THE WORDS SAY IS ITS JOB (w-36261bad16).
//
// "why do these all say not started", sent with a screenshot of the inbox, went
// to the YC Partner: "It manages the YC cohort program and tracks status on the
// batch board." The small model was handed the screenshot as its markdown,
// `![pasted-6780.png](attachments/…)`, so it guessed at what "these" were and
// matched on the word "status". The question rebuilt as it was asked at the
// time and put to claude-haiku-4-5: YC Partner 2 times in 6 (twice more it
// asked to see the image), and 2 in 4 with today's team. With the picture named
// as one it cannot see and the rule that a shared word is not a fit: an agent 6
// in 6 and 4 in 4. Five tasks that belong to a teammate or to nobody, among
// them "agents get stuck like this all the time" with its screenshot, went
// where they went before every time.
import { describe, it, expect } from 'vitest';
import { routePrompt } from '../shared/auto-route.mts';

const mate = (id: string, name: string, job: string) => ({ id, name, role: name, job, goal: null, duties: [], status: 'active', paused: false });
const team = [
  mate('t-yc', 'YC Partner', 'I run our own YC-style program and keep a board of the batch.'),
  mate('t-perf', 'Performance lead', 'Keep Agentbox from throttling your Mac, and keep its cloud runs working.'),
];
const ask = (title: string, body = '') => routePrompt({ title, body }, team, []);

describe('a picture sent with the task', () => {
  const prompt = ask('why do these all say not started', '![pasted-6780.png](attachments/mwbdcynh-52flk8-pasted-6780.png)');

  it('is named as a picture the model cannot see, not handed over as a file name', () => {
    expect(prompt).not.toContain('pasted-6780.png');
    expect(prompt).not.toContain('attachments/');
    expect(prompt).toContain('why do these all say not started\n(a picture you cannot see)');
  });

  it('is named once for each picture, with the words around them kept', () => {
    const two = ask('compare these', 'before ![a.png](attachments/a.png) and after ![b.jpg](attachments/b.jpg) the change');
    expect(two).toContain('before (a picture you cannot see) and after (a picture you cannot see) the change');
  });

  it('leaves a link to a document alone', () => {
    expect(ask('read this', 'see [the plan](docs/plan.md) first')).toContain('see [the plan](docs/plan.md) first');
  });
});

describe('the rule the model is given', () => {
  const prompt = ask('make the clip');

  it('says a word in common is not a fit', () => {
    expect(prompt).toContain('A word the task shares with a job is not a fit');
  });

  it('says a task whose words alone do not name the job goes to an agent', () => {
    expect(prompt).toContain('When the words alone do not say what the task is about, as when they\npoint at a picture you cannot see, answer 0.');
  });

  it('says to look at the pictures when they are sent with it', () => {
    const seen = routePrompt({ title: 'why do these all say not started', body: '![a.png](attachments/a.png)' }, team, [], { pictures: true });
    expect(seen).toContain('why do these all say not started\n(a picture, attached)');
    expect(seen).toContain('The pictures attached are part of the task');
    expect(seen).not.toContain('a picture you cannot see');
  });

  // w-064dd249d2: "How complex would it be for us to do something like that?",
  // about a cloud browser that keeps logins, went to the Performance lead
  // because its job says "cloud" and "keep work off the Mac".
  it('says an idea for something new is not the job of a teammate who keeps something working', () => {
    expect(prompt).toMatch(/An idea for something new, or a question about how hard it would be to\nbuild, goes to a teammate only when its job is building that very thing\./);
    expect(prompt).toMatch(/A job of watching or fixing a part of the app is not building something\nnew in that part: answer 0\./);
  });
});
