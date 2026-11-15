// A TEAMMATE'S COMMENT REACHES THE AGENT WHEN THE OWNER REPLIES (w-d19fcb9309).
//
// Two copies of the app on one stand-in team, 2026-11-09: Theo commented on
// Maya's shared thread ("I think it's the hero image, it's 4 MB on mobile.
// Can the agent check that first?"), the comment landed on Maya's thread and
// in her Needs you, and she replied "Good call from Theo, check the hero image
// first." Her agent was handed her words and nothing else: a comment is a
// `comment` delta, which the transcript (threadOf) skipped and no reply brief
// read. So the agent could not know what Theo had said.
//
// A comment still starts no run. The owner's next message, on whichever path
// it reaches the agent, now carries the comments since their last one.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { Store } from '../main/store.mts';
import * as disk from '../main/store/work-items.mts';
import { threadOf } from '../shared/work-items.mts';
import { CONTINUED_NOTE } from '../shared/thread-continued.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

const THEO = 'p-theo';
const HERO = "I think it's the hero image, it's 4 MB on mobile. Can the agent check that first?";
const REPLY = 'Good call from Theo, check the hero image first.';

let root;
let store;
let product;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-reaches-agent-'));
  const dir = path.join(root, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ slug: 'website', name: 'Website' }));
  product = { slug: 'website', name: 'Website', dir, repoPath: null };
  store = await new Store({ accountRoot: root, products: [] }).init();
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });

const supervisor = () => {
  const s = Object.create(Supervisor.prototype);
  s.appDir = root;
  s.dataDir = root;
  s.userDir = root;
  s.config = { personalProducts: [] };
  s.store = store;
  s.statePageOn = () => true;
  s.writingRules = () => '';
  return s;
};

// The line main/team/thread-share.mjs `deliver` writes for a teammate's comment.
let n = 0;
const comment = (id, text, { name = 'Theo Park', by = THEO, ts = Date.now() } = {}) => {
  n += 1;
  disk.appendForeignLines(product.dir, [{
    id, ts, source: 'system', by, uid: `comment-c${n}`, patch: { comment: { text, ...(name ? { name } : {}) } },
  }]);
};
const later = () => new Promise((r) => setTimeout(r, 5));

async function threadWithComment() {
  const item = store.composeItem('website', { title: 'Why is the checkout page slow', body: 'Why is the checkout page slow on mobile? Find the cause.' });
  store.recordSessionResult('website', item.id, { result: 'The cart query has no index.' });
  await later();
  comment(item.id, HERO);
  await later();
  return item;
}

describe('the transcript an agent reads', () => {
  it('holds a teammate\'s comment, under their name and not as the owner\'s word', async () => {
    const item = await threadWithComment();
    const turn = store.readThread('website', item.id).find((t) => t.text === HERO);
    expect(turn).toMatchObject({ field: 'comment', from: 'Theo Park' });
    expect(turn.source).not.toBe('founder');
  });

  it('names a comment from before names were carried as a teammate\'s', async () => {
    const item = store.composeItem('website', { title: 'Old comment' });
    comment(item.id, 'An old comment', { name: null });
    expect(store.readThread('website', item.id).find((t) => t.text === 'An old comment')).toMatchObject({ field: 'comment', from: 'A teammate' });
  });

  it('leaves out the quiet "continued in a thread of my own" line, and a comment line nobody wrote', () => {
    const lines = [
      { id: 'w-a', ts: 1, source: 'system', by: THEO, uid: 'comment-1', patch: { comment: { text: CONTINUED_NOTE, name: 'Theo Park' } } },
      { id: 'w-a', ts: 2, source: 'system', uid: 'comment-2', patch: { comment: { text: 'no writer' } } },
      { id: 'w-a', ts: 3, source: 'system', by: THEO, uid: 'other-3', patch: { comment: { text: 'not from the sync' } } },
    ];
    expect(threadOf(lines, 'w-a')).toEqual([]);
  });

  it('puts the comment in a fresh run\'s conversation, as a teammate\'s', async () => {
    const item = await threadWithComment();
    store.answerItem('website', item.id, { answer: REPLY });
    const brief = supervisor().buildBrief(store.readItem('website', item.id), product, { continuation: true });
    expect(brief).toContain(HERO);
    expect(brief).toContain('Theo Park, a teammate (not the founder)');
  });
});

