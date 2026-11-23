// A SHARED PROJECT NAMED LIKE ONE OF YOUR OWN SAYS WHOSE IT IS (2026-11-20).
//
// Two rounds of team testers each had a project of their own called Payments API
// (or Web app) and joined the teammate's one of the same name. The inbox, the
// project filter and the composer showed two identical names, and a tester
// logged "Two team projects have the same Payments API name" and "Project
// filter offers two identical Web app choices". Measured by joining into a
// folder that already holds a project of that name, and one that does not.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { joinSharedProject, joinedName } from '../main/team/projects.mts';

let root: string;
const own = (slug: string, name: string, team?: object) => {
  fs.mkdirSync(path.join(root, slug), { recursive: true });
  fs.writeFileSync(path.join(root, slug, 'project.json'), JSON.stringify({ schemaVersion: 1, id: slug, name, ...(team ? { team } : {}) }));
};
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joined-name-')); });

describe('joining a shared project', () => {
  it('says whose it is when you already have one by that name, whatever its case', () => {
    own('web', 'web app');
    const joined = joinSharedProject(root, { id: 'p1', name: 'Web app', createdBy: 'dana' }, 'Dana');
    expect(joined.name).toBe('Web app · Dana');
    expect(JSON.parse(fs.readFileSync(path.join(joined.dir, 'project.json'), 'utf8')).name).toBe('Web app · Dana');
  });
  it('keeps the name as it is when nothing of yours is called that', () => {
    own('api', 'Payments API');
    expect(joinSharedProject(root, { id: 'p2', name: 'Web app', createdBy: 'dana' }, 'Dana').name).toBe('Web app');
  });
  it('keeps the name when the sharer is not known yet', () => {
    own('web', 'Web app');
    expect(joinedName(root, 'Web app', null)).toBe('Web app');
  });
  it('a conversation between two people is not counted as a project of yours', () => {
    own('direct-1', 'Web app', { direct: true, projectId: 'd1' });
    expect(joinedName(root, 'Web app', 'Dana')).toBe('Web app');
  });
});
