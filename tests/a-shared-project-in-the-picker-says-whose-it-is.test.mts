// A SHARED PROJECT IN THE PICKER SAYS WHOSE IT IS (2026-11-20).
//
// On a synthetic team, Theo shared Payments API. On Lena's Home the project
// picker read "Payments API — For personal tasks", the same words as My
// Workspace. The note was drawn for any project with no folder on this
// computer, and a project a teammate shared has none until you link one.
// Measured on Lena's copy: Payments API had no repoPath and team.sharedBy
// was Theo. Now a shared project with no folder says who shared it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { projectNote } from '../renderer/src/threads/composer-rules.ts';

const THEO = { id: 'p-theo', name: 'Theo Okafor', email: 'theo@team.test', avatarUrl: null };
const LENA = 'p-lena';
const byId = new Map([[THEO.id, THEO]]);
const team = (sharedBy: string | null, direct = false) => ({ projectId: 'pr-1', teamId: 't-1', visibility: 'team' as const, people: [], sharedBy, direct });
const note = (p: Parameters<typeof projectNote>[0], me = LENA) => projectNote(p, { me, byId });

describe('the note beside a project in the picker', () => {
  it('says who shared it, the reported one', () => {
    expect(note({ repoPath: null, team: team(THEO.id) })).toBe('Shared by Theo');
  });

  it('says it is your team\'s when you shared it or the sharer is unknown', () => {
    expect(note({ repoPath: null, team: team(LENA) })).toBe('Your team’s');
    expect(note({ repoPath: null, team: team('p-gone') })).toBe('Your team’s');
    expect(note({ repoPath: null, team: team(null) })).toBe('Your team’s');
  });

  it('still says For personal tasks on My Workspace and any project of your own with no folder', () => {
    expect(note({ repoPath: null, team: null })).toBe('For personal tasks');
    expect(note({ repoPath: undefined })).toBe('For personal tasks');
  });

  it('says nothing for a project with a folder, shared or not', () => {
    expect(note({ repoPath: '/code/web-app', team: null })).toBeNull();
    expect(note({ repoPath: '/code/payments-api', team: team(THEO.id) })).toBeNull();
  });

  it('is what the picker draws', () => {
    const src = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(src).not.toContain('>For personal tasks<');
    expect(src).toMatch(/projectNote\(p, /);
  });
});
