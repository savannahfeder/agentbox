// Which text the row shows under the title.
//
// The row now has to be enough to decide on without opening anything, so which
// FIELD it draws is load-bearing rather than cosmetic. The rule is the one the
// row has always used and it has one trap in it: an item she composed herself
// is often a single line with no body at all, so keying "show the result" on
// the Done TAB alone leaves her own answered asks sitting in the inbox with
// nothing under the title. Those rows are the whole reason answers are
// delivered to the inbox instead of filed (belongsInInbox).

import { describe, expect, it } from 'vitest';
import { clipToSentence, rowSummary, SUMMARY_BUDGET } from '../renderer/src/list-rules.ts';

const asked = { body: 'What is our weekly active number?', status: 'open' };
const answered = { body: 'What is our weekly active number?', result: 'Twelve, measured Monday.', status: 'done' };

describe('rowSummary', () => {
  it('shows the ask while the work is open', () => {
    expect(rowSummary(asked, 'inbox')).toBe('What is our weekly active number?');
  });

  it('shows the answer once it is finished, in every view', () => {
    // Her own asks come back done and stay in the INBOX. The result is the
    // news there; the body is the question she already knows she asked.
    expect(rowSummary(answered, 'inbox')).toBe('Twelve, measured Monday.');
    expect(rowSummary(answered, 'done')).toBe('Twelve, measured Monday.');
  });

  it('falls back to the body when a finished item wrote no result', () => {
    expect(rowSummary({ body: 'Ship the pricing page.', status: 'done' }, 'done'))
      .toBe('Ship the pricing page.');
  });

  it('says nothing rather than something wrong when there is no text', () => {
    expect(rowSummary({ status: 'open' }, 'inbox')).toBe('');
  });

  // A ROW THAT IS NOT FINISHED USED TO SHOW THE USER'S OWN WORDS BACK.
  // `blocked` is not `done`, so a worker that answered and marked the row
  // blocked handed back a row reading exactly as it had before, word for word,
  // with a finished answer the list would not print. Which text is NEWER is the
  // question, not what the status is.
  const wrote = (bodyTs, resultTs) => ({ body: { ts: bodyTs, source: 'founder' }, result: { ts: resultTs, source: 'agent' } });

  it('shows the answer on a blocked row, because the answer is the newer text', () => {
    const blocked = {
      body: 'What is the status of the round?',
      result: 'Term sheet signed Tuesday. Nothing needed from you until Friday.',
      status: 'blocked',
      wrote: wrote(1000, 2000),
    };
    expect(rowSummary(blocked, 'inbox')).toBe('Term sheet signed Tuesday. Nothing needed from you until Friday.');
  });

  it('shows it on a row reopened by her reply too, which is the same row an instant later', () => {
    const reopened = { body: 'Ship the pricing page?', result: 'Shipped and verified.', status: 'open', wrote: wrote(1000, 2000) };
    expect(rowSummary(reopened, 'inbox')).toBe('Shipped and verified.');
  });

  it('still shows the ask when the body is the newer text', () => {
    // The user rewrote the ask after an old result. The rewrite is the news then.
    const rewritten = { body: 'Actually, hold the pricing page until legal reads it.', result: 'Shipped and verified.', status: 'open', wrote: wrote(3000, 2000) };
    expect(rowSummary(rewritten, 'inbox')).toBe('Actually, hold the pricing page until legal reads it.');
  });

  it('leaves an open row with no result exactly as it was', () => {
    expect(rowSummary(asked, 'inbox')).toBe('What is our weekly active number?');
  });

  it('keeps showing the result on a done row whose ledger recorded no timestamps', () => {
    // Older lines carry no `wrote` map. Dropping those would take the news off
    // rows that have been printing it correctly all along.
    expect(rowSummary(answered, 'inbox')).toBe('Twelve, measured Monday.');
  });

  it('strips the markdown so two lines of prose survive, not two lines of syntax', () => {
    const item = { body: '## Context\n\nThe **build** is green.\n\nApprove to ship?', status: 'open' };
    expect(rowSummary(item, 'inbox')).toBe('The build is green. Approve to ship?');
  });
});

describe('clipToSentence', () => {
  // Clipping on a character count produced rows that read as if the sentence
  // had been interrupted mid-phrase. Saying less is better than trailing off,
  // because trailing off looks like the row failed rather than like there is
  // more inside it.
  it('leaves anything inside the budget exactly as written', () => {
    const short = 'CI is green and staging is verified. Approve to deploy to production?';
    expect(clipToSentence(short)).toBe(short);
  });

  it('ends on a full stop rather than mid-word', () => {
    const long = 'Ten people from outside have made an account since 15 July and not one has ever come back. '
      + 'The four things they hit are fixed and running since 11 August, and nobody has sat through a first session on it.';
    const out = clipToSentence(long);
    expect(out).toBe('Ten people from outside have made an account since 15 July and not one has ever come back.');
    expect(out.length).toBeLessThanOrEqual(SUMMARY_BUDGET);
  });

  it('honours a question mark or an exclamation as an ending too', () => {
    const q = `${'x'.repeat(60)} is what happened? ${'y'.repeat(200)}`;
    expect(clipToSentence(q).endsWith('?')).toBe(true);
  });

  it('falls back to a word boundary with an ellipsis when one sentence overruns', () => {
    const runOn = `${'word '.repeat(80)}end.`;
    const out = clipToSentence(runOn);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/wor…$/);
    expect(out.length).toBeLessThanOrEqual(SUMMARY_BUDGET + 1);
  });
});

// A message written as one paragraph: the title is a label cut from the body,
// so the row would print its first sentence twice unless the summary starts
// where the label stopped (message-split.ts made the titles this way).
describe('rowSummary when the title came out of the body', () => {
  const hers = {
    title: 'Can the welcome email wait until they finish setup?',
    body: 'Can the welcome email wait until they finish setup? Right now it goes out the '
      + 'second someone signs up, so people get a "you are all set" email mid-form.',
    status: 'open',
  };

  it('summarises what the title could not hold, not what it already said', () => {
    expect(rowSummary(hers, 'inbox')).toBe('Right now it goes out the second someone signs up, so people get a "you are all set" email mid-form.');
  });

  it('is unchanged on a row whose title an agent wrote separately', () => {
    const filed = { title: 'Pricing page: annual toggle on or off?', body: 'Three tiers, annual default.', status: 'open' };
    expect(rowSummary(filed, 'inbox')).toBe('Three tiers, annual default.');
  });

  it('says nothing rather than repeating the title when the message was one line', () => {
    expect(rowSummary({ title: 'Fix the login bug', body: 'Fix the login bug', status: 'open' }, 'inbox')).toBe('');
  });
});
