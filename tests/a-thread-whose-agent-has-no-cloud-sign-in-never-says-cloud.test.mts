// Four power testers (2026-11-09) sent Codex threads with the cloud on and no
// Codex account signed in to the cloud. Each ran on this Mac, and once it
// answered its button said "Runs on Cloud": "Answered Codex run has cloud badge
// despite missing cloud account", "stopping local codex changes location label
// to cloud". The thread's place was read from its project alone; its engine,
// which the cloud cannot run, was never asked.
import { describe, it, expect } from 'vitest';
import { threadPlace, type CloudStatus } from '../renderer/src/cloud-menu.ts';

const cloud = { setUp: true, mode: 'all', running: 0, month: {}, projects: ['p'], noCloudSignIn: ['codex'] } as unknown as CloudStatus;
const item = { id: 'w-1', product: 'p' };

describe("a thread's place when its agent cannot run in the cloud", () => {
  it('is not Cloud for a Codex thread with no Codex sign-in in the cloud', () => {
    expect(threadPlace(item, null, cloud, 'codex')).toBe(null);
    expect(threadPlace(item, { where: 'mac' }, cloud, 'codex')).toBe(null);
  });

  it('is still Cloud for a Claude Code thread, and for Codex once it is signed in', () => {
    expect(threadPlace(item, null, cloud, 'claude')).toBe('here');
    expect(threadPlace(item, null, { ...cloud, noCloudSignIn: [] } as CloudStatus, 'codex')).toBe('here');
  });

  it('says cloud for a run that is in the cloud now, whatever the list says', () => {
    expect(threadPlace(item, { where: 'cloud' }, cloud, 'codex')).toBe('cloud');
  });

  it('a thread kept on this Mac still says so', () => {
    expect(threadPlace({ ...item, onMac: true }, null, cloud, 'codex')).toBe('kept');
  });
});
