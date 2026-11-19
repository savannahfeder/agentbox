#!/usr/bin/env node
// WALK THE WHOLE FIRST RUN BY KEYBOARD AND PICTURE EVERY SCREEN.
//
//   node .claude/skills/verify-agentbox/scripts/walk-first-run.mjs <out dir> [dark|light]
//
// A brand-new person's copy on stand-ins: four chats to bring in, Claude Code
// and Codex both ready, and a team cloud to make an account on. It presses what
// each screen asks for, saves a numbered picture of every one, and each has to
// show the words named below. The first that does not ends the walk with exit 1
// and a picture of what was there instead.
//
// It is not a tester: it cannot say a screen is confusing. Run it before the
// testers so they are not spent on a step that does not come.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [outArg, scheme = 'dark'] = process.argv.slice(2);
if (!outArg) { console.error('usage: walk-first-run.mjs <out dir> [dark|light]'); process.exit(2); }
const out = path.resolve(outArg);
// Chats in a temp folder are skipped as scratch, so the copy lives outside one.
if (!process.env.VERIFY_ROOT || /^(\/private)?\/tmp\//.test(process.env.VERIFY_ROOT)) process.env.VERIFY_ROOT = path.join(os.homedir(), '.agentbox-verify');
process.env.VERIFY_INSTANCE ||= 'first-run';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const LIVE = path.join(here, 'live.mjs');
const { instanceDir } = await import(LIVE);
const { connect } = await import(path.join(here, 'cdp.mjs'));
const { startStandinCloud } = await import(path.join(REPO, 'cloud/standin/server.mjs'));

const run = (script, args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [script, ...args], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let said = '';
  c.stdout.on('data', (d) => { said += d; });
  c.stderr.on('data', (d) => { said += d; });
  c.on('exit', (code) => resolve({ code, said }));
});

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-walk-'));
const cloud = await startStandinCloud({ file: path.join(scratch, 'cloud.json') });
fs.writeFileSync(path.join(scratch, 'team.config.json'), JSON.stringify({ url: cloud.url, anonKey: 'stand-in', standin: true }));
fs.writeFileSync(path.join(scratch, 'team.json'), JSON.stringify({ config: path.join(scratch, 'team.config.json') }), { mode: 0o600 });

