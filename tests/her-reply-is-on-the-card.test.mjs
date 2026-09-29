// A REPLY SENT FROM THE APP IS ON THE CARD. The bug, on session-67: a reply
// sent from the app never appeared on the agent's card.
//
// The reason is one line in a file nobody had reason to doubt. MEASURED off
// session-67's own transcript (session 35c5c838, claude 2.1.229):
//
//   19:41:17  a reply "status?" is sent from Agentbox
//   19:41:18  it lands as `{"type":"user","isMeta":true,"message":{"content":
//             "Another Claude session sent a message:\nstatus?\n\nThis came
//             from another Claude session — not typed by your user…"}}`
//   19:41:26  the agent answers her, properly, in its own window
//   19:41:47  a second reply asks whether it answered, and the same thing happens
//
// So the message arrived and the agent did the work. What went wrong is what
// she SAW: `herTurnRaw` in main/agents.mjs drops every `isMeta` user line, and
// it is right to — that flag is also on every tool result and system reminder,
// and quoting those back to her as her own words is worse than the blank.
//
// The fix is a RECORD, not a guess: the process that delivered the message
// writes down what it delivered. Agentbox must not unwrap peer messages in a
// transcript and call them hers, because another of her own sessions pinging
// this one is a real peer, and drawing that as her words would put a sentence
// she never typed on the one card built to be trusted.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentRow, herWords } from '../shared/agents.mjs';
import { AgentSchedule } from '../main/agent-schedule.mjs';
import { NAME } from '../shared/product-name.mjs';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-spoke-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const AGENT = {
  pid: 83970,
  sessionId: '35c5c838-dbd1-4e15-9723-0aac5b573573',
  name: 'session-67',
  cwd: '/tmp/agentbox-fixture-repo',
  status: 'idle',
  startedAt: 1786700000000,
  lastActiveAt: 1787020956000,
  statusAt: 1787020956000,
  touched: [],
  asked: [{ at: 1786665600000, text: 'I want you to install this skill across my projects for coding: https://example.com/skills/tidy-commits' }],
};

describe('her reply is on the card', () => {
  it(`the words she sent from ${NAME} are hers, next to the ones read off the transcript`, () => {
    const words = herWords({
      ...AGENT,
      spoke: [
        { at: 1787020877000, text: 'status?' },
        { at: 1787020907000, text: 'did you respond to my question?' },
      ],
    });
    expect(words.map((t) => t.text)).toEqual([
      'I want you to install this skill across my projects for coding: https://example.com/skills/tidy-commits',
      'status?',
      'did you respond to my question?',
    ]);
  });

  it('the card she reads actually quotes them back', () => {
    const before = agentRow(AGENT, 1787021000000).body;
    expect(before).not.toContain('did you respond to my question?');

    const after = agentRow({
      ...AGENT,
      spoke: [
        { at: 1787020877000, text: 'status?' },
        { at: 1787020907000, text: 'did you respond to my question?' },
      ],
    }, 1787021000000).body;
    expect(after).toContain('Then');
    expect(after).toContain('did you respond to my question?');
    // The opening is still the opening. It is the ask, and it is four days old.
    expect(after).toContain('You started it');
    expect(after).toContain('install this skill');
  });

  it('never invents an opening out of a reply', () => {
    // A session whose transcript could not be read has nothing on record from
    // her.
    const words = herWords({ ...AGENT, asked: [], spoke: [{ at: 1787020877000, text: 'status?' }] });
    expect(words).toEqual([]);
    expect(agentRow({ ...AGENT, asked: [], spoke: [{ at: 1787020877000, text: 'status?' }] }, 1787021000000).body)
      .not.toContain('You started it');
  });

  it('does not say it twice when the session does record her turn as its own', () => {
    const words = herWords({
      ...AGENT,
      asked: [...AGENT.asked, { at: 1787020877000, text: 'status?' }],
      spoke: [{ at: 1787020877000, text: 'status?' }],
    });
    expect(words.filter((t) => t.text === 'status?')).toHaveLength(1);
  });
});

