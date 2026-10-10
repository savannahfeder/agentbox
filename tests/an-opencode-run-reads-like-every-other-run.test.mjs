// A ROW RUNNING OPENCODE HAS TO READ LIKE THE OTHER TWO.
//
// Every payload in this file was copied off a real OpenCode 1.18.35 `/event`
// stream on 2026-10-07, not written from the docs, which do not enumerate the
// event payloads at all. The shapes that matter and that nothing else records:
//
//   message.part.updated  part.type: text | reasoning | tool | step-start |
//                         step-finish; a tool part has state.status of
//                         pending | running | completed | error
//   message.part.delta    { partID, field: "text", delta }  -- and a REASONING
//                         part's deltas carry the same field: "text", which is
//                         the trap these tests exist for
//   permission.asked      bash: metadata.command
//                         edit: metadata.filepath AND metadata.diff, a whole
//                         unified diff, which neither other harness provides
//   session.error         error is an OBJECT: { name, data: { message } }
import { describe, it, expect } from 'vitest';
import { harnessFor } from '../main/harnesses.mjs';
import { openCodeApprovalCard, openCodeErrorText, rememberOpenCodeProsePart } from '../main/opencode.mjs';

const readers = () => harnessFor('opencode').readers();
const SESSION = 'ses_ee664c43cffe09NFlNa9LMgVW1';

const partUpdated = part => ['message.part.updated', { sessionID: SESSION, part }];
const delta = (partID, text) => ['message.part.delta', { sessionID: SESSION, partID, field: 'text', delta: text }];

