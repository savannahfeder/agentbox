// WHAT A POWER TEST DECIDES, KEPT APART FROM WHAT IT RUNS, SO IT CAN BE TESTED:
// who tests, what goes wrong around them and when, whether another round
// starts, what they have not tried yet, and what they are told.
import fs from 'node:fs';
import path from 'node:path';

const NUMBER = /^\d+$/;
const YES = /^(yes|true)$/i;
const NO = /^(no|false)$/i;

/** One person file: front matter, the whole text, and the numbered day and the plate as lists. */
export function readPerson(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${path.basename(file)} has no front matter`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const at = line.indexOf(':');
    if (at < 0) continue;
    const raw = line.slice(at + 1).trim();
    meta[line.slice(0, at).trim()] = NUMBER.test(raw) ? Number(raw) : YES.test(raw) ? true : NO.test(raw) ? false : raw;
  }
  const body = m[2].trim();
  const section = (title) => {
    const s = body.split(/\n## /).find((part) => part.toLowerCase().startsWith(title));
    return s ? s.split('\n').slice(1).map((l) => l.trim()).filter((l) => /^(\d+\.|-)\s/.test(l)).map((l) => l.replace(/^(\d+\.|-)\s+/, '')) : [];
  };
  return {
    slug: path.basename(file, '.md'),
    name: meta.name,
    role: meta.role,
    logins: meta.logins ?? 1,
    codex: meta.codex ?? false,
    projects: String(meta.projects ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    pace: meta.pace ?? 'steady',
    atOnce: meta['at-once'] ?? 3,
    history: meta.history ?? 0,
    knowsKeys: meta['knows-keys'] ?? true,
    day: section('your day'),
    plate: section('on your plate'),
    text: body,
  };
}

export function readPeople(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort().map((f) => readPerson(path.join(dir, f)));
}

/** `all`, `random:N`, or names joined by commas. Unknown names are refused with the list. */
export function pickPeople(spec, people, rand = Math.random) {
  const want = String(spec ?? 'random:2').trim();
  if (want === 'all') return people;
  const random = /^random(?::(\d+))?$/.exec(want);
  if (random) {
    const n = Math.min(Number(random[1] ?? 1), people.length);
    const pool = [...people];
    const picked = [];
    while (picked.length < n) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    return picked;
  }
  return want.split(',').map((s) => s.trim()).filter(Boolean).map((slug) => {
    const p = people.find((x) => x.slug === slug);
    if (!p) throw new Error(`nobody called "${slug}". The pool: ${people.map((x) => x.slug).join(', ')}`);
    return p;
  });
}

/**
 * Which of a person's projects a past task names, by index, or undefined.
 * Seeded history files a task that names a project there, or a tester rightly
 * calls it misfiled.
 */
export function projectNamedIn(title, projects) {
  const at = projects.findIndex((p) => new RegExp(`\\b${p.replace(/[^\w ]/g, '.')}\\b`, 'i').test(title));
  return at >= 0 ? at : undefined;
}

export const CHAOS = ['none', 'light', 'normal', 'heavy'];
export const LOGIN_NAMES = ['default', '.claude-second', '.claude-third', '.claude-fourth'];

/**
 * What goes wrong around the tester, and when, as fractions of the test's
 * length so a 30-minute test and an 8-hour one see the same day. Logins
 * running out, slow or dying agents are the stand-ins' world (world.json), so
 * a test on real tools gets only what happens to the app itself: a restart, a
 * freeze, a Control-C. The tester is never told; a person learns of these from
 * the app, and whether the app says so is the test.
 */
export function chaosPlan(level, totalMs, { real = false, cloud = false, logins = 2, codex = true } = {}) {
  if (!CHAOS.includes(level)) throw new Error(`chaos is one of ${CHAOS.join(', ')}`);
  if (level === 'none') return [];
  const at = (f) => Math.round(totalMs * f);
  if (cloud) return cloudDay(level, totalMs, at);
  const names = LOGIN_NAMES.slice(0, Math.max(1, logins));
  const share = { light: 0.01, normal: 0.02, heavy: 0.05 }[level];
  const events = [];
  if (!real) {
    events.push({ kind: 'agents', at: 0, until: totalMs, world: { pace: { minMs: 5_000, maxMs: 90_000 }, options: 0.3, hang: share, die: share },
      says: `Agents answer in 5 to 90 seconds; ${Math.round(share * 100)}% hang and ${Math.round(share * 100)}% die mid-run, as real ones sometimes do.` });
    if (names.length > 1) events.push({ kind: 'login-out', at: at(0.2), until: at(0.4), out: [names[1]], says: `The ${names[1]} login ran out of usage.` });
    if (codex && level !== 'light') events.push({ kind: 'codex-out', at: at(0.45), until: at(0.55), out: ['codex'], says: 'Codex ran out of usage.' });
    if (level !== 'light') events.push({ kind: 'all-out', at: at(0.62), until: at(0.7), out: names, says: 'Every Claude login ran out of usage.' });
    if (level === 'heavy') events.push({ kind: 'slow-agents', at: at(0.8), until: at(0.9), world: { pace: { minMs: 60_000, maxMs: 300_000 } }, says: 'Agents slowed to 1 to 5 minutes an answer.' });
  }
  if (level !== 'light') {
    events.push({ kind: 'restart', at: at(0.5), says: 'The app quit and opened again, as an update or a restart does.' });
    const ms = Math.min(180_000, Math.max(30_000, Math.round(totalMs * 0.05)));
    // Only the app's processes stop; the window keeps going, as when the app hangs or wakes slower than the screen.
    events.push({ kind: 'sleep', at: at(0.75), ms, says: `The app froze for ${Math.round(ms / 1000)} seconds and then carried on.` });
  }
  if (level === 'heavy') events.push({ kind: 'crash', at: at(0.85), says: 'The app was stopped with Control-C mid-run, its agents with it, and opened again.' });
  return events.sort((a, b) => a.at - b.at);
}

// How long the cloud waits without a word from the Mac before it calls the
// Mac away (main/cloud/run.mjs OFFLINE_AFTER_MS). A sleep shorter than this
// never reaches the cloud's away path.
export const CLOUD_AWAY_MS = 90_000;

/**
 * The cloud's day (--cloud): what a laptop does to runs that live elsewhere.
 * A sleep stops the whole Mac, the cloud relay included (`whole`), for longer
 * than the cloud waits before calling it away; `closed` quits the app and
 * leaves it shut for minutes, as at lunch, before it opens again.
 */
function cloudDay(level, totalMs, at) {
  const clamp = (ms, lo, hi) => Math.min(hi, Math.max(lo, Math.round(ms)));
  const sleep = (f, ms) => ({ kind: 'sleep', at: at(f), ms, whole: true, says: `The Mac slept for ${Math.round(ms / 60_000 * 10) / 10} min, the app and its cloud relay with it, and woke.` });
  const longSleep = clamp(totalMs * 0.03, 2 * 60_000, 6 * 60_000);
  if (level === 'light') return [{ kind: 'restart', at: at(0.3), says: 'The app quit and opened again, as an update or a restart does.' }, sleep(0.6, longSleep)];
  const shut = clamp(totalMs * 0.06, 3 * 60_000, 15 * 60_000);
  const events = [
    { kind: 'restart', at: at(0.12), says: 'The app quit and opened again, as an update or a restart does.' },
    sleep(0.25, longSleep),
    { kind: 'closed', at: at(0.38), ms: shut, says: `The app was quit and left shut for ${Math.round(shut / 60_000)} min, then opened again.` },
    { kind: 'crash', at: at(0.52), says: 'The app was stopped with Control-C mid-run, its agents with it, and opened again.' },
    { kind: 'restart', at: at(0.66), says: 'The app quit and opened again, as an update or a restart does.' },
    sleep(0.8, 2 * 60_000),
  ];
  if (level === 'heavy') events.push({ kind: 'crash', at: at(0.9), says: 'The app was stopped with Control-C mid-run, its agents with it, and opened again.' });
  return events;
}

/** The stand-ins' world at one moment: every window open then, merged; `out` is the union. */
export function worldAt(events, elapsed) {
  const world = {};
  const out = new Set();
  for (const e of events) {
    if (e.until == null || elapsed < e.at || elapsed >= e.until) continue;
    if (e.world) Object.assign(world, e.world);
    for (const o of e.out ?? []) out.add(o);
  }
  if (out.size) world.out = [...out];
  return world;
}

/** Whether to try again to bring back a copy whose restart failed: once a minute, and only while the clock runs. */
export function restartAgain({ down, now, deadline, everyMs = 60_000 }) {
  return !!down && now < deadline && now - down.tried >= everyMs;
}

/**
 * Whether another round starts. The clock owns the test, not the tester: a
 * tester that decides it is done after two minutes gets another round. What
 * ends it is the clock, or a tester that cannot act at all (three rounds in a
 * row with nothing done, or one it cannot sign in for), so nothing retries for
 * ever.
 */
export function nextRound({ now, deadline, roundMs, idleInARow = 0, lastOutcome = null, maxIdle = 3, minRoundMs = 60_000 }) {
  if (lastOutcome === 'signed-out') return { go: false, why: 'the tester could not sign in to Claude Code' };
  if (lastOutcome === 'tester-out') return { go: false, why: 'the tester\'s own Claude Code ran out of usage' };
  if (idleInARow >= maxIdle) return { go: false, why: `the tester did nothing in ${idleInARow} rounds in a row` };
  if (deadline - now < minRoundMs) return { go: false, why: 'time is up' };
  return { go: true, endsAt: Math.min(now + roundMs, deadline) };
}

/** What a round amounted to, from the actions it took and the last words of its session. */
export function roundOutcome({ actions, text = '' }) {
  if (/not logged in|invalid api key|please run \/login|authentication_error|OAuth token has expired/i.test(text) && actions === 0) return 'signed-out';
  if (/hit your (session |weekly )?limit|usage limit reached|rate_limit_error/i.test(text) && actions === 0) return 'tester-out';
  return actions >= 3 ? 'acted' : 'idle';
}

/** Which part of their day a tester is in, by how far through the test it is. */
export function phaseAt(person, fraction) {
  if (!person.day.length) return 'An ordinary working day.';
  return person.day[Math.min(person.day.length - 1, Math.floor(Math.max(0, fraction) * person.day.length))];
}

/**
 * What the tester has and has not done today, from the keys they pressed and
 * what the app wrote down. The not-yet list is handed to the next round,
 * which is what turns "all looks great" after two minutes into another hour.
 */
export function coverage({ actions = [], lines = [], seeded = new Set(), maxAtOnce = 0, person }) {
  const lastAsk = new Map();
  const askCount = new Map();
  const answeredAt = new Map();
  let replies = 0;
  let replyWhileRunning = 0;
  const engines = new Set();
  const models = new Set();
  const projects = new Set();
  for (const l of lines.filter((x) => !seeded.has(x.id)).sort((a, b) => a.ts - b.ts)) {
    const p = l.patch ?? {};
    if (l.source !== 'founder') {
      if (p.result) answeredAt.set(l.id, l.ts);
      continue;
    }
    if (p.engine) engines.add(p.engine);
    if (p.model) models.add(p.model);
    // A title is an ask when it opens the thread; later it is a rename.
    if (!p.answer && (!p.title || lastAsk.has(l.id))) continue;
    if (p.answer) {
      replies++;
      if ((lastAsk.get(l.id) ?? 0) > (answeredAt.get(l.id) ?? 0)) replyWhileRunning++;
    }
    if (!lastAsk.has(l.id) && l.product) projects.add(l.product);
    lastAsk.set(l.id, l.ts);
    askCount.set(l.id, (askCount.get(l.id) ?? 0) + 1);
  }
  const threads = lastAsk.size;
  const longest = Math.max(0, ...askCount.values());
  const pressed = (key, mod = null) => actions.some((a) => a.verb === 'press' && String(a.args?.[0]).toLowerCase() === key && (!mod || a.args?.includes(mod)));
  const verb = (v) => actions.filter((a) => a.verb === v).length;
  const checks = [
    [threads >= 3, `${threads} threads sent`, 'sending a handful of threads'],
    [maxAtOnce >= person.atOnce, `${maxAtOnce} going at once at the busiest`, `having ${person.atOnce} threads going at once, as you do on a busy day`],
    [replies >= 3, `${replies} replies`, 'replying to answers, and keeping a conversation going'],
    [replyWhileRunning > 0, 'replied while an agent was still working', 'replying to a thread while its agent is still working'],
    [longest >= 5, `a thread ${longest} messages long`, 'one long thread: five or more messages back and forth'],
    ...(person.codex ? [[engines.has('codex'), 'used Codex', 'sending some work to Codex instead of Claude Code']] : []),
    [models.size >= 2, `${models.size} models`, 'picking a different model for a thread or a reply'],
    ...(person.projects.length > 1 ? [[projects.size >= 2, `${projects.size} projects`, 'working in more than one of your projects']] : []),
    [pressed('e'), 'closed threads', 'closing threads you are done with (E)'],
    [pressed('z'), 'used undo', 'undoing something (Z)'],
    [pressed('l'), 'put one off', 'putting a thread off until later (L)'],
    [pressed('/'), 'searched', 'searching your threads (/)'],
    [pressed('b'), 'used the board', 'switching to the board (B)'],
    [pressed('k', 'meta'), 'used the command bar', 'the command bar (⌘K)'],
    [actions.some((a) => a.verb === 'press' && /^[1-9]$/.test(String(a.args?.[0]))), 'picked an option', 'picking one of the options an agent offered (1 to 9)'],
    [verb('reload') > 0, 'reloaded', 'reloading the app mid-work'],
    [verb('away') > 0, 'stepped away', 'stepping away and coming back to see what landed'],
    [verb('shot') > 0, 'took pictures', 'taking a picture of anything odd'],
  ];
  return { did: checks.filter(([ok]) => ok).map(([, d]) => d), notYet: checks.filter(([ok]) => !ok).map(([, , n]) => n), threads, replies };
}

const PACE = {
  fast: 'You look at the app every minute or two and rarely step away for long.',
  steady: 'You come back to the app every five minutes or so; use away for the gaps.',
  'between-meetings': 'You are in meetings or calls most of the day: step away for 15 to 40 minutes at a time (away 9, several in a row), then work in short bursts.',
};

const KEYS = 'N new thread; ⌘↵ (press Enter meta) sends; J/K or arrows move in the list; ↵ opens; esc goes back; R replies in an open thread; E closes a thread; L puts it off until later; Z undoes; ⌘K (press k meta) opens the command bar; / searches; B switches list and board; Tab moves between the tabs; S shows or hides the summary; 1 to 9 pick an option an agent offered.';

export function testerPrompt({ person, focus, room = null, browse, diary, shots, round, totalMinutes, minutesLeft, roundMinutes, fraction, diaryTail, issues, notYet, real, stoppedEarlyMin = 0 }) {
  const list = (xs, none) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : none);
  return `You are ${person.name}, ${person.role}. Below is who you are. Stay in character: use Agentbox the way you would on a real working day, to get your own work done, and notice what goes wrong the way you would.

${person.text}

THE APP
Agentbox is an inbox for AI coding agents. You write a task as a new thread; an agent (Claude Code, or Codex) takes it, works, and answers in the thread. You reply, pick one of the options it offers, close the thread, put it off, and so on. ${person.knowsKeys ? `You know its keys: ${KEYS}` : 'You installed it today and do not know its keys yet. Find your way around as a new person would.'}

You use the app through one command, run with Bash:
  ${browse} ${round === 1 ? 'open            (first, once)' : 'look            (the app is already open; start here)'}
  ${browse} look            (what is on screen, and numbered things you can press)
  ${browse} click 7         (press thing 7 from the last look; or click "New thread")
  ${browse} type "some text"
  ${browse} press n         (one key; add modifiers after: press Enter meta, press k meta)
  ${browse} shot name       (a picture; you can open it with Read: ${shots}/name.png)
  ${browse} away 5          (step away for up to 9 minutes, as you would between things, then look)
  ${browse} reload
Run look after anything that changes the screen.

${real
    ? 'The agents are real Claude Code and Codex on a real subscription, working in your projects\' repositories. Write tasks the way you normally would, but keep each one small enough to finish in a few minutes.'
    : 'The agents are stand-ins: they take a few seconds to a minute and a half and answer with a short note naming the task, not real work. Judge the app, not the answers. Write tasks the way you normally would.'}

TODAY'S TEST
${focus ? `The team shipped a change and asked you to lean on it today: ${focus}` : 'Nothing in particular: use it the way you always do.'}

${room ? `YOUR ROOM
You are signed in to a real team, and you are in the ${room} room, under Rooms in the sidebar. The person who asked for this test is in the room with you and reads it live, so it is like sharing an office: say hello when you start, tell them now and then what you are working on and how it is going, ask them when you are stuck or something in the app confused you, and answer when they write to you. Use the room the way you would with a coworker, not as a report. Look at their card, open their page, try what a room offers (a thread, a mention with @), and log anything about Rooms in your diary like anything else. Stay visible all day: they want to see you and what you are working on. Never go invisible, and if the menu under your name says you are, choose Come back.

` : ''}YOUR DIARY
You keep a diary while you work, and the person who asked you to test reads all of it.
  ${diary} note "what you did, what you expected, how it felt"
  ${diary} issue --severity broken|wrong|slow|confusing --title "..." --steps "1. ... 2. ..." --expected "..." --actual "..." --shot name
  ${diary} again 3 "what you saw this time"     (a logged issue happened again)
  ${diary} time                                 (how long is left)
Log an issue the moment you notice it, with a shot, before looking into it further. Anything counts: something broken, an answer on the wrong thread or not at all, a count that is wrong, a screen that is slow, words that confused you, a thing you could not find. Small ones are worth logging. A test with nothing logged is the test that failed.

HOW LONG
This is stretch ${round} of a working session of ${totalMinutes} minutes. ${minutesLeft} minutes are left, and this stretch ends in ${roundMinutes} minutes, when you will be stopped mid-action. That is expected.${stoppedEarlyMin >= 2 ? ` Last stretch you stopped ${stoppedEarlyMin} minutes early, which wasted them: keep using the app until you are stopped.` : ''} You are never done: when you run out of what you planned, do the next part of your day, go back to earlier threads, follow up on answers, and push harder on today's test. Never stop to write a summary; the diary is the summary.

WHERE YOU ARE IN YOUR DAY (${Math.round(fraction * 100)}% through)
${phaseAt(person, fraction)}
${PACE[person.pace] ?? PACE.steady}

WHAT YOU HAVE DONE SO FAR
${list(diaryTail, round === 1 ? 'Nothing yet: this is the start of your day. Open the app first.' : 'Your diary is empty, which is itself worth fixing: note what you do.')}

ISSUES YOU HAVE LOGGED
${list(issues, 'None yet.')}
For ones seen only once, try to see them again when it fits what you are doing, and use again.

NOT DONE YET TODAY
${list(notYet, 'You have tried everything on the usual list; go deeper on today\'s test.')}
Do the ones someone like you would do.

RULES
- Use only those two commands, and Read for your own pictures.
- Report only what you saw happen, with the steps. Do not guess at causes.
- Taste is not an issue unless it stopped you or confused you.`;
}
