// THE DRIVES: one per feature in ../features/, each a user's path through the
// real browser copy that live.mjs started. A drive presses what a person
// presses, then checks what a person would see AND what the app wrote to disk,
// because a screen that says "sent" over a store that holds nothing is the
// failure verification exists to catch.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { foldWorkItems } = await import(path.join(REPO, 'shared/work-items.mjs'));

/**
 * The project's own folder of machinery: `<store>/projects/<the project's
 * folder, every non-alphanumeric character as "-">` (main/store/home.mjs). The
 * ledger lives there, not beside project.json.
 */
export function machinery(state, slug = 'sandbox') {
  return path.join(state.storeRoot, 'projects', path.join(state.accountRoot, slug).replace(/[^A-Za-z0-9]/g, '-'));
}
export function readLedger(state, slug = 'sandbox') {
  const file = path.join(machinery(state, slug), 'work-items.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
/** Every project the copy has a ledger for, by slug (the installed app adds "My workspace" of its own). */
export function projects(state) {
  // The account folder and the separator after it, as machinery() spells them.
  const prefix = `${state.accountRoot}/`.replace(/[^A-Za-z0-9]/g, '-');
  try {
    return fs.readdirSync(path.join(state.storeRoot, 'projects')).filter((d) => d.startsWith(prefix)).map((d) => d.slice(prefix.length));
  } catch { return []; }
}

/**
 * Rows folded the way the app folds them: one project's, or with no slug every
 * project's, since where a new thread is filed by default differs between the
 * browser copy (the first project) and the installed app (its own workspace).
 */
export function rows(state, slug = null) {
  // The project is which ledger the row is in; the fold does not repeat it.
  const one = (s) => [...foldWorkItems(readLedger(state, s)).values()].map((r) => ({ ...r, product: s }));
  return slug ? one(slug) : projects(state).flatMap(one);
}
/** A thread's session logs, in whichever project it is filed. */
export function sessionLogs(state, id) {
  for (const slug of projects(state)) {
    try { return fs.readdirSync(path.join(machinery(state, slug), 'sessions', id)); } catch { /* not this one */ }
  }
  return [];
}
/** Every start of the Claude stand-in on one thread: which login, which attempt, when. */
export function spawnsOf(state, id) {
  try {
    return fs.readFileSync(path.join(state.receipts, `${id}.spawns.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}
export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
/** Poll a fact on disk; the fact, or null when it never came. */
export async function until(fn, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    const got = fn();
    if (got) return got;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 200));
  }
}

const WORD = 'PINEAPPLE';

/** Every line the Codex stand-in logged: its requests, and the CONNECTs it refused as the copy's proxy. */
export function codexModelLog(state) {
  try {
    return fs.readFileSync(path.join(state.instance, 'codex-model.log'), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/**
 * ONE TASK ON A PERSON'S OWN CODEX SETUP: sent to Codex from the composer, run
 * by the real codex on their home, against the stand-in signed with their own
 * login. A setup that must not run (`expect.answers` false) is checked for
 * the opposite: no request went out on that login at all, and the thread says
 * in a plain sentence why and what to do.
 */
async function codexSetupTask({ tab, state, claim, capture, setup }) {
  const expect = setup.expect;
  const known = (k) => ({ known: setup.known?.[k] ?? null });
  const tok = `cs${Date.now().toString(36)}`;
  const title = `Setup ${tok}: reply with exactly the word ${WORD} and nothing else. [[tok:${tok}]]`;
  const { row, picked } = await compose(tab, state, title, { engine: 'codex' });
  claim(picked, 'the composer offers Codex and it can be picked', picked ?? 'no Codex column in the model menu');
  await capture('sent');
  if (!claim(row, 'the store holds the thread', row?.id)) return;
  claim(row.engine === 'codex', 'the thread is stored as a Codex thread', `engine ${row.engine ?? 'unset'}`);
  const mine = () => codexModelLog(state).filter((e) => e.token === tok || (e.item && e.item === row.id));
  const current = () => rows(state).find((r) => r.id === row.id) ?? row;
  const result = () => String(current().result ?? '');

  if (expect.answers) {
    claim(await until(() => mine().length, 60_000), 'the real codex asked the model about this thread', `${mine().length} request(s)`);
    const answered = await until(() => result().includes(WORD), 120_000);
    claim(answered, 'the answer lands on the thread', result().slice(0, 80) || '(none)', known('answers'));
  } else {
    // Long enough for a worker to have started and died, and for the app to
    // have written what it has to say.
    const said = await until(() => {
      const r = current();
      const text = [r.result, r.note, r.error, r.statusNote].filter(Boolean).join(' ');
      return expect.says.test(text) ? text : null;
    }, 90_000);
    await openThread(tab, current());
    await tab.wait(800);
    const screen = await tab.text();
    const shown = expect.says.test(screen);
    claim(said || shown, 'the thread says, in a plain sentence, why it cannot run and what to do',
      String(said || screen.split('\n').find((l) => expect.says.test(l)) || result() || '(nothing on the thread)').slice(0, 200), known('answers'));
    await capture('refused');
    claim(!mine().length, 'no worker sent this task to a model on that login', `${mine().length} request(s)`, known('billing'));
  }

  const asked = mine().filter((e) => e.item || e.token);
  if (expect.store) {
    const offered = asked.find((e) => e.mcp?.some((n) => /update_work_item$/.test(n)));
    claim(offered, 'Codex offered the worker the app\'s store tools',
      offered ? offered.mcp.filter((n) => /work_item/.test(n)).slice(0, 2).join(', ') : `mcp tools: ${asked[0]?.mcp?.slice(0, 4).join(', ') || 'none'}`, known('store'));
    const note = await until(() => readLedger(state, row.product).some((l) => l.id === row.id && String(l.patch?.note ?? '').includes(tok)), 10_000);
    const back = asked.find((e) => e.toolResult)?.toolResult;
    claim(note, 'the worker\'s note reached the thread through the store tool',
      note ? 'in the ledger' : back ? `tool said: ${back.slice(0, 120)}` : 'never called', known('store'));
  }
  const signed = [...new Set(asked.map((e) => e.auth))];
  const away = [...new Set(codexModelLog(state).filter((e) => e.connect).map((e) => e.connect))];
  claim(!signed.includes('api-key') && (!expect.answers || signed.includes('chatgpt')),
    'the model was paid for by a ChatGPT plan, never an API key',
    `signed: ${signed.join(', ') || 'nothing'}${away.length ? `; refused on the way off this Mac: ${away.join(', ')}` : ''}`, known('billing'));
  for (const c of setup.check?.(state.home, { codexLog: asked }) ?? []) claim(c.ok, c.sentence, c.evidence, known(c.key ?? 'check'));
  claim(await openThread(tab, current()), 'the thread opens from the list');
  await capture('thread');
}

/**
 * A CLAUDE AND A CODEX TASK, CAUGHT MID-RUN BY THE APP STOPPING, THEN THE APP
 * STARTED AGAIN. `how` is 'quit' (the app alone is signalled and stops its own
 * workers) or 'ctrl-c' (the whole process group at once, as a terminal does).
 * Either way the person expects both tasks to finish once it is back.
 */
async function interruptMidRun({ tab, state, claim, capture, live }, how) {
  const stamp = Date.now().toString(36);
  const tasks = [{ engine: 'claude', tok: `R1${stamp}` }, ...(state.codexBin ? [{ engine: 'codex', tok: `R2${stamp}` }] : [])];
  for (const t of tasks) {
    t.title = `Mid-run ${t.tok} [[stub:slow:12000]] [[tok:${t.tok}]]`;
    t.row = (await compose(tab, state, t.title, { engine: t.engine })).row;
  }
  const codexAsked = (tok) => fs.existsSync(path.join(state.instance, 'codex-model.log'))
    && fs.readFileSync(path.join(state.instance, 'codex-model.log'), 'utf8').includes(tok);
  const running = await until(() => spawnsOf(state, tasks[0].row.id).length && (!tasks[1] || codexAsked(tasks[1].tok)), 30_000);
  claim(running, `both workers are running when the app is stopped (${how === 'quit' ? 'a quit' : 'Control-C'})`);
  await live.restart(how);
  const after = live.readState();
  await tab.goto(after.url);
  // The old page lost its server for a moment, which is the restart, not a bug.
  tab.errors.length = 0;
  const resultOf = (t) => String(rows(after).find((x) => x.id === t.row.id)?.result ?? '');
  const done = await until(() => tasks.every((t) => resultOf(t).includes(t.tok)), 120_000);
  claim(done, 'once it is back, every interrupted task is answered', tasks.map((t) => resultOf(t).slice(0, 70) || 'none').join(' | '));
  claim(tasks.every((t) => rows(after).filter((r) => r.title === t.title).length === 1), 'no task was duplicated');
  const listed = [];
  for (const t of tasks) listed.push(await inNeedsYou(tab, t.title, rows(after).find((x) => x.id === t.row.id)));
  claim(listed.every(Boolean), 'both are under Needs you');
  await capture('after-restart');
}

/**
 * OPEN A THREAD THE WAY A PERSON FINDS IT: the All tab, so it is there whichever
 * list it has moved to (a real worker sets its own status and the row leaves
 * In progress), then its row by the name the list shows, which is the label an
 * agent gave it when it gave one, else the title. Matched on the start of the
 * name, because a long one is cut short on screen.
 */
/** Click one of the list's tabs by its words (its count is ignored). True when one was there. */
export async function clickTab(tab, words) {
  const hit = await tab.evaluate(`(() => {
    const re = new RegExp(${JSON.stringify(words.source)}, ${JSON.stringify(words.flags)});
    const el = [...document.querySelectorAll('button, [role="tab"], a')].find((e) => re.test(e.textContent.trim()));
    if (el) el.click();
    return !!el;
  })()`);
  await tab.wait(500);
  return hit;
}

/**
 * WHO THE OPEN THREAD SAYS OPENED IT: 'you', 'agent', or null for neither.
 *
 * Two forms, and both are right. An opening with no words of its own draws the
 * quiet sentence; one that carries words draws as a message, its author's
 * byline over them and no sentence anywhere. A row its worker has named carries
 * words either way, since the title is then said in the opening
 * (renderer/src/thread-history.ts, withTitleSaid), which is why real Claude
 * Code's rows read one way and the stand-in's the other.
 */
export function whoOpenedThread({ agentSaid = false, youSaid = false, opener = null } = {}) {
  if (agentSaid) return { who: 'agent', saw: 'An agent opened this' };
  if (youSaid) return { who: 'you', saw: 'You opened this' };
  const name = String(opener ?? '').trim();
  if (!name) return { who: null, saw: 'neither line on screen' };
  if (name === 'You') return { who: 'you', saw: 'your byline over the opening' };
  if (name === 'The agent') return { who: 'agent', saw: 'the agent\'s byline over the opening' };
  return { who: null, saw: `the opening is bylined "${name}"` };
}

/** The same question asked of the open thread on the screen. */
export async function whoOpenedOnScreen(tab) {
  return whoOpenedThread(await tab.evaluate(`(() => {
    const t = document.body.innerText;
    return {
      agentSaid: /An agent opened this/.test(t),
      youSaid: /\\bOpened this|You opened this/.test(t),
      opener: document.querySelector('.thread .msg .msg-who')?.textContent.trim() ?? null,
    };
  })()`));
}

async function openThread(tab, row) {
  const names = [row.label, row.title].filter(Boolean).map((n) => String(n).slice(0, 24));
  const find = `(() => {
    const names = ${JSON.stringify(names)};
    const hit = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && names.some((n) => e.textContent.trim().startsWith(n)));
    if (hit) hit.click();
    return !!hit;
  })()`;
  // There is no "All" list any more: the thread is under whichever tab its
  // state puts it, and a thread that just finished moves from In progress to
  // Needs you while the drive looks. So each tab in turn, as a person would.
  let clicked = false;
  for (const words of [/^all\b/i, /^needs you/i, /^in progress/i, /^later/i, /^done/i]) {
    if (!(await clickTab(tab, words))) continue;
    clicked = await tab.until(find, { ms: 3000, why: 'the thread to be in this list' }).catch(() => false);
    if (clicked) break;
  }
  await tab.wait(800);
  return clicked;
}

/**
 * IN THE OPEN COMPOSER, CHOOSE THE ENGINE THE WAY A PERSON DOES: the model
 * word under the box, then All models, then the first row in that engine's
 * column. Returns the label now on the chip, or null when there was no such
 * column (an engine this copy does not have).
 */
export async function pickEngine(tab, engine) {
  const head = engine === 'codex' ? 'codex' : 'claude';
  // The field labelled Model, not the To field above it, which is the same kind
  // of button. Pressed again if the first press landed while the composer was
  // still settling (seen once on the fourth task of a quick run).
  for (let i = 0; i < 3; i += 1) {
    await tab.evaluate(`[...document.querySelectorAll('.tc-field')].find((f) => f.querySelector('.tc-label')?.textContent.trim() === 'Model')?.querySelector('.tc-word')?.click()`);
    if (await tab.until(`!!document.querySelector('.tc-model-menu')`, { ms: 1500 }).catch(() => false)) break;
  }
  await tab.until(`!!document.querySelector('.tc-model-menu')`, { why: 'the model menu to open', ms: 2000 });
  await tab.evaluate(`[...document.querySelectorAll('.tc-model-menu .tc-row')].find((b) => /All models/.test(b.textContent))?.click()`);
  await tab.wait(300);
  const label = await tab.evaluate(`(() => {
    const col = [...document.querySelectorAll('.tc-model-menu .tc-col')].find((c) => new RegExp(${JSON.stringify(head)}, 'i').test(c.querySelector('.tc-menu-head')?.textContent ?? ''));
    const row = col?.querySelector('.tc-row');
    if (!row) return null;
    const text = row.textContent.trim();
    row.click();
    return text;
  })()`);
  await tab.wait(300);
  return label;
}

/** In the open composer, choose the project by name from its chip. True when it took. */
export async function pickProject(tab, name) {
  await tab.evaluate(`[...document.querySelectorAll('.tc-chip')].find((b) => b.querySelector('.tc-chip-name'))?.click()`);
  await tab.until(`!!document.querySelector('[role="listbox"][aria-label="Project"]')`, { why: 'the project menu to open', ms: 5000 });
  await tab.evaluate(`[...document.querySelectorAll('[aria-label="Project"] .tc-row')].find((b) => b.textContent.trim() === ${JSON.stringify(name)})?.click()`);
  await tab.wait(300);
  return tab.evaluate(`document.querySelector('.tc-chip-name')?.textContent.trim() === ${JSON.stringify(name)}`);
}

/**
 * IS THIS THREAD WHERE THE PERSON WILL LOOK? The Needs you tab of the list,
 * read off the screen. A finished answer that is not there is the "it never
 * came back" bug, whatever the store says.
 */
export async function inNeedsYou(tab, title, row = null) {
  await tab.press('Escape');
  await tab.press('Escape');
  // The tab, not a leaf: its count sits in a child of the same button.
  await clickTab(tab, /^needs you/i);
  // The list shows the short name an agent gave the thread when it gave one
  // (real Claude Code often does), so look for what the person sees.
  const shown = String(row?.label || title);
  return tab.evaluate(`document.body.innerText.includes(${JSON.stringify(shown.slice(0, 24))})`);
}

/** Compose one thread from the keyboard, optionally on a chosen engine and project. Returns its stored row. */
export async function compose(tab, state, title, { engine = null, project = null } = {}) {
  await tab.until(`document.body.innerText.includes('Threads')`, { why: 'the inbox to draw' });
  // The last composer has to be gone first: while it closes it still holds the
  // cursor, and an N pressed then lands in it (seen on a run of six tasks).
  await tab.until(`!document.querySelector('textarea.tc-text')`, { why: 'the last composer to close', ms: 8000 }).catch(() => tab.press('Escape'));
  await tab.press('n');
  await tab.until(`document.activeElement?.matches('textarea.tc-text') && document.activeElement.value === ''`, { why: 'N to open an empty composer', ms: 8000 });
  await tab.type(title);
  let picked = null;
  if (engine) picked = await pickEngine(tab, engine);
  if (project) await pickProject(tab, project);
  if (engine || project) await tab.evaluate(`document.querySelector('textarea.tc-text')?.focus()`);
  await tab.press('Enter', ['meta']);
  await tab.until(`!document.querySelector('textarea.tc-text')`, { why: '⌘↵ to send and close the composer', ms: 8000 });
  // Composing writes two lines, the app's stamp and then the person's own
  // (with the engine and model); wait for the second, or the row reads early.
  const theirs = (r) => r.title === title && r.wrote?.title?.source === 'founder';
  const row = await until(() => rows(state).find(theirs), 10_000);
  return { row, picked };
}

export const DRIVES = {
  'inbox-opens': {
    what: 'the inbox draws on an empty store: no sign-in wall, no first-run walk, the empty state and its way forward',
    async run({ tab, claim, capture }) {
      await tab.until(`document.body.innerText.includes('Threads')`, { why: 'the inbox to draw' });
      await tab.wait(800);
      await capture('inbox');
      const text = await tab.text();
      claim(!/Wrong or missing token/.test(text), 'the tab got past the token check');
      claim(!/Sign in to/.test(text), 'no sign-in wall (the copy runs as the single-person app)');
      claim(/Nothing needs you/.test(text) && /New thread/.test(text), 'the empty inbox says so and offers a new thread', text.replace(/\s+/g, ' ').slice(0, 120));
    },
  },
  'one-at-a-time': {
    what: 'Every thread in Needs you opens one thing at a time: Enter or a click opens the page, a pick moves on, J and the arrows walk, earlier messages open, esc leaves, the last answer lands on the empty inbox, and a thread in In progress opens on the same page without the queue',
    notInstalled: 'it rewrites the stand-in world, which only the browser copy reads',
    async run({ tab, state, claim, capture }) {
      // Every answer ends with choices; replies are held back once the three
      // are answered, so the queue can be emptied before any comes back.
      const worldFile = path.join(state.instance, 'world.json');
      const prior = readJson(worldFile) ?? {};
      const setWorld = (w) => fs.writeFileSync(worldFile, JSON.stringify({ ...prior, ...w }));
      const page = () => tab.evaluate(`(() => ({
        on: !!document.querySelector('.app.one-at-a-time'),
        name: document.querySelector('.thread-crumb-name')?.textContent ?? null,
        title: document.querySelector('.one-sum > .one-title')?.textContent ?? null,
        pos: document.querySelector('.one-pos')?.textContent ?? null,
        choices: document.querySelectorAll('.one-choices .opt-row').length,
        heading: !!document.querySelector('.one-choices .opt-head'),
        panel: !!document.querySelector('.ts-panel, .ts-rail'),
        barName: (() => { const n = document.querySelector('.thread-crumb-name'); return !!n && getComputedStyle(n).display !== 'none'; })(),
        summary: !!document.querySelector('.one-sum'),
        answer: !!document.querySelector('.one-answer'),
        // A thread with one or two earlier messages is drawn whole, its ask in it (ItemThread, drawnWhole).
        whole: !!document.querySelector('.focus-body .thread') && !document.querySelector('.one-earlier'),
        earlier: document.querySelector('.one-earlier')?.textContent ?? null,
      }))()`);
      try {
        setWorld({ options: 1, pace: { minMs: 0, maxMs: 0 } });
        await tab.until(`document.body.innerText.includes('Threads')`, { why: 'the inbox to draw' });
        const stamp = Date.now().toString(36);
        const titles = ['Pick a name for the export button', 'Decide how long drafts are kept', 'Choose where the release notes live', 'Retire the old settings page'].map((t) => `${t} ${stamp}`);
        for (const title of titles) {
          await tab.press('n');
          await tab.until(`document.activeElement?.matches('textarea')`, { why: 'N to open the composer' });
          await tab.type(title);
          await tab.press('Enter', ['meta']);
          await tab.until(`document.body.innerText.includes(${JSON.stringify(title)})`, { why: 'the thread to be filed' });
        }
        const ours = () => rows(state).filter((r) => titles.includes(r.title));
        const answered = await until(() => { const r = ours(); return r.length === 4 && r.every((x) => /## Options/.test(String(x.result ?? ''))) ? r : null; }, 90_000);
        claim(answered, 'four threads come back from their agents with choices', answered ? '' : `${ours().filter((x) => x.result).length} of 4 answered`);
        if (!answered) return;
        setWorld({ options: 1, pace: { minMs: 120_000, maxMs: 120_000 } });

        await clickTab(tab, /^needs you/i);
        await tab.until(`!!document.querySelector('.list-pane .row')`, { why: 'Needs you to list the threads', ms: 10_000 }).catch(() => false);
        await capture('needs-you');
        claim(!(await tab.evaluate(`!!document.querySelector('.th-one')`)), 'Needs you has no separate way in to switch on');

        const order = await tab.evaluate(`[...document.querySelectorAll('.list-pane .row:not(.th-head)')].map((r) => r.textContent)`);
        await tab.press('Enter');
        const opened = await tab.until(`!!(document.querySelector('.app.one-at-a-time .one-sum') && (document.querySelector('.one-answer') || document.querySelector('.focus-body .thread')))`, { why: 'Enter to open the pointed row', ms: 10_000 }).catch(() => false);
        claim(opened, 'Enter on a row opens it on the one-at-a-time page');
        const first = await page();
        // Enter opens the pointed row, which need not be the top one.
        const at = order.findIndex((t) => first.name && t.includes(first.name.replace(/…$/, '').slice(0, 20)));
        claim(at >= 0 && first.pos === `${at + 1} of 4`, 'the corner says where you are', first.pos ?? 'no position');
        claim(!first.barName, 'the bar keeps only the way back; the name is said once, on the page');
        claim(!!first.title && titles.some((t) => t.startsWith(first.title.replace(/…$/, '').slice(0, 20))), 'the page names the thread above its Context', first.title ?? '');
        claim(first.summary && (first.answer || first.whole), 'the summary on top, then the newest answer, or the whole of a short thread', first.whole ? 'drawn whole' : 'the answer');
        claim(first.choices === 3 && !first.heading, 'the three choices at the foot, without a heading', `${first.choices} choices`);
        claim(!first.panel, 'no summary panel beside the page');
        await capture('first');

        // The arrows name their keys on hover, on the plate the rest of the corner wears.
        const arrow = await tab.evaluate(`(() => { const r = document.querySelector('.one-step[data-hint="next-thread"]')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
        if (arrow) {
          await tab.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: arrow.x - 4, y: arrow.y });
          await tab.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: arrow.x, y: arrow.y });
        }
        const plate = await tab.until(`[...document.querySelectorAll('[class*="hint-plate"]')].map((e) => e.textContent).find((t) => /Next thread/.test(t))`, { why: 'the plate on the down arrow', ms: 5000 }).catch(() => null);
        claim(plate, 'hovering the down arrow names its key', plate ?? 'no plate');
        await tab.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 700 });

        // A number pressed the moment the app moves you waits a beat (pick-settles).
        await tab.wait(1000);
        await tab.press('1');
        const next = await tab.until(`document.querySelector('.app.one-at-a-time') && document.querySelector('.thread-crumb-name')?.textContent !== ${JSON.stringify(first.name)}`, { why: 'the next thread to come up', ms: 10_000 }).catch(() => false);
        claim(next, 'picking 1 brings the next thread up');
        const sent = await tab.until(`(() => { const up = document.querySelector('.ts-top > .sent-line'); return up && !document.querySelector('.focus-dock-inner > .sent-line') ? up.textContent : null; })()`, { why: 'the sent line in the bar', ms: 4000 }).catch(() => null);
        claim(sent, 'where the answer went is said in the bar, not above the reply box', sent ?? 'no sent line in the bar');
        await capture('second');
        const firstRow = answered.find((r) => first.name && r.title.startsWith(first.name.replace(/…$/, '').slice(0, 20)));
        const landed = firstRow && await until(() => rows(state).find((r) => r.id === firstRow.id && /^Option 1:/.test(String(r.answer ?? ''))), 15_000);
        claim(landed, 'the pick is written onto the thread it answered', landed ? String(landed.answer).slice(0, 40) : '');
        const taken = firstRow && await until(() => spawnsOf(state, firstRow.id).length >= 2 && spawnsOf(state, firstRow.id).length, 20_000);
        claim(taken, 'an agent takes the answer up', taken ? `${taken} starts` : '');

        const before = await page();
        await tab.press('j');
        await tab.wait(800);
        const walked = await page();
        claim(walked.on && walked.name !== before.name, 'J walks to the thread below', `${before.pos} to ${walked.pos}`);
        await tab.evaluate(`document.querySelector('.one-step[aria-label^="Previous"]')?.click()`);
        await tab.wait(800);
        const back = await page();
        claim(back.on && back.name === before.name, 'the up arrow walks back', back.pos ?? '');

        // These threads are short, so they are drawn whole, the ask in them; a longer one folds.
        if (before.earlier) {
          await tab.evaluate(`document.querySelector('.one-earlier')?.click()`);
          const opened2 = await tab.until(`!!(document.querySelector('.one-earlier')?.textContent?.startsWith('Hide') && document.querySelector('.focus-body .thread'))`, { why: 'the earlier messages to open', ms: 8000 }).catch(() => false);
          claim(opened2, 'the earlier messages open in place', before.earlier);
        } else {
          const ask = await tab.evaluate(`document.querySelector('.focus-body .thread')?.textContent ?? ''`);
          claim(!!before.name && ask.includes(before.name.replace(/…$/, '').slice(0, 20)), 'a short thread is drawn whole, with your ask in it', before.name ?? '');
        }
        await capture('earlier');

        await tab.press('Escape');
        const left = await tab.until(`!document.querySelector('.app.one-at-a-time') && !!document.querySelector('.list-pane .row')`, { why: 'esc to leave for Needs you', ms: 8000 }).catch(() => false);
        claim(left, 'esc leaves for Needs you');

        const ourRow = `[...document.querySelectorAll('.list-pane .row')].find((r) => ${JSON.stringify(titles.map((t) => t.slice(0, 20)))}.some((t) => r.textContent.includes(t)))`;
        await tab.evaluate(`${ourRow}?.click()`);
        const clicked = await tab.until(`!!document.querySelector('.app.one-at-a-time')`, { why: 'a click to open a thread', ms: 8000 }).catch(() => false);
        claim(clicked, 'a click on a row opens it on the one-at-a-time page too');
        // A typed reply moves on too.
        const typed = await page();
        await tab.wait(1000);
        await tab.press('r');
        await tab.until(`document.activeElement?.matches('textarea')`, { why: 'R to open the reply box', ms: 5000 }).catch(() => false);
        await tab.type(`Keep it for 30 days ${stamp}`);
        await tab.press('Enter', ['meta']);
        const replied = await tab.until(`!document.querySelector('.app.one-at-a-time') || document.querySelector('.thread-crumb-name')?.textContent !== ${JSON.stringify(typed.name)}`, { why: 'the reply to move on', ms: 10_000 }).catch(() => false);
        claim(replied, 'a typed reply moves on as a pick does', typed.name ?? '');
        const repliedRow = answered.find((r) => typed.name && r.title.startsWith(typed.name.replace(/…$/, '').slice(0, 20)));
        const reply = repliedRow && await until(() => rows(state).find((r) => r.id === repliedRow.id && String(r.answer ?? '').includes(stamp)), 15_000);
        claim(reply, 'the typed reply is written onto its thread');
        // And E closes it and moves on.
        const closing = await page();
        await tab.wait(1000);
        await tab.press('e');
        await tab.wait(400);
        // The first E on a thread whose agent waits on you says so once, and a second E goes ahead (stopped-agent.ts).
        const warned = await tab.evaluate(`[...document.querySelectorAll('.toast')].some((t) => /Press again to go ahead/.test(t.textContent))`);
        if (warned) await tab.press('e');
        const closed = await tab.until(`!document.querySelector('.app.one-at-a-time') || document.querySelector('.thread-crumb-name')?.textContent !== ${JSON.stringify(closing.name)}`, { why: 'E to close and move on', ms: 10_000 }).catch(() => false);
        await capture('after-e');
        claim(closed, 'E closes the thread and moves on', `${closing.name ?? ''}${warned ? ', after the one-time warning' : ''}`);
        const closedRow = answered.find((r) => closing.name && r.title.startsWith(closing.name.replace(/…$/, '').slice(0, 20)));
        const done = closedRow && await until(() => rows(state).find((r) => r.id === closedRow.id && r.status === 'done'), 15_000);
        claim(done, 'the closed thread is marked done in the store');
        for (let i = 0; i < 5; i++) {
          const now = await page();
          if (!now.on) break;
          await tab.wait(1000);
          await tab.press('1');
          await tab.until(`!document.querySelector('.app.one-at-a-time') || document.querySelector('.thread-crumb-name')?.textContent !== ${JSON.stringify(now.name)}`, { why: 'the pick to move on', ms: 10_000 }).catch(() => false);
          await tab.wait(400);
        }
        const empty = await tab.until(`!document.querySelector('.app.one-at-a-time') && document.body.innerText.includes('Nothing needs you')`, { why: 'the last answer to land on the empty inbox', ms: 10_000 }).catch(() => false);
        claim(empty, 'the last answer lands on the empty inbox');
        await capture('empty');
        const all = await until(() => { const r = ours(); return r.every((x) => x.status === 'done' || /^Option 1:|Keep it for 30 days/.test(String(x.answer ?? ''))) ? r : null; }, 15_000);
        claim(all, 'every thread holds what was done to it: a pick, a reply or a close');

        // Out of Needs you, a thread opens on the same page, without the place in the queue.
        await clickTab(tab, /^in progress/i);
        await tab.until(`!!(${ourRow})`, { why: 'In progress to list a picked thread', ms: 10_000 }).catch(() => false);
        await tab.evaluate(`${ourRow}?.click()`);
        const same = await tab.until(`!!document.querySelector('.app.one-at-a-time .one-sum > .one-title') && !document.querySelector('.one-pos') && !document.querySelector('.ts-panel')`, { why: 'an In progress thread to open', ms: 8000 }).catch(() => false);
        claim(same, 'a thread in In progress opens on the same page, without the place in the queue');
        const floating = await tab.evaluate(`[...document.querySelectorAll('.toast')].filter((t) => getComputedStyle(t).position === 'fixed').length`);
        claim(floating === 0, 'no toast floats over the page; any is in the bar', `${floating} floating`);
        await capture('in-progress');
        await tab.press('Escape');
      } finally {
        fs.writeFileSync(worldFile, JSON.stringify(prior));
      }
    },
  },
  'new-thread': {
    what: 'N, type a task, ⌘↵: the thread is filed, a worker is started on it, and its answer shows in the thread',
    async run({ tab, state, claim, capture }) {
      // With real Claude Code the task is one a model answers in a single turn
      // and the reply drive can check it remembers; with the stand-in, any title.
      const title = state.engine === 'stub'
        ? `Verify ${Date.now().toString(36)}: say hello`
        : `Verify ${Date.now().toString(36)}: reply with exactly the word ${WORD} and nothing else. Do not use any tools.`;
      await tab.until(`document.body.innerText.includes('Threads')`, { why: 'the inbox to draw' });
      await tab.press('n');
      const focused = await tab.until(`document.activeElement?.matches('textarea') && document.activeElement.placeholder`, { why: 'N to open the composer with the cursor in it' });
      claim(true, 'N opens the composer with the cursor in it', focused);
      await tab.type(title);
      await capture('composer');
      await tab.press('Enter', ['meta']);
      await tab.until(`document.body.innerText.includes(${JSON.stringify(title)})`, { why: 'the new thread to appear in the list' });
      await capture('sent');

      const row = await until(() => rows(state).find((r) => r.title === title), 10_000);
      claim(row, 'the store holds the thread', row?.id);
      if (!row) return;
      // The stand-in leaves a receipt; real Claude Code leaves only the session log.
      const receipt = state.engine === 'stub' ? await until(() => readJson(path.join(state.receipts, `${row.id}.json`)), 30_000) : null;
      const logs = await until(() => sessionLogs(state, row.id).length, 30_000);
      claim(state.engine === 'stub' ? receipt : logs, 'a worker was started on it', receipt ? `cwd ${path.basename(receipt.cwd)}` : `${logs ?? 0} session log(s)`);
      if (receipt) {
        const leaked = Object.keys(receipt.env).filter((k) => /^(ANTHROPIC_|OPENAI_)/.test(k) || k === 'CLAUDE_CODE_USE_BEDROCK');
        claim(!leaked.length, 'the worker was handed no API key (it bills the subscription)', leaked.join(', '));
        // A project with code gets a folder per task. The installed app files a
        // new thread in its own "My workspace", which has no repository, and the
        // worker works in that project's folder, which is not anybody's checkout.
        const repo = state.repos?.[row.product];
        if (repo) claim(receipt.cwd !== repo && receipt.cwd.includes(row.id), 'the worker runs in a folder of its own, not the project checkout', receipt.cwd.replace(state.instance, '…'));
        else claim(!Object.values(state.repos ?? {}).includes(receipt.cwd) && receipt.cwd.endsWith(row.product), 'a project without code: the worker runs in that project\'s own folder, not a checkout', receipt.cwd.replace(state.instance, '…'));
        claim(receipt.env.ZERO_ITEM === row.id, 'the worker is told which thread it is on', receipt.env.ZERO_ITEM);
      }
      const answered = await until(() => rows(state).find((r) => r.id === row.id && String(r.result ?? '').trim()), state.engine === 'stub' ? 30_000 : 300_000);
      claim(answered, 'the worker\'s answer is written onto the thread', String(answered?.result ?? '').slice(0, 80));

      // Open it the way a person does: the list row, then read what they read.
      claim(await openThread(tab, rows(state).find((r) => r.id === row.id) ?? row), 'the thread opens from the list');
      if (answered) {
        const shown = await tab.until(`document.body.innerText.includes(${JSON.stringify(String(answered.result).trim().split('\n')[0].slice(0, 40))})`, { why: 'the answer to show in the open thread', ms: 15_000 }).catch(() => false);
        claim(shown, 'the open thread shows the answer');
      }
      const opened = await whoOpenedOnScreen(tab);
      claim(opened.who === 'you', 'the thread says you opened it, not an agent', opened.saw);
      await tab.wait(600);
      await capture('thread');
    },
  },
  'codex-thread': {
    what: 'a thread sent to Codex from the composer runs on the real codex binary, its answer lands on that thread, and it shows under Needs you',
    async run({ tab, state, claim, capture }) {
      if (state.engine === 'stub' && !state.codexBin) return claim(false, 'this Mac has Codex installed (the drive runs the real codex binary)', 'none found', { known: 'no codex on this Mac' });
      const tok = `cx${Date.now().toString(36)}`;
      const title = state.engine === 'stub'
        ? `Verify Codex [[tok:${tok}]]`
        : `Verify ${tok}: reply with exactly the word MANGO and nothing else. Do not run any commands.`;
      const { row, picked } = await compose(tab, state, title, { engine: 'codex' });
      claim(picked, 'the composer offers Codex and it can be picked', picked ?? 'no Codex column in the model menu');
      await capture('sent');
      if (!claim(row, 'the store holds the thread', row?.id)) return;
      claim(row.engine === 'codex', 'the thread is stored as a Codex thread', `engine ${row.engine ?? 'unset'}`);
      if (state.engine === 'stub') {
        const asked = await until(() => fs.existsSync(path.join(state.instance, 'codex-model.log'))
          && fs.readFileSync(path.join(state.instance, 'codex-model.log'), 'utf8').includes(tok), 60_000);
        claim(asked, 'real codex started and asked its model about this thread');
      } else {
        claim(await until(() => sessionLogs(state, row.id).length, 60_000), 'a Codex worker was started on it');
      }
      const word = state.engine === 'stub' ? tok : 'MANGO';
      const answered = await until(() => rows(state).find((r) => r.id === row.id && String(r.result ?? '').includes(word)), state.engine === 'stub' ? 90_000 : 300_000);
      claim(answered, 'Codex\'s answer is written onto this thread', String(rows(state).find((r) => r.id === row.id)?.result ?? '(none)').slice(0, 80));
      claim(await inNeedsYou(tab, title, rows(state).find((r) => r.id === row.id)), 'the answered thread is under Needs you');
      await capture('needs-you');
      claim(await openThread(tab, rows(state).find((r) => r.id === row.id) ?? row), 'the thread opens from the list');
      await capture('thread');
    },
  },
  'many-at-once': {
    what: 'six tasks sent back to back across two projects and both engines: each is answered, each answer lands on its own thread in its own project, all show under Needs you, and no worker is left running',
    async run({ tab, state, claim, capture }) {
      const stamp = Date.now().toString(36);
      const plan = [0, 1, 2, 3, 4, 5].map((i) => ({
        // Picked every time: the composer keeps the last model chosen.
        engine: (state.codexBin || state.engine === 'real') && i % 2 ? 'codex' : 'claude',
        project: i % 3 === 2 ? 'Second' : 'Sandbox',
        tok: `M${i}${stamp}`,
      }));
      const real = state.engine === 'real';
      const made = [];
      for (const p of plan) {
        const title = real
          ? `Verify ${p.tok}: reply with exactly ${p.tok} and nothing else. Do not run any commands.`
          : `At once ${p.tok} [[stub:slow:4000]] [[tok:${p.tok}]]`;
        const { row } = await compose(tab, state, title, { engine: p.engine, project: p.project });
        made.push({ ...p, title, row });
      }
      await capture('sent');
      claim(made.every((m) => m.row), 'all six are stored', made.map((m) => m.row?.id ?? 'missing').join(' '));
      const slugOf = { Sandbox: 'sandbox', Second: 'second' };
      claim(made.every((m) => m.row?.product === slugOf[m.project]), 'each is filed under the project it was sent to',
        made.map((m) => `${m.project}→${m.row?.product}`).join(' '));
      claim(made.every((m) => (m.row?.engine ?? 'claude') === (m.engine ?? 'claude')), 'each runs on the engine it was sent to',
        made.map((m) => `${m.engine ?? 'claude'}→${m.row?.engine ?? 'claude'}`).join(' '));
      const resultOf = (m) => String(rows(state).find((x) => x.id === m.row?.id)?.result ?? '');
      const done = await until(() => made.every((m) => resultOf(m).includes(m.tok)), real ? 600_000 : 150_000);
      claim(done, 'every task is answered, and each answer carries its own task\'s token (none crossed)',
        made.map((m) => `${m.tok}:${resultOf(m).includes(m.tok) ? 'ok' : resultOf(m).slice(0, 30) || 'none'}`).join(' '));
      const all = rows(state);
      claim(made.every((m) => all.filter((r) => r.title === m.title).length === 1), 'no task was duplicated');
      const listed = [];
      for (const m of made) listed.push(await inNeedsYou(tab, m.title, rows(state).find((x) => x.id === m.row?.id)));
      claim(listed.every(Boolean), 'all six are under Needs you', listed.map((x) => (x ? 'y' : 'n')).join(''));
      await capture('needs-you');
      // Workers end once answered. The Codex app-server is one long-lived
      // process by design, so it is not counted.
      const left = await until(() => {
        const out = execFileSync('ps', ['-Ao', 'command='], { encoding: 'utf8' }).split('\n')
          .filter((l) => l.includes(state.instance) && /stub-claude-worker|codex exec/.test(l));
        return out.length === 0 ? 'none' : null;
      }, 40_000);
      claim(left, 'no worker is left running after its answer');
    },
  },
  'restart-mid-run': {
    what: 'quit and reopen the app (⌘Q, an update) while a Claude and a Codex task are mid-run: both still get exactly one answer, under Needs you',
    stubOnly: 'needs workers slow enough to be caught mid-run',
    notInstalled: 'a restart of the installed app is a relaunch through open; this drive runs on the browser copy',
    run: (ctx) => interruptMidRun(ctx, 'quit'),
  },
  'ctrl-c-mid-run': {
    what: 'Control-C the terminal running the browser copy while a Claude and a Codex task are mid-run, then start it again: both still get exactly one answer',
    stubOnly: 'needs workers slow enough to be caught mid-run',
    notInstalled: 'Control-C is how the browser copy is stopped, not the installed app',
    run: (ctx) => interruptMidRun(ctx, 'ctrl-c'),
  },
  'reply-lands-where-shown': {
    what: 'two replies sent quickly, the second after the app has moved on: each lands on the thread that was on screen when it was sent',
    stubOnly: 'tells threads apart by the token in each stand-in answer',
    async run({ tab, state, claim, capture }) {
      const stamp = Date.now().toString(36);
      // Three, because with more than one other thread waiting the app moves on
      // to the next after a reply instead of back to the list.
      const made = {};
      for (const k of ['A', 'B', 'C']) made[k] = (await compose(tab, state, `Reply ${k} [[tok:Q${k}${stamp}]]`, { engine: 'claude' })).row;
      const answered = await until(() => Object.entries(made).every(([k, r]) => String(rows(state).find((x) => x.id === r.id)?.result ?? '').includes(`Q${k}${stamp}`)), 40_000);
      if (!claim(answered, 'all three threads are answered first')) return;
      // Which thread is open, read off its pane: each answer carries its own token.
      const shown = () => tab.evaluate(`(() => { const t = document.querySelector('.focus-pane')?.innerText ?? '';
        return ['A', 'B', 'C'].find((k) => t.includes('Q' + k + '${stamp}')) ?? null; })()`);
      // Opened the way a person works through Needs you: the tab, then the keys.
      await tab.press('Escape');
      await clickTab(tab, /^needs you/i);
      await tab.press('Enter');
      await tab.wait(800);
      const before = await shown();
      claim(before, 'a thread opens from Needs you with ↵', before ?? 'none');
      if (!before) return;
      const ledgerHas = (row, words) => readLedger(state, row.product).some((l) => l.id === row.id && JSON.stringify(l).includes(words));
      await tab.press('r');
      await tab.until(`document.activeElement?.matches('textarea, [contenteditable="true"]')`, { ms: 8000 });
      await tab.type(`reply one ${stamp}`);
      await tab.press('Enter', ['meta']);
      claim(await until(() => ledgerHas(made[before], `reply one ${stamp}`), 10_000), `the first reply is on thread ${before}, the one on screen`);
      await tab.wait(1200);
      const next = await shown();
      await capture('after-first-reply');
      await tab.press('r');
      const box = await tab.until(`document.activeElement?.matches('textarea, [contenteditable="true"]')`, { ms: 8000 }).catch(() => false);
      if (!next || !box) {
        claim(true, 'after the first reply the app left the thread, so there is no second thread to reply on', `on screen: ${next ?? 'the list'}`);
        return;
      }
      await tab.type(`reply two ${stamp}`);
      await tab.press('Enter', ['meta']);
      const target = made[next];
      claim(await until(() => ledgerHas(target, `reply two ${stamp}`), 10_000), `the second reply is on thread ${next}, the one on screen when it was sent`);
      claim(Object.entries(made).every(([k, r]) => k === next || !ledgerHas(r, `reply two ${stamp}`)), 'and on no other thread');
      await capture('after-second-reply');
    },
  },
  'one-login-runs-out': {
    what: 'two Claude logins, the second out of usage: every task still gets answered, the one that hit the limit moves to the free login within a minute',
    stubOnly: 'needs a login that runs out on demand',
    async run({ tab, state, claim, capture }) {
      // Two tasks, so round-robin puts one of them on each login.
      const made = [];
      for (const n of [1, 2]) made.push((await compose(tab, state, `Login out ${n} [[stub:limit-on:.claude-second]] [[tok:LO${n}${Date.now().toString(36)}]]`, { engine: 'claude' })).row);
      claim(made.every(Boolean), 'both tasks are stored');
      const spawned = (id) => spawnsOf(state, id);
      const hit = await until(() => made.find((r) => spawned(r.id).some((s) => s.login.endsWith('.claude-second'))), 30_000);
      claim(hit, 'one task landed on the login that is out', hit ? spawned(hit.id).map((s) => path.basename(s.login)).join(' → ') : 'neither did; round-robin put both on the free login');
      const answered = await until(() => made.every((r) => /\[LO/.test(String(rows(state).find((x) => x.id === r.id)?.result ?? ''))), 60_000);
      claim(answered, 'every task is answered within a minute, the limited one included',
        made.map((r) => String(rows(state).find((x) => x.id === r.id)?.result ?? '').slice(0, 60)).join(' | '));
      if (hit) {
        const trail = spawned(hit.id).map((s) => path.basename(s.login));
        claim(trail.length >= 2 && trail.at(-1) === 'default', 'the limited task was moved to the free login', trail.join(' → '));
      }
      await capture('answered');
    },
  },
  'every-login-runs-out': {
    what: 'every Claude login and the Codex login out of usage: each task says so in plain words with when it resumes, sits where the person looks, and is not retried in a loop',
    stubOnly: 'needs logins that run out on demand',
    async run({ tab, state, claim, capture }) {
      const claude = (await compose(tab, state, `Out everywhere [[stub:limit]] [[tok:OE${Date.now().toString(36)}]]`, { engine: 'claude' })).row;
      const codex = state.codexBin ? (await compose(tab, state, `Codex out [[stub:limit]] [[tok:CO${Date.now().toString(36)}]]`, { engine: 'codex' })).row : null;
      const said = (r) => String(rows(state).find((x) => x.id === r.id)?.result ?? '');
      claim(await until(() => /usage limit/i.test(said(claude)), 45_000), 'the Claude task says it is at its usage limit', said(claude).slice(0, 120));
      claim(/11:59pm/.test(said(claude)), 'and says when it starts again (the reset time the CLI printed)');
      if (codex) claim(await until(() => /Codex is at its usage limit/i.test(said(codex)), 90_000), 'the Codex task says Codex is at its usage limit', said(codex).slice(0, 120));
      // A minute of watching: no retry storm. At most one attempt per login.
      await tab.wait(45_000);
      const tries = spawnsOf(state, claude.id).length;
      claim(tries >= 1 && tries <= 2, 'the Claude task was tried at most once per login, not in a loop', `${tries} attempt(s) on 2 logins`);
      claim(await inNeedsYou(tab, claude.title, rows(state).find((r) => r.id === claude.id)), 'the stopped task is under Needs you, where the person looks');
      await capture('needs-you');
      await openThread(tab, rows(state).find((r) => r.id === claude.id) ?? claude);
      claim(!/It handed this back/.test(await tab.text()), 'the thread does not claim the agent handed it back (the app wrote its own note)');
      await capture('thread');
      if (!codex) return;
      // A NEW Codex task while Codex is out: nothing can start it until the
      // reset, so it must say that, not "Queued … as soon as one is free" (the
      // breaker's finding, 2026-10-12).
      await tab.press('Escape');
      const next = (await compose(tab, state, `After Codex ran out [[tok:AC${Date.now().toString(36)}]]`, { engine: 'codex' })).row;
      if (!claim(next, 'a new Codex task can still be sent')) return;
      await tab.until(`/Codex is out|Started in/.test(document.querySelector('.toast-line')?.innerText ?? '')`, { why: 'the line after Send', ms: 8000 }).catch(() => {});
      const sentSaid = await tab.evaluate(`document.querySelector('.toast-line')?.innerText ?? ''`);
      await capture('sent-while-codex-is-out');
      claim(/^Codex is out/.test(sentSaid) && !/Started/.test(sentSaid),
        'the line after Send says it is waiting for Codex, not "Started" (the breaker\'s finding, 2026-10-15)', sentSaid);
      await tab.wait(3000);
      await openThread(tab, rows(state).find((r) => r.id === next.id) ?? next);
      const text = await tab.text();
      claim(/Codex is at its usage limit, so this starts on its own when it resets/.test(text) && !/as soon as one is free/.test(text),
        'a new Codex task says Codex is at its usage limit, not that it is queued', (text.match(/Codex is at[^\n]*|Queued[^\n]*/) ?? ['neither'])[0].slice(0, 120));
      await capture('new-codex-task-at-limit');
    },
  },
  'undo-says-what-happened': {
    what: 'Z says what really happened: on a task the agent already answered it says too late, and after a close it says the thread is still open (the breaker\'s findings, 2026-10-15)',
    stubOnly: 'needs a task that takes thirty seconds on demand',
    async run({ tab, state, claim, capture }) {
      const toast = () => tab.evaluate(`document.querySelector('.toast-line')?.innerText ?? ''`);
      const pressZ = async () => {
        await tab.press('z');
        await tab.wait(400);
        // Past thirty seconds a first Z only asks; the second one does it.
        if (/Press Z again/.test(await toast())) { await tab.press('z'); await tab.wait(400); }
      };

      // 1. A quick task, answered before Z.
      const quick = (await compose(tab, state, `Quick one [[tok:UQ${Date.now().toString(36)}]]`, { engine: 'claude' })).row;
      if (!claim(quick, 'the quick task is stored')) return;
      claim(await until(() => String(rows(state).find((r) => r.id === quick.id)?.result ?? '').includes('UQ'), 30_000), 'the agent answered it');
      await pressZ();
      const tooLate = await toast();
      await capture('z-after-answer');
      claim(/Too late/.test(tooLate) && !/Withdrawn/.test(tooLate), 'Z on an answered task says it was too late, not "Withdrawn"', tooLate);
      claim(rows(state).find((r) => r.id === quick.id)?.status !== 'done', 'and the answered task is not closed away into Done');
      claim(!(await tab.evaluate(`!!document.querySelector('textarea.tc-text')`)), 'and the words are not put back in a composer to send twice');
      await tab.press('Escape');

      // 2. Close a running task, then Z inside the window.
      const slow = (await compose(tab, state, `Slow one [[stub:slow:30000]] [[tok:US${Date.now().toString(36)}]]`, { engine: 'claude' })).row;
      if (!claim(slow, 'the slow task is stored')) return;
      await until(() => sessionLogs(state, slow.id).length, 20_000);
      await openThread(tab, rows(state).find((r) => r.id === slow.id) ?? slow);
      await tab.press('e');
      await tab.wait(500);
      await tab.press('z');
      await tab.wait(400);
      const reopened = await toast();
      await capture('z-after-close');
      claim(/Still open/.test(reopened) && !/Nothing was sent/.test(reopened), 'Z after closing a running task says it is still open, not "Nothing was sent"', reopened);
      await tab.wait(3500);
      claim(rows(state).find((r) => r.id === slow.id)?.status !== 'done', 'and the task was not closed');
      // Close it for real, so its worker stops and frees the login for the
      // drives after this one.
      await tab.press('e');
      await until(() => rows(state).find((r) => r.id === slow.id)?.status === 'done', 10_000);
      await tab.press('Escape');
      // The third finding, a task sent while Codex is out of usage, is checked
      // in every-login-runs-out: only the last drive may leave a login resting.
    },
  },
  'setup-task': {
    what: 'on a person\'s own Claude Code setup (live.mjs up --setup): one task, and the real Claude Code answers it, writes to the thread through the store tools, and bills nobody\'s API key',
    onlyOn: 'setup',
    async run({ tab, state, claim, capture }) {
      const { setupNamed } = await import('./setups.mjs');
      const setup = setupNamed(state.setup);
      if (setup.engine === 'codex') return codexSetupTask({ tab, state, claim, capture, setup });
      const expect = setup.expect;
      const known = (k) => ({ known: setup.known?.[k] ?? null });
      const tok = `su${Date.now().toString(36)}`;
      const title = `Setup ${tok}: reply with exactly the word ${WORD} and nothing else. [[tok:${tok}]]`;
      const { row } = await compose(tab, state, title, { engine: 'claude' });
      await capture('sent');
      if (!claim(row, 'the store holds the thread', row?.id)) return;
      claim(await until(() => sessionLogs(state, row.id).length, 30_000), 'a worker was started on it');
      const answered = await until(() => rows(state).find((r) => r.id === row.id && String(r.result ?? '').trim()), 120_000);
      const result = String(rows(state).find((r) => r.id === row.id)?.result ?? '');
      claim(!!answered === expect.answers && (!expect.answers || result.includes(WORD)), 'the answer lands on the thread', result.slice(0, 80) || '(none)', known('answers'));

      // What Claude Code sent the model, as this person's setup shaped it.
      const asked = fs.existsSync(path.join(state.instance, 'claude-model.log'))
        ? fs.readFileSync(path.join(state.instance, 'claude-model.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.task && e.token === tok)
        : [];
      claim(asked.length, 'the real Claude Code asked the model about this thread', `${asked.length} task turn(s)`);
      const offered = asked.find((e) => e.mcp.some((n) => /__update_work_item$/.test(n)));
      claim(!!offered === expect.store, 'Claude Code offered the worker the app\'s store tools',
        offered ? offered.mcp.filter((n) => /work_item/.test(n)).slice(0, 2).join(', ') : `mcp tools: ${asked[0]?.mcp.slice(0, 4).join(', ') || 'none'}${asked[0]?.deferred ? ' (tools deferred behind ToolSearch)' : ''}`, known('store'));
      const note = await until(() => readLedger(state, row.product).some((l) => l.id === row.id && String(l.patch?.note ?? '').includes(tok)), 10_000);
      const toolBack = asked.find((e) => e.toolResult)?.toolResult;
      claim(!!note === expect.store, 'the worker\'s note reached the thread through the store tool',
        note ? 'in the ledger' : toolBack ? `tool said: ${toolBack.text.slice(0, 120)}` : 'never called', known('store'));
      const signed = [...new Set(asked.map((e) => e.auth))];
      const billedKey = signed.includes('api-key');
      claim(expect.billing === 'subscription' ? !billedKey : billedKey, 'no API key the person left in a settings file was used (the plan pays, not a key)',
        `signed: ${signed.join(', ') || 'nothing'}`, known('billing'));
      for (const c of setup.check?.(state.home) ?? []) claim(c.ok, c.sentence, c.evidence, known(c.key ?? 'check'));
      claim(await openThread(tab, rows(state).find((r) => r.id === row.id) ?? row), 'the thread opens from the list');
      await capture('thread');
    },
  },
  'reply': {
    what: 'open an answered thread, R, type a reply, ⌘↵: the reply is stored, a worker takes it and its answer lands (with --real-claude, it also remembers the first turn)',
    async run({ tab, state, claim, capture }) {
      const done = rows(state).filter((r) => String(r.result ?? '').trim()).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!claim(done, 'there is an answered thread to reply to (run the new-thread drive first)')) return;
      const before = sessionLogs(state, done.id).length;
      await tab.until(`document.body.innerText.includes('Threads')`);
      claim(await openThread(tab, done), 'the thread opens from the list');
      await tab.press('r');
      const focused = await tab.until(`document.activeElement?.matches('textarea, [contenteditable="true"]')`, { why: 'R to put the cursor in the reply box', ms: 8000 }).catch(() => false);
      claim(focused, 'R puts the cursor in the reply box');
      const stamp = Date.now().toString(36);
      const reply = state.engine === 'stub'
        ? `And once more, ${stamp}`
        : `Which word did you just reply with? Answer with only that word. Do not use any tools. (${stamp})`;
      await tab.type(reply);
      await capture('reply-typed');
      const sentAt = Date.now();
      await tab.press('Enter', ['meta']);
      const heard = await until(() => readLedger(state, done.product).some((l) => l.id === done.id && JSON.stringify(l).includes(stamp)), 10_000);
      claim(heard, 'the reply is written to the thread in the store');
      const started = await until(() => sessionLogs(state, done.id).length > before, 30_000);
      claim(started, 'a worker session is started for the reply', `${before} → ${sessionLogs(state, done.id).length} session logs`);
      const answered = await until(() => {
        const r = rows(state).find((x) => x.id === done.id);
        return (r?.wrote?.result?.ts ?? 0) > sentAt && String(r.result ?? '').trim() ? r : null;
      }, state.engine === 'stub' ? 30_000 : 300_000);
      claim(answered, 'the answer to the reply is written onto the thread', String(answered?.result ?? '').slice(0, 80));
      // MEMORY, PROVED BY BEHAVIOUR. The stand-in leaves no Claude Code
      // transcript, so the app (rightly) cannot resume it and re-briefs instead;
      // only a real session can show the thread's context carried over.
      // On a setup, a gap already filed for that setup reads KNOWN.
      const memoryKnown = state.setup ? ((await import('./setups.mjs')).setupNamed(state.setup)?.known?.memory ?? null) : null;
      if (state.engine !== 'stub' && answered) claim(String(answered.result).includes(WORD), `the answer remembers the first turn (${WORD})`, String(answered.result).slice(0, 60), { known: memoryKnown });
      await tab.wait(800);
      await capture('after-reply');
    },
  },
};
