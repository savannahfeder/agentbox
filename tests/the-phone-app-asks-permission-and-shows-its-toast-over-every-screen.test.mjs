// THE PHONE APP ASKS PERMISSION AND SHOWS ITS TOAST OVER EVERY SCREEN, as the
// phone site does.
//
// Codex's parity audit (finding 21): the site draws an agent's permission ask
// as one card across the foot of every screen, with the queue stacked behind
// it, and Allow and Deny; the app never drew one, so an agent waiting on a
// command waited until she reached her Mac. Measured on the phone site at
// 402px (scripts/scratch/overlays): the card's four blocks, "+1 waiting", the
// folder on the quiet line, the thread it opens. The app also made a toast
// after every press (cloud.tsx) and no screen drew it, so Undo was offered
// nowhere; the site shows it for 6 seconds when it names a thread and 2.5 when
// it does not. The card's words and the toast's rules come from the site's own
// files through mobile/src/lib/overlays.ts; the screens are React Native,
// which these tests do not draw, so they read the layout's source for where
// the two are drawn.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView } from '../renderer/src/phone-rows';
import { phoneSender } from '../renderer/src/phone-send';
import { approvalCard, cardOnStage, threadOnScreen, toastLife, toastTapOpens } from '../mobile/src/lib/overlays';
import { previewCloud, previewRows } from '../mobile/src/lib/preview';

const NOW = Date.UTC(2026, 9, 20, 12);
const products = [{ slug: 'mac:alpha', name: 'Alpha' }];
const items = [{ product: 'mac:alpha', id: 'w-1', title: 'Draw the sign-in screen' }];
const ask = (input, extra = {}) => ({ id: 'ap-1', at: NOW, product: 'mac:alpha', item: 'w-1', tool: 'Bash', input, ...extra });

describe('a permission card says what the site\'s card says', () => {
  it('leads with what the agent says the command does, and keeps the verb and folder on the quiet line', () => {
    const card = approvalCard(ask({ command: 'ffmpeg -i a.mov b.mp4', description: 'Make a copy of the draft', cwd: '~/dev/film' }), 0, products, items);
    expect(card.lede).toBe('Make a copy of the draft');
    expect(card.command).toBe('ffmpeg -i a.mov b.mp4');
    expect(card.where).toBe('asks to run in ~/dev/film');
    expect(card.waiting).toBeNull();
  });

  it('with no description, names the project and the verb, and says nothing twice', () => {
    const card = approvalCard(ask({ command: 'ls' }), 0, products, items);
    expect(card.lede).toBe('Alpha asks to run');
    expect(card.where).toBe('');
  });

  it('counts the asks behind it', () => {
    expect(approvalCard(ask({ command: 'ls' }), 2, products, items).waiting).toBe('+2 waiting');
  });

  it('says what else the yes opens, beside the command', () => {
    const card = approvalCard(ask({ command: 'curl x', host: 'example.com', grantRoot: '/tmp/w' }), 0, products, items);
    expect(card.opens).toEqual(['opens the network to example.com', 'and asks to write anywhere under /tmp/w for the rest of this run']);
  });

  it('names the thread that asks, and only one still on the phone', () => {
    expect(approvalCard(ask({ command: 'ls' }), 0, products, items).task).toEqual({ title: 'Draw the sign-in screen', product: 'mac:alpha', id: 'w-1' });
    expect(approvalCard(ask({ command: 'ls' }, { item: 'w-gone' }), 0, products, items).task).toBeNull();
  });

  it('shows one card, oldest first, and holds the answered one on stage until it has gone', () => {
    const queue = [ask({ command: 'a' }), ask({ command: 'b' }, { id: 'ap-2' })];
    expect(cardOnStage(queue, null, null)).toMatchObject({ card: { id: 'ap-1' }, verdict: null, waiting: 1 });
    // Answered: the phone stops listing it at once, and it still leaves with its stamp.
    expect(cardOnStage(queue.slice(1), { id: 'ap-1', allow: true }, queue[0])).toMatchObject({ card: { id: 'ap-1' }, verdict: 'allow', waiting: 1 });
  });
});

describe('the toast', () => {
  it('stays six seconds when it names a thread and two and a half when it does not', () => {
    expect(toastLife({ goes: { product: 'mac:alpha', id: 'w-1' } })).toBe(6000);
    expect(toastLife({})).toBe(2500);
  });

  it('opens the thread it names, unless that thread is the one on screen', () => {
    const toast = { goes: { product: 'mac:alpha', id: 'w-1' } };
    expect(toastTapOpens(toast, null)).toBe(true);
    expect(toastTapOpens(toast, { product: 'mac:alpha', id: 'w-2' })).toBe(true);
    expect(toastTapOpens(toast, { product: 'mac:alpha', id: 'w-1' })).toBe(false);
    expect(toastTapOpens({}, null)).toBe(false);
  });

  it('knows which thread a screen shows from its route', () => {
    expect(threadOnScreen(['thread', '[product]', '[id]'], { product: 'mac:alpha', id: 'w-1' })).toEqual({ product: 'mac:alpha', id: 'w-1' });
    expect(threadOnScreen([], {})).toBeNull();
    expect(threadOnScreen(['search'], { product: 'mac:alpha', id: 'w-1' })).toBeNull();
  });
});

describe('the layout draws both over every screen', () => {
  const layout = fs.readFileSync(new URL('../mobile/src/app/_layout.tsx', import.meta.url), 'utf8');
  it('inside the cloud, after the screens, so they sit on top', () => {
    expect(layout).toMatch(/<Stack[^>]*\/>\s*<Approvals \/>\s*<Toast \/>[\s\S]*<\/CloudProvider>/);
  });
});

describe('the preview has asks to draw, and answers them', () => {
  it('two waiting asks on two threads, and Allow takes one off the screen', async () => {
    const rows = previewRows(NOW);
    expect(phoneView(rows, NOW).approvals.map((a) => a.id)).toEqual(expect.arrayContaining(['ap-preview-1', 'ap-preview-2']));
    const cloud = previewCloud(() => NOW);
    let now = { projects: await cloud.select('phone_projects', ''), threads: await cloud.select('phone_threads', ''), commands: [] };
    const sender = phoneSender({ client: cloud, rows: () => now, setRows: (next) => { now = next; }, aliases: () => ({}), changed: () => {} });
    expect(await sender.approve({ id: 'ap-preview-1', allow: true })).toEqual({ ok: true });
    expect(phoneView(now, NOW).approvals.map((a) => a.id)).not.toContain('ap-preview-1');
  });
});
