// NAMING ANOTHER THREAD WHILE YOU WRITE (w-c110f2371d).
//
// They kept wanting to point an agent at another thread from the New thread
// box or a reply, typed @, and got nothing: @ is for people and the agents a
// conversation brings in, and threads had no key at all. # is the key for
// threads now, the way it is for issues on GitHub and channels in Slack.
//
// What is measured here: which "#" opens the list and which does not (a
// heading, a hex colour, an email-like word, a "#" inside a word), what the
// list offers for a query, how a picked name is found again in the text (a
// restored draft included), and that the sent message carries a link both the
// agent and the thread view can read.
import { describe, it, expect } from 'vitest';
import {
  threadQuery, threadRows, threadName, findThreadMentions, encodeThreadMentions, withThreadNames,
} from '../renderer/src/thread-mentions.ts';
import { threadMessage } from '../renderer/src/threads/composer-rules.ts';
import { ticketReference } from '../renderer/src/ticket-references.ts';

const T = Date.parse('2026-10-21T09:00:00');
const thread = (id, title, at, more = {}) => ({ id, product: 'agentbox-team', productName: 'Agentbox Team', title, status: 'open', createdAt: at, updatedAt: at, ...more });
const login = thread('w-a000000001', 'Fix the login loop on the phone', T - 3_000);
const reply = thread('w-a000000002', 'The reply box grows with its text', T - 1_000);
const replyOld = thread('w-a000000003', 'Reply box keys', T - 9_000, { status: 'done' });
const labelled = thread('w-a000000004', 'A thing I sometimes find myself wanting to do in a new thread or in replies is to tag other agent threads', T - 2_000, { label: 'Thread reference syntax design', wrote: { label: { ts: T } } });
const odd = { id: 'agent-123', product: 'x', title: 'An outside agent row', updatedAt: T };
const all = [login, reply, replyOld, labelled, odd];

const at = (text) => threadQuery(text, text.length);

describe('which # opens the list', () => {
  it('opens on a # that starts the message or a word, with nothing typed yet', () => {
    expect(at('#')).toEqual({ start: 0, query: '' });
    expect(at('Do what we did in #')).toEqual({ start: 18, query: '' });
    expect(at('(see #rep')).toEqual({ start: 5, query: 'rep' });
  });
  it('keeps the words typed after it, spaces and all, on one line', () => {
    expect(at('like #reply box')).toEqual({ start: 5, query: 'reply box' });
  });
  it.each([
    ['a markdown heading', '# '],
    ['a second heading level', '## Plan'],
    ['a # inside a word', 'issue#12'],
    ['a # on an earlier line', '#reply\nnext line'],
    ['no # at all', 'reply box'],
  ])('stays shut for %s', (_, text) => expect(at(text)).toBeNull());
  it('reads only up to the caret', () => {
    expect(threadQuery('#reply box', 4)).toEqual({ start: 0, query: 'rep' });
  });
});

describe('what the list offers', () => {
  it('offers the newest threads first when nothing is typed, never the one you are in', () => {
    expect(threadRows(all, '', { here: reply.id }).map((r) => r.id)).toEqual([labelled.id, login.id, replyOld.id]);
  });
  it('matches the starts of the words in a thread name, finished threads included', () => {
    expect(threadRows(all, 'reply').map((r) => r.id)).toEqual([reply.id, replyOld.id]);
    expect(threadRows(all, 'box gro').map((r) => r.id)).toEqual([reply.id]);
  });
  it('ranks matches by how recently they moved, not by where the words sit', () => {
    expect(threadRows(all, 'reply box').map((r) => r.id)).toEqual([reply.id, replyOld.id]);
  });
  it('goes by the name the list draws, and still finds the words of the title under it', () => {
    expect(threadName(labelled)).toBe('Thread reference syntax design');
    expect(threadRows(all, 'syntax').map((r) => r.id)).toEqual([labelled.id]);
    expect(threadRows(all, 'tag other').map((r) => r.id)).toEqual([labelled.id]);
  });
  it('cuts a long name at a word', () => {
    const long = thread('w-a000000008', 'One two three four five six seven eight nine ten eleven twelve thirteen', T);
    expect(threadName(long)).toBe('One two three four five six seven eight nine ten eleven…');
  });
  it('finds a thread by its id too', () => {
    expect(threadRows(all, 'w-a000000001').map((r) => r.id)).toEqual([login.id]);
  });
  it.each([['a word in the middle of another', 'eply'], ['a colour', 'fff'], ['an issue number', '12']])('offers nothing for %s', (_, q) => {
    expect(threadRows(all, q)).toEqual([]);
  });
  it('never offers a row that a message could not link to', () => {
    expect(threadRows(all, 'outside')).toEqual([]);
  });
  it('stops at six', () => {
    const many = Array.from({ length: 9 }, (_, i) => thread(`w-b00000000${i}`, `Plan ${i}`, T - i));
    expect(threadRows(many, 'plan')).toHaveLength(6);
  });
});

