// A MESSAGE YOU SENT TO A TEAMMATE CAN BE EDITED OR DELETED, AND ONLY BY YOU.
//
// A conversation with a teammate had no way to fix a typo or take a message
// back: the only undo was Z in the first seconds after sending. An edit is a
// delta on a later ledger line, `{ on, text }` or `{ on, gone: true }`, naming
// the message by its line uid, the way a reaction does. Measured here: the
// fold and the chat both read the newest edit; a deletion stays deleted; the
// row's one line stops showing a deleted message; a teammate's line naming
// your message changes nothing; and the edit crosses to a teammate in a
// conversation but not on an ordinary shared task.
import { describe, it, expect } from 'vitest';
import { foldWorkItems, pickFields } from '../shared/work-items.mjs';
import { whatATeammateMaySet } from '../shared/team-rules.mjs';
import { itemThread } from '../renderer/src/item-thread.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const ID = 'w-1234567890';
const ME = 'p-me', MAYA = 'p-maya';
let clock = 1_000_000;
const tick = () => (clock += 1000);
const open = (by) => ({ id: ID, ts: tick(), source: 'founder', by, uid: `u-open`, patch: { title: 'Hi', body: 'Hi there', kind: 'directive', status: 'open', people: [ME, MAYA] } });
const say = (by, text, uid) => ({ id: ID, ts: tick(), source: 'founder', by, uid, patch: { answer: text } });
const edit = (by, on, change, ts = tick()) => ({ id: ID, ts, source: 'founder', by, uid: `u-e-${ts}`, patch: { edit: { on, ...change } } });
const fold = (lines) => foldWorkItems(lines).get(ID);
const chat = (lines) => itemThread(lines, [], null, { chat: true }).events.filter((e) => e.kind !== 'work' && e.text);

describe('the field itself', () => {
  it('keeps an edit with words and a deletion, and nothing else', () => {
    expect(pickFields({ edit: { on: 'u-1', text: ' fixed ' } })).toEqual({ edit: { on: 'u-1', text: 'fixed' } });
    expect(pickFields({ edit: { on: 'u-1', gone: true } })).toEqual({ edit: { on: 'u-1', gone: true } });
    expect(pickFields({ edit: { on: 'u-1', text: '   ' } })).toBeNull();
    expect(pickFields({ edit: { text: 'no message named' } })).toBeNull();
    expect(pickFields({ edit: 'fixed' })).toBeNull();
  });
});

describe('an edit in the fold', () => {
  it('reads back the newest words for the message', () => {
    const item = fold([open(MAYA), say(ME, 'teh launch', 'u-a'), edit(ME, 'u-a', { text: 'the launch' }), edit(ME, 'u-a', { text: 'the launch post' })]);
    expect(item.edits['u-a']).toMatchObject({ text: 'the launch post' });
    expect(item.talk.chat.at(-1).text).toBe('the launch post');
  });

  it('keeps the newest by its own time when an older edit arrives later', () => {
    const late = edit(ME, 'u-a', { text: 'first fix' }, clock + 10);
    const newer = edit(ME, 'u-a', { text: 'second fix' }, clock + 20);
    const item = fold([open(MAYA), say(ME, 'typo', 'u-a'), newer, late]);
    expect(item.edits['u-a'].text).toBe('second fix');
  });

  it('drops a deleted message from the row line, which falls back to the one before', () => {
    const item = fold([open(MAYA), say(MAYA, 'are we on?', 'u-q'), say(ME, 'wrong chat', 'u-a'), edit(ME, 'u-a', { gone: true })]);
    expect(item.edits['u-a']).toMatchObject({ gone: true });
    expect(item.talk.chat.map((s) => s.text)).not.toContain('wrong chat');
    expect(item.talk.chat.at(-1).text).toBe('are we on?');
  });

  it('keeps a deleted message deleted, whatever its author writes after', () => {
    const item = fold([open(MAYA), say(ME, 'oops', 'u-a'), edit(ME, 'u-a', { gone: true }), edit(ME, 'u-a', { text: 'back again' })]);
    expect(item.edits['u-a'].gone).toBe(true);
  });

  it('ignores a teammate naming your message', () => {
    const item = fold([open(MAYA), say(ME, 'my words', 'u-a'), edit(MAYA, 'u-a', { text: 'her words' }), edit(MAYA, 'u-a', { gone: true })]);
    expect(item.edits?.['u-a']).toBeUndefined();
    expect(item.talk.chat.at(-1).text).toBe('my words');
  });

  it('lets the opening message be edited by whoever wrote it', () => {
    const item = fold([open(MAYA), edit(MAYA, 'u-open', { text: 'Hi there, Sam' })]);
    expect(item.edits['u-open'].text).toBe('Hi there, Sam');
  });
});

