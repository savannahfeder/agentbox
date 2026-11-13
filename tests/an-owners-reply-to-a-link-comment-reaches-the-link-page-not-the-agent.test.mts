// AN OWNER'S REPLY TO A LINK COMMENT REACHES THE LINK PAGE, NOT THE AGENT.
//
// QA on 2026-11-13: with a shared doc open beside its thread, the owner typed
// "A: reply to c1" in the file's Notes box. That box only ever writes a note
// for the agent, so a Codex run started, wrote qa-share-doc-v2.md with an
// answer in it, and the link page never showed a reply. The thread's Notes
// panel did not list the link's comments at all, so there was nowhere else to
// answer. Measured on the fold, the thread's lines, the store and the panel's
// source: the comments are listed with "Reply on the link page" beside the
// file, and a reply sent there marks the thread answered without starting a run.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { foldWorkItems, pickFields } from '../shared/work-items.mts';
import { threadEvents } from '../renderer/src/thread-history.ts';

const make = { id: 'w-1', ts: 1, source: 'founder', patch: { title: 'Share the plan', status: 'blocked' } };
const comment = (ts: number, text: string) => ({ id: 'w-1', ts, source: 'system', patch: { note: `B commented on plan.md. "${text}"`, linkComment: { name: 'B', file: 'plan.md', text } } });
const reply = (ts: number, source = 'founder') => ({ id: 'w-1', ts, source, by: 'owner', patch: { linkReply: { file: 'plan.md', text: 'Thanks, fixed' } } });
const fold = (lines: unknown[]) => foldWorkItems(lines).get('w-1')!;

describe('the reply line', () => {
  it('keeps the file and the words, and nothing else', () => {
    expect(pickFields({ linkReply: { file: 'plan.md', text: 'Thanks', extra: 1 } })).toEqual({ linkReply: { file: 'plan.md', text: 'Thanks' } });
    expect(pickFields({ linkReply: { file: 'plan.md', text: '  ' } })).toBeNull();
    expect(pickFields({ linkReply: 'Thanks' })).toBeNull();
  });

  it('answers the link comments written before it, so the thread leaves Needs you', () => {
    expect(fold([make, comment(2, 'c1'), comment(3, 'c2')]).linkComments).toHaveLength(2);
    expect(fold([make, comment(2, 'c1'), comment(3, 'c2'), reply(4)]).linkComments).toBeUndefined();
  });

  it('does not answer a comment that came after it', () => {
    expect(fold([make, comment(2, 'c1'), reply(3), comment(4, 'c2')]).linkComments?.map((c) => c.text)).toEqual(['c2']);
  });

  it('counts only when the person wrote it', () => {
    expect(fold([make, comment(2, 'c1'), reply(3, 'system')]).linkComments).toHaveLength(1);
  });

  it('is no answer to the agent and leaves a teammate\'s words waiting', () => {
    const teammate = { id: 'w-1', ts: 3, source: 'system', by: 'mate', uid: 'comment-1', patch: { comment: { text: 'Look at this', name: 'Mate' } } };
    const item = fold([make, comment(2, 'c1'), teammate, reply(4)]);
    expect(item.answer).toBeUndefined();
    expect(item.status).toBe('blocked');
    expect(item.waitingComments?.map((c) => c.text)).toEqual(['Look at this']);
  });

  it('reads in the thread as your reply on the link page, in your words', () => {
    const said = threadEvents([make, comment(2, 'c1'), reply(3)]).find((e) => /link page/.test(e.said ?? ''));
    expect(said).toMatchObject({ who: 'you', said: 'You replied on the link page for plan.md', words: 'Thanks, fixed' });
    expect(said?.message).toBeUndefined();
  });
});

describe('the store', () => {
  it('writes the reply on the thread as the person, and starts nothing', async () => {
    const disk = await import('../main/store/work-items.mts');
    const { Store } = await import('../main/store.mts');
    disk._internals.forgetFolds();
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'link-reply-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'payments'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'payments', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'payments', name: 'Payments' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const item = store.composeItem('payments', { title: 'Share the plan', body: 'Share it' });
    store.commentOnASharedFile('payments', item.id, 'B commented on plan.md. "c1"', { name: 'B', file: 'plan.md', text: 'c1' });
    expect(store.readItem('payments', item.id).linkComments).toHaveLength(1);
    const before = store.readItem('payments', item.id);
    store.repliedOnALink('payments', item.id, { file: 'plan.md', text: 'Thanks' });
    const after = store.readItem('payments', item.id);
    expect(after.linkComments).toBeUndefined();
    expect(after.answer).toBe(before.answer);
    expect(after.wrote?.linkReply?.source ?? 'founder').toBe('founder');
    expect(store.repliedOnALink('payments', 'w-nope', { file: 'plan.md', text: 'x' })).toBeNull();
  });
});

describe('the Notes panel beside a thread\'s file', () => {
  const src = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

  it('lists the link\'s comments with a way to reply on the link page', () => {
    const panel = src('renderer/src/components/NotesSidebar.tsx');
    expect(panel).toMatch(/useLinkNotes\([^;]*thread:\s*item\.id/);
    expect(panel).toMatch(/<LinkNotes\b/);
  });

  it('sends the reply with the thread it answers, so the thread hears of it', () => {
    expect(src('renderer/src/components/LinkNotes.tsx')).toMatch(/fileLinkComment\(\{[^}]*thread/);
    expect(src('main/ipc.mts')).toMatch(/'zero:file-link-comment'[\s\S]{0,600}repliedOnALink/);
  });
});
