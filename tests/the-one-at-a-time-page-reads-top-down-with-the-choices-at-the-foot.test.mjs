// THE ONE-AT-A-TIME PAGE READS TOP DOWN, WITH THE CHOICES AT THE FOOT (w-65bcefb857).
//
// Approved in round six of that thread, drawn on real threads: the short title
// in the top bar with "1 of 5" and up and down arrows beside the menu; Context
// and your last message side by side, their labels running into the text; a
// line that opens every earlier message, commands included; the agent's newest
// answer with its bold first line as the headline; and the choices drawn as
// the app draws them, see-through and apart from the reply box, at the foot of
// every page. No summary panel beside it, no key row, no end page.
//
// Measured by rendering the pieces and by reading where the app wires them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueueSummary, QueueAnswer, QueueNav, QueueFile } from '../renderer/src/components/OneThingAtATime.tsx';
import { OptionsOffer } from '../renderer/src/components/OptionsOffer.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const noop = () => {};

describe('the summary on top', () => {
  const draw = (p) => renderToStaticMarkup(h(QueueSummary, { onToggle: noop, open: false, ...p }));

  it('is the Context, under a row with the earlier messages and no label', () => {
    // The label ran into the text until round seventeen
    // (tests/the-context-sits-under-its-label-small-and-set-off).
    const html = draw({ context: 'Funding deadlines in the next 3 weeks.', earlier: 1 });
    expect(visible(html)).toMatch(/^Show 1 earlier message Funding deadlines in the next 3 weeks\.$/);
  });
  it('opens the earlier messages from one line, counted', () => {
    expect(visible(draw({ context: 'c', you: null, earlier: 8 }))).toContain('Show 8 earlier messages');
    expect(visible(draw({ context: 'c', you: null, earlier: 1 }))).toContain('Show 1 earlier message');
    expect(visible(draw({ context: 'c', you: null, earlier: 8, open: true }))).toContain('Hide earlier messages');
  });
  it('offers the agent\'s steps when there are no earlier messages but there are steps', () => {
    expect(visible(draw({ context: 'c', you: null, earlier: 0, steps: true }))).toContain('Show what the agent did');
    expect(visible(draw({ context: 'c', you: null, earlier: 0, steps: false }))).not.toMatch(/Show/);
  });
  it('draws only what it has', () => {
    expect(visible(draw({ context: null, earlier: 0 }))).toBe('');
  });
  it('breaks a long link rather than running off the line', () => {
    // Drawn on a real thread whose last message, then shown beside the
    // Context, was a bare x.com link: the link could not break, so "3:46AM"
    // fell to a line of its own under "You, Yesterday".
    const css = read('renderer/src/one-thing-at-a-time.css');
    expect(css).toMatch(/\.one-col \{[^}]*overflow-wrap: anywhere/);
  });
  it('says nothing with a colon or a dash', () => {
    const words = visible(draw({ context: 'c', earlier: 3 }));
    expect(words).not.toMatch(/[:—–]/);
  });
});

describe('the answer', () => {
  const md = (t) => h('div', { className: 'md' }, t);
  it('wears its bold first line as the headline and the rest as written', () => {
    const html = renderToStaticMarkup(h(QueueAnswer, { text: '**Ship it?**\n\nAll green.', md }));
    expect(html).toMatch(/<h1 class="one-q">Ship it\?<\/h1>/);
    expect(html).toContain('All green.');
  });
  it('is drawn as written when it opens with no bold line', () => {
    const html = renderToStaticMarkup(h(QueueAnswer, { text: 'Plain.', md }));
    expect(html).not.toContain('<h1');
    expect(html).toContain('Plain.');
  });
});

