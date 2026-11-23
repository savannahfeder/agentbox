// A TEAMMATE'S CHOICES SHOW ONCE IN ITS THREAD.
//
// Test day 2026-11-18: the Marketing lead posted a draft to the team chat with
// "Approve the post" and "Revise the post", then ended its run with the same
// draft and the same two choices. Its thread drew both: the draft twice, three
// buttons under the chat copy, and the answer's own choices at the foot. The
// founder: "why is it giving multiple options inline? yes we should probs get
// rid of that". A chat question from the run stays in the thread only while the
// run's answer offers no choices of its own; it is still answered in Chats.
import { it, expect } from 'vitest';
import { openQuestionsIn } from '../renderer/src/teammates/chat-lines.ts';

const LEAD = 't-f7ff22a32a';
const RUN = 'w-434eef0bd1';
const ask = { id: 'm-e3ea0cdf73bb', kind: 'msg', from: LEAD, to: [], text: 'A draft for your review: … Would you approve this post?', ts: 1000, options: ['Approve the post', 'Revise the post'], run: RUN };
const view = { list: [], chat: [ask], runs: [] };
const thread = (result: string, extra = {}) => ({
  id: RUN, labels: ['founder', `teammate:${LEAD}`, 'hop:0'], result,
  wrote: { result: { ts: 2000, source: 'agent' } }, ...extra,
});

it("the answer's own choices are the only ones drawn", () => {
  const answer = '**Would you approve this post?**\n\nThe draft.\n\n## Options\n\n1. Approve the post. (Recommended)\n2. Revise the post.';
  expect(openQuestionsIn(view as never, thread(answer))).toEqual([]);
});

it('with no choices in the answer, the chat question is drawn in the thread as before', () => {
  expect(openQuestionsIn(view as never, thread('**I asked you in the chat.**')).map((q) => q.id)).toEqual(['m-e3ea0cdf73bb']);
});

it("once you have picked from the answer's choices, the chat question does not come back", () => {
  const picked = thread('**Approved.**', { answer: 'Option 1: Approve the post.', wrote: { result: { ts: 4000, source: 'agent' }, answer: { ts: 3000, source: 'founder' } } });
  expect(openQuestionsIn(view as never, picked)).toEqual([]);
});

it('a chat question asked after your last word and the last answer is still drawn', () => {
  const later = { ...ask, id: 'm-later', ts: 5000 };
  const answer = '**Would you approve this post?**\n\n## Options\n\n1. Approve the post.\n2. Revise the post.';
  expect(openQuestionsIn({ ...view, chat: [ask, later] } as never, thread(answer, { answer: 'Option 1', wrote: { result: { ts: 2000, source: 'agent' }, answer: { ts: 3000, source: 'founder' } } })).map((q) => q.id)).toEqual(['m-later']);
});
