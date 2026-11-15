// A LONG TASK IS ROUTED ON WHAT IT ASKS, NOT ON ITS BACKGROUND.
//
// A person dictated a 2,291-character task: four paragraphs of background
// (sales calls, a launch, which day posts do best), then the ask, a research
// question, starting at character 2,026. `routePrompt` cut the body at 1,500
// characters, so the router never saw the ask. It saw areas several teammates
// cover and sent the task to the primary teammate, whose run then answered the
// role (hand this on, plan the work) instead of the question. Measured by
// finding the ask's offset in the task body against the cut.
//
// The router now reads a body whole up to 3,000 characters and, past that,
// its start and its end, where a dictated ask usually lands. Its [P] line says
// the primary is for work asked of several teammates, not for background that
// mentions what they do.
import { describe, it, expect } from 'vitest';
import { routePrompt, offerPrompt, taskForRouting, ROUTE_READS_WHOLE } from '../shared/auto-route.mts';

const team = [
  { id: 't-loom', name: 'Loom lead', job: 'Makes personalised outreach videos and books calls with teams.' },
  { id: 't-mkt', name: 'Head of Marketing', job: 'Launches, posts and their timing.' },
];
const primary = { id: 't-chief', name: 'Chief of staff', primary: true };

const ASK = 'What I want from you: a long list of the questions they will ask, real ones people were asked and ones you expect.';
const filler = (n: number) => 'We shipped a feature, could book sales calls with teams, or launch on Monday and check which day posts do best. '.repeat(Math.ceil(n / 110)).slice(0, n);
const dictated = `${filler(2026)}\n\n${ASK}`;

describe('the router reads the ask at the end of a long task', () => {
  it('sees an ask that starts past the old 1,500-character cut', () => {
    expect(dictated.indexOf(ASK)).toBeGreaterThan(1500);
    expect(routePrompt({ title: 'Prep for an interview', body: dictated }, team, [], { primary })).toContain(ASK);
  });

  it('reads a body just under the limit whole', () => {
    const body = `${filler(ROUTE_READS_WHOLE - ASK.length - 2)}\n\n${ASK}`;
    expect(body.length).toBeLessThanOrEqual(ROUTE_READS_WHOLE);
    expect(taskForRouting(body)).toBe(body.replace(/\s+/g, ' ').trim());
  });

  it('reads the start and the end of a body over the limit, and says it skipped the middle', () => {
    const start = 'START: we are a two-person team.';
    const body = `${start} ${filler(ROUTE_READS_WHOLE * 2)} ${ASK}`;
    const read = taskForRouting(body);
    expect(read.startsWith(start)).toBe(true);
    expect(read.endsWith(ASK)).toBe(true);
    expect(read).toContain('…');
    expect(read.length).toBeLessThanOrEqual(ROUTE_READS_WHOLE + 10);
  });

  it('asks the same way when it offers a teammate for the work', () => {
    expect(offerPrompt({ title: 'Prep', body: dictated }, { role: 'Coach' })).toContain(ASK);
  });
});

describe('the primary is for work asked of several teammates', () => {
  const prompt = routePrompt({ title: 'Prep', body: dictated }, team, [], { primary });
  it('still offers the primary', () => {
    expect(prompt).toContain('[P] Chief of staff');
  });
  it('says background that mentions their areas is not a reason', () => {
    expect(prompt).toMatch(/asks for work from several of the teammates above/);
    expect(prompt).toMatch(/background/i);
  });
  it('tells the router to judge by what the person asks for', () => {
    expect(prompt).toMatch(/what the person asks for/);
  });
});
