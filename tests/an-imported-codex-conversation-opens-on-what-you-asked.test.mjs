// AN IMPORTED CODEX CONVERSATION OPENS ON WHAT YOU ASKED, NOT ON THE QUESTION
// THAT BROUGHT IT IN.
//
// Found driving the real app on a Mac with only Codex (w-db6f5e331e,
// 2026-10-05). Every Codex conversation, imported by Yes on its row or by the
// ⌘K card, opened on "An agent opened this: Import into Orders Api? ...
// Options 1. Import into Orders Api 2. Not now", over a result saying it was
// already in. The row itself was right (body = the prompt, labels = codex), but
// the yes writes the prompt as YOURS, so the conversation draws under You, and
// the pane only takes a rewritten ask from the side that wrote the first one.
// So the agent's question stayed the opening for good.
//
// Now the line that turns the row into a Codex mirror also turns the opening
// into yours, carrying the prompt. A row still asking keeps the question.

import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';
import { itemThread } from '../renderer/src/item-thread';

const T0 = Date.parse('2026-10-05T13:38:00-07:00');
const line = (ts, source, patch) => ({ id: 'w-1', ts, source, patch });
const ASK = '**Import into Orders Api? You asked Codex: "Every morning, send the kitchen a summary".**\n\nA Codex conversation from September 26.\n\n## Options\n1. Import into Orders Api\n2. Not now';
const PROMPT = "Every morning, send the kitchen a summary of the day's orders.";

const asking = [
  line(T0, 'agent', { title: 'Send the kitchen a daily summary', status: 'open', kind: 'import', priority: 5, labels: ['codex-import', 'codex:abc'] }),
  line(T0 + 1, 'agent', { body: ASK }),
];
// What store.answerCodexImport writes on a yes.
const imported = [
  ...asking,
  line(T0 + 2, 'founder', { body: PROMPT }),
  line(T0 + 3, 'agent', { kind: 'directive', labels: ['codex', 'codex:abc'], result: 'There is now a 6am job.\n\nRead from Codex. Replies happen there.' }),
  line(T0 + 3, 'founder', { status: 'open' }),
];

describe('an imported Codex conversation', () => {
  const openings = threadEvents(imported).filter((e) => e.field === 'body');

  it('opens once, as yours, on the prompt', () => {
    expect(openings).toHaveLength(1);
    expect(openings[0].said).toBe('You opened this');
    expect(openings[0].who).toBe('you');
    expect(openings[0].words).toBe(PROMPT);
  });

  it('says where it came from rather than that an agent opened it', () => {
    const said = threadEvents(imported).map((e) => e.said);
    expect(said).toContain('Started in Codex');
    expect(said).not.toContain('An agent opened this');
  });

  it('no longer shows the import question or its options', () => {
    expect(openings[0].words).not.toMatch(/Import into|Options|Not now/);
  });

  it('keeps what Codex said as the result, in the pane too', () => {
    const thread = itemThread(imported, []);
    const text = thread.events.map((e) => e.text ?? '').join(' ');
    expect(text).toContain(PROMPT);
    expect(text).not.toContain('Import into Orders Api?');
  });
});

describe('a Codex conversation still asking', () => {
  it('keeps the question, because that is what it is waiting on', () => {
    const openings = threadEvents(asking).filter((e) => e.field === 'body');
    expect(openings).toHaveLength(1);
    expect(openings[0].said).toBe('An agent opened this');
    expect(openings[0].words).toContain('Import into Orders Api?');
  });
});

describe('any other row', () => {
  it('still ignores a body from the other side', () => {
    const lines = [
      line(T0, 'agent', { title: 'Tidy the footer', status: 'open', kind: 'directive', priority: 5, labels: [] }),
      line(T0 + 1, 'agent', { body: 'The footer has three fonts.' }),
      line(T0 + 2, 'founder', { body: 'Something else entirely.' }),
      line(T0 + 3, 'agent', { labels: ['design'] }),
    ];
    const openings = threadEvents(lines).filter((e) => e.field === 'body');
    expect(openings[0].said).toBe('An agent opened this');
    expect(openings[0].words).toBe('The footer has three fonts.');
  });
});

// A FRESH IMPORT SENT NOTHING BACK. The yes also wrote a founder "open" over a
// row that was already open, and the thread drew it as "You sent it back" under
// Codex's answer: both power testers (w-62228098e6) asked what they had sent.
// The yes now reopens only a row that was not open, one turned down before.
describe('a Codex conversation brought in by the store', () => {
  it('says nothing was sent back when it was brought in fresh', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { Store } = await import('../main/store.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-codex-history-'));
    const accountRoot = path.join(root, 'accounts', 'test-account');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
    const { slug } = store.createProduct({ name: 'Orders Api', repoPath: path.join(root, 'orders') });
    store.importCodexThreads(slug, [{ id: 'abc', source: 'codex', folder: path.join(root, 'orders'), title: 'Kitchen summary', prompt: PROMPT, last: 'Want it at 6am or 7am?', waiting: true }]);
    const { readLinesFrom } = await import('../main/store/work-items.mjs');
    const lines = readLinesFrom(store.productDir(slug)).lines.map((l) => (typeof l === 'string' ? JSON.parse(l) : l));
    const said = threadEvents(lines).map((e) => e.said);
    expect(said).not.toContain('You sent it back');
    expect(store.listItems().find((i) => i.labels.includes('codex:abc')).status).toBe('open');
  });
});
