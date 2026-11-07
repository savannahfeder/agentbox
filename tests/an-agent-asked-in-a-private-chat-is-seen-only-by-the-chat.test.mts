// AN AGENT ASKED IN A PRIVATE CHAT IS SEEN ONLY BY THE PEOPLE IN THAT CHAT.
//
// Asked to check (w-e053ed3581): "private messages are only visible to the
// people who are involved in them ... even if you select everyone in board
// view". The chat itself held: a message record is readable only by its
// people, and no Mac publishes a card for one. The door was the agent you
// bring in with @. Its task lands in a project you pick, its brief carries the
// last twelve messages, and it was narrowed to the chat's people only when that
// project was a cloud-shared one (`isShared`). No project is cloud-shared any
// more: since w-b989839656 a project says who sees its threads with `seenBy`,
// and a project from before that setting reads as the whole team. Measured on
// one Mac on 2026-10-05: 37 of its 38 projects read as Team, so asking @Codex
// from a chat with one teammate put the ask, and the agent's summary of the
// chat, on every teammate's board as a card for the whole team.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { chatTaskSharing } from '../renderer/src/team/agent-mentions.ts';
import { cardsFor } from '../shared/thread-cards.mjs';

const ME = 'p-me';
const ALICE = 'p-alice';
const CAROL = 'p-carol';
const CHAT = [ME, ALICE];

// The card a Mac would publish for one task in one project.
function cardFor(project, sharing) {
  const item = { id: 'w-1', title: 'Make tasks from findings 1 to 3', body: 'brief', status: 'open', createdAt: 2, updatedAt: 2, ...sharing };
  return cardsFor({ products: [project], readItems: () => [item], since: 1 })[0] ?? null;
}

describe('who sees the task an agent is asked for in a chat', () => {
  it('a project that reads as the whole team: only the chat sees it (the reported case)', () => {
    const project = { slug: 'old', name: 'Old project' }; // no seenBy: from before the setting, so Team
    expect(chatTaskSharing(project, CHAT)).toEqual({ visibility: 'people', visibleTo: CHAT });
    expect(cardFor(project, chatTaskSharing(project, CHAT)).people).toEqual(CHAT);
  });

  it('a project set to Team: only the chat sees it', () => {
    const project = { slug: 'p', name: 'P', seenBy: 'team' };
    expect(cardFor(project, chatTaskSharing(project, CHAT)).people).toEqual(CHAT);
  });

  it('a project shared with someone who is not in the chat: they do not see it', () => {
    const project = { slug: 'p', name: 'P', seenBy: 'people', seenByPeople: [CAROL] };
    const card = cardFor(project, chatTaskSharing(project, CHAT));
    expect(card.people).toEqual(CHAT);
    expect(card.people).not.toContain(CAROL);
  });

  it('a cloud-shared project, as before: only the chat sees it', () => {
    const project = { slug: 'p', name: 'P', team: { projectId: 'x', visibility: 'team', people: [] } };
    expect(chatTaskSharing(project, CHAT)).toEqual({ visibility: 'people', visibleTo: CHAT });
  });

  it('a Just you project stays Just you: no card at all', () => {
    for (const project of [{ slug: 'p', name: 'P', seenBy: 'private' }, { slug: 'w', name: 'My Workspace', personal: true }]) {
      expect(chatTaskSharing(project, CHAT)).toEqual({});
      expect(cardFor(project, chatTaskSharing(project, CHAT))).toBeNull();
    }
  });

  it('a chat whose people are not known fails closed to private, never to the team', () => {
    const project = { slug: 'old', name: 'Old project' };
    expect(chatTaskSharing(project, [])).toEqual({ visibility: 'private' });
    expect(cardFor(project, chatTaskSharing(project, []))).toBeNull();
  });

  it('drops blanks and repeats from the people', () => {
    const project = { slug: 'old', name: 'Old project' };
    expect(chatTaskSharing(project, [ME, '', ALICE, ME])).toEqual({ visibility: 'people', visibleTo: CHAT });
  });
});

describe('the send step uses that rule for every project', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('passes the chat\'s people through chatTaskSharing, not only on a cloud-shared project', () => {
    expect(app).toContain('...chatTaskSharing(project, people),');
    expect(app).not.toContain("isShared(project) && people.length ? { visibility: 'people'");
  });
});

describe('a chat itself is never on anybody else\'s board', () => {
  it('a message record publishes no card, whatever its rows say', () => {
    const chat = { slug: 'direct-1', name: 'Direct', team: { projectId: 'd', direct: true, visibility: 'people', people: [ALICE], sharedBy: ME } };
    const row = { id: 'w-2', title: 'hey', body: 'something private', status: 'open', visibility: 'team', createdAt: 2, updatedAt: 2 };
    expect(cardsFor({ products: [chat], readItems: () => [row], since: 1 })).toEqual([]);
  });
});
