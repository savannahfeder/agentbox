// A ROW IS CALLED WHAT IT IS ABOUT, NOT WHAT SHE HAPPENED TO SAY FIRST.
//
// A title taken from the first sentence of an ask runs long, often ends in an
// ellipsis mid sentence, and often opens with the same few words ("I", "Can
// you", "We"). A column of those is many rows that look like one row.
//
// WHAT CAN SILENTLY BREAK HERE, which is what this file is for:
//
//   1. `label` falls out of WORK_ITEM_FIELDS in a merge and every name the app
//      writes is dropped on the floor by the fold, silently, exactly the way an
//      agent's title rewrite already is.
//   2. The fold starts letting an agent's `label` lose to something, and the
//      names stop landing on the rows that need them most, which are hers.
//   3. `rowTitle` starts preferring the title, or starts drawing an empty label,
//      and the list goes back to her first sentences or draws nothing at all.
//   4. The naming pass stops being idempotent and renames a settled row every
//      fifteen seconds forever, spending a process a tick and changing the words
//      under her while she reads them.
//   5. `cleanName` starts accepting a paragraph, and a row's name becomes an
//      essay that pushes the whole right end of the row off the card.

import { describe, it, expect } from 'vitest';
import { foldWorkItems, WORK_ITEM_FIELDS } from '../shared/work-items.mjs';
import { rowTitle } from '../renderer/src/list-rules';
import { cleanName, contentTouchedAt, namePrompt, wantsName, NAME_MAX } from '../main/row-label.mjs';

const line = (patch, { id = 'w-1', ts = 1000, source = 'agent' } = {}) => ({ id, ts, source, patch });

describe('the ledger carries a name of its own', () => {
  it('accepts label, because a patch to an unknown field is dropped in silence', () => {
    expect(WORK_ITEM_FIELDS).toContain('label');
  });

  it('lets an agent name a row whose title is HERS, which is the whole point', () => {
    const item = foldWorkItems([
      line({ title: 'I feel like the inbox is a little bit messy. For instance:' }, { ts: 1, source: 'founder' }),
      line({ label: 'Inbox row titles' }, { ts: 2, source: 'agent' }),
    ]).get('w-1');
    // Her title is untouched: she still reads her own words when she opens it.
    expect(item.title).toBe('I feel like the inbox is a little bit messy. For instance:');
    // And the name the list draws is ours.
    expect(item.label).toBe('Inbox row titles');
    expect(rowTitle(item)).toBe('Inbox row titles');
  });

  it('still refuses an agent the TITLE, so nothing here weakened the fold', () => {
    const item = foldWorkItems([
      line({ title: 'Her words' }, { ts: 1, source: 'founder' }),
      line({ title: 'An agent had a better idea' }, { ts: 2, source: 'agent' }),
    ]).get('w-1');
    expect(item.title).toBe('Her words');
  });
});

describe('what the list calls a row', () => {
  it('draws the label when there is one', () => {
    expect(rowTitle({ title: 'I have been really struggling with', label: 'The positioning line' }))
      .toBe('The positioning line');
  });

  it('draws her title when there is not, which is every row until one is named', () => {
    expect(rowTitle({ title: 'I can no longer open the settings page.' }))
      .toBe('I can no longer open the settings page.');
  });

  it('NEVER draws a nameless row, whatever whitespace arrives in the field', () => {
    for (const label of ['', '   ', '\n', '\t ']) {
      expect(rowTitle({ title: 'Her words', label })).toBe('Her words');
    }
  });
});

