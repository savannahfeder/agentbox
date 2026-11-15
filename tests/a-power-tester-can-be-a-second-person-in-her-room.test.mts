// A POWER TESTER CAN BE A SECOND PERSON IN HER ROOM (w-3d0fa23ffb, 2026-10-21).
//
// The founder: "make a power user that actually joins the Astral room with me
// so they can do the usual power user testing AND can send messages to me and
// i can see them live." Power-test copies ran as a fresh user with no team, so
// none could ever be in a room. A copy handed a team file (live.mjs --team)
// signs in to that team as its own account with Rooms on, and its tester is
// told the room is there and that the person who asked for the test reads it
// live.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testerPrompt } from '../.claude/skills/power-test/scripts/plan.mjs';
import { teamEnv, cleanEnv } from '../.claude/skills/verify-agentbox/scripts/live.mjs';

const person = { name: 'Test Person', role: 'an engineer', atOnce: 4, codex: true, projects: ['One'], day: ['Morning'], text: 'You are an engineer.', knowsKeys: true };
const base = { person, focus: null, browse: 'B', diary: 'D', shots: '/tmp/x', round: 1, totalMinutes: 60, minutesLeft: 60, roundMinutes: 20, fraction: 0, diaryTail: [], issues: [], notYet: [], real: false };

describe('the tester in a room', () => {
  it('is told the room is there, who reads it, and to talk in it through the day', () => {
    const p = testerPrompt({ ...base, room: 'Astral' });
    expect(p).toMatch(/YOUR ROOM/);
    expect(p).toMatch(/the Astral room/);
    expect(p).toMatch(/reads it live/);
    expect(p).toMatch(/say hello/i);
  });
  // w-4465054f04: "make sure this person is in a room so I can see how
  // everything works and that they're not in the invisible state". The prompt
  // used to send the tester invisible for a while as part of trying the room.
  it('stays visible all day, and comes back if it finds itself invisible', () => {
    const p = testerPrompt({ ...base, room: 'Astral' });
    expect(p).not.toMatch(/going invisible for a little while/);
    expect(p).toMatch(/stay visible/i);
    expect(p).toMatch(/Come back/);
  });
  it('without a room, hears nothing about one', () => {
    expect(testerPrompt(base)).not.toMatch(/YOUR ROOM/);
  });
});

describe('the copy on a team', () => {
  const file = (o) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'team-tester-')), 't.json'); fs.writeFileSync(f, JSON.stringify(o)); return f; };
  it('signs in with the file’s account, to the file’s cloud', () => {
    expect(teamEnv(file({ config: '/x/team.config.json', email: 'a@b.test', password: 'p:w' }))).toEqual({
      AGENTBOX_TEAM_CONFIG: '/x/team.config.json', AGENTBOX_TEAM_TEST_LOGIN: 'a@b.test:p:w',
    });
  });
  it('a file missing the account or the cloud is refused in plain words', () => {
    expect(() => teamEnv(file({ config: '/x', email: 'a@b.test' }))).toThrow(/needs config, email and password/);
  });
  it('nothing of the team leaks in from the shell that started it', () => {
    expect(cleanEnv({ AGENTBOX_TEAM_CONFIG: '/hers', AGENTBOX_TEAM_TEST_LOGIN: 'x:y', PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });
});
