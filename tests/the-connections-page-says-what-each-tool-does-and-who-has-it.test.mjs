// THE CONNECTIONS PAGE SAYS WHAT EACH TOOL DOES AND WHO HAS IT.
//
// What was missing (2026-10-31): a person had no place to see which tools their
// agents can reach, whether that is true right now, or which teammate to ask.
// Measured here: the words on a tile, the link an agent writes in a thread, and
// the one small thing that crosses to the team, which is a list of tool ids and
// never a token, a read or an account.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { connectionLinkOf, keepConnectionLinks, stateLine, toolWords, whoHasIt } from '../renderer/src/connections/connections-shown';
import { artifactUrlTransform } from '../renderer/src/remark-artifact-paths';
import { createMemoryCloud, memoryBackend, signUpMemory } from '../main/team/memory-cloud.mjs';
import { cleanConnections, MAX_CONNECTIONS } from '../shared/team-connections.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const NOW = 1_800_000_000_000;

describe('the word on a tile', () => {
  it('Works says how long ago, in words', () => {
    expect(stateLine({ state: 'works', word: 'Works', at: NOW - 2 * 60_000 }, NOW)).toBe('Works 2 min ago');
    expect(stateLine({ state: 'works', word: 'Works', at: NOW - 3 * 3600_000 }, NOW)).toBe('Works 3 hours ago');
    expect(stateLine({ state: 'works', word: 'Works', at: NOW - 3600_000 }, NOW)).toBe('Works 1 hour ago');
    expect(stateLine({ state: 'works', word: 'Works', at: NOW - 2 * 86400_000 }, NOW)).toBe('Works 2 days ago');
  });

  it('under a minute is just now', () => {
    expect(stateLine({ state: 'works', word: 'Works', at: NOW - 5000 }, NOW)).toBe('Works just now');
  });

  it('every other state is its word alone, but down, which says since when', () => {
    for (const [state, word] of [['not_connected', 'Not connected'], ['not_signed_in', 'Not signed in'], ['not_allowed', 'Not allowed'], ['nothing_to_read', 'Nothing to read'], ['unreachable', 'Could not reach its tools']]) {
      expect(stateLine({ state, word, at: NOW - 1000 }, NOW)).toBe(word);
    }
  });
});

describe('what agents can do, in plain words', () => {
  it('a tool name reads as a phrase', () => {
    expect(toolWords('list_issues')).toBe('List issues');
    expect(toolWords('get_issue')).toBe('Read an issue');
    expect(toolWords('create_issue')).toBe('Create an issue');
    expect(toolWords('search_pages')).toBe('Search pages');
    expect(toolWords('update_issue')).toBe('Update an issue');
    expect(toolWords('get_user')).toBe('Read a user');
    expect(toolWords('get_issue_status')).toBe('Read an issue status');
  });
});

describe('who has it', () => {
  const people = [
    { id: 'a', name: 'Maya', connections: ['linear'] },
    { id: 'b', name: 'Dev', connections: ['linear', 'test-tracker'] },
    { id: 'c', name: 'Sofia', connections: [] },
    { id: 'd', name: 'Old', },
  ];
  it('names the people with that tool, and only them', () => {
    expect(whoHasIt('linear', people).map((p) => p.id)).toEqual(['a', 'b']);
    expect(whoHasIt('test-tracker', people).map((p) => p.id)).toEqual(['b']);
    expect(whoHasIt('notion', people)).toEqual([]);
  });
  it('with no team there is nobody', () => {
    expect(whoHasIt('linear', undefined)).toEqual([]);
  });
});

describe('the link an agent writes in a thread', () => {
  it('opens the page, or the tool on it', () => {
    expect(connectionLinkOf('agentbox://connections')).toEqual({ id: null });
    expect(connectionLinkOf('agentbox://connections/')).toEqual({ id: null });
    expect(connectionLinkOf('agentbox://connections/linear')).toEqual({ id: 'linear' });
  });

  it('is nothing else, however close', () => {
    for (const h of ['agentbox://connections/linear/../../x', 'agentbox://connections/LINEAR?x=1', 'agentbox://elsewhere', 'https://connections/linear', 'agentbox://connectionsx', undefined, '']) {
      expect(connectionLinkOf(h)).toBeNull();
    }
  });

  it('survives the markdown step, which drops any scheme it does not know', () => {
    expect(artifactUrlTransform('agentbox://connections/linear')).toBe('agentbox://connections/linear');
    expect(keepConnectionLinks('agentbox://connections')).toBe('agentbox://connections');
    expect(keepConnectionLinks('agentbox://elsewhere')).toBe('');
    expect(artifactUrlTransform('agentbox://elsewhere')).toBe('');
    expect(keepConnectionLinks('javascript:alert(1)')).toBe('');
  });

  it('is a button in a thread, a teammate\'s thread and a group', () => {
    for (const f of ['renderer/src/components/Focus.tsx', 'renderer/src/threads/TeammateThread.tsx', 'renderer/src/team/rooms/RoomChat.tsx']) {
      expect(read(f), f).toMatch(/connectionLinkOf\(href\)/);
    }
    expect(read('renderer/src/team/rooms/RoomChat.tsx')).toMatch(/urlTransform=\{keepConnectionLinks\}/);
  });
});

