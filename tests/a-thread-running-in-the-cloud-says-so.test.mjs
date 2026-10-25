// A THREAD RUNNING IN THE CLOUD SAYS SO, AND NOTHING ELSE CHANGES.
//
// With cloud runs on (docs/cloud/PLAN.md) a thread past this Mac's slots runs
// in an AWS sandbox. The work behaves the same, but where it runs is a fact
// she should be able to see at a glance: it is why the Mac stays quiet, and
// it is why closing the lid will not stop it. The supervisor marks such a
// session `where: 'cloud'`; the line under the title adds "In the cloud",
// and a run on this Mac reads exactly as it did before.

import { describe, it, expect } from 'vitest';
import { bylineFacts, stateLedParts } from '../renderer/src/byline';

const now = 1_791_900_000_000;
const item = { id: 'w-1', product: 'p', productName: 'Agentbox', title: 't', status: 'claimed', kind: 'directive', labels: ['founder'], createdAt: now - 3600e3, updatedAt: now - 60e3 };
const session = (extra = {}) => ({ itemId: 'w-1', product: 'p', startedAt: now - 4 * 60e3, tail: [], ...extra });

describe('the line under a running thread', () => {
  it('says "In the cloud" for a run in the cloud', () => {
    const f = bylineFacts(item, { session: session({ where: 'cloud' }), inProgress: true, now });
    expect(f.placeWord).toBe('In the cloud');
    expect(stateLedParts(f, null)).toContain('In the cloud');
    expect(f.line).toMatch(/running in the cloud/);
  });

  it('says nothing new for a run on this Mac', () => {
    const f = bylineFacts(item, { session: session(), inProgress: true, now });
    expect(f.placeWord).toBe(null);
    expect(stateLedParts(f, null)).not.toContain('In the cloud');
    expect(f.line).not.toMatch(/cloud/);
  });

  it('says nothing about the cloud once the run is over', () => {
    const f = bylineFacts({ ...item, status: 'done' }, { session: null, now });
    expect(f.placeWord).toBe(null);
  });
});
