// The power test of 2026-10-25 was about AI teammates, which sit behind
// Settings > Alpha features while they are in testing. Each tester's copy
// started as a new person's does, with them off, so both testers spent their
// first minutes looking for Chats and the report opened on "No Chats page or
// people icon anywhere" as its worst issue. A power test can now start its
// copies with named alpha features on (`--alpha teammates`); without the flag
// they stay off, as for anyone new.
//
// The same run's watcher said "More agents running than the app allows (2)"
// after the tester had raised Settings > Running to 8 agents: it read the cap
// once, when the copy started. It reads it on every check now.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { copyConfig } = await import('../.claude/skills/verify-agentbox/scripts/live.mjs');
const { agentCap } = await import('../.claude/skills/power-test/scripts/watch.mjs');
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('a test copy\'s alpha features', () => {
  it('are on when named, and off when not', () => {
    expect(copyConfig({ storeRoot: '/s', alpha: ['teammates'] })).toMatchObject({ alphaTeammates: true });
    expect(copyConfig({ storeRoot: '/s', alpha: ['teammates', 'rooms'] })).toMatchObject({ alphaTeammates: true, alphaRooms: true });
    const plain = copyConfig({ storeRoot: '/s' });
    expect(plain.alphaTeammates).toBeUndefined();
    expect(plain.alphaRooms).toBeUndefined();
  });

  it('are passed from the power test to every copy it starts', () => {
    expect(read('.claude/skills/power-test/scripts/power-test.mjs')).toMatch(/\.\.\.\(alpha \? \['--alpha', alpha\] : \[\]\)/);
    expect(read('.claude/skills/verify-agentbox/scripts/live.mjs')).toMatch(/const alpha = value\('alpha'\)/);
  });
});

describe('the watcher\'s agent cap', () => {
  it('is the copy\'s setting at the moment it checks', () => {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-cap-'));
    const write = (n) => fs.writeFileSync(path.join(data, 'zero.config.json'), JSON.stringify({ maxConcurrentSessions: n }));
    write(2);
    expect(agentCap(data)).toBe(2);
    write(8);
    expect(agentCap(data)).toBe(8);
    fs.rmSync(path.join(data, 'zero.config.json'));
    expect(agentCap(data)).toBe(2);
    expect(read('.claude/skills/power-test/scripts/watch.mjs')).toMatch(/const allowed = agentCap\(st\.data\);/);
  });
});
