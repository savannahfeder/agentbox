// THE TEAMMATE OFFER IS A CARD UNDER THE ANSWER, NOT A LINE UNDER YOUR WORDS (w-bb45118b10).
//
// Auto's offer of a teammate was one quiet line under the person's opening
// words. In the 2026-11-11 power test it was folded under "earlier messages"
// twice before the tester came back to the thread, and the founder looked at
// the built screen and found nothing: "I was expecting ... a very obvious card
// ... that cannot be missed", one that makes people "understand the advantage
// of making an AI teammate for it (learning, continuity, etc.)". She approved
// the hire card (designs/w-bb45118b10/teammate-card-1-hire-card-v2.png): a sky
// banner, "Make this a Marketer's job.", one sentence, three reasons in a
// bordered list, and Make beside Not now. The reasons are about this
// thread, so once Auto offers a role, a second short question writes them.
// Asking for them inside Auto's own question made it offer on 7 of 12
// recurring tasks against 11 of 12 (Haiku, 2026-11-12), so they are asked apart.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { routePrompt, offerPrompt, readGains } = await import('../shared/auto-route.mts');
const { cleanRouted } = await import('../shared/work-items.mts');
const { offerCard, offerWaiting, startsFolded, DEFAULT_GAINS } = await import('../renderer/src/teammate-offer.ts');
const { TeammateOffer } = await import('../renderer/src/components/TeammateOffer.tsx');

const gains = ['Learns your voice from every post you approve or change', 'Carries on where this post left off, not from nothing', 'Writes it every Monday, and asks you before it posts'];

describe('Auto writes what the teammate would bring', () => {
  it('asks, about this task, what it learns, carries on from and then does, and to ask before posting', () => {
    const prompt = offerPrompt({ title: 'Write this week\'s launch post' }, { role: 'Marketer' });
    expect(prompt).toContain('Write this week\'s launch post');
    expect(prompt).toContain('a Marketer');
    expect(prompt).toMatch(/- Learns /);
    expect(prompt).toMatch(/- Carries on /);
    expect(prompt).toMatch(/without asking first/);
  });

  it('leaves Auto\'s own question as it was', () => {
    expect(routePrompt({ title: 'x' }, [], [])).not.toMatch(/- Learns /);
  });

  it('reads three lines, with bullets, numbers or none, which is how the model writes them', () => {
    expect(readGains(gains.map((g) => `- ${g}`).join('\n'))).toEqual(gains);
    expect(readGains(gains.map((g, i) => `${i + 1}. ${g}`).join('\n'))).toEqual(gains);
    expect(readGains(gains.join('\n\n'))).toEqual(gains);
  });

  it('reads anything but exactly three as none, so the card never mixes its own with the model\'s', () => {
    expect(readGains('- Learns your voice\n- Carries on')).toBeNull();
    expect(readGains([...gains, 'a fourth'].join('\n'))).toBeNull();
    expect(readGains('0 | -\nTeammate: Marketer | It repeats.\n- one')).toBeNull();
    expect(readGains('')).toBeNull();
  });

  it('shortens a line too long for one row of the card', () => {
    const long = `Learns ${'your voice and your taste and '.repeat(6)}more`;
    expect(readGains(`${long}\nCarries on\nAsks first`)?.[0].length).toBeLessThanOrEqual(90);
  });

  it('is kept by the store: three short strings at most, nothing else', () => {
    const kept = cleanRouted({ to: 'agent', why: 'x', at: 1, by: 'auto', offer: { role: 'Marketer', why: 'y', gains: [...gains, 'a fourth', 5] } });
    expect(kept?.offer?.gains).toEqual(gains);
    expect(cleanRouted({ to: 'agent', why: 'x', at: 1, by: 'auto', offer: { role: 'Marketer', why: 'y', gains: 'no' } })?.offer).toEqual({ role: 'Marketer', why: 'y' });
  });
});

const row = (offer: Record<string, unknown> | undefined, extra = {}) => ({
  id: 'w-post', product: 'site', title: 'Write this week\'s launch post', status: 'open', labels: ['founder'],
  routed: { to: 'agent', why: 'x', at: 1, by: 'auto', ...(offer ? { offer } : {}) }, ...extra,
});