describe('a picked thread in the text', () => {
  it('is found by its name after the #, wherever it sits', () => {
    const text = 'Do what #Fix the login loop on the phone did, then #The reply box grows with its text.';
    expect(findThreadMentions(text, all).map((m) => [m.id, text.slice(m.start, m.end)])).toEqual([
      [login.id, '#Fix the login loop on the phone'],
      [reply.id, '#The reply box grows with its text'],
    ]);
  });
  it('takes the longest name that fits, so a shorter name inside it does not win', () => {
    const short = thread('w-a000000005', 'Fix the login', T);
    expect(findThreadMentions('#Fix the login loop on the phone', [short, login]).map((m) => m.id)).toEqual([login.id]);
    expect(findThreadMentions('#Fix the login now', [short, login]).map((m) => m.id)).toEqual([short.id]);
  });
  it('is not a mention once a word runs on from the name', () => {
    expect(findThreadMentions('#Reply box keysmash', all)).toEqual([]);
  });
  it('prefers the thread that was picked when two share a name', () => {
    const twin = thread('w-a000000006', 'Reply box keys', T);
    expect(findThreadMentions('#Reply box keys', [twin, replyOld]).map((m) => m.id)).toEqual([twin.id]);
    expect(findThreadMentions('#Reply box keys', [twin, replyOld], [replyOld.id]).map((m) => m.id)).toEqual([replyOld.id]);
  });
  it('is the name without the # in a title', () => {
    const text = 'Do what #Reply box keys did';
    expect(withThreadNames(text, findThreadMentions(text, all))).toBe('Do what Reply box keys did');
  });
});

describe('what is sent', () => {
  const text = 'Read #Thread reference syntax design first, then #Reply box keys.';
  const sent = encodeThreadMentions(text, findThreadMentions(text, all));
  it('is a link carrying the name and the thread id', () => {
    expect(sent).toBe(`Read [Thread reference syntax design](${labelled.id}) first, then [Reply box keys](${replyOld.id}).`);
  });
  it('links to an address the thread view draws as the thread itself', () => {
    const hrefs = [...sent.matchAll(/\]\(([^)]+)\)/g)].map((m) => ticketReference(m[1]));
    expect(hrefs).toEqual([labelled.id, replyOld.id]);
  });
  it('keeps square brackets in a name from breaking the link', () => {
    const odd2 = thread('w-a000000007', 'Ship [beta] build', T);
    const msg = '#Ship [beta] build now';
    expect(encodeThreadMentions(msg, findThreadMentions(msg, [odd2]))).toBe(`[Ship \\[beta\\] build](${odd2.id}) now`);
  });
  it('leaves a message with no mention exactly as typed', () => {
    expect(encodeThreadMentions('Fix #12 and #fff', findThreadMentions('Fix #12 and #fff', all))).toBe('Fix #12 and #fff');
  });
});

describe('a new thread that names one', () => {
  const named = {
    encode: (s) => encodeThreadMentions(s, findThreadMentions(s, all)),
    plain: (s) => withThreadNames(s, findThreadMentions(s, all)),
  };
  it('is titled in plain words and keeps the link in its body, first line included', () => {
    expect(threadMessage('Do what #Reply box keys did\n\nBut for the phone.', [], named)).toEqual({
      title: 'Do what Reply box keys did',
      body: `Do what [Reply box keys](${replyOld.id}) did\n\nBut for the phone.`,
    });
    expect(threadMessage('Same as #Reply box keys', [], named)).toEqual({
      title: 'Same as Reply box keys',
      body: `Same as [Reply box keys](${replyOld.id})`,
    });
  });
  it('is split exactly as before when it names nothing', () => {
    expect(threadMessage('Fix #12\n\nOn the phone.', [], named)).toEqual({ title: 'Fix #12', body: 'On the phone.' });
  });
});
