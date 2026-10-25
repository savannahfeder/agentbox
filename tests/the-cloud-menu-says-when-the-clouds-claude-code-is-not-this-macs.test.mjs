// THE CLOUD MENU SAYS WHEN THE CLOUD'S CLAUDE CODE IS NOT THIS MAC'S.
//
// What broke: scripts/cloud-setup.mjs pins the cloud image to the Claude Code
// and Codex this Mac ran when the image was built, and writes both versions
// into cloud.json, but nothing ever read them back. Once this Mac's Claude
// Code moved on, a thread could start here on one version and resume in the
// cloud on another, and nobody was told to rebuild the image. Measured here:
// with the image at 2.1.4 and this Mac at 2.3.0, `cloudStatus()` said nothing
// and the menu's last line read "Nothing running in the cloud now".
//
// Now a different major.minor is said in the menu's last line; a different
// major, which is a known break, also keeps that engine's threads on this Mac.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { cloudVersionGaps } from '../shared/cloud-versions.mjs';
import { cloudFootLine } from '../renderer/src/cloud-menu';

let tmp;
beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudver-'))); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('the versions compared', () => {
  it('names a different major.minor, Claude Code first', () => {
    expect(cloudVersionGaps({ cloud: { claude: '2.1.4', codex: '0.40.0' }, mac: { claude: '2.3.0', codex: '0.41.2' } })).toEqual([
      { engine: 'claude', cloud: '2.1', mac: '2.3', blocks: false },
      { engine: 'codex', cloud: '0.40', mac: '0.41', blocks: false },
    ]);
  });

  it('says nothing of a patch release, or of a version it could not read', () => {
    expect(cloudVersionGaps({ cloud: { claude: '2.1.4' }, mac: { claude: '2.1.9' } })).toEqual([]);
    expect(cloudVersionGaps({ cloud: { claude: '2.1.4' }, mac: {} })).toEqual([]);
    expect(cloudVersionGaps({ cloud: {}, mac: { claude: '2.1.4' } })).toEqual([]);
    expect(cloudVersionGaps({ cloud: { claude: 'nonsense' }, mac: { claude: '2.1.4' } })).toEqual([]);
  });

  it('counts a different major as a break', () => {
    expect(cloudVersionGaps({ cloud: { claude: '2.9.0' }, mac: { claude: '3.0.1' } })).toEqual([{ engine: 'claude', cloud: '2.9', mac: '3.0', blocks: true }]);
  });
});

describe('the supervisor', () => {
  function supervisor(image) {
    const cfg = path.join(tmp, 'cloud.json');
    fs.writeFileSync(cfg, JSON.stringify({ region: 'r', bucket: 'b', runtimeArn: 'arn', ...image }));
    process.env.AGENTBOX_CLOUD_CONFIG = cfg;
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, tmp);
    sup._saveState = () => {};
    sup._cloudRoom = () => true;
    sup._cloudStarting = () => 0;
    return sup;
  }
  afterEach(() => { delete process.env.AGENTBOX_CLOUD_CONFIG; });

  it('reads this Mac\'s versions off the thread and says the gap in its status, without stopping runs', async () => {
    const sup = supervisor({ claudeCodeVersion: '2.1.4', codexVersion: '0.41.0' });
    sup._readMacAgentVersion = async (engine) => (engine === 'claude' ? '2.3.0' : '0.41.5');
    expect(sup.cloudStatus().versionGap).toBe(null);
    await sup._refreshMacAgentVersions();
    expect(sup.cloudStatus().versionGap).toEqual({ engine: 'claude', cloud: '2.1', mac: '2.3', blocks: false });
    expect(sup._cloudSlotFor('claude')).toBe(true);
  });

  it('keeps an engine\'s threads off a cloud a major version apart, and only that engine\'s', async () => {
    const sup = supervisor({ claudeCodeVersion: '2.9.0', codexVersion: '0.41.0' });
    sup._readMacAgentVersion = async (engine) => (engine === 'claude' ? '3.0.0' : '0.41.0');
    await sup._refreshMacAgentVersions();
    expect(sup._cloudSlotFor('claude')).toBe(false);
    expect(sup._cloudSlotFor('codex')).toBe(true);
    expect(sup.cloudStatus().versionGap).toMatchObject({ engine: 'claude', blocks: true });
  });

  it('says nothing when the versions agree, or this Mac\'s cannot be read', async () => {
    const sup = supervisor({ claudeCodeVersion: '2.1.4', codexVersion: '0.41.0' });
    sup._readMacAgentVersion = async (engine) => { if (engine === 'claude') return '2.1.7'; throw new Error('not installed'); };
    await sup._refreshMacAgentVersions();
    expect(sup.cloudStatus().versionGap).toBe(null);
  });
});

describe('the cloud menu\'s last line', () => {
  const base = { setUp: true, mode: 'full', running: 2, month: { runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null }, accounts: [] };

  it('says which to rebuild', () => {
    expect(cloudFootLine({ ...base, versionGap: { engine: 'claude', cloud: '2.1', mac: '2.3', blocks: false } })).toBe('The cloud\'s Claude Code is 2.1, this Mac\'s is 2.3: rebuild the cloud image');
  });

  it('and, for a break, where those threads run meanwhile', () => {
    expect(cloudFootLine({ ...base, versionGap: { engine: 'codex', cloud: '0.9', mac: '1.0', blocks: true } })).toBe('The cloud\'s Codex is 0.9, this Mac\'s is 1.0: rebuild the cloud image. Codex threads run on this Mac until then.');
  });

  it('is the running count when the versions agree', () => {
    expect(cloudFootLine({ ...base, versionGap: null })).toBe('2 running in the cloud now');
  });
});
