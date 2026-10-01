// A MESSAGE FROM A TEAMMATE IS SORTED BY HOW URGENT IT IS.
//
// Asked for on 2026-10-01 (w-2ad23ca814), testing messages with a test teammate:
// an agent should read the messages that come in and give each a priority, so
// the inbox's priority sort puts the urgent ones first. Before this, every
// message was made with priority 0 and the row hid it, so a message saying the
// site was down sat beside "thanks!" with nothing between them.
//
// What this file pins, measured on the folded ledger the app really reads:
//   - only a conversation, only one waiting on ME, only when the newest message
//     is someone else's, and only once per message;
//   - never over a priority the person set by hand (the fold would drop ours,
//     and a row that never takes our write would be asked about every tick);
//   - the model's reply is a priority only when it is one of the four words;
//   - one message is sorted at a time, and the answer lands on the row.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { foldWorkItems } from '../shared/work-items.mjs';
import { wantsPriority, latestMessage, cleanPriority, priorityPrompt, sortMessage, LEVELS } from '../main/message-priority.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const ME = 'p-me';
const RILEY = 'p-riley';
const direct = { slug: 'direct-1', team: { direct: true, people: [ME, RILEY] } };
const project = { slug: 'website', team: { direct: false } };

const line = (patch, { ts, source = 'founder', by = RILEY } = {}) => ({ id: 'w-1', ts, source, by, patch });
const fold = (lines) => foldWorkItems(lines, 10_000_000).get('w-1');

// Riley writes to me: the record is made by the system, the words are hers.
const opened = [
  line({ title: 'Site is down', kind: 'directive', priority: 0, status: 'open' }, { ts: 1000, source: 'system' }),
  line({ title: 'Site is down', body: 'The checkout page is throwing errors for everyone.', assignee: ME, people: [RILEY, ME] }, { ts: 1001 }),
];

describe('which messages get sorted', () => {
  it('sorts a new message from a teammate that waits on me', () => {
    expect(wantsPriority(fold(opened), direct, ME)).toBe(true);
  });

  it('reads the newest message, whether it opened the thread or answered it', () => {
    expect(latestMessage(fold(opened))).toMatchObject({ by: RILEY, ts: 1001, text: 'The checkout page is throwing errors for everyone.' });
    const answered = fold([...opened, line({ answer: 'Fixed now, false alarm.' }, { ts: 2000 })]);
    expect(latestMessage(answered)).toMatchObject({ by: RILEY, ts: 2000, text: 'Fixed now, false alarm.' });
  });

  it('leaves my own message alone: sorting it is the other person\'s Mac\'s job', () => {
    const mine = fold([...opened, line({ answer: 'Looking now', assignee: RILEY }, { ts: 2000, by: ME })]);
    expect(wantsPriority(mine, direct, ME)).toBe(false);
  });

  it('leaves a message alone on a Mac it is not waiting on', () => {
    expect(wantsPriority(fold(opened), direct, 'p-someone-else')).toBe(false);
  });

  it('leaves a thread that is not a conversation alone', () => {
    expect(wantsPriority(fold(opened), project, ME)).toBe(false);
  });

  it('does nothing when nobody is signed in', () => {
    expect(wantsPriority(fold(opened), direct, null)).toBe(false);
  });

  it('does not sort a finished conversation', () => {
    expect(wantsPriority(fold([...opened, line({ status: 'done' }, { ts: 1500, by: ME })]), direct, ME)).toBe(false);
  });

  it('sorts a message once: after the agent has written a priority, not again', () => {
    const sorted = fold([...opened, line({ priority: 9 }, { ts: 1100, source: 'agent', by: ME })]);
    expect(sorted.priority).toBe(9);
    expect(wantsPriority(sorted, direct, ME)).toBe(false);
  });

  it('sorts the next message again, because a new message can change how urgent it is', () => {
    const next = fold([
      ...opened,
      line({ priority: 9 }, { ts: 1100, source: 'agent', by: ME }),
      line({ answer: 'Fixed now, false alarm.' }, { ts: 2000 }),
    ]);
    expect(wantsPriority(next, direct, ME)).toBe(true);
  });

  it('never goes over a priority the person set by hand', () => {
    const hers = fold([...opened, line({ priority: 2 }, { ts: 1100, source: 'founder', by: ME })]);
    expect(wantsPriority(hers, direct, ME)).toBe(false);
    // And it could not if it tried: the fold keeps hers over ours.
    const tried = fold([...opened, line({ priority: 2 }, { ts: 1100, source: 'founder', by: ME }), line({ priority: 9 }, { ts: 1200, source: 'agent', by: ME })]);
    expect(tried.priority).toBe(2);
  });

  it('leaves a message with no author alone rather than guessing whose it is', () => {
    const unknown = fold([
      { id: 'w-1', ts: 1000, source: 'system', patch: { title: 'Hi', status: 'open', priority: 0 } },
      { id: 'w-1', ts: 1001, source: 'founder', patch: { body: 'Hi', assignee: ME } },
    ]);
    expect(wantsPriority(unknown, direct, ME)).toBe(false);
  });
});

