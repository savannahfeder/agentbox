// A SHARED ROW IS IN ONE INBOX AT A TIME: THE INBOX OF WHOEVER HAS TO ACT.
//
// Every teammate's Mac holds every row of a shared project. Without a rule,
// everyone's inbox would fill with everyone's work, which is Slack again. The
// design approved on 2026-09-30 (w-e731ca9376): a task given to a person is in
// that person's inbox; an agent's question is in the inbox of the person whose
// agent it is; a reply hands a person-to-person row to the other person, so a
// conversation goes back and forth between two inboxes instead of sitting in
// both. A private row is untouched by any of this.
import { it, expect, describe } from 'vitest';
import { inMyInbox, handedOnByReply } from '../shared/team-rules.mjs';

const MAYA = 'p-maya';
const THEO = 'p-theo';
const JUN = 'p-jun';
const shared = { slug: 'website', team: { projectId: 'x', sharedBy: MAYA } };
const privateProject = { slug: 'home', team: null };

describe('whose inbox', () => {
  it('a task given to Theo is in Theo\'s inbox and not in Maya\'s', () => {
    const row = { createdBy: MAYA, assignee: THEO, people: [MAYA, THEO], status: 'open' };
    expect(inMyInbox(row, shared, THEO)).toBe(true);
    expect(inMyInbox(row, shared, MAYA)).toBe(false);
  });

  it('nobody else on the team sees it in their inbox', () => {
    const row = { createdBy: MAYA, assignee: THEO, status: 'open' };
    expect(inMyInbox(row, shared, JUN)).toBe(false);
  });

  it('an agent\'s row is for the person whose agent it is', () => {
    const row = { createdBy: JUN, status: 'open' };
    expect(inMyInbox(row, shared, JUN)).toBe(true);
    expect(inMyInbox(row, shared, MAYA)).toBe(false);
  });

  it('a row handed back to the agents is for whoever handed it on', () => {
    const row = { createdBy: MAYA, assignee: 'agent', runner: THEO, status: 'open' };
    expect(inMyInbox(row, shared, THEO)).toBe(true);
    expect(inMyInbox(row, shared, MAYA)).toBe(false);
  });

  it('a finished task given to a person leaves their inbox', () => {
    expect(inMyInbox({ createdBy: MAYA, assignee: THEO, status: 'done' }, shared, THEO)).toBe(false);
  });

  it('leaves a private row to the ordinary rules, signed in or not', () => {
    expect(inMyInbox({ createdBy: null }, privateProject, MAYA)).toBe(true);
    expect(inMyInbox({ createdBy: null }, privateProject, null)).toBe(true);
  });

  it('leaves everything to the ordinary rules when nobody is signed in', () => {
    expect(inMyInbox({ createdBy: MAYA, assignee: THEO }, shared, null)).toBe(true);
  });
});

describe('a reply hands the row on', () => {
  it('Theo answering Maya\'s task hands it back to Maya', () => {
    expect(handedOnByReply({ createdBy: MAYA, assignee: THEO, people: [MAYA, THEO] }, shared, THEO)).toBe(MAYA);
  });

  it('Maya answering back hands it to Theo again', () => {
    expect(handedOnByReply({ createdBy: MAYA, assignee: MAYA, people: [MAYA, THEO] }, shared, MAYA)).toBe(THEO);
  });

  it('changes nothing on a row nobody was given, or one that is not yours to answer', () => {
    expect(handedOnByReply({ createdBy: MAYA }, shared, MAYA)).toBeNull();
    expect(handedOnByReply({ createdBy: MAYA, assignee: THEO, people: [MAYA, THEO] }, shared, JUN)).toBeNull();
    expect(handedOnByReply({ createdBy: MAYA, assignee: 'agent' }, shared, MAYA)).toBeNull();
  });

  it('changes nothing in a private project', () => {
    expect(handedOnByReply({ createdBy: MAYA, assignee: MAYA, people: [MAYA, THEO] }, privateProject, MAYA)).toBeNull();
  });
});

// Photographed 2026-09-30 on two real copies: Theo's answer handed the row
// back to Maya, and her inbox line still read her own question.
describe('the line under a row a teammate answered', () => {
  it('is what they said', async () => {
    const { rowSummary } = await import('../renderer/src/list-rules.ts');
    const row = {
      title: 'Launch video: ship Friday\u2019s cut?',
      body: '**Ship Friday\u2019s launch video, or change the ending first?**',
      answer: 'Change the ending first. I will send the new cut tonight.',
      status: 'open',
      wrote: { body: { ts: 1, by: 'maya' }, answer: { ts: 2, by: 'theo' } },
    };
    expect(rowSummary(row, 'inbox')).toBe('Change the ending first. I will send the new cut tonight.');
  });

  it('is unchanged on one Mac, where no line says who wrote it', async () => {
    const { rowSummary } = await import('../renderer/src/list-rules.ts');
    const row = { title: 'x', body: 'Pick a palette.', answer: 'B', status: 'open', wrote: { body: { ts: 1 }, answer: { ts: 2 } } };
    expect(rowSummary(row, 'inbox')).toBe('Pick a palette.');
  });
});
