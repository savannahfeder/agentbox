// ADDING PEOPLE TO A CONVERSATION (w-71e6af492d, asked for by the founder on
// 2026-10-01).
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
// What is pinned here:
//   - the control is on conversation pages ONLY, and nowhere else;
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

const project = { slug: 'northwind', name: 'Northwind', team: { projectId: 'x', teamId: 't', visibility: 'team', people: [], sharedBy: null } };
const pair = { slug: 'direct-1', name: 'Maya', team: { projectId: 'd1', teamId: 't', visibility: 'people', people: [ME, MAYA], sharedBy: null, direct: true } };
const group = { slug: 'direct-2', name: 'Maya, Theo', team: { projectId: 'd2', teamId: 't', visibility: 'people', people: [ME, MAYA, THEO], sharedBy: null, direct: true } };
// The record a teammate started: they are its `sharedBy`, not in `people`.
const theirs = { slug: 'direct-3', name: 'Maya', team: { projectId: 'd3', teamId: 't', visibility: 'people', people: [ME], sharedBy: MAYA, direct: true } };
const alone = { slug: 'direct-4', name: 'You', team: { projectId: 'd4', teamId: 't', visibility: 'people', people: [ME], sharedBy: null, direct: true } };

describe('who a conversation hands to New thread', () => {
  it('hands the one person you are talking to', () => {
    expect(peopleInConversation(pair, ME)).toEqual({ to: MAYA, also: [] });
  });

  it('hands everyone in a group, and never you', () => {
    const out = peopleInConversation(group, ME);
    expect(out).not.toBeNull();
    expect([out.to, ...out.also].sort()).toEqual([MAYA, THEO]);
    expect([out.to, ...out.also]).not.toContain(ME);
  });

  it('counts the person who started the record', () => {
    expect(peopleInConversation(theirs, ME)).toEqual({ to: MAYA, also: [] });
  });

  it('offers nothing on a project, which is not a conversation', () => {
    expect(peopleInConversation(project, ME)).toBeNull();
  });

  it('offers nothing where there is nobody but you', () => {
    expect(peopleInConversation(alone, ME)).toBeNull();
  });

  it('offers nothing when nobody is signed in', () => {
    expect(peopleInConversation(pair, null)).toBeNull();
    expect(peopleInConversation(undefined, ME)).toBeNull();
  });
});

describe('the control at the top of a conversation', () => {
  const team = {
    state: { signedIn: true, people: [] },
    me: ME,
    byId: new Map([[MAYA, { id: MAYA, name: 'Maya Chen' }], [THEO, { id: THEO, name: 'Theo Park' }]]),
    products: new Map([[pair.slug, pair], [group.slug, group], [project.slug, project]]),
  };
  const draw = (product) => renderToStaticMarkup(
    React.createElement(TeamContext.Provider, { value: team },
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