describe('a page or a note the answer names is read in place', () => {
  // Asked in round three: "we need to be able to read files really well
  // inline, not as a separate artifact on the side." Measured in the browser
  // copy: the thread page drew the review page as a small tile that read
  // "Preview unavailable".
  const md = (t) => h('div', null, t);
  it('heads it with its name and a way to open it full screen', () => {
    const html = renderToStaticMarkup(h(QueueFile, { product: 'p', path: '/a/designs/w-1/review.html', md, onOpen: noop }));
    expect(visible(html)).toBe('review.html');
    expect(html).toContain('aria-label="Open full screen"');
    expect(html).toContain('one-file one-page');
  });
  it('tells a note from a page', () => {
    expect(renderToStaticMarkup(h(QueueFile, { product: 'p', path: 'reports/listings.md', md, onOpen: noop }))).toContain('one-file one-note');
  });
  it('and the thread page draws them in this mode in place of the tiles', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toContain('inlineArtifacts && !previewSample && page && previewPaths.filter(readsInPlace).map((path) => path !== openDoc && <QueueFile');
    expect(focus).toContain('{!page && inlineArtifacts && !previewSample && <MessageFiles');
  });
});

describe('the corner', () => {
  it('says where you are and steps up and down', () => {
    const html = renderToStaticMarkup(h(QueueNav, { spot: { pos: 2, total: 5, index: 1 }, onStep: noop }));
    expect(visible(html)).toBe('2 of 5');
    expect(html).toContain('aria-label="Previous thread (K)"');
    expect(html).toContain('aria-label="Next thread (J)"');
  });
  it('greys the arrow with nothing past it', () => {
    const first = renderToStaticMarkup(h(QueueNav, { spot: { pos: 1, total: 2, index: 0 }, onStep: noop }));
    expect(first).toMatch(/aria-label="Previous thread \(K\)"[^>]*disabled/);
    const last = renderToStaticMarkup(h(QueueNav, { spot: { pos: 2, total: 2, index: 1 }, onStep: noop }));
    expect(last).toMatch(/aria-label="Next thread \(J\)"[^>]*disabled/);
  });
});

describe('the choices', () => {
  const offer = (bare) => renderToStaticMarkup(h(OptionsOffer, {
    ask: 'Should I ship it?', askAll: 'Should I ship it?', options: [{ n: 1, text: 'Ship it (recommended)', recommended: true }, { n: 2, text: 'Hold it' }],
    peekOption: null, askPeek: false, selectedOption: null, selRef: { current: null }, onPick: noop, onOptionEnter: noop, onAskEnter: noop, setPeek: noop, setAskPeek: noop, bare,
  }));
  it('drop their heading on this page, where the question is the headline', () => {
    expect(offer(true)).not.toContain('opt-head');
    expect(offer(true)).toContain('Ship it');
  });
  it('and keep it everywhere else', () => {
    expect(offer(false)).toContain('opt-head');
  });
});

describe('where the app wires it', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');
  const thread = read('renderer/src/components/ItemThread.tsx');

  it('every thread in Needs you opens on it (tests/every-thread-in-needs-you-opens-one-thing-at-a-time)', () => {
    expect(app).toMatch(/const queueSpot = spotIn\(shownInbox, focused\);/);
  });
  it('the thread page takes the queue, and wears no summary panel in it', () => {
    expect(app).toMatch(/queue=\{queueSpot && !inChats \?/);
    expect(focus).toMatch(/const summaryOffered = [^\n]*!page/);
  });
  it('the choices go to the foot, apart from the reply box, without their heading', () => {
    expect(focus).toContain('{offerInPane && (page || closeAsk ? null : (');
    // Under a full screen page they come up with the box instead
    // (tests/a-full-screen-page-in-one-at-a-time-shows-no-options-until-the-box-opens).
    //
    // The heading comes back for the one offer the app makes that says
    // something the page does not, which is the change nobody committed
    // (tests/a-change-nobody-committed-is-not-offered-for-shipping).
    expect(focus).toMatch(/\{page && stripShown && !fullScreenDoc && !closeAsk && \(\s*<div className=\{`one-choices[^`]*`\}>\s*<OptionsOffer[^/]{0,600}\bbare=\{!shipAsk\?\.headed\}\s*\/>/);
  });
  it('the conversation folds behind the summary', () => {
    expect(thread).toMatch(/<QueueSummary/);
    expect(thread).toMatch(/<QueueAnswer/);
  });
});
