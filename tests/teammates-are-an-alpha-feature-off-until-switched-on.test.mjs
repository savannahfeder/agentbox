// "Ship it, but keep it as a hidden alpha feature" (w-4bd7b5548b). Teammates
// are a switch in Settings, Alpha features, off unless turned on. Off, nothing
// of them runs or shows: no sidebar rows or pages (the snapshot carries none),
// no tick that wakes them or offers one for repeated asks, no hint naming one
// in a thread, no store calls from the screen, and no team tools offered to an
// agent while there is no teammate to talk to.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alphaFeatures } from '../main/settings.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { teammatesOn } from '../shared/teammates.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const FELIX = { id: 't-felix00001', name: 'Felix', status: 'active' };

describe('the switch', () => {
  it('is off unless someone turned it on, and only a real true counts', () => {
    expect(alphaFeatures({}).teammates).toBe(false);
    expect(alphaFeatures({ alphaTeammates: 'yes' }).teammates).toBe(false);
    expect(alphaFeatures({ alphaTeammates: true }).teammates).toBe(true);
    expect(teammatesOn(undefined)).toBe(false);
  });

  it('sits in Settings, Alpha features, and the phone may set it too', () => {
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/<Switch label="Teammates" on=\{!!w\.alpha\?\.teammates\} onChange=\{\(v\) => setWorkspace\('alphaTeammates', v\)\} \/>/);
    expect(read('main/settings.mjs')).toMatch(/case 'alphaTeammates':\n\s+saveConfig\(config, \{ alphaTeammates: !!value \}\);/);
    expect(read('shared/phone-settings.mjs')).toMatch(/alphaTeammates: bool,/);
  });
});

describe('with the switch off', () => {
  const make = (config, teammates) => new Supervisor(
    { storeRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'zero-tm-alpha-')), maxConcurrentSessions: 1, ...config },
    { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null, teammates },
    '/tmp',
  );

  it('nothing wakes a teammate or offers one, and it does when on', async () => {
    let ticks = 0;
    const teammates = { tick: async () => { ticks += 1; return []; }, list: () => [FELIX], noteTrouble() {} };
    await make({}, teammates).serveTeammates();
    expect(ticks).toBe(0);
    await make({ alphaTeammates: true }, teammates).serveTeammates();
    expect(ticks).toBe(1);
  });

  it('a thread naming a teammate gets no hint to hand it over', () => {
    const thread = { id: 'w-1', product: 'p', labels: ['founder'] };
    const teammates = { list: () => [FELIX] };
    expect(make({}, teammates).namedThreadsBlock(thread, { slug: 'p' }, ['@Felix take this'])).toBe('');
    expect(make({ alphaTeammates: true }, teammates).namedThreadsBlock(thread, { slug: 'p' }, ['@Felix take this'])).toMatch(/team_pass/);
  });

  it('the screen gets no teammates and its calls are refused', () => {
    const ipc = read('main/ipc.mjs');
    expect(ipc).toMatch(/teammates: alpha\.teammates \? \(\(\) => \{ try \{ return store\.teammatesView\(items, now\); \}/);
    expect(ipc).toMatch(/if \(!alphaFeatures\(config\)\.teammates\) return \{ ok: false, error: 'Teammates are an alpha feature\. Turn them on in Settings, Alpha features\.' \};/);
  });
});

describe('the team tools an agent is offered', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('are there only once there is a teammate to talk to', async () => {
    const { appHome } = await import('../main/store/home.mjs');
    const account = `acct-alpha-${Math.random().toString(36).slice(2, 8)}`;
    process.env.STORE_ACCOUNT_ID = account;
    fs.mkdirSync(path.join(appHome(), 'accounts', account), { recursive: true });
    const { buildTools } = await import('../mcp/tools.mjs');
    const names = () => buildTools({ holder: 't' }).tools.map((t) => t.name);
    expect(names().filter((n) => n.startsWith('team_'))).toEqual([]);
    const { writeTeammate, teamDir } = await import('../main/store/teammates-files.mjs');
    const { legacyRoot } = await import('../main/store/project.mjs');
    writeTeammate(teamDir(legacyRoot(), account), 't-fe11c00001', { name: 'Felix', status: 'active' }, Date.now());
    expect(names().filter((n) => n.startsWith('team_')).sort()).toEqual(['team_hire', 'team_method', 'team_pass', 'team_playbook', 'team_post', 'team_remember', 'team_roster', 'team_setup']);
  });
});
