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
  body: '**Your film is "Sample Film.mp4".**\n\nTry [the page](designs/demo.html), localhost:3002 or [the missing file](missing.pdf).',
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
const wait = () => new Promise(r => setTimeout(r, 80));
(async () => {
  let videosCreated = 0;
  const observer = new MutationObserver(entries => {
    for (const entry of entries) for (const node of entry.addedNodes) {
      if (node instanceof Element) videosCreated += Number(node.matches('video')) + node.querySelectorAll('video').length;
    }
  });
  observer.observe(document.getElementById('root')!, { childList: true, subtree: true });
  draw(0);
  await wait();
  const link = () => [...document.querySelectorAll('a')].find(el => el.textContent === 'the page')!;
  const before = link();
  for (let i = 0; i < 5; i++) {
    document.querySelector('video')?.dispatchEvent(new Event('error'));
    await wait();
  }
  const exhausted = !document.querySelector('video');
  const attemptsBefore = videosCreated;
  for (let i = 1; i <= 5; i++) { draw(i); await wait(); }
  const sameNode = link() === before;
  const retriesAfterUpdates = videosCreated - attemptsBefore;
  link().click();
  [...document.querySelectorAll('a')].find(el => el.textContent === 'localhost:3002')!.click();
  [...document.querySelectorAll('a')].find(el => el.textContent === 'the missing file')!.click();
  await wait();
  const mediaLabel = document.querySelector('.inline-media-name')?.textContent;
  draw(6, 'other');
  await wait();
  const productChanged = link() !== before;
  const otherProductResolved = (window as any).resolves.some((r: any) => r.product === 'other' && r.src === 'designs/demo.html');
  observer.disconnect();
  (window as any).regression = { sameNode, exhausted, retriesAfterUpdates, attemptsBefore, calls, notices, mediaLabel, productChanged, otherProductResolved };
})().catch(error => { (window as any).regression = { error: String(error) }; });
