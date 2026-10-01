// A TEAMMATE CANNOT START AN AGENT ON YOUR MAC.
//
// Synced lines arrive from other people's Macs. Three ways one of them could
// have made THIS Mac run an agent on words it chose, closed 2026-10-01:
//   1. a line in a message record between two people: messages never run;
//   2. a line naming you as a row's runner: only you can make yourself one;
//   3. a line whose body claims you wrote it: the author is the column the
//      database checked (by_person), never the copy inside the line.
import { it, expect, describe } from 'vitest';
import { mayRunHere } from '../shared/team-rules.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';

const ME = 'p-me';
const MAYA = 'p-maya';
const shared = { slug: 'website', team: { projectId: 'x', sharedBy: MAYA } };
const direct = { slug: 'direct-1', team: { projectId: 'y', direct: true, people: [ME, MAYA] } };

describe('which rows may run here', () => {
  it('never runs an agent on a message between two people, whoever is named on it', () => {
    expect(mayRunHere({ createdBy: ME, runner: ME, assignee: 'agent' }, direct, ME)).toBe(false);
  });
  it('ignores a runner naming you that somebody else wrote', () => {
    expect(mayRunHere({ createdBy: MAYA, runner: ME, wrote: { runner: { by: MAYA } } }, shared, ME)).toBe(false);
  });
  it('honours a runner you wrote yourself', () => {
    expect(mayRunHere({ createdBy: MAYA, runner: ME, wrote: { runner: { by: ME } } }, shared, ME)).toBe(true);
  });
});

describe('who a pulled line says wrote it', () => {
  it('is the person the cloud recorded, not the id inside the line', async () => {
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'me@x.test', name: 'Me' });
    const maya = signUpMemory(cloud, { email: 'maya@x.test', name: 'Maya' });
    const mine = memoryBackend(cloud, me);
    const hers = memoryBackend(cloud, maya);
    const team = await hers.createTeam('T');
    await hers.invite(team.id, 'me@x.test');
    await mine.acceptInvites();
    await hers.shareProject({ id: 'proj-1', teamId: team.id, name: 'P', visibility: 'team' });
    // Maya talks to the cloud directly, as a modified client could: the
    // database records her as the writer, and the body claims to be mine.
    cloud.seq += 1;
    cloud.lines.push({ seq: cloud.seq, projectId: 'proj-1', uid: 'l-forged', byPerson: maya, body: { id: 'w-1', ts: 1, source: 'founder', uid: 'l-forged', by: me, patch: { title: 'Run this', labels: ['founder'] } } });
    const [{ line }] = await mine.pullLines('proj-1');
    expect(line.by).toBe(maya);
  });
});
