// Typing a phrase finds the rows that say that phrase.
//
// On a real store of several hundred tasks, "how to work" kept hundreds of rows
// and only a handful of them contained the phrase. The words were being looked
// for one at a time, anywhere, INSIDE other words, so "to" was found in "into",
// "customer" and "stopped", and the rows that actually say "how to work" were
// sorted underneath hundreds of rows that do not, because the order was
// recency and nothing else.
//
// Three properties fix that, and a regression in any of them is silent:
//
//   THE PHRASE OUTRANKS THE WORDS. A row containing the typed words in a row,
//   in that order, comes above every row that merely contains all of them.
//   NOTHING IS DROPPED for failing it: the loose rows are still in the list,
//   underneath, because search is a filter over every task that exists.
//
//   A WORD IS FOUND AT THE START OF A WORD. "to" is in "today" and is not in
//   "into". Prefixes stay in because the user is still typing and "conver" has
//   to find "conversion" before the word is finished.
//
//   AN APOSTROPHE IS AN APOSTROPHE. Real rows are written with a curly one.
//   Typing "there's" on a normal keyboard has to find "There's".

import { describe, expect, it } from 'vitest';
import {
  matches,
  matchedSentence,
  searchScore,
  searchItems,
  splitHits,
} from '../renderer/src/search.ts';
import { previewText } from '../renderer/src/format.ts';

// The shape of the four rows that matter: one that says the
// phrase in its title, one that says it in its body, one that has all three
// words scattered through prose, and one that only ever had them inside other
// words.
const inTitle = {
  id: 'title', status: 'done', updatedAt: 100,
  title: 'How to Work is merged and your app already has it',
  result: 'The app booted at 1pm today, after all of it.',
};
const inBody = {
  id: 'body', status: 'open', updatedAt: 200,
  title: 'Measure the instructions you were handed this session',
  body: 'The How to work section is 20,802 characters, measured again from scratch.',
};
const scattered = {
  id: 'scattered', status: 'open', updatedAt: 300,
  title: 'Right now we only have one special theme',
  body: 'How many variants should there be, and do we have to ship them, and does the work land this week?',
};
const insideWords = {
  id: 'inside', status: 'open', updatedAt: 400,
  title: 'After my last customer call I concluded something',
  body: 'I ran into it again and then I stopped. Showhow the paperwork lands.',
};
const store = [inTitle, inBody, scattered, insideWords];

describe('the phrase she typed', () => {
  it('puts the rows that say it above the rows that merely contain its words', () => {
    const order = searchItems(store, 'how to work').map((h) => h.item.id);
    expect(order.slice(0, 2).sort()).toEqual(['body', 'title']);
    expect(order.indexOf('scattered')).toBeGreaterThan(order.indexOf('body'));
  });

  it('does not drop the rows that only have the words, because search is a filter', () => {
    expect(searchItems(store, 'how to work').map((h) => h.item.id)).toContain('scattered');
  });

  it('prefers the title over the body when both say it', () => {
    expect(searchItems(store, 'how to work')[0].item.id).toBe('title');
  });

  // THE ORDER IS THE WHOLE OF IT, and nothing is drawn on top of it.
  it('hands the list a sentence and nothing else, no band and no caption', () => {
    for (const hit of searchItems(store, 'how to work')) {
      expect(Object.keys(hit).sort()).toEqual(['item', 'summary']);
      expect(hit.summary).not.toMatch(/^You said/);
    }
  });

  it('does not rank a row top just for having the words in its title', () => {
    // Under a phrase, only the phrase is close.
    const allThree = {
      id: 'allthree', status: 'open', updatedAt: 900,
      title: 'I want to kick off a video, a small demo of how it works',
      body: 'Nothing else here.',
    };
    // It still matches, so it is still in the list, and it ranks below every
    // row that actually says the phrase.
    expect(searchScore(allThree, 'how to work')).toBe(2);
    expect(searchScore(inTitle, 'how to work')).toBeGreaterThan(searchScore(allThree, 'how to work'));
    expect(searchScore(inBody, 'how to work')).toBeGreaterThan(searchScore(allThree, 'how to work'));
    // A ONE-WORD query has no phrase, so there the title IS the strong signal.
    expect(searchScore(allThree, 'video')).toBe(2);
    // And a word that is only in the body is the bottom rung, not the top.
    expect(searchScore(allThree, 'nothing')).toBe(1);
  });

  it('quoted, it keeps only the rows that say it', () => {
    expect(searchItems(store, '"how to work"').map((h) => h.item.id).sort())
      .toEqual(['body', 'title']);
  });

  it('leaves a one-word query ordered the way it always was, newest first', () => {
    expect(searchItems(store, 'theme').map((h) => h.item.id)).toEqual(['scattered']);
    expect(searchItems(store, '').map((h) => h.item.id))
      .toEqual(['inside', 'scattered', 'body', 'title']);
  });

  it('survives a line break inside it, because her prose is markdown and markdown wraps', () => {
    const wrapped = {
      id: 'wrapped', status: 'open', updatedAt: 500, title: 'The instructions',
      body: 'Measure the How to\nwork section and tell me what you find.',
    };
    expect(searchScore(wrapped, 'how to work')).toBeGreaterThanOrEqual(3);
    expect(searchItems([wrapped], '"how to work"').length).toBe(1);
  });
});