describe('the record of what she said', () => {
  it('is written when the message is delivered and survives a reload', () => {
    const s = new AgentSchedule(dir);
    s.replied('session:abc', 1787020877000, 1787020877000, 'status?');
    s.replied('session:abc', 1787020907000, 1787020907000, 'did you respond to my question?');
    expect(new AgentSchedule(dir).spoke('session:abc').map((t) => t.text))
      .toEqual(['status?', 'did you respond to my question?']);
  });

  it('rides out to the row with the reply mark', () => {
    const s = new AgentSchedule(dir);
    s.replied('session:35c5c838-dbd1-4e15-9723-0aac5b573573', 1787020877000, 1787020877000, 'status?');
    const [row] = s.decorate([AGENT], 1787021000000);
    expect(row.spoke.map((t) => t.text)).toEqual(['status?']);
  });

  it('withdrawing the reply takes the words back out', () => {
    // Her undo. A card that still quoted the message underneath a withdrawn
    // reply would say she had said something she had just unsaid.
    const s = new AgentSchedule(dir);
    s.replied('session:abc', 1787020877000, 1787020877000, 'status?');
    s.replied('session:abc', 0);
    expect(s.spoke('session:abc')).toEqual([]);
  });

  // CLOSING A ROW DOES NOT UNSAY WHAT SHE SAID. It used to, and `spoke` is the
  // only record on the machine that she ever spoke to a session: Claude Code
  // stamps an injected message `isMeta` and the transcript reader drops it, so
  // nothing else knows. Measured on session-46: four of her messages reached
  // that session and the file held one, and the card was back to quoting only
  // what she had started it with five days earlier. Closing is about her inbox
  // and nothing else, which is what the row itself promises her.
  it('does not unsay what she said, because closing is about her inbox alone', () => {
    const s = new AgentSchedule(dir);
    s.replied('session:abc', 1787020877000, 1787020877000, 'status?');
    s.close('session:abc', 1787020950000);
    expect(s.spoke('session:abc')).toEqual([{ at: 1787020877000, text: 'status?' }]);
    // The mark itself still goes, so an undone close cannot put the row back
    // into In progress over a reply she has already finished with.
    expect(s.repliedAt('session:abc')).toBe(0);
  });

  it('survives a close and a reopen, so a reopened row still knows the thread', () => {
    const s = new AgentSchedule(dir);
    s.replied('session:abc', 1787020877000, 1787020877000, 'status?');
    s.close('session:abc', 1787020950000);
    s.close('session:abc', 0);
    expect(new AgentSchedule(dir).spoke('session:abc')).toEqual([{ at: 1787020877000, text: 'status?' }]);
  });

  // The entry that holds only her words is still an entry. `_keep` and the
  // sweep both used a three-way test that did not mention `spoke`, so the file
  // was written and then the words were dropped on the next read.
  it('keeps her words on disk when nothing else is set on the row', () => {
    const s = new AgentSchedule(dir);
    s.replied('session:abc', 1787020877000, 1787020877000, 'status?');
    s.close('session:abc', 1787020950000);
    s.close('session:abc', 0);
    s.decorate([{ sessionId: 'abc', pid: 4, startedAt: 1 }], 1787021000000);
    expect(new AgentSchedule(dir).spoke('session:abc')).toEqual([{ at: 1787020877000, text: 'status?' }]);
  });

  it('cannot grow without bound on a session left running for a month', () => {
    const s = new AgentSchedule(dir);
    for (let i = 1; i <= 40; i += 1) s.replied('session:abc', 1787020000000 + i, 1787020000000 + i, `message ${i}`);
    const kept = s.spoke('session:abc');
    expect(kept).toHaveLength(8);
    expect(kept[kept.length - 1].text).toBe('message 40');
  });

  it('keeps nothing for a send that never landed', () => {
    // `replied` is only reached on a delivered message (main/ipc.mjs), and a
    // call with no text must not leave an empty quote on the card.
    const s = new AgentSchedule(dir);
    s.replied('session:abc', 1787020877000, 1787020877000, '   ');
    expect(s.spoke('session:abc')).toEqual([]);
    expect(s.repliedAt('session:abc')).toBe(1787020877000);
  });
});