describe('an edit in the chat', () => {
  it('draws the edited words and says it was edited', () => {
    const events = chat([open(MAYA), say(ME, 'teh launch', 'u-a'), edit(ME, 'u-a', { text: 'the launch' })]);
    const mine = events.find((e) => e.uid === 'u-a');
    expect(mine.text).toBe('the launch');
    expect(mine.edited).toBeGreaterThan(0);
    expect(events.find((e) => e.uid === 'u-open').edited).toBeUndefined();
  });

  it('draws a deleted message nowhere', () => {
    const events = chat([open(MAYA), say(ME, 'wrong chat', 'u-a'), edit(ME, 'u-a', { gone: true })]);
    expect(events.some((e) => e.uid === 'u-a')).toBe(false);
    expect(events.some((e) => (e.text ?? '').includes('wrong chat'))).toBe(false);
  });

  it('keeps a deleted message as a line saying so when replies hang off it', () => {
    const reply = { ...say(MAYA, 'what did you mean?', 'u-r'), patch: { answer: 'what did you mean?', inReplyTo: 'u-a' } };
    const built = itemThread([open(MAYA), say(ME, 'half a thought', 'u-a'), reply, edit(ME, 'u-a', { gone: true })], [], null, { chat: true });
    const kept = built.events.find((e) => e.uid === 'u-a');
    expect(kept.deleted).toBe(true);
    expect(kept.text).toBe('This message was deleted.');
    expect(JSON.stringify(built)).not.toContain('half a thought');
  });

  it('draws the words as written when a teammate tried to change them', () => {
    const events = chat([open(MAYA), say(ME, 'my words', 'u-a'), edit(MAYA, 'u-a', { text: 'her words' })]);
    expect(events.find((e) => e.uid === 'u-a').text).toBe('my words');
  });
});

describe('the chat as drawn', () => {
  const team = { state: {}, me: ME, byId: new Map([[ME, { id: ME, name: 'Sam Rivera', email: '', avatarUrl: null }], [MAYA, { id: MAYA, name: 'Maya Chen', email: '', avatarUrl: null }]]), products: new Map() };
  const draw = (events) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
    React.createElement(Thread, { events, chat: true, name: 'Claude Code', landOn: 'w-1', onWhole: () => {}, md: (t) => React.createElement('p', null, t), onReact: () => {}, onQuote: () => {}, onEdit: () => {}, onMarkUnread: () => {} })));

  it('marks an edited message, and only that one', () => {
    const html = draw([
      { at: 1, who: 'you', by: MAYA, text: 'hi', uid: 'u-1' },
      { at: 2, who: 'you', by: ME, text: 'fixed words', uid: 'u-2', edited: 3 },
    ]);
    expect(html.match(/class="msg-edited"/g)).toHaveLength(1);
  });

  it('draws a deleted message kept for its replies as a quiet line with nothing to act on', () => {
    const html = draw([{ at: 1, who: 'you', by: ME, text: 'This message was deleted.', uid: 'u-1', deleted: true }]);
    expect(html).toContain('class="msg-body msg-deleted"');
    expect(html).not.toContain('chat-acts');
  });
});

describe('an edit crossing to a teammate', () => {
  const line = edit(ME, 'u-a', { text: 'fixed' });
  it('crosses in a conversation', () => {
    expect(whatATeammateMaySet(line, { direct: true })?.patch).toEqual({ edit: { on: 'u-a', text: 'fixed' } });
  });
  it('does not cross on an ordinary shared task', () => {
    expect(whatATeammateMaySet(line, { direct: false })).toBeNull();
  });
});
