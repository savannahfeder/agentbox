// A QUESTION ABOUT REBUILDING TO FIX A TEAMMATE'S PROBLEM GOES TO THAT TEAMMATE.
//
// "Within 20 minutes of me using it, it starts to lag constantly ... Would it
// help to rebuild it in Rust or something like that? Are there big decisions
// we can make to really make it maximally smooth?" was sent To Auto and went
// to an agent, with a Performance lead on the team whose three newest threads
// were about the app being slow. The rule that an idea for something new is
// not the job of a teammate who watches or fixes that part read the rebuild
// question as something new.
//
// The question rebuilt as it was asked that morning (the team's jobs as they
// read, the Performance lead's six newest threads) and put to Haiku: an agent
// 6 times in 6, and both runs asked why quoted that rule. With the sentence
// that a problem a teammate already works on stays its own: the Performance
// lead 6 in 6, three of them with its newest threads only its daily checks
// (0 in 3 before). "The security scan keeps going red ... do we need to
// rebuild how we scan" went to the Security lead 3 in 3 (2 in 3 before). What
// the first rule was written for still went to an agent, 3 in 3 each: the
// cloud browser question (w-064dd249d2), an idea for a frames-per-second
// meter, and rebuilding the website.
//
// Haiku answered as a subagent reading the question from a file, because
// `claude -p` has no sign-in on a cloud machine.
import { describe, it, expect } from 'vitest';
import { routePrompt } from '../shared/auto-route.mts';

const mate = (id: string, name: string, job: string) => ({ id, name, role: name, job, goal: null, duties: [], status: 'active', paused: false });
const team = [
  mate('t-perf', 'Performance lead', 'Keep Agentbox from throttling your Mac, and keep its cloud runs working.'),
  mate('t-sec', 'Security lead', 'I keep Agentbox secure, following docs/security-checks.md.'),
];
const prompt = routePrompt({ title: 'It lags after 20 minutes', body: 'Would it help to rebuild it in Rust? Are there big decisions we can make to make it smooth?' }, team, []);

describe('the rule the model is given about something new', () => {
  it('says a problem a teammate already works on stays its own, even when the task asks about rebuilding to fix it', () => {
    expect(prompt).toContain("A problem a teammate already works on is different: a task asking how to\nfix it for good, even by rebuilding or rewriting, is that teammate's.");
  });

  it('says it straight after the rule it is the exception to', () => {
    const lines = prompt.split('\n');
    const rule = lines.indexOf('new in that part: answer 0.');
    expect(rule).toBeGreaterThan(-1);
    expect(lines[rule + 1]).toBe('A problem a teammate already works on is different: a task asking how to');
  });

  // The case the first rule was written for (w-064dd249d2) still has its words.
  it('still says an idea for something new is not the job of a teammate who keeps something working', () => {
    expect(prompt).toMatch(/An idea for something new, or a question about how hard it would be to\nbuild, goes to a teammate only when its job is building that very thing\./);
    expect(prompt).toMatch(/A job of watching or fixing a part of the app is not building something\nnew in that part: answer 0\./);
  });

  it('keeps the rule that being unsure goes to an agent', () => {
    expect(prompt).toContain('When unsure between a teammate and\nnone, answer 0.');
  });
});
