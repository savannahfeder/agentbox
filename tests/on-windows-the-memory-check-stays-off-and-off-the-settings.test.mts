// ON WINDOWS THE MEMORY CHECK STAYS OFF AND OFF THE SETTINGS.
//
// Measured on Windows Server 2022 on main: the gate tried to listen on a unix
// socket, failed with `listen EACCES ... agentbox-memory-gate.sock` and tried
// again, 69 lines in one browser-mode log, while every Claude worker still
// carried `memory-gate-hook.sh`, which needs `curl --unix-socket`. Until the
// gate has a Windows channel it does nothing there: no listening, no hooks, no
// variables, and no switch on the Running page that cannot take effect.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';
import { memoryGateSettings } from '../main/settings.mts';
import { memoryGateWorksOn } from '../main/memory-gate.mts';
import { phoneSettingsOf } from '../shared/phone-settings.mts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const made: Supervisor[] = [];
afterEach(async () => {
  Object.defineProperty(process, 'platform', realPlatform);
  for (const s of made.splice(0)) await s.stopMemoryGate?.();
});

const item = { id: 'w-1', product: 'demo', priority: 7 };
const settingsSupervisor = { memoryGateStatus: () => null, leftoverStatus: () => null, startHoldStatus: () => null };

function on(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-win-'));
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, codexHome: path.join(tmp, '.codex'), memoryGate: true, memoryGateSocket: path.join(tmp, 'g.sock'), memoryGateLockPort: 0 }, store, root, tmp, tmp);
  made.push(sup);
  return { sup, tmp };
}

describe('which platforms the memory check works on', () => {
  it('is every one but Windows', () => {
    expect(memoryGateWorksOn('darwin')).toBe(true);
    expect(memoryGateWorksOn('linux')).toBe(true);
    expect(memoryGateWorksOn('win32')).toBe(false);
  });
});

describe('on Windows with the switch on', () => {
  it('a worker carries no hook and no gate variables', () => {
    const { sup } = on('win32');
    expect(sup.memoryGateHooks()).toBeNull();
    expect(sup.memoryGateEnv(item)).toEqual({});
    expect(sup.codexMemoryGateEnv()).toEqual({});
  });

  it('turning it on starts no coordinator and touches no Codex home', async () => {
    const { sup, tmp } = on('win32');
    await sup.setMemoryGate(true);
    expect(sup._memoryGate ?? null).toBeNull();
    expect(fs.existsSync(path.join(tmp, '.codex'))).toBe(false);
  });

  it('the phone gets no memory switch either', () => {
    const phone = phoneSettingsOf({ ok: true, workspace: { memoryGate: null } }, { version: null });
    expect(phone?.workspace.memoryGate).toBeNull();
    const mac = phoneSettingsOf({ ok: true, workspace: { memoryGate: { on: true, slots: null, slotsAuto: 2, slotsMax: 12, now: null } } }, { version: null });
    expect(mac?.workspace.memoryGate?.on).toBe(true);
  });

  it('the Running page has no memory switch', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(memoryGateSettings({ config: { memoryGate: true }, supervisor: settingsSupervisor })).toBeNull();
  });
});

describe('on a Mac or Linux with the switch on', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    it(`a worker still carries the hook and the variables (${platform})`, () => {
      const { sup } = on(platform);
      expect(JSON.stringify(sup.memoryGateHooks())).toContain('memory-gate-hook.sh');
      expect(sup.memoryGateEnv(item)).toHaveProperty('AGENTBOX_GATE_SOCK');
    });

    it(`the Running page shows the switch on (${platform})`, () => {
      Object.defineProperty(process, 'platform', { value: platform });
      expect(memoryGateSettings({ config: { memoryGate: true }, supervisor: settingsSupervisor })?.on).toBe(true);
    });
  }
});
