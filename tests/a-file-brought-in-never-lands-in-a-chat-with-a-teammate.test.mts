// A tester pressed Open in Agentbox on a link while his chat with Ana was on
// screen, and the file's thread went into that chat: Ana's side then showed
// "the imported brief instead of our messages" (power test, 2026-11-11). A file
// brought in goes into the project on screen only when it is a project, and
// otherwise into the person's first own project; never into a chat.
import { describe, it, expect } from 'vitest';
import { projectToBringInto } from '../main/bring-shared-file.mts';

const own = (slug: string) => ({ slug });
const chat = (slug: string) => ({ slug, team: { direct: true } });
const shared = (slug: string) => ({ slug, team: { projectId: 'p1', sharedBy: 'ana' } });

describe('where a brought-in file goes', () => {
  it('the project on screen, when it is a project of theirs or one shared with the team', () => {
    expect(projectToBringInto([own('launch'), own('my-workspace')], 'launch')).toBe('launch');
    expect(projectToBringInto([shared('product'), own('my-workspace')], 'product')).toBe('product');
  });
  it('their first own project when the chat with a teammate is on screen', () => {
    expect(projectToBringInto([chat('dm-ana'), own('outreach'), own('my-workspace')], 'dm-ana')).toBe('outreach');
  });
  it('their first own project when nothing, or nothing known, is on screen', () => {
    expect(projectToBringInto([chat('dm-ana'), own('outreach')], null)).toBe('outreach');
    expect(projectToBringInto([own('outreach')], 'gone')).toBe('outreach');
  });
  it('nowhere when there are only chats', () => {
    expect(projectToBringInto([chat('dm-ana')], 'dm-ana')).toBeNull();
    expect(projectToBringInto([], null)).toBeNull();
  });
});