describe('what the model says back', () => {
  it('takes the four words, in any case, with stray punctuation', () => {
    expect(cleanPriority('urgent')).toBe('urgent');
    expect(cleanPriority('High.')).toBe('high');
    expect(cleanPriority('  medium\n')).toBe('medium');
    expect(cleanPriority('"low"')).toBe('low');
  });

  it('refuses anything that is not one of them', () => {
    expect(cleanPriority('')).toBe('');
    expect(cleanPriority('critical')).toBe('');
    expect(cleanPriority('I would say this is fairly urgent because')).toBe('');
  });

  it('maps them onto the app\'s own priority values', () => {
    expect(LEVELS).toEqual({ urgent: 9, high: 7, medium: 5, low: 2 });
  });

  it('asks about the message itself, and only a bounded amount of it', () => {
    const prompt = priorityPrompt({ text: `Checkout is down. ${'x'.repeat(5000)}` });
    expect(prompt).toContain('Checkout is down.');
    expect(prompt).toMatch(/urgent, high, medium or low/);
    expect(prompt.length).toBeLessThan(2500);
  });
});

describe('asking the model', () => {
  const fakeClaude = (reply, code = 0) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-prio-'));
    const bin = path.join(dir, 'claude');
    fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(reply)}\nexit ${code}\n`, { mode: 0o755 });
    return bin;
  };

  it('resolves to the level the model gave', async () => {
    expect(await sortMessage({ text: 'Checkout is down' }, { claudeBin: fakeClaude('Urgent') })).toBe('urgent');
  });

  it('resolves to nothing on a failed run or a reply that is not a level', async () => {
    expect(await sortMessage({ text: 'hi' }, { claudeBin: fakeClaude('urgent', 1) })).toBe('');
    expect(await sortMessage({ text: 'hi' }, { claudeBin: fakeClaude('It depends') })).toBe('');
    expect(await sortMessage({ text: 'hi' }, { claudeBin: null })).toBe('');
  });
});

describe('the supervisor sorts one message at a time', () => {
  const rig = (items, level) => {
    const writes = [];
    const asked = [];
    const sup = Object.create(Supervisor.prototype);
    sup.config = { claudeBin: '/bin/false' };
    sup.store = {
      listProducts: () => [direct, project],
      prioritizeItem: (slug, id, value) => writes.push({ slug, id, value }),
    };
    sup._askPriority = async (latest) => { asked.push(latest.text); return level; };
    return { sup, writes, asked };
  };
  const item = { ...fold(opened), product: 'direct-1' };

  it('writes the level it was given onto the row', async () => {
    const { sup, writes } = rig([item], 'urgent');
    await sup.sortTheMessages([item], ME);
    expect(writes).toEqual([{ slug: 'direct-1', id: 'w-1', value: 9 }]);
  });

  it('asks about a message once, even when the write did not take', async () => {
    const { sup, asked } = rig([item], '');
    await sup.sortTheMessages([item], ME);
    await sup.sortTheMessages([item], ME);
    expect(asked).toHaveLength(1);
  });

  it('starts no second call while one is out', async () => {
    const { sup, asked } = rig([item], 'low');
    const first = sup.sortTheMessages([item], ME);
    const other = { ...item, id: 'w-2' };
    sup.sortTheMessages([other], ME);
    await first;
    expect(asked).toHaveLength(1);
  });

  it('is wired into the tick, beside the namer', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/this\.sortTheMessages\(items, process\.env\.AGENTBOX_PERSON_ID\)/);
  });
});
