// THE MEMORY SWITCH IS SAVED AND TAKES EFFECT AT ONCE — w-3958c3753d.
//
// "Hold heavy work when memory is short" sits on the Agents page, off out of
// the box. Turning it on must start the coordinator now, not at the next
// launch, and be written to the config so the next launch starts it too. The
// number of heavy commands at once is Auto (one per 8 GB) until somebody picks
// one, and picking Auto again goes back to the machine's own number.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../main/config.mjs';
import { setWorkspaceSetting, memoryGateSettings } from '../main/settings.mjs';
import { NAME } from '../shared/product-name.mjs';

function withConfig(onDisk) {
  const appDir = mkdtempSync(join(tmpdir(), 'gate-settings-'));
  writeFileSync(join(appDir, 'zero.config.json'), JSON.stringify(onDisk));
  const config = loadConfig(appDir);
  config.appDir = appDir;
  return { appDir, config, onDisk: () => JSON.parse(readFileSync(join(appDir, 'zero.config.json'), 'utf8')) };
}

function fakeSupervisor() {
  const calls = [];
  return {
    calls,
    setMemoryGate: async (on) => { calls.push(['on', on]); },
    memoryGateSlots: () => 2,
    memoryGateStatus: () => null,
  };
}

describe('the switch', () => {
  it('is off when nobody has touched it', () => {
    const { config } = withConfig({});
    expect(config.memoryGate).toBe(false);
    expect(memoryGateSettings({ config, supervisor: fakeSupervisor() }).on).toBe(false);
  });

  it('turning it on starts the coordinator now and is remembered', () => {
    const { config, onDisk } = withConfig({});
    const supervisor = fakeSupervisor();
    setWorkspaceSetting({ config, supervisor }, { key: 'memoryGate', value: true });
    expect(supervisor.calls).toEqual([['on', true]]);
    expect(onDisk().memoryGate).toBe(true);
    expect(config.memoryGate).toBe(true);
  });

  it('turning it off stops it and is remembered', () => {
    const { config, onDisk } = withConfig({ memoryGate: true });
    const supervisor = fakeSupervisor();
    setWorkspaceSetting({ config, supervisor }, { key: 'memoryGate', value: false });
    expect(supervisor.calls).toEqual([['on', false]]);
    expect(onDisk().memoryGate).toBe(false);
  });
});

describe('heavy commands at once', () => {
  it('is Auto until somebody picks a number, and a pick reaches the running coordinator', () => {
    const { config, onDisk } = withConfig({ memoryGate: true });
    const supervisor = fakeSupervisor();
    expect(memoryGateSettings({ config, supervisor })).toMatchObject({ on: true, slots: null, slotsAuto: 2 });
    setWorkspaceSetting({ config, supervisor }, { key: 'memoryGateSlots', value: 3 });
    expect(onDisk().memoryGateSlots).toBe(3);
    expect(supervisor.calls).toEqual([['on', true]]);
  });

  it('Auto clears the pick', () => {
    const { config, onDisk } = withConfig({ memoryGate: true, memoryGateSlots: 3 });
    setWorkspaceSetting({ config, supervisor: fakeSupervisor() }, { key: 'memoryGateSlots', value: null });
    expect(onDisk().memoryGateSlots).toBe(null);
  });

  it('a pick out of range is brought inside it', () => {
    const { config, onDisk } = withConfig({});
    setWorkspaceSetting({ config, supervisor: fakeSupervisor() }, { key: 'memoryGateSlots', value: 99 });
    expect(onDisk().memoryGateSlots).toBe(12);
    setWorkspaceSetting({ config, supervisor: fakeSupervisor() }, { key: 'memoryGateSlots', value: 0 });
    expect(onDisk().memoryGateSlots).toBe(1);
  });
});

describe('what the page shows', () => {
  it('a plain sentence about right now, only while it is on', () => {
    const { config } = withConfig({ memoryGate: true });
    const supervisor = {
      ...fakeSupervisor(),
      memoryGateStatus: () => ({
        role: 'owner', pressure: 'tight', slots: 2,
        running: [{ holdsSlot: true }, { holdsSlot: false }], waiting: [{}, {}, {}],
      }),
    };
    expect(memoryGateSettings({ config, supervisor }).now).toBe('Memory is tight. 1 heavy command running, 3 waiting.');
    const idle = { ...fakeSupervisor(), memoryGateStatus: () => ({ role: 'owner', pressure: 'normal', running: [], waiting: [] }) };
    expect(memoryGateSettings({ config, supervisor: idle }).now).toBe('Memory is fine. Nothing heavy running.');
    const standby = { ...fakeSupervisor(), memoryGateStatus: () => ({ role: 'standby', running: [], waiting: [] }) };
    expect(memoryGateSettings({ config, supervisor: standby }).now).toBe(`Another ${NAME} on this Mac is coordinating.`);
    const { config: off } = withConfig({});
    expect(memoryGateSettings({ config: off, supervisor: fakeSupervisor() }).now).toBe(null);
  });
});