describe('the card', () => {

  it('says whose job it is, why, the three reasons, and the button, in the approved words', () => {
    expect(offerCard({ role: 'Marketer', why: 'A Marketer would write it every week.', gains })).toEqual({
      letter: 'M', headline: 'Make this a Marketer\'s job.', why: 'A Marketer would write it every week.', gains, make: 'Make a Marketer',
    });
  });

  it('says "an" before a vowel', () => {
    expect(offerCard({ role: 'Investor update editor', why: '' }).make).toBe('Make an Investor update editor');
  });

  it('falls back to reasons about learning and carrying on when Auto gave none', () => {
    const card = offerCard({ role: 'Support lead', why: '' });
    expect(card.gains).toEqual(DEFAULT_GAINS);
    expect(DEFAULT_GAINS.join(' ')).toMatch(/Learns/);
    expect(DEFAULT_GAINS.join(' ')).toMatch(/Carries on/);
    expect(card.why).toMatch(/Support lead/);
  });

  it('draws as a card with the banner, the list and both buttons', () => {
    const html = renderToStaticMarkup(h(TeammateOffer, { item: row({ role: 'Marketer', why: 'It repeats.', gains }) }));
    expect(html).toContain('class="to-card"');
    expect(html).toContain('<canvas');
    expect(html).toContain('Make this a Marketer&#x27;s job.');
    for (const g of gains) expect(html).toContain(g);
    expect(html).toContain('Make a Marketer');
    expect(html).toContain('Not now');
  });

  it('draws nothing with no offer, or one turned down', () => {
    expect(renderToStaticMarkup(h(TeammateOffer, { item: row(undefined) }))).toBe('');
    expect(renderToStaticMarkup(h(TeammateOffer, { item: row({ role: 'Marketer', why: '', answered: 'no' }) }))).toBe('');
  });

  it('once made, says so in one line instead of the card', () => {
    const html = renderToStaticMarkup(h(TeammateOffer, { item: row({ role: 'Marketer', why: '', answered: 'made' }) }));
    expect(html).not.toContain('to-card');
    expect(html).toContain('You made a Marketer for work like this.');
  });

  it('is waiting only while unanswered on a thread that did not go to a teammate whose job it is', () => {
    expect(offerWaiting(row({ role: 'Marketer', why: '' }))).toBe(true);
    expect(offerWaiting(row({ role: 'Marketer', why: '', answered: 'made' }))).toBe(false);
    expect(offerWaiting(row(undefined))).toBe(false);
    expect(offerWaiting(null)).toBe(false);
  });
});

// The founder, 2026-11-13: ↵ making a teammate was "not a good idea in case
// someone does it accidentally", and the card should fold away.
describe('only a click makes a teammate', () => {
  it('↵ in a thread does nothing to the card', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).not.toMatch(/teammate-offer|answerRouteOffer/);
  });

  it('and the button shows no key', () => {
    const html = renderToStaticMarkup(h(TeammateOffer, { item: row({ role: 'Marketer', why: '', gains }) }));
    expect(html).not.toContain('↵');
  });
});

describe('folding it away', () => {
  it('opens whole the first time, and folded once you have seen it on this thread', () => {
    expect(startsFolded({ choice: null, seen: false })).toBe(false);
    expect(startsFolded({ choice: null, seen: true })).toBe(true);
  });

  it('keeps what you chose with the chevron, either way', () => {
    expect(startsFolded({ choice: 'open', seen: true })).toBe(false);
    expect(startsFolded({ choice: 'folded', seen: false })).toBe(true);
  });

  it('folded, is one line that still names the role, and opens again with a click', () => {
    const store = new Map<string, string>([['agentbox.teammate-offer.fold.site/w-post', 'folded']]);
    const was = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    try {
      const html = renderToStaticMarkup(h(TeammateOffer, { item: row({ role: 'Marketer', why: '', gains }) }));
      expect(html).toContain('class="to-bar"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('Make this a Marketer&#x27;s job.');
      expect(html).not.toContain('to-card');
      expect(html).not.toContain(gains[0]);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = was;
    }
  });

  it('whole, has a chevron to fold it', () => {
    const html = renderToStaticMarkup(h(TeammateOffer, { item: row({ role: 'Marketer', why: '', gains }) }));
    expect(html).toContain('aria-label="Fold this away"');
  });
});

describe('where it sits', () => {
  const thread = () => fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');
  const line = () => fs.readFileSync(new URL('../renderer/src/components/RouteLine.tsx', import.meta.url), 'utf8');

  it('under the newest answer, on both ways the thread draws it', () => {
    expect(thread().match(/<TeammateOffer item=\{item\} \/>/g)).toHaveLength(2);
    expect(thread()).toMatch(/\{answer\}\s*\n\s*<TeammateOffer item=\{item\} \/>/);
    expect(thread()).toMatch(/<QueueAnswer [^\n]*\/>\s*\n\s*<TeammateOffer item=\{item\} \/>/);
  });

  it('and no longer as a line under your words, where it was folded away', () => {
    expect(line()).not.toMatch(/rt-offer|answerRouteOffer/);
  });
});
