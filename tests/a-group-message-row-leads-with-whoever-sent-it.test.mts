// A GROUP MESSAGE'S ROW LEADS WITH WHOEVER SENT IT.
//
// Reported 2026-10-19: one teammate sent a file to a group of three, and the
// inbox row read "Other, Sender" with the other teammate's face, so it looked
// sent by the wrong person. Opening it showed the real sender.
//
// Measured on the real conversation record: the sender's Mac writes the record
// with `people` = everyone but the sender, and the sender as `sharedBy`.
// `messageLine` listed `people` first and `sharedBy` after, and the row's face
// is the first name's, so the person who started a group was always drawn
// last, whoever had written the newest line. Now the person whose words the
// row shows comes first; when the newest line is yours ("You: ...") the
// record's order stands.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { foldWorkItems } from '../shared/work-items.mjs';
import { messageLine } from '../renderer/src/threads/page-rules.ts';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const ID = 'w-abcdef1234';
const ME = 'p-me', OTTO = 'p-otto', ROSA = 'p-rosa', JUN = 'p-jun';
const NAMES = { [ME]: 'Sam Lee', [OTTO]: 'Otto Park', [ROSA]: 'Rosa Diaz', [JUN]: 'Jun Ito' };
const nameOf = (id) => NAMES[id].split(' ')[0];
// The record as Rosa's Mac makes it when she writes to Otto and you.
const GROUP = { slug: 'direct-g', name: 'Direct', team: { projectId: 'g', teamId: 't1', people: [OTTO, ME], sharedBy: ROSA, direct: true, visibility: 'people' } };
const PAIR = { slug: 'direct-g', name: 'Direct', team: { projectId: 'p', teamId: 't1', people: [ME], sharedBy: ROSA, direct: true, visibility: 'people' } };

let clock = 1_000_000;
const tick = () => (clock += 60_000);
const open = (by, text, people = [ROSA, OTTO, ME]) => ({ id: ID, ts: tick(), source: 'founder', by, uid: 'u-open', patch: { title: text, body: text, status: 'open', kind: 'directive', assignee: OTTO, people } });
const say = (by, uid, text, inReplyTo) => ({ id: ID, ts: tick(), source: 'founder', by, uid, patch: inReplyTo ? { answer: text, inReplyTo } : { answer: text } });
const fold = (lines) => ({ ...foldWorkItems(lines).get(ID), product: GROUP.slug });
const lead = (lines, product = GROUP) => messageLine(fold(lines), product, ME, nameOf);

describe('who a group message row names first', () => {
  it('names the person who sent it first, not the first person on the record', () => {
    expect(lead([open(ROSA, 'cut-v2.mp4')]).people).toEqual([ROSA, OTTO]);
  });

  it('moves to whoever wrote the newest line, either way round', () => {
    const lines = [open(ROSA, 'cut-v2.mp4'), say(OTTO, 'u-1', 'Looks right.')];
    expect(lead(lines).people).toEqual([OTTO, ROSA]);
    lines.push(say(ROSA, 'u-2', 'Sending it on.'));
    expect(lead(lines).people).toEqual([ROSA, OTTO]);
  });

  it('names the writer of a thread reply first when that is what the row says', () => {
    const lines = [open(ROSA, 'Morning.'), say(ME, 'u-ask', 'Two cuts or one?'), say(OTTO, 'u-r', 'One.', 'u-ask')];
    expect(lead(lines)).toMatchObject({ people: [OTTO, ROSA], text: 'Otto in your thread: One.' });
  });

  it('reads a message from before chats kept who spoke where the same way', () => {
    const item = {
      id: ID, product: GROUP.slug, status: 'open', title: 'cut-v2.mp4', body: 'cut-v2.mp4', kind: 'directive',
      createdBy: ROSA, assignee: OTTO, people: [ROSA, OTTO, ME], wrote: { body: { ts: 1, by: ROSA } },
    };
    expect(messageLine(item, GROUP, ME, nameOf).people).toEqual([ROSA, OTTO]);
  });

  // THE CASE THAT MUST NOT MOVE ANYONE: your own line already says "You:".
  it('keeps the record’s order when the newest line is yours', () => {
    const said = lead([open(ROSA, 'cut-v2.mp4'), say(ME, 'u-1', 'Thanks.')]);
    expect(said).toMatchObject({ people: [OTTO, ROSA], fromMe: true });
  });

  it('never adds someone who is not in the conversation', () => {
    const lines = [open(ROSA, 'cut-v2.mp4'), say(JUN, 'u-1', 'Wrong chat, sorry.')];
    expect(lead(lines).people).toEqual([OTTO, ROSA]);
  });

  it('leaves a conversation between two people as it was', () => {
    expect(lead([open(ROSA, 'Hi.', [ROSA, ME])], PAIR).people).toEqual([ROSA]);
  });
});

describe('drawn in the inbox', () => {
  const team = { state: { signedIn: true }, me: ME, byId: new Map(Object.entries(NAMES).map(([id, name]) => [id, { id, name }])), products: new Map() };
  const draw = (lines) => renderToStaticMarkup(
    React.createElement(TeamContext.Provider, { value: team }, React.createElement(ThreadCells, { item: fold(lines), product: GROUP, now: clock })),
  );

  it('shows the sender’s face and name first', () => {
    const html = draw([open(ROSA, 'cut-v2.mp4')]);
    expect(html).toMatch(/<span class="tm-av"[^>]*>Ro<\/span><b class="th-msg-who">Rosa, Otto<\/b>/);
  });

  it('shows the other teammate first once they write the newest line', () => {
    const html = draw([open(ROSA, 'cut-v2.mp4'), say(OTTO, 'u-1', 'Looks right.')]);
    expect(html).toMatch(/<span class="tm-av"[^>]*>Ot<\/span><b class="th-msg-who">Otto, Rosa<\/b>/);
  });
});
