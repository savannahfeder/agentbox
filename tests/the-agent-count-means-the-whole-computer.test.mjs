// THE NUMBER YOU PICK FOR HOW MANY RUN AT ONCE IS FOR THE WHOLE COMPUTER.
//
// 2026-10-11: the Running page read "14 agents" and "You set this. Automatic
// would run 6", on a 16 GB Mac that then ran out of memory. Nobody had picked
// 14. The file held 7, stored PER LOGIN by the stepper that was there before
// 5 Oct; two Claude logins made it 14, and the 5 Oct update read any number in
// the file as "you set this" and switched Automatic off.
//
// So the number is now the machine's (`agentsAtOnce`), shared out across the
// logins exactly, and a number stored under the old per-login meaning is not
// read as a choice: that install goes back to Automatic.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { setWorkspaceSetting } from '../main/settings.mjs';
import { loadConfig } from '../main/config.mjs';
import { agentCountOptions } from '../renderer/src/components/Settings.tsx';

const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-computer-')); dirs.push(d); return d; };

function fleet({ logins = 2, agentsAtOnce, agentsAuto = false } = {}) {
  const dir = tmp();
  const config = {
    home: dir, appDir: dir, storeRoot: dir,
    authProfiles: ['default', ...Array.from({ length: logins - 1 }, (_, n) => `${dir}/.claude-${n + 2}`)],
    maxConcurrentSessions: 3, agentsAuto, agentsAtOnce,
  };
  const sup = new Supervisor(config, { listItems: () => [], listProducts: () => [], isDue: () => true }, dir);
  sup._engineFor = () => 'claude';
  sup._profilesFor = (engine) => (engine === 'claude' ? config.authProfiles : []);
  return { sup, config, dir };
}

describe('the fleet runs the number you picked, on any number of logins', () => {
  it('7 on two logins runs 7, not 14', () => {
    const { sup, config } = fleet({ logins: 2 });
    setWorkspaceSetting({ config, supervisor: sup }, { key: 'sessionsAtOnce', value: 7 });
    expect(sup._capacityFor('claude')).toBe(7);
    expect(config.agentsAtOnce).toBe(7);
    expect(config.agentsAuto).toBe(false);
  });

  it('7 on one login runs 7, and 6 on two runs 6', () => {
    expect(fleet({ logins: 1, agentsAtOnce: 7 }).sup._capacityFor('claude')).toBe(7);
    expect(fleet({ logins: 2, agentsAtOnce: 6 }).sup._capacityFor('claude')).toBe(6);
  });

  it('an odd number is shared out with the extra one, not rounded away', () => {
    const { sup } = fleet({ logins: 2, agentsAtOnce: 7 });
    expect(sup._slotsPerAccount('claude')).toBe(4);
    expect(sup._capacityFor('claude')).toBe(7);
  });

  it('one agent on two logins is one agent', () => {
    expect(fleet({ logins: 2, agentsAtOnce: 1 }).sup._capacityFor('claude')).toBe(1);
  });

  it('writes the machine number to the file, never a per-login one', () => {
    const { sup, config, dir } = fleet({ logins: 2 });
    setWorkspaceSetting({ config, supervisor: sup }, { key: 'sessionsAtOnce', value: 5 });
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8'));
    expect(onDisk.agentsAtOnce).toBe(5);
    expect(onDisk.agentsAuto).toBe(false);
  });
});

// 2026-10-27: Automatic said 6 on her 16 GB Mac, Codex was signed in beside
// Claude, and each engine was held to 6 on its own. The minute log read
// "capacity 12" all evening; nine ran at once and the Mac stopped answering.
describe('the number holds with Codex signed in too', () => {
  function both({ agentsAuto = true, agentsAtOnce } = {}) {
    const dir = tmp();
    const config = {
      home: dir, appDir: dir, storeRoot: dir,
      authProfiles: ['default', `${dir}/.claude-2`, `${dir}/.claude-3`],
      codexProfiles: ['default', `${dir}/.codex-2`],
      codexBin: '/nonexistent/codex', engineChoice: '2026-09-04T00:00:00Z',
      maxConcurrentSessions: 3, agentsAuto, agentsAtOnce, memoryGate: true,
    };
    const sup = new Supervisor(config, { listItems: () => [], listProducts: () => [], isDue: () => true }, dir);
    sup._profilesFor = (engine) => (engine === 'claude' ? config.authProfiles : config.codexProfiles);
    sup._machine = () => ({ memBytes: 16 * 1024 ** 3, cores: 10 });
    return sup;
  }

  it('Automatic on a 16 GB Mac runs 6 in all, not 6 of each', () => {
    const sup = both();
    expect(sup._capacityFor('codex')).toBe(6);
    expect(sup._capacity()).toBe(6);
  });

  it('a number picked on the menu is the whole computer across both', () => {
    expect(both({ agentsAuto: false, agentsAtOnce: 4 })._capacity()).toBe(4);
  });

  it('a full Claude fleet leaves no room for Codex on this Mac', () => {
    const sup = both();
    for (let n = 0; n < 6; n++) sup.sessions.set(`c-${n}`, { itemId: `c-${n}`, engine: 'claude' });
    expect(sup._localSlotFor('codex')).toBe(false);
    sup.sessions.delete('c-0');
    expect(sup._localSlotFor('codex')).toBe(true);
  });
});

describe('a number stored per login before is not taken as a choice', () => {
  const load = (file) => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify(file));
    return loadConfig(dir, { home: dir });
  };

  it('the old per-login 7, with Automatic written off, comes back on Automatic', () => {
    expect(load({ maxConcurrentSessions: 7, agentsAuto: false }).agentsAuto).toBe(true);
    expect(load({ maxConcurrentSessions: 2 }).agentsAuto).toBe(true);
  });

  it('a machine number picked on the new menu stays picked', () => {
    const c = load({ agentsAtOnce: 5, agentsAuto: false });
    expect(c.agentsAuto).toBe(false);
    expect(c.agentsAtOnce).toBe(5);
  });

  it('Automatic chosen after a number is Automatic', () => {
    expect(load({ agentsAtOnce: 5, agentsAuto: true }).agentsAuto).toBe(true);
  });
});

describe('the menu says what will run', () => {
  it('each option is the number it stores, whatever the logins', () => {
    const two = agentCountOptions({ slotsMax: 12, agentsTotal: 6, accounts: [{}, {}] });
    expect(two.find((o) => o.value === '7').label).toBe('7 agents');
    expect(two.some((o) => o.label === '14 agents')).toBe(false);
  });
});
