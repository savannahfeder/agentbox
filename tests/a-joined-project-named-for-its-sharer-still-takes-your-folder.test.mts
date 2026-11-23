// Joining Theo's Payments API next to your own renamed it "Payments API · Theo", and the step that
// links your code folder compared that new name, so it never matched (tester issue 76); seen here on disk.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { joinSharedProject, linkSharedFolders } from '../main/team/projects.mts';

const team = { projectId: 'pr-1', teamId: 't-1', visibility: 'team', people: [], sharedBy: 'p-theo' };

describe('a joined project named for whoever shared it', () => {
  let root: string; let repo: string;
  const write = (slug: string, json: Record<string, unknown>) => { fs.mkdirSync(path.join(root, slug), { recursive: true }); fs.writeFileSync(path.join(root, slug, 'project.json'), JSON.stringify(json)); };
  const read = (slug: string) => JSON.parse(fs.readFileSync(path.join(root, slug, 'project.json'), 'utf8'));
  const products = () => fs.readdirSync(root).map((slug) => ({ dir: path.join(root, slug), ...read(slug) }));
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'account-'));
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'payments-api-'));
  });

  it('takes the folder of your own project it was named apart from, the reported one', () => {
    write('payments-api', { name: 'Payments API', repoPath: repo });
    const joined = joinSharedProject(root, { id: 'pr-1', name: 'Payments API', teamId: 't-1', createdBy: 'p-theo' }, 'Theo');
    expect(joined.name).toBe('Payments API · Theo');
    expect(linkSharedFolders(products())).toEqual([{ dir: joined.dir, repoPath: repo }]);
    expect(read(joined.slug).name).toBe('Payments API · Theo');
  });

  it('still matches a shared name that is your own name exactly', () => {
    write('mine', { name: 'Payments API · Theo', repoPath: repo });
    write('shared', { name: 'Payments API · Theo', team });
    expect(linkSharedFolders(products())).toHaveLength(1);
  });

  it('takes no folder when the name before the sharer is another project', () => {
    write('mine', { name: 'Payments', repoPath: repo });
    write('shared', { name: 'Payments API · Theo', team });
    expect(linkSharedFolders(products())).toEqual([]);
  });

  it('never reads a name of your own as carrying a sharer', () => {
    write('mine', { name: 'Payments API · Theo', repoPath: repo });
    write('shared', { name: 'Payments API', team });
    expect(linkSharedFolders(products())).toEqual([]);
  });
});
