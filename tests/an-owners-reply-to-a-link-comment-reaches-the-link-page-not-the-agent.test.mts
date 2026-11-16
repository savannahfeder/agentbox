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
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LinkNotes, linkReplyWords } from '../renderer/src/components/LinkNotes.tsx';

const src = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

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
    expect(said).toMatchObject({ who: 'you', said: 'You replied on the link page', words: 'Thanks, fixed' });
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

// The comments were listed beside the file with one small "Reply on the link
// page" at the end, and QA still wrote in the box under them, which only ever
// spoke to the agent. Each comment now has its own Reply, and it turns that box
// into a reply on the link page.
describe('a comment\'s Reply', () => {
  const c = (id: string, extra = {}) => ({ id, byName: 'Tom Becker', byAvatar: null, text: `words ${id}`, at: 1, mine: false, byOwner: false, ...extra });
  const draw = (props: Record<string, unknown>) => renderToStaticMarkup(h(LinkNotes, { comments: [c('a'), c('b'), c('me', { byOwner: true })], onGo() {}, onReply() {}, ...props }));

  it('is on every comment but your own, and is the only way in', () => {
    const html = draw({});
    expect(html.match(/>Reply</g)).toHaveLength(2);
    expect(html).not.toContain('Reply on the link page');
  });

  it('marks the comment being answered and hides its own Reply meanwhile', () => {
    const html = draw({ replyingTo: 'b' });
    expect(html.match(/>Reply</g)).toHaveLength(1);
    expect(html.match(/av-note is-link is-on/g)).toHaveLength(1);
  });

  it('names the person and the link page on the box, by first name', () => {
    expect(linkReplyWords({ id: 'a', name: 'Tom Becker' })).toBe('Reply to Tom on the link page');
  });

  for (const file of ['renderer/src/components/ArtifactView.tsx', 'renderer/src/components/NotesSidebar.tsx']) {
    it(`sends the box to the link page, not the agent, while it is on (${path.basename(file)})`, () => {
      const view = src(file);
      expect(view).toMatch(/onReply=\{\(to\) => \{ setToLink\(to\)/);
      expect(view).toMatch(/if \(toLink && \(?e\.key === 'Enter'[\s\S]{0,200}sendToLink\(\)/);
      expect(view).toMatch(/const sendToLink = async \(\) => \{[\s\S]{0,200}linkNotes\.reply\(typed\)/);
      expect(view).not.toMatch(/const sendToLink = async \(\) => \{[\s\S]{0,400}(fileMark|write\(\{ do: 'note')/);
    });
  }
});

describe('the Notes panel beside a thread\'s file', () => {

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
