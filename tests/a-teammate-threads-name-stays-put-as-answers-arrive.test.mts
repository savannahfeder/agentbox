// "In every thread the title changes with every response." The founder's
// screenshot: a thread handed to a teammate, its header reading POST 7 NOW
// OPENS "YOUR LAPTOP CAN RUN 4 CODING AGENTS.", the bold first line of the
// teammate's latest answer. The header took rowTitle, which names a teammate's
// row after that line so the inbox reads as a message, while the page below
// was already named after the thread (pageTitle). So the header got a new name
// on every answer and disagreed with the page. Measured on the 15 open teammate
// threads: every header was an answer's first line; most titles were a whole
// dictated sentence, so the page is now named the way any thread is: its short
// name, else its own words cut to a few.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageTitle } from '../renderer/src/one-thing-at-a-time.ts';
import { rowTitle } from '../renderer/src/list-rules.ts';
import { wantsName, namePrompt } from '../main/row-label.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'mobile/src/lib/thread.ts'), 'utf8');

const dictated = "I don't know if we already had a thread on this, but we are launching Agent Vox Cloud tomorrow and want to figure out h…";
const thread = (over = {}) => ({
  id: 'w-8f28cab15f64', status: 'open', title: dictated,
  labels: ['founder', 'teammate:t-27fd9da55b', 'hop:0', 'from-chat'], ...over,
});

describe("a teammate thread's name", () => {
  it('is the same before, after one answer and after the next', () => {
    const before = pageTitle(thread());
    const first = pageTitle(thread({ result: '**Here are seven posts for the launch.**\n\nPost 1 opens...' }));
    const next = pageTitle(thread({ result: '**Post 7 now opens "your laptop can run 4 coding agents."**\n\nHey...' }));
    expect(first).toBe(before);
    expect(next).toBe(before);
  });

  it('is a few words of its own title, never the answer or the whole sentence', () => {
    const name = pageTitle(thread({ result: '**Post 7 now opens "your laptop can run 4 coding agents."**' }));
    expect(name).not.toMatch(/Post 7/);
    expect(name.length).toBeLessThan(dictated.length);
    expect(dictated.toLowerCase()).toContain(name.toLowerCase().split(' ').slice(0, 3).join(' '));
  });

  it('is its short name when it has one, and a rename wins', () => {
    const named = thread({ label: 'Agentcloud launch posts', wrote: { label: { ts: 1, source: 'agent' } } });
    expect(pageTitle({ ...named, result: '**Anything at all.**' })).toBe('Agentcloud launch posts');
    const renamed = thread({ label: 'Launch tweets', wrote: { label: { ts: 2, source: 'founder' } } });
    expect(pageTitle(renamed)).toBe('Launch tweets');
  });

  // The inbox row took the answer's first line too until w-877175ed81.
  it('is the name its inbox row has', () => {
    const answered = thread({ result: '**Post 7 now opens the hook.**' });
    expect(rowTitle(answered)).toBe(pageTitle(answered));
  });

  it('leaves a thread with no teammate named as before', () => {
    const mine = { title: 'fix the login thing', label: 'Fix the login button', labels: ['founder'], result: '**Fixed.**' };
    expect(pageTitle(mine)).toBe('Fix the login button');
  });
});

describe('the header over an open thread', () => {
  it('names it the way its page does, not the way its inbox row does', () => {
    expect(focus).toMatch(/const threadName = named \? talkFull : pageTitle\(item\);/);
    expect(focus).not.toMatch(/talkFull \? talkFull : rowTitle\(item\)/);
  });

  it('on the phone too', () => {
    expect(phone).toMatch(/title: pageTitle\(item\),/);
    expect(phone).not.toMatch(/title: rowTitle\(item\),/);
  });
});

describe('the namer', () => {
  it('names a teammate thread once, like any other, and leaves it named', () => {
    expect(wantsName(thread())).toBe(true);
    expect(wantsName(thread({ label: 'Agentcloud launch posts' }))).toBe(false);
  });

  it('gives a teammate thread that runs from a duty its name from its own title', () => {
    const duty = thread({ title: 'Sweep X for fresh posts', body: 'One of your duties: Sweep X for fresh posts' });
    expect(namePrompt(duty)).toContain('Sweep X for fresh posts');
  });
});