describe('through the team sync', () => {
  it('delivers a comment with its writer\'s name, which the owner\'s reply then carries', async () => {
    const cloud = createMemoryCloud();
    const mac = async (email, name) => {
      const personId = signUpMemory(cloud, { email, name });
      const storeRoot = fs.mkdtempSync(path.join(root, 'mac-'));
      const accountRoot = path.join(storeRoot, 'accounts', 'a');
      fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
      fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
      const macStore = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
      const service = createTeamService({
        session: memorySession(() => memoryBackend(cloud, personId)),
        store: macStore, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
      });
      return { personId, store: macStore, service };
    };
    disk._internals.forgetFolds();
    const maya = await mac('maya@nw.test', 'Maya Chen');
    const theo = await mac('theo@nw.test', 'Theo Park');
    try {
      await maya.service.signIn();
      await maya.service.createTeam('Northwind');
      await maya.service.invite('theo@nw.test');
      await theo.service.signIn();
      await theo.service.acceptInvite(maya.service.state().team.id);
      disk.setLineAuthor(maya.personId);
      const item = maya.store.composeItem('website', { title: 'Checkout is slow', body: 'Checkout is slow', visibility: 'team' });
      maya.store.recordSessionResult('website', item.id, { result: 'Looking.' });
      for (const m of [maya, theo, maya]) await m.service.syncNow();
      await theo.service.commentOnThread(maya.personId, item.id, HERO);
      await maya.service.syncNow();
      maya.store.answerItem('website', item.id, { answer: REPLY });

      const s = supervisor();
      s.store = maya.store;
      const brief = s.replyBrief(maya.store.readItem('website', item.id), { product: maya.store.listProducts().find((p) => p.slug === 'website') });
      expect(brief).toContain(HERO);
      expect(brief).toContain('Theo Park');
    } finally {
      await maya.service.signOut();
      await theo.service.signOut();
    }
  });
});

describe('the owner\'s reply to a session that already ran', () => {
  it('carries the comment when the session is handed the reply', async () => {
    const item = await threadWithComment();
    store.answerItem('website', item.id, { answer: REPLY });
    const brief = supervisor().replyBrief(store.readItem('website', item.id), { product });
    expect(brief).toContain(REPLY);
    expect(brief).toContain(HERO);
    expect(brief).toContain('Theo Park');
  });

  it('carries it to a session woken after an interruption', async () => {
    const item = await threadWithComment();
    store.answerItem('website', item.id, { answer: REPLY });
    expect(supervisor().resumeBrief(store.readItem('website', item.id), { continuation: true, product })).toContain(HERO);
  });

  it('carries it to a session still running, before the reply is written down', async () => {
    const item = await threadWithComment();
    const { block } = supervisor().replyFiles('website', REPLY, 'claude', item.id);
    expect(block).toContain(HERO);
    expect(block).toContain('Theo Park');
  });

  it('does not hand over again a comment from before the owner\'s previous message', async () => {
    const item = await threadWithComment();
    store.answerItem('website', item.id, { answer: 'Looking at it.' });
    await later();
    store.answerItem('website', item.id, { answer: 'Any news?' });
    const s = supervisor();
    expect(s.replyBrief(store.readItem('website', item.id), { product })).not.toContain(HERO);
    expect(s.replyFiles('website', 'And now?', 'claude', item.id).block).not.toContain(HERO);
  });

  it('carries every comment since the owner\'s previous message, oldest first', async () => {
    const item = await threadWithComment();
    comment(item.id, 'Also the fonts load late.', { name: 'Jun Ito', by: 'p-jun' });
    await later();
    store.answerItem('website', item.id, { answer: REPLY });
    const brief = supervisor().replyBrief(store.readItem('website', item.id), { product });
    expect(brief.indexOf(HERO)).toBeGreaterThan(-1);
    expect(brief.indexOf('Also the fonts load late.')).toBeGreaterThan(brief.indexOf(HERO));
    expect(brief).toContain('Jun Ito');
  });

  it('adds nothing to a reply on a thread nobody commented on', async () => {
    const item = store.composeItem('website', { title: 'Quiet thread' });
    store.recordSessionResult('website', item.id, { result: 'Done.' });
    store.answerItem('website', item.id, { answer: 'Thanks' });
    const s = supervisor();
    expect(s.replyBrief(store.readItem('website', item.id), { product })).not.toMatch(/commented/i);
    expect(s.replyFiles('website', 'Thanks', 'claude', item.id).block).toBe('');
  });
});
