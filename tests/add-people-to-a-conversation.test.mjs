// ADDING PEOPLE TO A CONVERSATION (2026-10-01).
//
// Messages already go to a group, and each exact group has one conversation
// (main/team/index.mjs directWith). What was missing was the way in from a
// conversation you already have open: the page named the people in it and
// offered no way to start the one with one more person in it. So a quiet
// "Add people" control sits beside the faces at the top of a conversation,
// and it opens New thread with everyone already in the conversation in To.
//
// Slack's rule, and the one the founder asked for: adding someone makes the
// group's conversation; the old one stays exactly as it was. Nothing here
// changes the record on screen, which is why this is a handoff to the
// composer and not a write.
//
// AND IT IS NOT THERE WHEN THERE IS NOBODY TO ADD (2026-10-01): the Add people
// button shows only when the company holds somebody else to add, because a
// button that can do nothing is clutter. A two person company, or a group that is already everyone, gets no
// control, because pressing it could only ever open a card with the same
// people in it.
//
// What is pinned here:
//   - the control is on conversation pages ONLY, and nowhere else;
//   - it is gone when the company holds nobody who is not already in this
//     conversation;
//   - it hands over everyone in the conversation but you, in To, so the
//     composer's own group rule picks up from there;
//   - the person who started the record counts even when the record lists
//     them as `sharedBy` rather than in `people`;
//   - a record with nobody in it but you offers nothing, because there is no
//     conversation there to add to.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { peopleInConversation } from '../renderer/src/threads/page-rules.ts';
import { AddPeople } from '../renderer/src/team/TeamFocus.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const ME = 'p-me';
const MAYA = 'p-maya';
const THEO = 'p-theo';
const JUN = 'p-jun';
// The company: everyone signed in to this team, as the app holds them.
const COMPANY = [{ id: ME }, { id: MAYA }, { id: THEO }, { id: JUN }];

const project = { slug: 'northwind', name: 'Northwind', team: { projectId: 'x', teamId: 't', visibility: 'team', people: [], sharedBy: null } };
const pair = { slug: 'direct-1', name: 'Maya', team: { projectId: 'd1', teamId: 't', visibility: 'people', people: [ME, MAYA], sharedBy: null, direct: true } };
const group = { slug: 'direct-2', name: 'Maya, Theo', team: { projectId: 'd2', teamId: 't', visibility: 'people', people: [ME, MAYA, THEO], sharedBy: null, direct: true } };
// The record a teammate started: they are its `sharedBy`, not in `people`.
const theirs = { slug: 'direct-3', name: 'Maya', team: { projectId: 'd3', teamId: 't', visibility: 'people', people: [ME], sharedBy: MAYA, direct: true } };
const alone = { slug: 'direct-4', name: 'You', team: { projectId: 'd4', teamId: 't', visibility: 'people', people: [ME], sharedBy: null, direct: true } };

describe('who a conversation hands to New thread', () => {
  it('hands the one person you are talking to', () => {
    expect(peopleInConversation(pair, ME, COMPANY)).toEqual({ to: MAYA, also: [] });
  });

  it('hands everyone in a group, and never you', () => {
    const out = peopleInConversation(group, ME, COMPANY);
    expect(out).not.toBeNull();
    expect([out.to, ...out.also].sort()).toEqual([MAYA, THEO]);
    expect([out.to, ...out.also]).not.toContain(ME);
  });

  it('counts the person who started the record', () => {
    expect(peopleInConversation(theirs, ME, COMPANY)).toEqual({ to: MAYA, also: [] });
  });

  it('offers nothing on a project, which is not a conversation', () => {
    expect(peopleInConversation(project, ME, COMPANY)).toBeNull();
  });

  it('offers nothing where there is nobody but you', () => {
    expect(peopleInConversation(alone, ME, COMPANY)).toBeNull();
  });

  it('offers nothing when nobody is signed in', () => {
    expect(peopleInConversation(pair, null, COMPANY)).toBeNull();
    expect(peopleInConversation(undefined, ME, COMPANY)).toBeNull();
  });
});

describe('nobody left in the company to add', () => {
  it('offers nothing in a company of two', () => {
    expect(peopleInConversation(pair, ME, [{ id: ME }, { id: MAYA }])).toBeNull();
  });

  it('offers nothing on a group that is already everyone', () => {
    expect(peopleInConversation(group, ME, [{ id: ME }, { id: MAYA }, { id: THEO }])).toBeNull();
  });

  it('offers it on that same group once one more person joins', () => {
    expect(peopleInConversation(group, ME, COMPANY)).not.toBeNull();
  });

  it('counts somebody who left the company as nobody to add', () => {
    // Theo is in the conversation and no longer on the list. That is not room.
    expect(peopleInConversation(group, ME, [{ id: ME }, { id: MAYA }])).toBeNull();
  });

  it('offers nothing before the company list has arrived', () => {
    expect(peopleInConversation(pair, ME, [])).toBeNull();
  });
});

describe('the control at the top of a conversation', () => {
  const teamOf = (company) => ({
    state: { signedIn: true, people: company },
    me: ME,
    byId: new Map(company.map((p) => [p.id, { id: p.id, name: p.id }])),
    products: new Map([[pair.slug, pair], [group.slug, group], [project.slug, project]]),
  });
  const team = teamOf(COMPANY);
  const draw = (product, t = team) => renderToStaticMarkup(
    React.createElement(TeamContext.Provider, { value: t },
      React.createElement(AddPeople, { product, onAdd: () => {} })),
  );

  it('is there on a conversation', () => {
    const html = draw(pair);
    expect(html).toContain('Add people');
  });

  it('is there on a group conversation too', () => {
    expect(draw(group)).toContain('Add people');
  });

  it('is not on a task page', () => {
    expect(draw(project)).toBe('');
  });

  it('is not there in a company of two', () => {
    expect(draw(pair, teamOf([{ id: ME }, { id: MAYA }]))).toBe('');
  });

  it('is not there on a group that is already the whole company', () => {
    expect(draw(group, teamOf([{ id: ME }, { id: MAYA }, { id: THEO }]))).toBe('');
  });

  it('is not there with nobody signed in', () => {
    const html = renderToStaticMarkup(
      React.createElement(TeamContext.Provider, { value: null },
        React.createElement(AddPeople, { product: pair, onAdd: () => {} })),
    );
    expect(html).toBe('');
  });

  it('says what it does in plain words, with no em dash', () => {
    expect(draw(pair)).not.toContain('—');
  });
});
