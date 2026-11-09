// PRESSING A PERSON OR AN AI TEAMMATE OPENS THEIR PLACE (2026-10-30).
//
// The owner, on the team board: "I'm clicking on a conversation, but that's not
// the only thing I'll want to do." A person's card opened a board of their
// threads with a Message button that left the page; someone else's AI teammate
// opened a dialog that was only a send box. Seen on a 1440x900 window with
// three people and six AI teammates. Now a person, your AI teammate or someone
// else's opens a place: the conversation, what they are on, what they
// finished, and what you can do with them. You and the team keep their boards,
// and a group chat still opens on Chats.
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pressOpens, pressOpensIn } from '../renderer/src/team/everything/place.ts';
import { JobBlock, Place, PlaceList, SendBox } from '../renderer/src/team/everything/PlacePage.tsx';

describe('what a press opens', () => {
  it('is a place for a person, your AI teammate and someone else\'s', () => {
    expect(pressOpens('person:p-sofia')).toBe('place');
    expect(pressOpens('mate:t-cos')).toBe('place');
    expect(pressOpens('theirmate:p-dev:t-rel')).toBe('place');
  });

  it('is your own board for you, and the new teammate card is not a place', () => {
    expect(pressOpens('me')).toBe('board');
    expect(pressOpens('new')).toBe('board');
  });

  it('is the team\'s board for the team\'s own chat, and Chats for any other group', () => {
    expect(pressOpensIn('room:r-team', 'room:r-team')).toBe('board');
    expect(pressOpensIn('room:r-launch', 'room:r-team')).toBe('chat');
    expect(pressOpensIn('direct:w-1', 'room:r-team')).toBe('chat');
    expect(pressOpensIn('room:r-team', null)).toBe('chat');
  });

  it('never takes a key that only starts like a person for one', () => {
    expect(pressOpens('room:person:x')).toBe('chat');
    expect(pressOpens('personal')).toBe('board');
  });
});

const sofia = { key: 'person:p-sofia', kind: 'person', name: 'Sofia Reyes', agents: 2, inProgress: 3, now: 'Pricing page test' };

describe('a place', () => {
  const html = renderToStaticMarkup(h(Place, {
    m: sofia, waits: 1, onBack() {}, backTo: 'Needs you',
    actions: h('button', null, 'Give a task'),
    chat: h('div', { className: 'chat-here' }, 'the real chat'),
    side: h(PlaceList, { title: 'On now', now: 10_000, rows: [{ key: 'a', title: 'Pricing page test', word: 'Working', at: 5_000 }] }),
  }));

  it('has a way back that says where it goes', () => {
    expect(html).toContain('Back to Needs you');
    expect(html).toContain('>Needs you<');
  });

  it('holds their conversation, their work and what you can do, under their name', () => {
    expect(html).toContain('Sofia Reyes');
    expect(html).toContain('the real chat');
    expect(html).toContain('Pricing page test');
    expect(html).toContain('Give a task');
  });

  it('says under the name that something of theirs waits on you, not what they are on', () => {
    const head = html.slice(html.indexOf('pl-head'), html.indexOf('pl-body'));
    expect(head).toContain('Waiting on you');
    expect(head).not.toContain('Pricing page test');
  });
});

describe('an AI teammate\'s job', () => {
  it('can be changed on the one you own', () => {
    expect(renderToStaticMarkup(h(JobBlock, { job: 'Write the brief', onSave: async () => null }))).toContain('>Change<');
  });

  it('is only read on someone else\'s', () => {
    const html = renderToStaticMarkup(h(JobBlock, { job: 'Cut the release' }));
    expect(html).toContain('Cut the release');
    expect(html).not.toContain('Change');
  });
});

describe('someone else\'s AI teammate', () => {
  it('says in the box where your words go before you send them', () => {
    const html = renderToStaticMarkup(h(SendBox, { placeholder: 'Write to Release manager', empty: h('p', null, 'What you write goes to Dev as a request.'), onSend: async () => null }));
    expect(html).toContain('What you write goes to Dev as a request.');
    expect(html).toContain('placeholder="Write to Release manager"');
  });
});
