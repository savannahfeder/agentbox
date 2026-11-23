// THE PHONE'S PROJECT PICKER SAYS WHICH COMPUTER EACH PROJECT IS ON, AND WHETHER IT IS ON.
//
// QA on 2026-11-15 (M-19, Android): New thread › Project listed the paired
// computer's five projects mixed, in name order, with 'My Workspace (0d99)',
// 'My Workspace (ac08)', 'Sandbox 1' and 'Web Todo' from computers long gone.
// Nothing said where each lived or that it was off, and a thread filed to one
// sat Queued for good. The list came straight from phone_projects ordered by
// name, and two same-named projects were told apart by four hex digits of the
// device id. Each computer renews its projects every 30 seconds
// (main/phone-inbox.mts), so a project's updated_at says whether its computer is on.
import { describe, it, expect } from 'vitest';
import { projectsByComputer, runnableFirst } from '../mobile/src/lib/project-computers';
import { phoneView } from '../renderer/src/phone-rows';

const NOW = Date.parse('2026-11-15T18:30:00Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const HERE = 'aaaaaaaaaaaa';
const GONE = '0d99bbbbbbbb';
const OLD = 'ac08cccccccc';
const MIN = 60_000;
const DAY = 24 * 3600_000;

const projects = [
  { device: HERE, project: 'notes', name: 'Notes', updated_at: at(20_000) },
  { device: GONE, project: 'my-workspace', name: 'My Workspace', updated_at: at(3 * DAY) },
  { device: HERE, project: 'my-workspace', name: 'My Workspace', updated_at: at(20_000) },
  { device: OLD, project: 'my-workspace', name: 'My Workspace', updated_at: at(9 * DAY) },
  { device: OLD, project: 'sandbox-1', name: 'Sandbox 1', updated_at: at(9 * DAY) },
  { device: GONE, project: 'web-todo', name: 'Web Todo', updated_at: at(3 * DAY) },
];
const computers = [{ device: HERE, name: 'MacBook Pro' }, { device: GONE, name: 'Studio' }];

describe('the project picker, with projects from computers that are off', () => {
  const groups = projectsByComputer(projects, computers, NOW);

  it('groups the projects by computer, the one that is on first', () => {
    expect(groups.map((g) => g.device)).toEqual([HERE, GONE, OLD]);
    expect(groups[0].projects.map((p) => p.name)).toEqual(['Notes', 'My Workspace']);
    expect(groups[1].projects.map((p) => p.name)).toEqual(['My Workspace', 'Web Todo']);
  });

  it('names each computer, and says which are on and when the others last were', () => {
    expect(groups.map((g) => g.label)).toEqual(['MacBook Pro · online', 'Studio · last online 3 days ago', 'Another computer · last online 9 days ago']);
  });

  it('shows a project by its own name inside its computer, without a code after it', () => {
    expect(groups.flatMap((g) => g.projects.map((p) => p.name)).some((n) => /\(/.test(n))).toBe(false);
  });

  it('says a computer that is off still runs its threads when the cloud carries them', () => {
    const [g] = projectsByComputer([{ ...projects[1], cloud: true }], computers, NOW);
    expect(g.label).toBe('Studio · off, runs in Agentbox Cloud');
    expect(g.runs).toBe(true);
  });

  it('counts a computer as on just inside its 90 seconds, and off just past them', () => {
    const on = projectsByComputer([{ ...projects[0], updated_at: at(89_000) }], computers, NOW)[0];
    const off = projectsByComputer([{ ...projects[0], updated_at: at(91_000) }], computers, NOW)[0];
    expect(on.label).toBe('MacBook Pro · online');
    expect(off.label).toBe('MacBook Pro · last online 2 minutes ago');
    expect(off.runs).toBe(false);
  });

  it('puts a cloud-carried computer that is off ahead of one that is off and not carried', () => {
    const order = projectsByComputer([
      { device: OLD, project: 'a', name: 'A', updated_at: at(5 * MIN) },
      { device: GONE, project: 'b', name: 'B', updated_at: at(3 * DAY), cloud: true },
    ], computers, NOW).map((g) => g.device);
    expect(order).toEqual([GONE, OLD]);
  });
});

describe('the project a new thread opens on', () => {
  it('is one that can run, not the first name in the alphabet on a computer that is gone', () => {
    // In name order, as the phone reads them (PROJECTS_SELECT), Studio's My Workspace comes first.
    const byName = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    const products = phoneView({ projects: byName, threads: [], commands: [] }, NOW).products;
    expect(products[0].slug).toBe(`my-workspace@${GONE}`);
    const first = runnableFirst(products, projectsByComputer(projects, computers, NOW))[0];
    expect(first.slug.endsWith(`@${HERE}`)).toBe(true);
  });

  it('keeps the list as it was when every computer is on', () => {
    const live = projects.map((p) => ({ ...p, updated_at: at(10_000) }));
    const products = phoneView({ projects: live, threads: [], commands: [] }, NOW).products;
    expect(runnableFirst(products, projectsByComputer(live, computers, NOW)).map((p) => p.slug)).toEqual(products.map((p) => p.slug));
  });
});

describe('a project name two computers share, on the rest of the phone', () => {
  it('is told apart by the computer it is on', () => {
    const products = phoneView({ projects, threads: [], commands: [] }, NOW, computers).products;
    expect(products.find((p) => p.slug === `my-workspace@${GONE}`)?.name).toBe('My Workspace (Studio)');
    expect(products.find((p) => p.slug === `my-workspace@${HERE}`)?.name).toBe('My Workspace (MacBook Pro)');
  });

  it('falls back to the short code for a computer that never sent its name', () => {
    const products = phoneView({ projects, threads: [], commands: [] }, NOW, computers).products;
    expect(products.find((p) => p.slug === `my-workspace@${OLD}`)?.name).toBe('My Workspace (ac08)');
  });

  it('is left alone when no other computer has a project of that name', () => {
    const products = phoneView({ projects, threads: [], commands: [] }, NOW, computers).products;
    expect(products.find((p) => p.slug === `web-todo@${GONE}`)?.name).toBe('Web Todo');
  });
});