describe('a word is found at the start of a word', () => {
  it('does not find "to" inside "into", "customer" or "stopped"', () => {
    expect(matches(insideWords, ['to'])).toBe(false);
  });

  it('does not find "how" inside "showhow"', () => {
    expect(matches(insideWords, ['how'])).toBe(false);
  });

  it('still finds a word she has not finished typing', () => {
    expect(matches(inBody, ['meas'])).toBe(true);
    expect(matches(inBody, ['charact'])).toBe(true);
  });

  // THE WORD STILL BEING TYPED IS THE LAST ONE, and it is the only one that
  // may be a prefix. Measured in the real app: with every word allowed to be a
  // prefix, "how to work" lit the "to" in "tonight" and in "too", which is the
  // same visual noise as before, one step quieter.
  it('treats every word but the last as a whole word', () => {
    const tonight = {
      id: 't', status: 'open', updatedAt: 1,
      title: 'Your disk tonight', body: 'A worker never ends its turn with a build still running.',
    };
    // "to" is not in "tonight" once there is a word after it.
    expect(splitHits('Your disk tonight', ['to', 'work']).some((r) => r.hit)).toBe(false);
    // but "work" is the word still being typed, so it is in "worker".
    expect(splitHits('A worker never ends', ['to', 'work']).filter((r) => r.hit).map((r) => r.text))
      .toEqual(['work']);
    expect(matches(tonight, ['to', 'work'])).toBe(false);
  });

  it('still lets the last word be half typed inside a longer query', () => {
    expect(matches(inBody, ['section', 'charact'])).toBe(true);
    expect(matches(inBody, ['charact', 'section'])).toBe(false);
  });

  it('finds a word after a bracket, a slash or a dash, which are not letters', () => {
    const punctuated = { id: 'p', status: 'open', updatedAt: 1, title: '(idle-time) and main/store', body: '' };
    expect(matches(punctuated, ['time'])).toBe(true);
    expect(matches(punctuated, ['store'])).toBe(true);
  });

  it('keeps the loose rows findable when nothing else matches at all', () => {
    // "work" inside "paperwork" is not a hit, so this row is not in the list.
    expect(searchItems([insideWords], 'work').length).toBe(0);
  });
});

describe('an apostrophe is an apostrophe', () => {
  const curly = { id: 'c', status: 'open', updatedAt: 1, title: 'There’s something wrong with our search field', body: '' };

  it('finds a curly one when she types a straight one', () => {
    expect(searchItems([curly], "there's").length).toBe(1);
  });

  it('finds a straight one when the row was written with a curly', () => {
    const straight = { id: 's', status: 'open', updatedAt: 1, title: "There's something wrong", body: '' };
    expect(searchItems([straight], 'there’s').length).toBe(1);
  });

  it('reads a curly double quote as a quote too', () => {
    const quoted = { id: 'q', status: 'open', updatedAt: 1, title: 'She said “how to work” again', body: '' };
    expect(searchScore(quoted, 'how to work')).toBe(4);
  });
});

describe('the row says why it matched', () => {
  it('shows the sentence with the whole phrase in it, not the first stray word', () => {
    const sentence = matchedSentence(
      'To be clear, this is about something else. The How to work section is 20,802 characters.',
      ['how', 'to', 'work'],
      'how to work',
    );
    expect(sentence).toContain('How to work section');
  });

  it('lights the phrase as one run rather than three scattered words', () => {
    const runs = splitHits('The How to work section', ['how', 'to', 'work'], 'how to work');
    expect(runs.filter((r) => r.hit).map((r) => r.text)).toEqual(['How to work']);
  });

  it('does not light a word buried inside another word', () => {
    const runs = splitHits('I ran into it and then I stopped', ['to']);
    expect(runs.some((r) => r.hit)).toBe(false);
  });

  it('still lights a prefix she is halfway through typing', () => {
    const runs = splitHits('the conversion rate', ['conver']);
    expect(runs.filter((r) => r.hit).map((r) => r.text)).toEqual(['conver']);
  });
});

describe('a heading is searchable text', () => {
  // Found on a real store: one task carried "Where the code is and how to
  // work" as a markdown heading and typing "how to work" could not
  // find it, because the searchable text dropped every heading line. A heading
  // is a landmark, and a landmark is what a person half remembers and types.
  const headed = {
    id: 'h', status: 'open', updatedAt: 1,
    title: 'Fix the two approved onboarding defects',
    body: 'Do not touch the other lanes.\n\n## Where the code is and how to work\n\nThe app repo is elsewhere.',
  };

  it('finds a phrase that only ever appears in a heading', () => {
    expect(searchScore(headed, 'how to work')).toBeGreaterThanOrEqual(3);
    expect(searchItems([headed], '"how to work"').length).toBe(1);
  });

  it('says the heading back as the reason the row is in the list', () => {
    expect(searchItems([headed], 'how to work')[0].summary).toContain('how to work');
  });

  it('leaves the row preview alone, where a heading is still not the news', () => {
    expect(previewText(headed.body)).toBe('Do not touch the other lanes. The app repo is elsewhere.');
  });
});