describe('which rows the app offers to name', () => {
  const row = (over = {}) => ({ status: 'open', title: 'Something she dictated', ...over });

  it('names a live row that has never been named', () => {
    expect(wantsName(row())).toBe(true);
  });

  it('leaves the archive alone', () => {
    expect(wantsName(row({ status: 'done' }))).toBe(false);
  });

  it('leaves a row with no words on it alone', () => {
    expect(wantsName({ status: 'open', title: '  ', body: '' })).toBe(false);
  });

  it('IS IDEMPOTENT: a named row whose content has not moved is never named again', () => {
    const named = row({
      label: 'Inbox row titles',
      wrote: { title: { ts: 10, source: 'founder' }, label: { ts: 20, source: 'agent' } },
    });
    expect(wantsName(named)).toBe(false);
    // Twice, three times, forever: this runs every fifteen seconds.
    expect(wantsName(named)).toBe(false);
  });

  it('names it again when she answers, because the thread has moved', () => {
    const answered = row({
      label: 'Inbox row titles',
      wrote: {
        title: { ts: 10, source: 'founder' },
        label: { ts: 20, source: 'agent' },
        answer: { ts: 30, source: 'founder' },
      },
    });
    expect(wantsName(answered)).toBe(true);
  });

  it('does NOT rename on a claim, a heartbeat or a release', () => {
    // contentTouchedAt reads the four fields that carry words. Everything else
    // about a row moves several times a minute while a worker is on it.
    const busy = {
      wrote: {
        title: { ts: 10 }, label: { ts: 20 },
        status: { ts: 999 }, runAt: { ts: 999 }, answeredThrough: { ts: 999 },
      },
    };
    expect(contentTouchedAt(busy)).toBe(10);
    expect(wantsName({ status: 'claimed', title: 'x', label: 'A name', ...busy })).toBe(false);
  });
});

describe('the message the naming call gets', () => {
  it('carries the last thing written on the row, not just her opening line', () => {
    // The failure this prevents, measured 2026-09-03: titled from its opening
    // message alone came back "Fix onboarding and theme visibility" while the
    // row was by then about landing five branches.
    const prompt = namePrompt({
      title: 'Testing the app and observing several key issues.',
      body: 'A few things I noticed while clicking around.',
      result: 'The merge rule is on main. Shall I land the five branches that matter?',
    });
    expect(prompt).toContain('Testing the app and observing several key issues.');
    expect(prompt).toContain('land the five branches');
    expect(prompt).toContain('AS IT STANDS NOW');
  });

  it('says so plainly when nothing has been written yet', () => {
    expect(namePrompt({ title: 'A brand new row' })).toContain('(nothing written yet)');
  });
});

describe('what comes back is not a name until it has been cleaned', () => {
  it('takes a plain one-line answer as it is', () => {
    expect(cleanName('Landing branches for app fixes')).toBe('Landing branches for app fixes');
  });

  it('drops quotes, a label prefix and a trailing full stop', () => {
    expect(cleanName('"Landing branches for app fixes"')).toBe('Landing branches for app fixes');
    expect(cleanName('Title: Landing branches for app fixes')).toBe('Landing branches for app fixes');
    expect(cleanName('Landing branches for app fixes.')).toBe('Landing branches for app fixes');
  });

  it('REFUSES a paragraph rather than putting one on the row', () => {
    const essay = 'This thread is about deciding which of the five outstanding branches should be merged into main before the release, and I would suggest';
    expect(cleanName(essay)).toBe('');
    expect(essay.length).toBeGreaterThan(NAME_MAX);
  });

  it('refuses a reply that is a sentence rather than a name', () => {
    expect(cleanName('Sure, here is a good short title for you')).toBe('');
  });

  it('refuses nothing at all, so the row keeps the name it had', () => {
    for (const junk of ['', '   ', '\n\n', null, undefined]) {
      expect(cleanName(junk)).toBe('');
    }
  });
});

describe('the row is findable by either name', () => {
  it('searches the label AND her title, because she may remember either', async () => {
    const { searchItems } = await import('../renderer/src/search');
    const items = [{
      id: 'w-1',
      title: 'I feel like the inbox is a little bit messy. For instance:',
      label: 'Inbox row titles',
      status: 'open',
    }];
    expect(searchItems(items, 'inbox row titles').map((h) => h.item.id)).toEqual(['w-1']);
    expect(searchItems(items, 'a little bit messy').map((h) => h.item.id)).toEqual(['w-1']);
  });
});
