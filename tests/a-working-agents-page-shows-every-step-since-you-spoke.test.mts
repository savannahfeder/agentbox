// A WORKING AGENT'S PAGE SHOWS EVERY STEP SINCE YOU SPOKE (w-e10a618747).
//
// The founder: for a thread waiting on review, the page leading with the answer
// and folding what the agent did is right, but "for in progress tasks I usually
// go there to see what the agent is up to so only seeing the last step doesn't
// work". Read in ItemThread.tsx and measured with these rules on a running
// thread (your ask, "Picked this up.", a command, "Now the tests.", a command):
// `newestAnswer` was the agent's newest sentence, `standsAt` was -1 because
// nothing of yours came after it, and `earlierCount` put the other two messages
// behind "Show 2 earlier messages". So the page drew one sentence, and every
// new sentence the agent said replaced the one before it.
//
// Now, while a session is up, the page starts where this round began: the
// answer your newest message or pick followed on from, or the top when the
// agent had said nothing before it. Everything since is drawn as the thread,
// with the thinking mark at its foot. Once the run ends the page leads with the
// answer again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workingFrom, standsAt, newestAnswer, earlierThan } from '../renderer/src/one-thing-at-a-time.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const thread = fs.readFileSync(path.join(root, 'renderer/src/components/ItemThread.tsx'), 'utf8');

const you = (at, text) => ({ at, who: 'you', text });
const it_ = (at, text) => ({ at, who: 'it', text });
const work = (at) => ({ kind: 'work', at, verb: 'ran', subject: 'npm test', output: '', lines: 0, failed: false });
const picked = (at) => ({ kind: 'work', at, verb: 'Picked', subject: 'Ship it', output: '', lines: 0, failed: false, yours: true, answers: true });

describe('where the page starts while an agent works', () => {
  it('at the top on a first run, so the ask and every step are drawn', () => {
    const events = [you(1, 'fix the sidebar'), it_(2, 'Picked this up.'), work(3), it_(4, 'Now the tests.'), work(5)];
    // What the page used to do with it: lead with the newest sentence alone.
    expect(newestAnswer(events, null)?.text).toBe('Now the tests.');
    expect(standsAt(events, { at: 4 })).toBe(-1);
    expect(workingFrom(events)).toBe(0);
  });

  it('at the answer your reply follows on from, with the steps since under it', () => {
    const events = [you(1, 'build it'), it_(5, '**Shipped.**'), you(9, 'the colours are off'), it_(10, 'Reading the theme.'), work(11), it_(12, 'Changing the dark palette.')];
    expect(workingFrom(events)).toBe(1);
    expect(earlierThan(events, 1)).toBe(1);
  });

  it('at the answer a pick was made on, since a pick is yours too', () => {
    expect(workingFrom([you(1, 'go'), it_(5, '**Ship it?**'), picked(9), it_(10, 'Shipping.'), work(11)])).toBe(1);
  });

  it('at the newest answer before your newest message, not an older one', () => {
    const events = [you(1, 'a'), it_(2, 'first answer'), you(3, 'b'), it_(4, 'second answer'), you(5, 'c'), it_(6, 'On it.')];
    expect(workingFrom(events)).toBe(3);
  });

  it('at the answer you replied to twice, keeping both replies', () => {
    const events = [you(1, 'a'), it_(2, 'answer'), you(3, 'one more thing'), you(4, 'and this'), it_(5, 'On both.')];
    expect(workingFrom(events)).toBe(1);
  });

  it('at that answer before the agent has said a word of this round', () => {
    expect(workingFrom([you(1, 'a'), it_(2, 'answer'), you(3, 'again')])).toBe(1);
  });

  it('at the top when nothing in the thread is yours', () => {
    expect(workingFrom([it_(1, 'Filed: tidy the docs'), it_(2, 'Starting.'), work(3)])).toBe(0);
  });
});

describe('the page while an agent works', () => {
  it('knows a session is up', () => {
    expect(thread).toMatch(/const working = !!queue && !!session;/);
    expect(thread).toMatch(/const stands = !queue \? -1 : working \? workingFrom\(events\) : standsAt\(events, newest\);/);
  });

  it('never draws the newest sentence alone with the rest folded', () => {
    expect(thread).toMatch(/const alone = !!newest && !working && stands < 0;/);
    expect(thread).toMatch(/if \(alone && !earlierOpen && !short\) \{/);
  });

  it('draws from where the round began, keeping a long thread\'s gap line', () => {
    expect(thread).toMatch(/const start = stands > gapIndex\(events, omitted\) \? stands : -1;/);
    expect(thread).toMatch(/const from = short \|\| earlierOpen \? -1 : start;/);
    expect(thread).toMatch(/events=\{from >= 0 \? events\.slice\(from\) : events\}/);
  });

  it('counts the messages a long thread\'s window left out among the earlier ones', () => {
    expect(thread).toMatch(/const behind = start >= 0 \? earlierThan\(events, start\) \+ omitted : alone \? earlierCount\(events, byApp \? null : outcome\) \+ omitted : 0;/);
  });
});

describe('a thread with nothing running keeps the page it had', () => {
  it('leads with an answer that is still the newest word', () => {
    expect(standsAt([you(1, 'go'), it_(5, '**Done?**')], { at: 5 })).toBe(-1);
  });
  it('and offers the agent\'s steps behind the fold only when the answer is drawn alone', () => {
    expect(thread).toMatch(/steps=\{!short && alone && /);
  });
});
