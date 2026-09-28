// THE MODEL DRAWER WITH A FILE OPEN BESIDE THE CARD (w-a29fae865a).
//
// Her screenshot: a file open on the right, the reply dock narrowed, the
// footer wrapped so "On Opus 5.5." starts its second line, and the model
// drawer hanging off the conversation pane's left edge, cut off there.
// This opens the app's own sample mode, opens a card and a file beside it,
// presses the model word for real, and measures the drawer against the pane.
//
//   arch -arm64 node scripts/probe-model-drawer-beside-a-file.mjs <dist> <out.png>
import { openInbox } from './lib/inbox-harness.mjs';

const [dist, out] = process.argv.slice(2);
const h = await openInbox({ dist, width: 1440, height: 900, snapshot: { products: [], items: [] } });
try {
  // Sample mode: no bridge at all, so the app draws its own fixtures.
  await h.call('Page.addScriptToEvaluateOnNewDocument', { source: `delete window.zero; localStorage.setItem('zero.firstRun.done','1');` });
  await h.goto(`${h.origin}/?fixtures&artifactTweaks`);
  await h.wait(1500);
  const click = async (x, y) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await h.call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  };
  const centre = (sel) => h.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);

  // Open the first card in the list.
  let at = await centre('.row, [data-row], .inbox-row');
  if (!at) throw new Error('no row to open');
  await click(...at);
  await h.wait(1200);
  // Open the first file beside it, with the small open button in its frame.
  at = await h.evaluate(`(() => { const b = [...document.querySelectorAll('.artifact-entry-list button')].find(e => e.getBoundingClientRect().width < 60); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  if (at) { await click(...at); await h.wait(1500); }
  const pane = await h.evaluate(`(() => { const d = document.querySelector('.dock-card'); return d ? Math.round(d.getBoundingClientRect().width) : null; })()`);

  // Unfold the reply box, then press the model word in it.
  at = await centre('.dock-card .dock-pill');
  if (at) { await click(...at); await h.wait(800); }
  at = await h.evaluate(`(() => { const b = [...document.querySelectorAll('.dock-card .compose-word')].find(e => /opus|sonnet|fable|haiku|gpt|model/i.test(e.textContent + e.title)); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  if (!at) {
    await h.capture(out);
    const seen = await h.evaluate(`JSON.stringify({ words: [...document.querySelectorAll('.compose-word')].map(e => e.title + '|' + e.textContent), dock: !!document.querySelector('.dock-card'), rows: [...new Set([...document.querySelectorAll('[class*="row"]')].map(e => e.className))].slice(0, 12), url: location.href })`);
    throw new Error(`no model word in the dock: ${seen}`);
  }
  await click(...at);
  await h.wait(500);
  const m = await h.evaluate(`(() => {
    const menu = document.querySelector('.dock-card .model-menu');
    if (!menu) return null;
    const box = menu.getBoundingClientRect();
    let left = 0, right = innerWidth, clipper = null;
    for (let n = menu.parentElement; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).overflowX === 'visible') continue;
      const r = n.getBoundingClientRect();
      if (r.left > left) { left = r.left; clipper = n.className; }
      right = Math.min(right, r.right);
    }
    const word = menu.parentElement.getBoundingClientRect();
    const low = [...menu.querySelectorAll('.effort-strip button')][0].getBoundingClientRect();
    const hit = document.elementFromPoint(low.left + low.width / 2, low.top + low.height / 2);
    return { menu: [Math.round(box.left), Math.round(box.right)], word: [Math.round(word.left), Math.round(word.right)],
      visible: [Math.round(left), Math.round(right)], clipper, lowPressable: !!hit && hit.textContent === 'Low' };
  })()`);
  await h.capture(out);
  console.log(JSON.stringify({ dockWidth: pane, ...m, err: await h.evaluate('window.__ERR__ ?? null') }));
} finally {
  h.close();
}
