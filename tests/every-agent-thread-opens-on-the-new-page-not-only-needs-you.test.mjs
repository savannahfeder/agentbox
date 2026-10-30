// EVERY AGENT THREAD OPENS ON THE NEW PAGE, NOT ONLY NEEDS YOU (w-65bcefb857).
//
// The founder's screenshot: a thread they had just replied to, its agent
// "Thinking", opened on the old page (the side panel, the small capital
// crumb, the whole conversation): "the in progress pages seem to match the
// old version of the app". Read in Focus.tsx: the page was drawn only for
// `queue`, and only a thread in Needs you has one. So the moment a reply
// took a thread out of Needs you, it went back to the old page.
//
// Now the page is how every agent thread is drawn; Needs you adds its place,
// its arrows and moving on. A thread you have answered since its newest answer,
// by a reply or a pick, is drawn from that answer down: what you said or
// picked and the agent's work under it, the rest behind "Show N earlier
// messages".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { standsAt, earlierThan } from '../renderer/src/one-thing-at-a-time.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('renderer/src/App.tsx');
const focus = read('renderer/src/components/Focus.tsx');
const thread = read('renderer/src/components/ItemThread.tsx');

describe('which threads get the page', () => {
  it('every thread with an agent, wherever it is opened from', () => {
    expect(app).toMatch(/const onePage = !!focused && !directSlugs\.has\(focused\.product\);/);
    expect(app).toMatch(/onePage=\{onePage\}/);
    expect(focus).toMatch(/const page = !!queue \|\| !!onePage;/);
  });
  it('but not a conversation between people, which keeps its chat', () => {
    expect(app).toMatch(/!directSlugs\.has\(focused\.product\)/);
  });
  it('and the window wears the page\'s look whenever the page is drawn', () => {
    expect(app).toMatch(/\$\{\(queueSpot \|\| onePage\) && focused \? ' one-at-a-time' : ''\}/);
  });
});

describe('what the page draws outside Needs you', () => {
  it('the same page: no side panel, the summary on top, choices at the foot, files in place', () => {
    expect(focus).toMatch(/const summaryOffered = summarised && !openDoc && !page;/);
    expect(focus).toMatch(/queue=\{page \? \{ context: item\.problem \?\? null \} : undefined\}/);
    expect(focus).toContain('{offerInPane && (page || closeAsk ? null : (');
    expect(focus).toContain('inlineArtifacts && !previewSample && page && previewPaths.filter(readsInPlace)');
  });
  it('but no place in the queue and no arrows, which are Needs you\'s alone', () => {
    expect(focus).toMatch(/\{queue && <QueueNav spot=\{queue\.spot\}/);
  });
});

const you = (at, text) => ({ at, who: 'you', text });
const it_ = (at, text) => ({ at, who: 'it', text });
const work = (at) => ({ kind: 'work', at, verb: 'ran', subject: 'npm test', output: '', lines: 0, failed: false });
const picked = (at) => ({ kind: 'work', at, verb: 'Picked', subject: 'Ship it', output: '', lines: 0, failed: false, yours: true, answers: true });

describe('a thread you have answered since its answer', () => {
  const events = [you(1, 'build it'), it_(5, '**Shipped.**'), you(9, 'these do not match the new UI'), work(10)];
  it('stands at the answer your reply follows on from', () => {
    expect(standsAt(events, { at: 5 })).toBe(1);
  });
  it('and at the answer a pick was made on, which is one of your acts, not a message', () => {
    // Photographed on a working copy: an In progress thread lost its "Picked Ship it".
    expect(standsAt([you(1, 'go'), it_(5, '**Ship it?**'), picked(9), work(10)], { at: 5 })).toBe(1);
  });
  it('and is drawn from there, the work under it, the rest folded and counted', () => {
    expect(earlierThan(events, 1)).toBe(1);
    expect(thread).toMatch(/const stands = queue && newest && !earlierOpen \? standsAt\(events, newest\) : -1;/);
    expect(thread).toMatch(/events=\{from >= 0 \? events\.slice\(from\) : events\}/);
  });
  it('not when the answer is still the newest word, which is the Needs you page as before', () => {
    expect(standsAt([you(1, 'go'), it_(5, '**Done?**')], { at: 5 })).toBe(-1);
  });
  it('not on the agent\'s own steps after its answer', () => {
    expect(standsAt([you(1, 'go'), it_(5, 'ok'), work(6)], { at: 5 })).toBe(-1);
  });
  it('and what you did after an answer still the newest word, a move to Later, is drawn under it', () => {
    // The app's own note, when there is one, sits between them
    // (tests/the-page-leads-with-the-agents-answer-not-the-apps-shipped-note).
    expect(thread).toMatch(/<QueueAnswer text=\{clean\(newest\.text\)\} md=\{md\} name=\{pageTitle\(item\)\} by=\{signer \? \{ t: signer, at: newest\.at \} : null\} \/>\s*(\{byApp && outcome && <p className="one-app-note">\{clean\(outcome\.text\)\}<\/p>\}\s*)?\{afterList\}/);
  });
  it('and not with no answer at all, where the whole conversation is drawn', () => {
    expect(standsAt([you(1, 'go')], null)).toBe(-1);
  });
});