describe('what crosses to the team', () => {
  const teamOf = () => {
    const cloud = createMemoryCloud();
    const a = signUpMemory(cloud, { email: 'a@x.test', name: 'A' });
    const b = signUpMemory(cloud, { email: 'b@x.test', name: 'B' });
    const c = signUpMemory(cloud, { email: 'c@x.test', name: 'C' });
    return { cloud, a, b, c };
  };

  it('a teammate sees which tools, nothing else', async () => {
    const { cloud, a, b } = teamOf();
    const ba = memoryBackend(cloud, a);
    const team = await ba.createTeam('T');
    cloud.members.push({ teamId: team.id, personId: b, role: 'member' });
    await ba.setConnections(['linear']);
    const seen = (await memoryBackend(cloud, b).teamPeople(team.id)).find((p) => p.id === a);
    expect(seen.connections).toEqual(['linear']);
    expect(Object.keys(seen).filter((k) => /token|read|account|client/i.test(k))).toEqual([]);
  });

  it('somebody off the team sees nothing', async () => {
    const { cloud, a, c } = teamOf();
    const ba = memoryBackend(cloud, a);
    const team = await ba.createTeam('T');
    await ba.setConnections(['linear']);
    expect(await memoryBackend(cloud, c).teamPeople(team.id)).toEqual([]);
  });

  it('only your own list can be written', async () => {
    const { cloud, a, b } = teamOf();
    await expect(memoryBackend(cloud, a).setConnections(['linear'], { personId: b })).rejects.toThrow();
  });

  it('only tool ids cross: not an object, not a sentence, not a long list', () => {
    expect(cleanConnections(['linear', 'test-tracker'])).toEqual(['linear', 'test-tracker']);
    expect(cleanConnections(['linear', 'linear'])).toEqual(['linear']);
    expect(cleanConnections(['Bearer abc def', { token: 'x' }, 'a'.repeat(41), null])).toEqual([]);
    expect(cleanConnections(Array.from({ length: 200 }, (_, i) => `t${i}`))).toHaveLength(MAX_CONNECTIONS);
    expect(cleanConnections('linear')).toEqual([]);
  });

  it('the migration lets a person write only that column, and a bad value cannot land', () => {
    const dir = path.join(root, 'cloud/supabase/migrations');
    const file = fs.readdirSync(dir).find((f) => /who_has_which_tool/.test(f));
    expect(file).toBeTruthy();
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(sql).toMatch(/add column if not exists connections text\[\]/);
    expect(sql).toMatch(/grant update \(connections\) on public\.people to authenticated/);
    expect(sql).toMatch(/check/i);
  });

  it('an app newer than the database still reads its team', () => {
    const src = read('main/team/supabase-backend.mjs');
    expect(src).not.toMatch(/PERSON_COLS = '[^']*connections/);
    expect(src).toMatch(/select\('id,connections'\)/);
  });
});

describe('where the page is', () => {
  // Above Files since 2026-11-02 (the-sidebar-reads-inbox-chats-connections-files).
  it('in the sidebar, right above Files', () => {
    const nav = read('renderer/src/components/WorkspaceNavigation.tsx');
    expect(nav.indexOf('data-tab="files"')).toBeGreaterThan(nav.indexOf('data-tab="connections"'));
    expect(nav.indexOf('data-tab="files"') - nav.indexOf('data-tab="connections"')).toBeLessThan(1200);
  });

  it('in Command K', () => {
    expect(read('renderer/src/components/Palette.tsx')).toMatch(/id: 'view-connections', label: 'Connections'/);
  });

  it('every door the window needs is there, on both sides', () => {
    const preload = read('preload.cjs');
    const ipc = read('main/ipc.mjs');
    for (const c of ['connections', 'connections-connect', 'connections-cancel', 'connections-check', 'connections-disconnect', 'connections-accept']) {
      expect(preload).toContain(`'zero:${c}'`);
      expect(ipc).toContain(`'zero:${c}'`);
    }
  });

  it('nothing the page reads carries a token', () => {
    const service = read('main/connections/index.mjs');
    const tile = service.slice(service.indexOf('const tileOf'), service.indexOf('// One refresh per connection'));
    expect(tile).not.toMatch(/token|client|metadata/i);
  });
});
