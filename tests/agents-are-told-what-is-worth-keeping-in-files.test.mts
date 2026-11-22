// AGENTS ARE TOLD WHAT IS WORTH KEEPING IN FILES.
//
// Files' home shows only what sits in a folder, so what an agent files is what
// the team sees first. Before this the brief told agents how to file and never
// what to: 347 of one project's 490 documents were agents' design drafts, and
// its owner asked that only "stuff that the team actually wants to save" be
// kept, in folders she and agents can trust. The brief now says what to keep,
// what to leave with its thread, to reuse a folder before making one, that a kept
// document opens with the one sentence its tile shows, and that Pinned is read
// before work on what the product says or costs.
//
// What must NOT happen: an agent told to file everything, or the old how-to
// sentences lost (an-agent-says-a-file-is-in-a-folder-only-when-files-says-so).
import { describe, expect, it } from 'vitest';
import { filesFoldersBrief } from '../shared/file-folders.mts';

const view = { me: { id: 'm' }, folders: [{ folder: 'Customers', project: 'Company', files: [1, 2] }, { folder: 'Pinned', project: 'Company', files: [1] }] };
const brief = filesFoldersBrief(view, 'Company') ?? '';

describe('the Files line every run gets', () => {
  it('says only what the team will want again goes in a folder', () => {
    expect(brief).toMatch(/only what the team will want again/i);
    expect(brief).toMatch(/drafts, check pictures and one-off images stay with their thread/i);
  });
  it('says to reuse a folder before making one, and how to name one', () => {
    expect(brief).toMatch(/make a new folder only when none fits/i);
  });
  it('says a kept document opens with the sentence its tile shows', () => {
    expect(brief).toMatch(/one sentence saying what it is/i);
  });
  it('says Pinned comes first and is read before work on what the product says or costs', () => {
    expect(brief).toMatch(/Pinned/);
    expect(brief).toMatch(/read what is in Pinned before/i);
  });
  it('still lists the folders and how to file', () => {
    expect(brief).toContain('Customers (2 files)');
    expect(brief).toMatch(/write_document/);
    expect(brief).toMatch(/team_file/);
  });
  it('says the same to a project with no folders yet', () => {
    expect(filesFoldersBrief({ me: { id: 'm' }, folders: [] }, 'Company')).toMatch(/only what the team will want again/i);
  });
});
