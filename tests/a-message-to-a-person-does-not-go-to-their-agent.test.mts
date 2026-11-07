// A MESSAGE TO A PERSON DOES NOT GO TO THEIR AGENT.
//
// Sofia's seat picker agent posted a picture into her chat with Dev.
// Dev's next message, two questions for Jordan meant for Sofia, was handed to
// that agent, which said it was not about the seat picker and offered to dig
// in. Measured on repliesToAgents: every message after the owner's agent spoke
// counted as a reply to it, until the owner herself wrote. Now only an agent
// message that asks the person something takes their answer, and a message
// that opens on the owner's name is the owner's.
import { describe, it, expect } from 'vitest';
import { repliesToAgents } from '../shared/teammate-reach.mts';

const voice = { id: 't-aaaaaa', name: 'Seat picker', run: 'w-run' };
const chat = (...said) => [{ id: 'w-convo', product: 'direct', status: 'open', talk: { chat: said, threads: {} } }];
const replies = (items, extra = {}) => repliesToAgents({ items, me: 'sofia', seen: new Set(), direct: () => true, ownerName: 'Sofia Reyes', ...extra });

describe('after the agent posts something without asking', () => {
  it('the person’s next message is for the owner, not the agent', () => {
    const items = chat(
      { by: 'sofia', ts: 1, text: 'Here is v8 with the picked lines.', voice },
      { by: 'dev', ts: 2, text: 'Two more for Jordan: does LUM-47 fire on fall-back, and which calendar test covers it.' },
    );
    expect(replies(items)).toEqual([]);
  });
});

describe('after the agent asks the person something', () => {
  const asked = { by: 'sofia', ts: 1, text: 'Dev, which of these lines should the 6-open state use?', voice };
  it('their answer goes back to the agent', () => {
    const out = replies(chat(asked, { by: 'dev', ts: 2, text: 'The second one.' }));
    expect(out.map((r) => r.run)).toEqual(['w-run']);
  });
  it('one asked without a question mark still counts', () => {
    const out = replies(chat({ ...asked, text: 'Dev, let me know which line the 6-open state should use.' }, { by: 'dev', ts: 2, text: 'The second.' }));
    expect(out).toHaveLength(1);
  });
  it('but a message that opens on the owner’s name is hers', () => {
    expect(replies(chat(asked, { by: 'dev', ts: 2, text: 'Sofia, separate thing: can you forward these to Jordan?' }))).toEqual([]);
  });
  it('and once the owner speaks, nothing after is the agent’s', () => {
    expect(replies(chat(asked, { by: 'sofia', ts: 2, text: 'Ignore that, Dev.' }, { by: 'dev', ts: 3, text: 'OK.' }))).toEqual([]);
  });
});

it('a reply in the thread under the agent’s message is always the agent’s', () => {
  const items = [{ id: 'w-convo', product: 'direct', status: 'open', talk: { chat: [], threads: {
    u1: { by: 'sofia', text: 'Here is v8.', voice, replies: [{ by: 'dev', ts: 2, text: 'Make the chips square.' }] },
  } } }];
  expect(replies(items)).toHaveLength(1);
});
