// A ONE-LINE TASK A PERSON SENT OPENS AS THEIRS, NOT THE AGENT'S.
//
// Found 2026-10-01 on the team build. A person's own first message was drawn
// as the agent's, the agent's first steps were summed up as "You renamed it,
// looked up a tool, claim work item, list documents", and a later step was
// drawn with the row id as its subject.
//
// Why. Sending a task writes two lines: the app's birth stamp (source
// 'system', the title) and then the person's own line. The team rule that
// drops the stamp when the same person's words follow only fired when that
// line carried a BODY. A task typed as one line has a title and no body, so the
// stamp stayed and opened the thread as the agent's (and took the person's
// words when the agent later gave the row a short name), and the person's own
// line, carrying the very same title, fell through to the rename branch and
// read "You renamed it" right above the agent's first tool calls. The id is the
// store tool's argument, which the trace keeps as the line's subject.

import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';
import { itemThread } from '../renderer/src/item-thread';

const T0 = Date.parse('2026-10-01T09:12:09-07:00');
const CARLA = 'p-test-0001';
const TITLE = 'Draft the quarterly update for the board, and list the numbers I should include.';
const line = (ts, source, patch, extra = {}) => ({ id: 'w-1a2b3c4d5e', ts, source, patch, ...extra });

// A one-line task, in the shapes such a row's lines have.
const hers = [
  line(T0, 'system', { title: TITLE, status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }, { by: CARLA }),
  line(T0 + 45, 'founder', { title: TITLE, model: 'opus' }, { by: CARLA }),
  line(T0 + 17_000, 'agent', { label: 'Quarterly board update draft' }, { by: CARLA }),
  line(T0 + 72_000, 'agent', { result: "**Here's the quarterly update.**\n\nSubject: Q3 update for the board" }, { by: CARLA }),
];

const trace = {
  startedAt: T0 + 44_000,
  text: [
    `# ${TITLE}`,
    '# w-1a2b3c4d5e · spawned 2026-10-01T16:12:53.286Z',
    '',
    '16:13:08  [ToolSearch] ',
    '16:13:11  [mcp__agentbox__claim_work_item] w-1a2b3c4d5e',
    '16:13:11  [mcp__agentbox__list_documents] ',
    '',
  ].join('\n'),
};

describe('a task Carla typed as one line', () => {
  it('opens with her, not with an agent', () => {
    const events = threadEvents(hers);
    expect(events.map((e) => e.said)).not.toContain('An agent opened this');
    expect(events[0]).toMatchObject({ who: 'you', said: 'You opened this', by: CARLA });
    expect(events[0].words).toContain(TITLE);
  });

  it('does not say she renamed it when the title did not change', () => {
    expect(threadEvents(hers).map((e) => e.said)).not.toContain('You renamed it');
  });

  it('draws her words as hers on the page, and none of her name on the agent\'s steps', () => {
    const { events } = itemThread(hers, [trace]);
    const first = events.find((e) => e.kind !== 'work');
    expect(first).toMatchObject({ who: 'you', by: CARLA });
    expect(first.text).toContain(TITLE);
    const verbs = events.filter((e) => e.kind === 'work').map((e) => e.verb);
    expect(verbs.some((v) => /^You /.test(v))).toBe(false);
  });

  it('never shows a row id as the subject of a step', () => {
    const { events } = itemThread(hers, [trace]);
    const subjects = events.filter((e) => e.kind === 'work').map((e) => e.subject);
    expect(subjects.some((s) => /\bw-[0-9a-f]{10}\b/.test(s))).toBe(false);
    // THE CLAIM IS NOT DRAWN AT ALL SINCE w-0bd0d8b2ef. This line used to
    // demand the step survive with its id blanked; the newer rule is that
    // taking a thread and writing its status back are the app talking to
    // itself and are not activity. Blanking the id still holds for every store
    // step that IS drawn (reading a document, filing a question).
    expect(events.some((e) => e.kind === 'work' && e.verb === 'claim work item')).toBe(false);
  });
});

describe('what must not change', () => {
  it('a real rename is still a rename, and says what it was', () => {
    const lines = [
      line(T0, 'founder', { title: 'Old name', status: 'open', body: 'the ask' }),
      line(T0 + 60_000, 'founder', { title: 'New name' }),
    ];
    const rename = threadEvents(lines).find((e) => e.said === 'You renamed it');
    expect(rename?.words).toBe('was "Old name"');
  });

  it('a line that repeats the title and closes the row still closes it', () => {
    const lines = [
      line(T0, 'founder', { title: 'Same', status: 'open', body: 'the ask' }),
      line(T0 + 60_000, 'founder', { title: 'Same', status: 'done' }),
    ];
    expect(threadEvents(lines).map((e) => e.said)).toEqual(['You opened this', 'You marked it done']);
  });

  it('a row an agent filed on a signed-in Mac still says an agent opened it', () => {
    const lines = [
      line(T0, 'agent', { title: 'Panel read the landing page', status: 'open', kind: 'question' }, { by: CARLA }),
      line(T0 + 2, 'agent', { title: 'Panel read the landing page' }, { by: CARLA }),
    ];
    expect(threadEvents(lines)[0]).toMatchObject({ who: 'agent', said: 'An agent opened this' });
  });

  it('a stamp followed by somebody else\'s line is not dropped', () => {
    const lines = [
      line(T0, 'system', { title: TITLE, status: 'open', kind: 'directive' }, { by: CARLA }),
      line(T0 + 45, 'founder', { title: TITLE }, { by: 'someone-else' }),
    ];
    expect(threadEvents(lines)[0].said).toBe('An agent opened this');
  });

  it('a subject that merely mentions an id keeps it', () => {
    const { events } = itemThread([line(T0, 'founder', { title: 'x', status: 'open', body: 'y' })], [{
      startedAt: T0 + 1000,
      text: '# x\n\n16:13:08  [Bash] git log --grep w-1a2b3c4d5e\n',
    }]);
    const ran = events.find((e) => e.kind === 'work');
    expect(ran.subject).toContain('w-1a2b3c4d5e');
  });
});
