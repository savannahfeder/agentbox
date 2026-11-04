// AN AI TEAMMATE WRITES LIKE A COLLEAGUE IN A CHAT.
//
// The owner: "they write really big blocks of text." Measured with real
// `claude -p` runs on six prompts through the brief and the real tool wording
// (scripts/scratch): see the commit message for the before and after. A long
// answer had nowhere to go: a metrics note reached its owner as "in Files ... at
// reports/lumen-metrics-2026-10-31.md", a path in a sentence. Now a chat message
// over the limit is refused with what to do instead, and team_post carries the
// document as a card. What must not change: a person's own words sent through
// team_post, a message meant to leave the team, and the rules for a plain worker's
// last message (a teammate's own: a-teammates-last-message-follows-the-chat-rules).
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamTell } from '../mcp/core/reach.mjs';
import { teamPost } from '../mcp/core/teammates.mjs';
import { readChat } from '../main/store/teammates-files.mjs';
import { CHAT_MOST, howYouWrite, voiceOf } from '../shared/teammates.mjs';

describe('what the brief tells it', () => {
  const lines = howYouWrite({ id: 't-abc123' });

  it('says a line or two, several short messages, one ask, no headings or bold', () => {
    expect(lines).toMatch(/a line or two, then stop/i);
    expect(lines).toMatch(/several short messages/i);
    expect(lines).toMatch(/ask one thing/i);
    expect(lines).toMatch(/no headings, bold/i);
  });

  it('says a long answer goes in a document, with one sentence beside it', () => {
    expect(lines).toMatch(/document/);
    expect(lines).toMatch(/one sentence/);
    expect(lines).toContain(String(CHAT_MOST));
  });

  it('carries its own voice', () => {
    expect(lines).toContain(voiceOf({ id: 't-abc123' }).says);
  });

  it('leaves the rules for a plain worker\'s last message as they were', () => {
    const defaults = JSON.parse(fs.readFileSync(new URL('../shared/instruction-defaults.json', import.meta.url), 'utf8'));
    expect(defaults.messages).toMatch(/Line one is the thing they have to say back, in bold/);
    expect(defaults.messages).toMatch(/Under 200 words/);
  });
});

describe('the tools', () => {
  let t; let chief; let run;

  beforeEach(async () => {
    t = await aTeamWithAgents();
    chief = t.maya.store.teammates.create({ starter: 'chief' });
    run = t.maya.store.composeItem(t.product.id, { title: 'A round', body: 'Round.', labels: [`teammate:${chief.id}`] });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = t.product.id;
    await t.tick();
  });
  afterEach(() => { delete process.env.ZERO_ITEM; return t.stop(); });

  const said = () => readChat(t.maya.store.teammates.dir()).messages.filter((m) => m.kind === 'msg' && m.from === chief.id);

  it('team_post takes a message at the limit', () => {
    teamPost({ text: 'x'.repeat(CHAT_MOST) });
    expect(said()).toHaveLength(1);
  });

  it('team_post refuses one over the limit, says what to do instead, and posts nothing', () => {
    expect(() => teamPost({ text: 'x'.repeat(CHAT_MOST + 1) })).toThrow(/document/);
    expect(said()).toEqual([]);
  });

  it('team_tell refuses one over the limit', () => {
    expect(() => teamTell({ text: 'x'.repeat(CHAT_MOST + 1), to: ['Dev'] })).toThrow(/document/);
  });

  it('team_tell lets a message meant to leave the team be as long as it is', () => {
    expect(teamTell({ text: 'x'.repeat(CHAT_MOST + 1), to: ['Dev'], outside: true }).held).toBe(true);
  });

  it('team_post from a plain thread, which is the person\'s own words, is not refused', () => {
    const plain = t.maya.store.composeItem(t.product.id, { title: 'Pass this on', body: 'Tell them.' });
    process.env.ZERO_ITEM = plain.id;
    expect(teamPost({ text: 'x'.repeat(CHAT_MOST + 1) }).posted).toBeTruthy();
  });

  describe('a document beside its sentence', () => {
    beforeEach(() => {
      fs.mkdirSync(path.join(t.product.dir, 'reports'), { recursive: true });
      fs.writeFileSync(path.join(t.product.dir, 'reports', 'metrics.md'), '# Metrics\n');
    });

    it('goes on the message as a card to open, in the thread\'s project', () => {
      teamPost({ text: 'Metrics note is done. Revenue is the one to read.', document: 'reports/metrics.md' });
      expect(said()[0].doc).toEqual({ product: t.product.id, src: 'reports/metrics.md', name: 'metrics.md' });
    });

    it('refuses one that is not there, and posts nothing', () => {
      expect(() => teamPost({ text: 'Here it is.', document: 'reports/gone.md' })).toThrow(/gone\.md/);
      expect(said()).toEqual([]);
    });

    it('refuses one outside the project', () => {
      expect(() => teamPost({ text: 'Here it is.', document: '../../secrets.md' })).toThrow(/project/);
      expect(() => teamPost({ text: 'Here it is.', document: '/etc/hosts' })).toThrow(/project/);
    });

    it('a message with no document has no card', () => {
      teamPost({ text: 'Nothing to read.' });
      expect(said()[0].doc).toBeUndefined();
    });
  });

  it('the page draws the card, and opens it where a teammate\'s file opens', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/m\.doc && <button[^\n]*tq-doc-card[^\n]*onOpenFile\(m\.doc!\.product, m\.doc!\.src\)/);
    expect(fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8')).toMatch(/onOpenFile: openTeammateFile/);
    // Escape left Chats with the document still open, on the copy.
    expect(fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8')).toMatch(/if \(e\.key === 'Escape' && openDoc\) \{ e\.preventDefault\(\); closeArtifact\(\); return; \}\s*if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); teammatesUi\.back\(\); \}/);
    // Beside the Chats list and the chat, a document left the chat one letter wide.
    const css = fs.readFileSync(new URL('../renderer/src/teammates/teammates.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.app\.doc-open \.tq-chats \.cx-list[^{]*\{ display: none; \}/);
  });
});
