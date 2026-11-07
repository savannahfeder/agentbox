import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Focus } from '../../renderer/src/components/Focus';

// The real reading pane with synthetic history. Parent callbacks deliberately
// change on every draw, just as App's inline onOpenDoc does on a store update.
const calls: unknown[] = [];
const notices: unknown[] = [];
const item = {
  id: 'w-link-test', product: 'demo', title: 'Files in a message', status: 'open',
  kind: 'directive', labels: ['founder'], createdAt: 1, updatedAt: 2,
  body: '**Your film is "Sample Film.mp4".**\n\nTry [the page](designs/demo.html), localhost:3002 or [the missing file](missing.xlsx).',
};
(window as any).zero.itemHistory = async () => ({ ok: true, lines: [
  { id: item.id, ts: 2, source: 'agent', patch: { result: item.body } },
] });
const root = createRoot(document.getElementById('root')!);
const noop = () => {};
function draw(round: number, product = 'demo') {
  flushSync(() => root.render(<Focus {...{
    item: { ...item, product }, parent: null, blockedBy: null, session: null,
    live: {}, stoppable: false, productDir: `/${product}`, repoDir: null,
    selectedOption: null, replyOpen: false, onOpenItem: noop, onClose: noop,
    onResolve: noop, onPick: noop, onReply: noop, onReplySend: noop,
    onReplyClose: noop, onStop: noop, onReopen: noop, onSnooze: noop, onReveal: noop,
    onOpenDoc: (src: string) => calls.push({ round, src }),
    onNotice: (text: string) => notices.push({ round, text }),
  } as any} />));
}
// A step whose next step needs it waits for the thing itself, named, so a slow
// Mac cannot make this probe wrong. Only the two checks that nothing happened
// wait a fixed while, where waiting too little can only let them pass.
const until = async (what: string, ready: () => unknown) => {
  for (let i = 0; i < 400; i++) {
    if (ready()) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`waited 10s for ${what}`);
};
const wait = () => new Promise(r => setTimeout(r, 80));
// Named so a probe that never finishes says which stage it was in.
const step = (what: string) => { (window as any).step = what; };
(async () => {
  let videosCreated = 0;
  const observer = new MutationObserver(entries => {
    for (const entry of entries) for (const node of entry.addedNodes) {
      if (node instanceof Element) videosCreated += Number(node.matches('video')) + node.querySelectorAll('video').length;
    }
  });
  observer.observe(document.getElementById('root')!, { childList: true, subtree: true });
  step('the first draw');
  draw(0);
  const link = () => [...document.querySelectorAll('a')].find(el => el.textContent === 'the page')!;
  await until('the message to be drawn', () => link() && document.querySelector('video'));
  const before = link();
  step('the film running out of places to look');
  for (let i = 0; i < 5; i++) {
    const tried = videosCreated;
    document.querySelector('video')?.dispatchEvent(new Event('error'));
    await until('the next place the film might be', () => videosCreated > tried || !document.querySelector('video'));
  }
  const exhausted = !document.querySelector('video');
  const attemptsBefore = videosCreated;
  step('five parent updates');
  for (let i = 1; i <= 5; i++) { draw(i); await wait(); }
  const sameNode = link() === before;
  const retriesAfterUpdates = videosCreated - attemptsBefore;
  step('the page link opening');
  link().click();
  await until('the page to be asked for', () => calls.length === 1);
  await wait();
  const bigView = document.querySelector('.artifact-view')?.getAttribute('aria-label');
  step('the address and the missing file');
  [...document.querySelectorAll('a')].find(el => el.textContent === 'localhost:3002')!.click();
  [...document.querySelectorAll('a')].find(el => el.textContent === 'the missing file')!.click();
  await until('the address and the missing file to be answered', () => calls.length === 2 && notices.length === 1);
  const mediaLabel = document.querySelector('.inline-media-name')?.textContent;
  step('the same thread under another product');
  draw(6, 'other');
  await until('the same file to be looked for in the other product', () => (window as any).resolves.some((r: any) => r.product === 'other' && r.src === 'designs/demo.html'));
  const productChanged = link() !== before;
  const otherProductResolved = (window as any).resolves.some((r: any) => r.product === 'other' && r.src === 'designs/demo.html');
  observer.disconnect();
  (window as any).regression = { sameNode, exhausted, retriesAfterUpdates, attemptsBefore, calls, notices, bigView, mediaLabel, productChanged, otherProductResolved };
})().catch(error => { (window as any).regression = { error: String(error) }; });
