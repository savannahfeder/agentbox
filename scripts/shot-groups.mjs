// Groups, photographed off a built renderer with a made-up team, at a
// full-screen window size, in light and dark: the Inbox, the narrow sidebar
// pointed at, a group, a chat, its options, a person's page, everyone's
// threads, a thread, its document, and a direct message.
//
//   npx vite build renderer --outDir dist-x
//   GROUPS_FACES=<folder of p-*.jpg> node scripts/shot-groups.mjs renderer/dist-x <outDir> [name,name]
// GROUPS_CHROME points at a Chromium when Playwright's own is not installed.
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const groups = '.gt-rail-nav button[aria-label="Groups"]';
const row = '.row:has-text("The first row a new project")';
const wide = { hover: true };
const shots = [
  { name: 'inbox', steps: [] },
  { name: 'sidebar-wide', steps: [wide] },
  { name: 'group', steps: [groups] },
  { name: 'group-sidebar-wide', steps: [groups, wide] },
  { name: 'chat-two', steps: [wide, '.gt-rail-row[aria-label="Maya, Priya"]'] },
  { name: 'options', steps: [groups, 'button[aria-label="Group options"]'] },
  { name: 'person', steps: [groups, '.gr-prow:has-text("Maya Chen")'] },
  { name: 'board', steps: [groups, 'button[aria-label="Group options"]', '.gr-optmenu .row:has-text("Everyone")'] },
  { name: 'thread', steps: [row] },
  { name: 'document', steps: [row, 'text=the-first-row.html'] },
  { name: 'direct', steps: [groups, wide, '.gt-rail-row[aria-label="Priya"]'] },
].filter((s) => !only || only.split(',').includes(s.name));

for (const s of shots) {
  for (const theme of ['light', 'dark']) {
    const app = await openStage({ dist: path.resolve(dist), width: 1710, height: 1063, theme, init: { 'rooms.tab': 'r-team' } });
    let hovering = false;
    for (const step of s.steps) {
      if (step === wide) { await app.page.locator('.gt-rail-nav').hover({ position: { x: 19, y: 300 } }); hovering = true; }
      else { await app.page.locator(step).first().click(); hovering = step.includes('gt-rail-row') ? hovering : false; if (!hovering) await app.page.mouse.move(1000, 700); }
      await app.page.waitForTimeout(700);
    }
    const file = path.join(out, `${s.name}-${theme}.png`);
    // The last step decides: a shot named for the wide sidebar keeps the pointer on it.
    if (s.steps.at(-1) === wide) await app.page.screenshot({ path: file });
    else await app.shot(file);
    const errors = await app.errors();
    if (errors.length) console.log(s.name, theme, errors);
    await app.close();
  }
}
console.log('wrote', out);