let failed = null;
const down = async () => { await run(LIVE, ['down']); fs.rmSync(scratch, { recursive: true, force: true }); };
await run(LIVE, ['down']);
const up = await run(LIVE, ['up', '--fresh', '--logins', '1', '--projects', 'Payments API,Web app', '--team', path.join(scratch, 'team.json')]);
if (up.code !== 0) { console.error(up.said.slice(-1500)); await down(); process.exit(1); }
await run(path.join(here, 'browse.mjs'), ['open']);
const browser = JSON.parse(fs.readFileSync(path.join(instanceDir(), 'browser.json'), 'utf8'));
const page = await connect(browser.wsUrl, { targetId: browser.targetId });
await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme === 'light' ? 'light' : 'dark' }] });
// The copy's Codex is a stand-in that is never signed in; the setup has to offer both agents.
await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const real = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    const body = String(init?.body ?? '');
    if (String(url).includes('zero%3Aengine-setup') && body.includes('"ready"') && body.includes('"codex"')) {
      return new Response(JSON.stringify({ ok: true, engine: 'codex', found: true, signedIn: true, certain: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // Since 2026-11-13 the copy's stand-in Claude Code reads as signed out too (why is not found yet; the
    // stand-in answers 0 by hand). So neither agent's sign-in reading is the walk's to prove: a real window is.
    if (String(url).includes('zero%3Aengine-setup') && body.includes('"ready"') && body.includes('"claude"')) {
      return new Response(JSON.stringify({ ok: true, engine: 'claude', found: true, signedIn: true, certain: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // NOTHING HERE PAYS. The walk cannot give Stripe a card, so the cloud's three answers on the plan page are
    // stood in for: signed in, checkout opened, seats bought. The team itself is made on the stand-in team cloud.
    // What the real cloud says to a team sign-in is tests/the-setup-has-one-plan-page-then-payment-then-an-invite-you-can-skip.
    const said = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (String(url).includes('zero%3Acloud-account-from-team')) return said({ ok: true });
    if (String(url).includes('zero%3Acloud-account-pay')) return said({ ok: true, where: 'checkout' });
    if (String(url).includes('zero%3Acloud-account-plan') && window.__walkPaid) return said({ signedIn: true, team: { trial: false, seats: 1 } });
    return real(url, init);
  };
})()` });
await page.call('Page.reload');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const CHORD = process.platform === 'darwin' ? 'meta' : 'ctrl';
const SCREEN = `(document.querySelector('.setup-split .ss-left, .first-run')?.innerText ?? '') + ' ' + (document.querySelector('.tour-frame')?.innerText ?? '') + ' ' + (document.querySelector('.tour-say')?.innerText ?? '')`;
const shown = async () => String(await page.evaluate(SCREEN).catch(() => '')).replace(/\s+/g, ' ').trim();
let n = 0;
/** Wait for the screen to say `want`, then picture it. */
const see = async (name, want, ms = 20_000) => {
  const deadline = Date.now() + ms;
  let got = await shown();
  while (!want.test(got) && Date.now() < deadline) { await page.wait(150); got = await shown(); }
  await page.wait(700);
  n += 1;
  const file = path.join(out, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.capture(file);
  console.log(`${String(n).padStart(2, '0')} ${name}: ${got.slice(0, 150)}`);
  if (!want.test(got)) throw new Error(`"${name}" never showed ${want}. It showed: ${got.slice(0, 300) || 'nothing'}. Picture: ${file}`);
};
const key = (k, mods) => page.press(k, mods);
const click = (words) => page.evaluate(`(() => { const el = [...document.querySelectorAll('.setup-split button, .setup-split .ss-row')].find((b) => b.innerText.trim().startsWith(${JSON.stringify(words)})); el?.click(); return !!el; })()`);
const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' };

try {
  await page.until(`/ready/i.test(document.querySelector('.ob-foot')?.textContent ?? '')`, { why: 'the welcome to say which agents are ready' });
  // The welcome fades in; a picture taken at once is a logo on an empty screen.
  await page.wait(2500);
  // When the welcome names the wrong agents, what each one's check said is the first thing to read.
  console.log(`   checks: ${await page.evaluate(`Promise.all(['claude', 'codex'].map((engine) => window.zero.engineSetup({ action: 'ready', engine }).then((r) => engine + ' found=' + r.found + ' signedIn=' + r.signedIn + ' certain=' + r.certain + (r.error ? ' (' + r.error + ')' : ''), (e) => engine + ' failed: ' + e))).then((l) => l.join('; '))`).catch((e) => `not read: ${e.message}`)}`);
  await see('welcome', /CLAUDE CODE AND CODEX\s+READY/i);
  // One long press of Enter is one step, not the whole setup.
  await page.call('Input.dispatchKeyEvent', { type: 'keyDown', ...enter });
  for (let i = 0; i < 30; i += 1) { await page.call('Input.dispatchKeyEvent', { type: 'keyDown', autoRepeat: true, ...enter }); await page.wait(33); }
  await page.call('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
  await see('chats', /STEP 1 OF \d+.*Add your recent agents/i);
  await key('Enter');
  await see('agent', /Pick your agent.*Claude Code.*Codex/i);
  // A choice is made with the arrows: down to Codex, back up to Claude Code.
  const ticked = () => page.evaluate(`document.querySelector('.setup-split .ss-row.ss-on')?.innerText ?? ''`);
  await key('ArrowDown');
  if (!/Codex/.test(await ticked())) throw new Error('↓ on the agent step did not move the choice to Codex');
  await key('ArrowUp');
  if (!/Claude Code/.test(await ticked())) throw new Error('↑ on the agent step did not move the choice back to Claude Code');
  await key('Enter');
  await see('account', /Create your account/i);
  await key('Enter');
  await see('account-name', /What’s your name/i);
  await page.type('Dana Whitfield');
  await key('Enter');
  await see('account-email', /Your email and a password/i);
  await page.type('dana@northwind.test');
  await key('Enter');
  if (!await page.evaluate(`document.activeElement?.type === 'password' && !document.querySelector('.si-error')`)) throw new Error('Enter on the email did not move to the password, or it showed an error');
  await page.type('correct-horse-9');
  await see('account-email-and-password', /Create account/i);
  await key('Enter');
  await see('plan', /Upgrade to Pro.*Invite only.*Try Pro free for 7 days.*Stay on Free/i);
  if (/\d+ (cloud agents )?at once/i.test(await page.evaluate(`document.querySelector('.setup-split')?.innerText ?? ''`))) throw new Error('the plan page still names a number of cloud agents at once');
  await key('Enter');
  await see('plan-waiting-on-stripe', /Finish in your browser/i);
  await page.evaluate('window.__walkPaid = true');
  await see('look', /Pick your look/i);
  await key('Enter');
  await see('all-set', /You’re set up.*4 chats brought in.*Start the walkthrough/i);
  // There is a way back from the last page: Back, and the dash of a step already passed.
  if (!await click('Back')) throw new Error('the last page has no Back');
  await see('back-from-all-set', /STEP 6 OF 6.*Pick your look/i);
  await key('Enter');
  await see('all-set-again', /You’re set up.*Start the walkthrough/i);
  if (!await page.evaluate(`(() => { const d = [...document.querySelectorAll('.setup-split .ss-steps button')].at(-1); d?.click(); return !!d; })()`)) throw new Error('no dash at the top of the last page can be pressed');
  await see('back-by-a-dash', /STEP 6 OF 6.*Pick your look/i);
  await key('Enter');
  await see('all-set-once-more', /You’re set up.*Start the walkthrough/i);
  await key('Enter');

  await see('walkthrough-compose', /WALKTHROUGH 1 OF 5.*to send this practice thread/i);  await key('Enter', [CHORD]);
  await see('walkthrough-working', /WALKTHROUGH 2 OF 5.*Your agent is working/i);
  await see('walkthrough-answered', /WALKTHROUGH 2 OF 5.*Your agent has answered/i);
  await key('Tab', ['shift']);
  await see('walkthrough-open', /WALKTHROUGH 2 OF 5.*Agents land here when they need you/i);
  await key('Enter');
  // The practice answer ends in numbered options, so the tip asks for a number and nothing is typed.
  await see('walkthrough-choose', /WALKTHROUGH 3 OF 5.*to choose the recommended option/i);
  await key('1');
  // The pick is a reply: the thread shows its agent thinking, as a real one does, and then the answer to it.
  await page.until(`!!document.querySelector('.live-activity .live-word.is-shimmering')`, { ms: 1500, why: 'the practice thread to show its agent thinking once an option is picked' });
  await see('walkthrough-thinking', /WALKTHROUGH \d OF 5/i);
  await page.until(`/Shorter now/.test(document.querySelector('.focus-body')?.innerText ?? '')`, { ms: 8000, why: 'the practice thread to answer the option that was picked' });
  await see('walkthrough-close', /WALKTHROUGH 4 OF 5.*to close it/i);
  await key('e');
  await see('walkthrough-palette', /WALKTHROUGH 5 OF 5.*to find anything/i);
  await key('k', [CHORD]);
  await see('walkthrough-in-palette', /WALKTHROUGH 5 OF 5.*Type urgent/i);
  await page.type('urgent');
  await key('Enter');
  await see('walkthrough-urgent', /Urgent threads move up your list/i);
  // The last word is said on Home's box, under a bar that reads done.
  await see('walkthrough-done', /WALKTHROUGH DONE Close ↵.*You finished the walkthrough\. Press ↵ to close/i);
  if (!await page.evaluate(`!!document.querySelector('.hm-hello') && !document.querySelector('.tour-glow')`)) throw new Error('the last tip is up, but not on Home, or something on Home is still ringed in gold');
  // ↵ is the tip's own key: it closes the tip, and Home's box, which has the cursor, gets no new line from it.
  const inBox = `(() => { const t = document.querySelector('.hm-start .tc-card textarea, .hm-start .tc-card [contenteditable="true"]'); return t ? String(t.value ?? t.innerText) : null; })()`;
  await page.evaluate(`document.querySelector('.hm-start .tc-card textarea, .hm-start .tc-card [contenteditable="true"]')?.focus()`);
  if (await page.evaluate(inBox) === null) throw new Error("Home's box has nothing to type in");
  await key('Enter');
  await page.until(`!document.querySelector('.tour-frame') && !document.querySelector('.tour-card') && !document.querySelector('.tour-glow')`, { ms: 3000, why: '↵ to put the last tip, its ring and the bar away' });
  const typed = await page.evaluate(inBox);
  if (typed !== '') throw new Error(`↵ on the last tip also reached Home's box, which now holds ${JSON.stringify(typed)}`);
  const hello = await page.evaluate(`document.querySelector('.hm-hello')?.innerText ?? ''`);
  if (!/^Good (morning|afternoon|evening), Dana$/.test(hello)) throw new Error(`Home after the walkthrough does not greet you as it always does. Its greeting is: ${hello || 'not there'}`);
  await see('home-after', /^$/);
  if (page.errors.length) throw new Error(`the page logged ${page.errors.length} error(s): ${page.errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  failed = e;
  n += 1;
  await page.capture(path.join(out, `${String(n).padStart(2, '0')}-where-it-stopped.png`)).catch(() => {});
}
page.detach();
await down();
if (failed) { console.error(`\nThe walk stopped: ${failed.message}`); process.exit(1); }
console.log(`\nThe whole first run walked: ${n} screens, pictures in ${out}`);
process.exit(0);
