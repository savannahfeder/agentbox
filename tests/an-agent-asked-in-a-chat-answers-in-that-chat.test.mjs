// AN AGENT ASKED IN A CHAT ANSWERS IN THAT CHAT, NOT AS A THREAD OF ITS OWN.
//
// Reported on w-dbe62a2841: in a conversation with a teammate, "@Claude Code
// in Agentbox Team are you able to help with this?" started a task, and its
// answer reached Needs you as a separate thread named "Agent hours not
// recorded", with the teammate's message folded away behind "Show 11 earlier
// messages". Measured off the store: the task carried nothing naming the chat
// it came from, so the inbox could only list it on its own; the namer read the
// first 1,200 characters of its brief, which were the oldest chat lines, not
// the ask; and a second mention in the same chat was briefed without the first
// agent's answer, because answers are not messages in the chat's ledger.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { askedInLabel, askedIn, chatTranscript, taskBrief } from '../renderer/src/team/agent-mentions.ts';
import { agentSaidLast, answersInTheirChat } from '../renderer/src/team/answers-in-the-chat.ts';
import { namePrompt } from '../main/row-label.mjs';

const chat = { id: 'w-chat000001', product: 'direct-priya' };
const task = (over = {}) => ({ id: 'w-task000001', product: 'agentbox-team', labels: ['founder', askedInLabel(chat)], ...over });

describe('the task names the chat it was asked in', () => {
  it('reads the chat back off the task', () => {
    expect(askedIn(task())).toEqual({ product: chat.product, id: chat.id });
  });

  it('reads nothing off a task asked anywhere else', () => {
    expect(askedIn({ labels: ['founder'] })).toBeNull();
    expect(askedIn({ labels: ['teammate:w-x'] })).toBeNull();
    expect(askedIn({})).toBeNull();
  });

  it('is written when a mention starts the task', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const start = app.slice(app.indexOf('const startChatAgents'), app.indexOf('const chatAgents = useMemo'));
    expect(start).toMatch(/labels: \[askedInLabel\(item\)\]/);
  });
});

describe('Needs you lists the chat, not the task', () => {
  const items = (t = task()) => [{ ...chat }, t];
  const run = (t, { inInbox = () => true, ownRow = () => false } = {}) => answersInTheirChat(items(t), { inInbox, ownRow });

  it('takes an answered task out and puts its chat in', () => {
    const { hide, lift } = run(task());
    expect([...hide]).toEqual(['agentbox-team/w-task000001']);
    expect([...lift.keys()]).toEqual(['direct-priya/w-chat000001']);
    expect(lift.get('direct-priya/w-chat000001').map((i) => i.id)).toEqual(['w-task000001']);
  });

  it('leaves a task alone while it is not waiting on you', () => {
    const { hide, lift } = run(task(), { inInbox: (i) => i.id !== 'w-task000001' });
    expect(hide.size).toBe(0);
    expect(lift.size).toBe(0);
  });

  it('keeps a task’s own row when only its own row can answer it (a permission card, a stopped run)', () => {
    const { hide, lift } = run(task(), { ownRow: () => true });
    expect(hide.size).toBe(0);
    expect(lift.size).toBe(0);
  });

  it('keeps a task’s own row when this copy does not have the chat', () => {
    const { hide, lift } = answersInTheirChat([task()], { inInbox: () => true, ownRow: () => false });
    expect(hide.size).toBe(0);
    expect(lift.size).toBe(0);
  });

  it('does not touch a task nobody asked for in a chat', () => {
    const { hide, lift } = run(task({ labels: ['founder'] }));
    expect(hide.size).toBe(0);
    expect(lift.size).toBe(0);
  });

  it('is wired into the inbox, and closing the chat closes the tasks it carried', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/answersInTheirChat\(/);
    const done = app.slice(app.indexOf('const markDone = useCallback'), app.indexOf('const reopenDone'));
    expect(done).toMatch(/liftedBy\.current\.get\(/);
  });
});

describe('the chat’s row says the agent answered', () => {
  const said = { ...chat, wrote: { body: { ts: 100 }, answer: { ts: 200 } } };
  const answered = (over = {}) => task({ engine: 'claude', result: '**Priya, all four files are in Brand kit.**\n\nThe video is the master.', wrote: { result: { ts: 300 } }, ...over });

  it('reads the answer’s first line, plain, with the agent’s name', () => {
    expect(agentSaidLast(said, [said, answered()])).toEqual({ who: 'Claude Code', text: 'Priya, all four files are in Brand kit.', at: 300 });
  });

  it('keeps the words’ own marks, a > between folders and an _ in a file name', () => {
    const r = agentSaidLast(said, [answered({ result: '## **Files under Kestrel > Brand kit:** `launch_v2.mp4`' })]);
    expect(r.text).toBe('Files under Kestrel > Brand kit: launch_v2.mp4');
  });

  it('says nothing once someone has written in the chat after it', () => {
    expect(agentSaidLast({ ...said, wrote: { ...said.wrote, answer: { ts: 400 } } }, [answered()])).toBeNull();
  });

  it('says nothing for a task with no answer, or one asked in another chat', () => {
    expect(agentSaidLast(said, [answered({ result: undefined })])).toBeNull();
    expect(agentSaidLast(said, [answered({ labels: ['founder', askedInLabel({ product: 'other', id: 'w-x' })] })])).toBeNull();
  });

  it('is what the row draws', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toMatch(/agentSaidLast\(item, allItems\)/);
  });
});

describe('a second mention in the chat knows what the first agent said', () => {
  const T = 1_000;
  const lines = [
    { ts: T, by: 'm', patch: { body: 'Could you send me the original files?' } },
    { ts: T + 1, by: 's', patch: { answer: '[@Claude Code in Agentbox Team](agentbox-agent:claude?project=agentbox-team&task=w-task000001) are you able to help with this?' } },
  ];
  const nameOf = (by) => (by === 'm' ? 'Priya' : 'Sam');

  it('puts the agent’s answer after the message that asked for it', () => {
    const said = chatTranscript(lines, nameOf, (id) => (id === 'w-task000001' ? 'The videos are on your Mac.' : null));
    expect(said.map((m) => m.who)).toEqual(['Priya', 'Sam', 'Claude Code']);
    expect(said[2].text).toBe('The videos are on your Mac.');
  });

  it('adds nothing for an agent that has not answered yet', () => {
    expect(chatTranscript(lines, nameOf, () => null)).toHaveLength(2);
    expect(chatTranscript(lines, nameOf)).toHaveLength(2);
  });
});

describe('the thread is named for the ask, not the oldest chat lines', () => {
  const body = taskBrief({
    sent: 'are you able to help with this?', asker: 'Sam', others: ['Priya'],
    transcript: [{ who: 'Priya', text: 'Now i can see 0.2 agent hours but the previous ones are not recorded' }],
  });

  it('leaves the conversation out of what the namer reads', () => {
    const prompt = namePrompt({ title: 'Are you able to help with this?', body });
    expect(prompt).toContain('are you able to help with this?');
    expect(prompt).not.toContain('agent hours');
  });

  it('still reads the whole body of a thread typed by hand, rules and all', () => {
    const prompt = namePrompt({ title: 'Fix the footer', body: 'Fix the footer\n\n---\n\nThe links overlap on narrow screens' });
    expect(prompt).toContain('The links overlap');
  });
});
