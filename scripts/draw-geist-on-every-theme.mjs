// w-3fc39983be, 2026-09-27. What Ember Grid's Geist looks like on every theme,
// shown on a few examples such as Peach and the first theme.
//
// Each theme is drawn twice on the same open row: as it ships (Avenir Next)
// and with Ember's two font lines applied to it and nothing else, so the only
// difference between a pair is the typeface.
//
//   arch -arm64 node scripts/draw-geist-on-every-theme.mjs > /tmp/geist.log 2>&1
import fs from 'node:fs';
import path from 'node:path';
import { openInbox } from './lib/inbox-harness.mjs';
import { herSnapshot } from './lib/her-inbox-snapshot.mjs';
import { ACCOUNT_ROOT } from './lib/machine-paths.mjs';

const OUT = path.join(ACCOUNT_ROOT, 'astral', 'designs', 'w-3fc39983be');
fs.mkdirSync(OUT, { recursive: true });

const LOOKS = [
  { skin: 'valley-haze', theme: 'dark' },
  { skin: 'peach-haze-2', theme: 'light' },
  { skin: 'frost-haze', theme: 'light' },
  { skin: 'lake', theme: 'dark' },
  { skin: 'woodblock-sea', theme: 'dark' },
  { skin: 'ember-grid', theme: 'dark', only: 'geist' },
];

// ROUND TWO, 2026-09-28. Round one still lacked Ember's capitals and the rest
// of its type treatment on the other themes. So this is the
// TYPE half of every Ember rule in workspace-navigation.css, unscoped: the face,
// the mono capitals on the chrome, the 400 weights. The colour half (the
// orange, the corner marks, the rays, the transparent search) stays Ember's.
const GEIST = `
  body { font-family: 'Geist', 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif !important; }
  :root { --mono: 'Geist Mono', ui-monospace, "SF Mono", Menlo, monospace !important; }
  .workspace-search span, .workspace-section, .row-end .product, .row-end .time {
    font-family: var(--mono); font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
  }
  .workspace-navigation .workspace-tab.active { font-weight: 400; }
  .workspace-running { font-family: var(--mono); }
  .workspace-title { font-weight: 400; letter-spacing: -.03em; }
  .row .subject { font-weight: 400; letter-spacing: -.01em; }
  .set-title { font-weight: 400; letter-spacing: -0.035em; }
  .idle-zero { font-weight: 400; }
  .idle-zero-say { font-family: var(--mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
  .idle-key { font-family: var(--mono); font-weight: 400; }
`;

// ROUND THREE, 2026-09-28. Ember's type only on the accents, such as the times
// on the right side of a row, while the main font stays Avenir Next everywhere
// else. So NO body face and NO weight changes:
// only Geist Mono as the app's mono (which every existing var(--mono) spot
// follows: keys, code, hints) and Ember's spaced capitals on the chrome.
const ACCENTS = `
  :root { --mono: 'Geist Mono', ui-monospace, "SF Mono", Menlo, monospace !important; }
  .workspace-search span, .workspace-section, .row-end .product, .row-end .time {
    font-family: var(--mono); font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
  }
  .workspace-running { font-family: var(--mono); }
  .idle-zero-say { font-family: var(--mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
  .idle-key { font-family: var(--mono); font-weight: 400; }
`;
// A new name each round: until the no-store fix is merged her running app
// shows a picture it has already drawn from memory, whatever is on disk.
const ROUND = 'r3';

async function openARow(app) {
  return app.evaluate(`(async () => {
    for (const r of [...document.querySelectorAll('.row')].slice(0, 14)) {
      r.click();
      await new Promise((f) => setTimeout(f, 700));
      if (document.querySelector('.focus-pane')) return true;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((f) => setTimeout(f, 300));
    }
    return false;
  })()`);
}

const app = await openInbox({ dist: path.resolve('renderer/dist'), snapshot: herSnapshot() });
await app.goto(app.origin);
await app.evaluate(`localStorage.setItem('zero.firstRun.done','1');localStorage.setItem('zero.seen','[]')`);
const made = [];
for (const look of LOOKS) {
  for (const face of ['avenir', 'accents']) {
    if (look.only && face !== 'avenir') continue;
    await app.wear({ theme: look.theme, skin: look.skin });
    if (face === 'accents') {
      await app.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(ACCENTS)}; document.head.appendChild(s); return 1; })()`);
    }
    await app.evaluate(`(async () => { await document.fonts.load('15px Geist'); await document.fonts.ready; return 1; })()`);
    // The inbox list, not an open row: it is where most of her reading is, and
    // the first open row in her store is a closed item with four short lines.
    const opened = await app.evaluate(`document.querySelectorAll('.row').length`);
    await app.wait(600);
    const body = await app.evaluate(`getComputedStyle(document.body).fontFamily`);
    const file = await app.capture(path.join(OUT, `${look.skin}--${look.only ? 'ember' : face}-${ROUND}.png`));
    made.push({ file: path.basename(file), opened, body });
    console.log(look.skin, face, opened, body);
  }
}
const err = await app.evaluate('window.__ERR__ || null');
console.log('page error:', err);
app.close();
fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(made, null, 2));
