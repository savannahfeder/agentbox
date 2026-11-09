// THE NEW THREAD CARD TO PEOPLE HAS A SUBJECT THAT STARTS ITS OWN THREAD.
//
// N to Dev and Maya could only ever add to the one conversation the
// three already had ("Continues your conversation with Dev and Maya"), so every
// piece of work went into it. The card now has a Subject row for a message; with
// words in it the send asks main for a thread of its own, and without them it is
// the conversation as before. Read off composer-rules and the card's source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { headRows, messageSubject } from '../renderer/src/threads/composer-rules.ts';

const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');

describe('which rows the head shows', () => {
  it('a message to a person has a Subject row after Send As', () => {
    expect(headRows({ person: true, kind: 'message' })).toEqual(['to', 'sendAs', 'subject']);
  });
  it('a task has none: its first line is its name', () => {
    expect(headRows({ person: true, kind: 'task' })).not.toContain('subject');
  });
  it('an agent has none', () => {
    expect(headRows({ person: false, kind: 'message' })).not.toContain('subject');
  });
});

describe('what the subject sends', () => {
  it('is the words, on one line', () => {
    expect(messageSubject('  Launch film\n shot list ')).toBe('Launch film shot list');
  });
  it('is nothing when only spaces were typed, so the message joins the conversation', () => {
    expect(messageSubject('   ')).toBe('');
    expect(messageSubject(undefined)).toBe('');
  });
  it('goes with the message to main', () => {
    expect(card).toMatch(/api\.teamMessage\(toMany[^\n]*messageSubject\(subject\)/);
  });
  it('turns off the line saying the message continues the conversation', () => {
    expect(card).toMatch(/convo && onOpenConversation && sendAs === 'message' && !messageSubject\(subject\)/);
  });
});