describe('an OpenCode run reads like every other run', () => {
  it('records the session it can be resumed on, from any event that names it', () => {
    const session = {};
    readers().capture(session, 'session.updated', { sessionID: SESSION, info: { id: SESSION, cost: 0, tokens: { total: 14491 } } });
    expect(session.sessionId).toBe(SESSION);
    expect(session.opencodeCost).toBe(0);
    expect(session.opencodeTokens).toEqual({ total: 14491 });
  });

  it('keeps the last assistant prose as the result, and not the reasoning', () => {
    const session = {};
    readers().capture(session, ...partUpdated({ id: 'prt_r', type: 'reasoning', text: 'The user wants me to create a file' }));
    expect(session.result).toBeUndefined();
    readers().capture(session, ...partUpdated({ id: 'prt_a', type: 'text', text: 'Working on it' }));
    readers().capture(session, ...partUpdated({ id: 'prt_a', type: 'text', text: 'DONE, the file is written' }));
    expect(session.result).toBe('DONE, the file is written');
    expect(session.resultIsError).toBe(false);
  });

  it('turns a session error object into a sentence rather than [object Object]', () => {
    const session = {};
    readers().capture(session, 'session.error', { sessionID: SESSION, error: { name: 'ProviderAuthError', data: { message: 'no credentials for anthropic' } } });
    expect(session.result).toBe('ProviderAuthError: no credentials for anthropic');
    expect(session.resultIsError).toBe(true);
    expect(openCodeErrorText('plain words')).toBe('plain words');
    expect(openCodeErrorText({})).toBeNull();
    expect(openCodeErrorText(null)).toBeNull();
  });

  it('remembers which files the run changed, for the card that shows the change', () => {
    const session = {};
    const write = { id: 'prt_w', type: 'tool', tool: 'write', state: { status: 'completed', input: { filePath: '/project/note.txt' } } };
    readers().capture(session, ...partUpdated(write));
    readers().capture(session, ...partUpdated(write));
    readers().capture(session, ...partUpdated({ id: 'prt_b', type: 'tool', tool: 'bash', state: { status: 'completed', input: { command: 'ls' } } }));
    expect(session.opencodeChange).toEqual(['/project/note.txt']);
    expect(harnessFor('opencode').change(session)).toEqual({ files: ['/project/note.txt'] });
    expect(harnessFor('opencode').change({})).toBeNull();
  });

  it('streams the prose being typed and never the private reasoning', () => {
    const session = {};
    // The run starts talking in a text part, which is the one to stream.
    rememberOpenCodeProsePart(session, ...partUpdated({ id: 'prt_a', type: 'text', text: '' }));
    expect(readers().stream(session, ...delta('prt_a', 'Reading the '))).toBe(true);
    expect(readers().stream(session, ...delta('prt_a', 'file'))).toBe(true);
    expect(session.saying).toBe('Reading the file');
    // A reasoning part's deltas carry the same field name and must not show.
    expect(readers().stream(session, ...delta('prt_r', 'secretly thinking'))).toBe(false);
    expect(session.saying).toBe('Reading the file');
    // A step boundary ends the prose part, so the next deltas are not assumed.
    rememberOpenCodeProsePart(session, ...partUpdated({ id: 'prt_s', type: 'step-start' }));
    expect(session.opencodeProsePart).toBeNull();
  });

  it('says what it is doing while a tool is still running', () => {
    const { activity } = readers();
    expect(activity(...partUpdated({ type: 'tool', tool: 'bash', state: { status: 'running' } }))).toEqual({ tool: 'Bash' });
    expect(activity(...partUpdated({ type: 'tool', tool: 'webfetch', state: { status: 'pending' } }))).toEqual({ tool: 'Fetch' });
    // A finished tool is history, not activity.
    expect(activity(...partUpdated({ type: 'tool', tool: 'bash', state: { status: 'completed' } }))).toBeNull();
    expect(activity(...partUpdated({ type: 'text', text: 'hello' }))).toBeNull();
  });

  it('summarises and traces a turn in words a person would use', () => {
    const { summarize, trace } = readers();
    expect(summarize(...partUpdated({ type: 'text', text: 'Wrote the note' }))).toBe('Wrote the note');
    expect(summarize(...partUpdated({ type: 'tool', tool: 'write', state: { status: 'completed' } }))).toBe('tool: Write');
    expect(summarize(...partUpdated({ type: 'reasoning', text: 'thinking' }))).toBeNull();

    expect(trace(...partUpdated({ type: 'text', text: 'Wrote the note' }))).toMatch(/ {2}Wrote the note$/);
    expect(trace(...partUpdated({ type: 'tool', tool: 'bash', state: { status: 'completed', input: { command: 'npm test' } } }))).toMatch(/\[Bash] npm test$/);
    // A refused tool says so, which is how a denied card is readable later.
    expect(trace(...partUpdated({ type: 'tool', tool: 'bash', state: { status: 'error', input: { command: 'rm -rf /' } } }))).toMatch(/\[Bash] \(refused\) rm -rf \/$/);
    expect(trace('session.error', { error: { name: 'APIError', data: { message: 'rate limited' } } })).toMatch(/\[error] APIError: rate limited$/);
  });

  it('shapes a shell approval around the command it wants to run', () => {
    expect(openCodeApprovalCard({
      id: 'per_1', sessionID: SESSION, permission: 'bash',
      patterns: ['echo *'], metadata: { command: 'echo hello-from-opencode' },
    })).toEqual({
      kind: 'bash', title: 'Run a command', detail: 'echo hello-from-opencode',
      command: 'echo hello-from-opencode', patterns: ['echo *'],
    });
  });

  it('shapes a file approval around the diff OpenCode actually sends', () => {
    // This is the payload measured off the real server: a write asks with the
    // whole unified diff in it, so the card can show the change itself.
    const card = openCodeApprovalCard({
      id: 'per_2', sessionID: SESSION, permission: 'edit',
      patterns: ['note.txt'],
      metadata: { filepath: '/project/note.txt', diff: 'Index: /project/note.txt\n+++ /project/note.txt\n+hello\n' },
    });
    expect(card.kind).toBe('edit');
    expect(card.title).toBe('Change a file');
    expect(card.detail).toBe('/project/note.txt');
    expect(card.diff).toContain('+hello');
  });

  it('still shapes a card for a permission it has never seen before', () => {
    const card = openCodeApprovalCard({ id: 'per_3', sessionID: SESSION, permission: 'something_new', patterns: ['*'] });
    expect(card).toEqual({ kind: 'something_new', title: 'Use a tool', detail: '*', patterns: ['*'] });
    expect(openCodeApprovalCard(null).title).toBe('Use a tool');
  });

  it('reads nothing out of a malformed event and never throws', () => {
    const session = {};
    const { capture, stream, summarize, trace, activity } = readers();
    for (const bad of [null, undefined, 42, 'text', { part: null }, { part: 'nonsense' }]) {
      expect(() => capture(session, 'message.part.updated', bad)).not.toThrow();
      expect(stream(session, 'message.part.delta', bad)).toBe(false);
      expect(summarize('message.part.updated', bad)).toBeNull();
      expect(trace('message.part.updated', bad)).toBeNull();
      expect(activity('message.part.updated', bad)).toBeNull();
    }
    expect(session.result).toBeUndefined();
  });
});
