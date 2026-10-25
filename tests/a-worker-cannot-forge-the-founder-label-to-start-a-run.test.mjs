// A worker can put the 'founder' label on any row through the store MCP
// (create_work_item / update_work_item take a free labels array), and
// `_isFreshWork` only checked the label was PRESENT, never who wrote it, so a
// forged label auto-spawned a run the founder never asked for. compose, a
// hand-typed founder row, and a repeat occurrence all stamp labels as
// founder/system; only a forged one is authored 'agent'. Measured with the real
// fold + `_isFreshWork`: before the fix an agent-authored 'founder' label read
// as fresh work (true); after, only a founder/system author does.
import { describe, it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';

const row = ({ source, labels = [], id = 'w-1', product = 'acme' }) => {
  const it = foldWorkItems([{ id, ts: 1, source, patch: { title: 't', kind: 'directive', status: 'open', labels } }]).get(id);
  it.product = product;
  return it;
};

const sup = (autonomousProducts = []) => Object.assign(Object.create(Supervisor.prototype), {
  config: { autonomousProducts },
  restingUntil: () => 0,
  _weSaidItRunsAgain: () => false,
});

const fresh = (s, it) => Supervisor.prototype._isFreshWork.call(s, it);

describe('only a founder- or system-written founder label is fresh work', () => {
  it('runs a row the founder composed (system-stamped label)', () => {
    expect(fresh(sup(), row({ source: 'system', labels: ['founder'] }))).toBe(true);
  });
  it('runs a row the founder labelled by hand (founder-stamped label)', () => {
    expect(fresh(sup(), row({ source: 'founder', labels: ['founder'] }))).toBe(true);
  });
  it('does NOT run a row whose founder label an agent forged', () => {
    expect(fresh(sup(), row({ source: 'agent', labels: ['founder'] }))).toBe(false);
  });
  it('still runs agent work in an autonomous product, with no founder label', () => {
    expect(fresh(sup(['acme']), row({ source: 'agent', labels: [] }))).toBe(true);
  });
  it('does NOT run an ordinary agent proposal', () => {
    expect(fresh(sup(), row({ source: 'agent', labels: ['proposal'] }))).toBe(false);
  });
  it('still runs a founder row with no recorded label author (a legacy row)', () => {
    const legacy = { id: 'w-1', product: 'acme', status: 'open', kind: 'directive', labels: ['founder'], wrote: {} };
    expect(fresh(sup(), legacy)).toBe(true);
  });
});
