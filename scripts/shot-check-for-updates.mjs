// CHECK FOR UPDATES, PHOTOGRAPHED IN EVERY STATE IT CAN BE IN (w-39d6c237f7).
//
//   arch -arm64 node scripts/shot-check-for-updates.mjs renderer/dist <outDir>
//
// Full screen (1920x1080), dark, the built app, nothing injected: each state is
// the real Settings page opened in the fixture world that summons it
// (?update=…, see `updateShape` in renderer/src/api.ts), and the pressed shots
// click the real button and photograph what came back.
import fs from 'node:fs';
import path from 'node:path';
import { openInbox } from './lib/inbox-harness.mjs';

const [dist, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

// The button, found by its words rather than by a class, so this script says
// what a hand would do.
const PRESS = `(() => {
  const g = [...document.querySelectorAll('.set-group')].find((x) => x.dataset.find === 'updates');
  const b = g && g.querySelector('button');
  if (b) b.click();
  return b ? b.textContent : null;
})()`;

const ROW = `(() => {
  const g = [...document.querySelectorAll('.set-group')].find((x) => x.dataset.find === 'updates');
  if (!g) return null;
  return {
    label: g.querySelector('.set-row-label').textContent,
    desc: g.querySelector('.set-row-desc').textContent,
    button: g.querySelector('button').textContent,
    disabled: g.querySelector('button').disabled,
  };
})()`;

const SHOTS = [
  // Every state, in the order a person meets them.
  { name: '1-never-checked', world: '' },
  { name: '2-up-to-date', world: '&update=current' },
  { name: '3-downloading', world: '&update=downloading' },
  { name: '4-ready-installed', world: '&update=ready' },
  { name: '5-ready-from-a-checkout', world: '&update=source' },
  { name: '6-rebuilding', world: '&update=installing' },
  { name: '7-offline', world: '&update=error' },
  { name: '8-this-copy-does-not-update-itself', world: '&update=unsupported' },
];

const h = await openInbox({ dist, width: 1920, height: 1080, snapshot: {} });
try {
  await h.goto(h.origin);
  await h.evaluate(`localStorage.setItem('zero.firstRun.done','1')`);
  await h.evaluate(`localStorage.setItem('zero.theme','dark')`);

  for (const { name, world } of SHOTS) {
    await h.goto(`${h.origin}/?fixtures&settings=general${world}`);
    await h.wait(2200);
    await h.evaluate(`document.activeElement && document.activeElement.blur()`);
    console.log(name, JSON.stringify(await h.evaluate(ROW)));
    await h.capture(path.join(out, `${name}.png`));
  }

  // PRESSED, in the two worlds where the press is the whole point: one that
  // finds nothing and one that finds something.
  for (const [name, world] of [['9-pressed-finds-nothing', '&update=current'], ['10-pressed-finds-one', '&update=ready']]) {
    await h.goto(`${h.origin}/?fixtures&settings=general${world}`);
    await h.wait(2200);
    await h.evaluate(`document.activeElement && document.activeElement.blur()`);
    console.log(name, 'pressed', await h.evaluate(PRESS));
    await h.wait(900);
    console.log(name, JSON.stringify(await h.evaluate(ROW)));
    await h.capture(path.join(out, `${name}.png`));
  }

  // AND THE SAME COMMAND IN ⌘K, with nothing waiting (where it is offered) and
  // with something waiting (where the restart row stands in its place).
  for (const [name, world] of [['11-command-k', '&update=current'], ['12-command-k-when-one-waits', '&update=ready']]) {
    await h.goto(`${h.origin}/?fixtures${world}`);
    await h.wait(2200);
    await h.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`);
    await h.wait(500);
    // React owns the box's value, so the native setter is what a keystroke
    // looks like from inside the page.
    await h.evaluate(`(() => {
      const i = document.querySelector('.palette-input');
      if (!i) return 'no box';
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      i.focus(); set.call(i, 'updat');
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    })()`);
    await h.wait(600);
    console.log(name, JSON.stringify(await h.evaluate(`[...document.querySelectorAll('.palette-item')].map((r) => r.textContent).slice(0, 6)`)));
    await h.capture(path.join(out, `${name}.png`));
  }

  const err = await h.evaluate('window.__ERR__ || null');
  if (err) console.error('error', err);
} finally {
  h.close();
}
