// The one file a model writes for a lead is brief.json (BRIEF.md says how).
// checkBrief rejects anything that would make a wrong or broken film, and
// says for each problem where it is and what to change, so any model can fix
// it from the message alone. A brief that passes films without a person
// reading it; one that cannot pass is never filmed.

export const BANNED = ['seamless', 'effortless', 'unlock', 'supercharge', 'revolutioniz', 'empower', 'leverag', 'cutting-edge', 'next-generation', 'robust', 'elevate',
  'streamline', 'game-changer', 'harness', 'delve', 'synergy', 'world-class', 'best-in-class'];

// Names everyone knows, which need no quote from the company's site.
const COMMON = new Set(('API APIs SDK SDKs CLI CI CD UI UX URL URLs JSON CSV PDF SQL HTTP HTTPS REST GraphQL OAuth SSO SAML SCIM MCP LLM LLMs AI ID IDs '
  + 'iOS Android Mac macOS Windows Linux Chrome Safari Slack GitHub GitLab Linear Jira Notion Stripe Postgres PostgreSQL Redis Kafka S3 AWS GCP Azure Vercel Docker Kubernetes '
  + 'Python TypeScript JavaScript Go Rust Node React Next.js Swift Kotlin Claude Code Codex Cursor OpenAI Anthropic Google Gmail Outlook Zoom Okta Twilio Sentry Datadog '
  + 'Monday Tuesday Wednesday Thursday Friday Saturday Sunday Website Docs Dashboard Maya Chen Jordan Lee Sam Patel I'
  + ' US EU UK EUR USD SOC HIPAA GDPR CCPA PR PRs QA E2E 1Password Vault Postman Figma Webflow Supabase Firebase npm pip').split(' '));

import fs from 'node:fs';

const THREADS = ['bug', 'migration', 'fourth', 'jordan', 'sixth'];
const EXAMPLE = (() => { try { return JSON.parse(fs.readFileSync(new URL('../brief.example.json', import.meta.url), 'utf8')); } catch { return null; } })();
// Every line of words a brief puts on screen, with where it is.
function lines(b) {
  const out = [];
  for (const k of [...THREADS, 'maya']) for (const f of ['title', 'summary', 'ask', 'comment', 'reply', 'body']) if (typeof b[k]?.[f] === 'string') out.push([`${k}.${f}`, b[k][f]]);
  (b.headlines?.lines ?? []).forEach((s, i) => out.push([`headlines.lines[${i}]`, s]));
  for (const k of ['running', 'done']) (b[k] ?? []).forEach((r, i) => out.push([`${k}[${i}].title`, r.title]));
  for (const who of ['maya', 'jordan', 'sam']) (b.team?.[who]?.done ?? []).forEach((s, i) => out.push([`team.${who}.done[${i}]`, s]));
  return out.filter(([, s]) => typeof s === 'string');
}
const TOP = ['company', 'projects', 'grounding', 'bug', 'migration', 'headlines', 'fourth', 'jordan', 'sixth', 'maya', 'running', 'done', 'team'];
const VERB = /^(Fix|Add|Move|Show|Speed up|Let|Cache|Retry|Document|Write|Debug|Update|Remove|Rename|Split|Merge|Check|Test|Run|Make|Stop|Keep|Send|Sync|Flag|Link|Draft|Publish|Clean up|Handle|Support|Track|Log|Limit|Load|Read|Store|Group|Sort|Match|Pre-fill|Backfill|Migrate|Upgrade|Index|Build|Bump|Catch|Turn|Use|Allow|Block|Warn|Reuse|Drop|Batch|Parse|Cut|Save|Trim|Find|Prefill|Export|Import|Draw|Pin|Mark|Tag|Score|Rank|Lint|Profile|Measure|Replace|Retire|Deprecate|Expose|Hide|Guard|Validate|Verify|Wire|Port|Ship|Investigate|Audit|Review|Write up|Explain|Answer|Reply|Set up|Configure|Open|Close|Archive|Restore|Translate|Localize|Compress|Resize|Crop|Render|Fetch|Stream|Paginate|Throttle|Queue|Schedule|Notify|Email|Alert|Monitor|Record|Detect|Classify|Extract|Summarize|Generate|Train|Evaluate|Benchmark|Compare|Tune|Shorten|Simplify|Combine|Separate|Normalize|Dedupe|Deduplicate)\b/;

export const norm = (s) => String(s ?? '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').toLowerCase();

// What a model gets wrong that a script can put right without changing what
// it says: stray spaces, curly quotes, a non-breaking space.
export function tidyBrief(value) {
  if (typeof value === 'string') return value.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (Array.isArray(value)) return value.map(tidyBrief);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'rows' ? v : tidyBrief(v)])); // code keeps its indents
  return value;
}

export function siteText(site) {
  return norm((site?.pages ?? []).map((p) => [p.title, p.description, p.ogTitle, ...(p.h1 ?? []), ...(p.h2 ?? []), ...(p.h3 ?? []), ...(p.nav ?? []), ...(p.buttons ?? []), p.text].join(' ')).join(' '));
}

export function checkBrief(b, site, headlinesReport = null) {
  const bad = [];
  const say = (at, what) => bad.push(`${at}: ${what}`);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return ['brief.json: must be one JSON object shaped like brief.example.json'];
  if (b.unsure) return [`unsure: ${b.unsure} (the brief says the site is too thin to know what they build, so no film is made)`];
  for (const k of Object.keys(b)) if (!TOP.includes(k)) say(k, 'is not part of a brief; remove it');

  // ---- shape: every field there, of the right kind, of a size the screen holds ----
  const str = (v, at, { min = 1, max, end, start } = {}) => {
    if (typeof v !== 'string') { say(at, `missing; write a string${max ? ` of at most ${max} characters` : ''}`); return false; }
    if (v.length < min) { say(at, min === 1 ? 'is empty' : `is ${v.length} characters; write at least ${min}`); return false; }
    if (max && v.length > max) say(at, `is ${v.length} characters; cut it to at most ${max}`);
    if (end && !end.test(v)) say(at, `must end ${end === /\?$/ ? 'with a question mark' : `like ${end.source.replace(/\\|\$/g, '')}`}`);
    if (start && !v.startsWith(start)) say(at, `must start "${start}"`);
    return true;
  };
  const list = (v, at, { min, max }, each) => {
    if (!Array.isArray(v)) { say(at, `missing; write a list of ${min === max ? min : `${min} to ${max}`}`); return false; }
    if (v.length < min || v.length > max) say(at, `has ${v.length}; needs ${min === max ? `exactly ${min}` : `${min} to ${max}`}`);
    v.forEach((x, i) => each(x, `${at}[${i}]`));
    return true;
  };
  const obj = (v, at) => { if (!v || typeof v !== 'object' || Array.isArray(v)) { say(at, 'missing; write an object like the one in brief.example.json'); return false; } return true; };

  if (obj(b.company, 'company')) {
    str(b.company.name, 'company.name', { max: 40 });
    str(b.company.domain, 'company.domain', { max: 60 });
    str(b.company.oneLiner, 'company.oneLiner', { max: 90 });
  }
  list(b.projects, 'projects', { min: 5, max: 5 }, (p, at) => str(p, at, { max: 28 }));
  const projects = new Set(Array.isArray(b.projects) ? b.projects : []);
  if (Array.isArray(b.projects) && projects.size !== b.projects.length) say('projects', 'two projects have the same name');
  const inProject = (p, at) => { if (typeof p === 'string' && !projects.has(p)) say(at, `"${p}" is not one of projects (${[...projects].join(', ')})`); else if (typeof p !== 'string') say(at, 'missing; name one of projects'); };
  list(b.grounding, 'grounding', { min: 1, max: 40 }, (g, at) => { if (obj(g, at)) { str(g.term, `${at}.term`, { max: 60 }); str(g.quote, `${at}.quote`, { max: 400 }); } });

  const thread = (t, at, { options = [2, 3] } = {}) => {
    if (!obj(t, at)) return;
    inProject(t.project, `${at}.project`);
    if (str(t.title, `${at}.title`, { max: 60 }) && !VERB.test(t.title)) say(`${at}.title`, `"${t.title}" must start with a verb, the way a ticket does (Fix, Add, Move, Show, Document...)`);
    str(t.summary, `${at}.summary`, { min: 30, max: 220 });
    str(t.ask, `${at}.ask`, { max: 90, end: /\?$/ });
    list(t.progress, `${at}.progress`, { min: 2, max: 5 }, (x, a) => str(x, a, { max: 70 }));
    list(t.context, `${at}.context`, { min: 1, max: 3 }, (x, a) => str(x, a, { max: 240 }));
    if (options) list(t.options, `${at}.options`, { min: options[0], max: options[1] }, (x, a) => str(x, a, { max: 40 }));
  };
  thread(b.bug, 'bug', { options: [3, 3] });
  if (Array.isArray(b.bug?.options) && b.bug.options[0] !== 'Merge it') say('bug.options[0]', 'must be "Merge it" (she says "so I just hit one" and the film presses 1)');
  thread(b.migration, 'migration', { options: null });
  thread(b.fourth, 'fourth');
  thread(b.jordan, 'jordan');
  thread(b.sixth, 'sixth');
  if (typeof b.jordan?.title === 'string' && !b.jordan.title.startsWith("Write this week's ")) say('jordan.title', `must start "Write this week's " (for example "Write this week's ${b.company?.name ?? 'Acme'} changelog")`);
  if (obj(b.jordan, 'jordan')) str(b.jordan.comment, 'jordan.comment', { min: 10, max: 60 });

  if (obj(b.migration?.change, 'migration.change')) {
    list(b.migration.change.files, 'migration.change.files', { min: 1, max: 3 }, (f, at) => {
      if (!obj(f, at)) return;
      str(f.path, `${at}.path`, { max: 80 });
      str(f.said, `${at}.said`, { max: 90 });
      list(f.rows, `${at}.rows`, { min: 1, max: 30 }, (r, a) => {
        if (!Array.isArray(r) || r.length !== 2 || !['+', '-', '='].includes(r[0]) || typeof r[1] !== 'string') say(a, 'must be ["+", "code"], ["-", "code"] or ["=", "code"]');
        else if (r[1].length > 100) say(a, `is ${r[1].length} characters of code; keep each row to 100`);
      });
    });
    const rows = (b.migration.change.files ?? []).reduce((n, f) => n + (Array.isArray(f?.rows) ? f.rows.length : 0), 0);
    if (Array.isArray(b.migration.change.files) && (rows < 12 || rows > 30)) say('migration.change', `has ${rows} rows of code in all; write 12 to 30`);
  }

  if (obj(b.headlines, 'headlines')) {
    inProject(b.headlines.project, 'headlines.project');
    list(b.headlines.lines, 'headlines.lines', { min: 3, max: 3 }, (h, at) => {
      if (!str(h, at, { max: 46 })) return;
      const words = h.split(/\s+/).length;
      if (words > 8) say(at, `has ${words} words; at most 8`);
    });
    if (str(b.headlines.why, 'headlines.why', { max: 260 }) && !/first.*second.*third/i.test(b.headlines.why)) say('headlines.why', 'must say what the first, the second and the third lead with');
  }

  if (obj(b.maya, 'maya')) {
    const m = b.maya;
    inProject(m.project, 'maya.project');
    if (str(m.title, 'maya.title', { max: 36 }) && !VERB.test(m.title)) say('maya.title', `"${m.title}" must start with a verb (Debug, Fix, Check...)`);
    str(m.body, 'maya.body', { max: 140 });
    str(m.ask, 'maya.ask', { max: 90, start: "I'm stuck on" });
    str(m.summary, 'maya.summary', { max: 140 });
    str(m.context, 'maya.context', { min: 40, max: 400 });
    str(m.comment, 'maya.comment', { min: 10, max: 50 });
    if (typeof m.title === 'string' && typeof m.comment === 'string' && m.title.length + m.comment.length > 70)
      say('maya.comment', `her title and comment are ${m.title.length + m.comment.length} characters together; at most 70, or the inbox row hides her comment`);
    if (str(m.reply, 'maya.reply', { min: 12, max: 28 }) && /[^\x20-\x7E]/.test(m.reply)) say('maya.reply', 'must be plain keyboard text (the film types it key by key)');
  }

  list(b.running, 'running', { min: 19, max: 19 }, (r, at) => {
    if (!obj(r, at)) return;
    inProject(r.project, `${at}.project`);
    str(r.title, `${at}.title`, { max: 64 });
    str(r.activity, `${at}.activity`, { max: 40 });
    if (r.cloud !== undefined && typeof r.cloud !== 'boolean') say(`${at}.cloud`, 'must be true or false');
  });
  if (Array.isArray(b.running) && b.running[0] && b.running[0].cloud !== true) say('running[0].cloud', 'must be true (the film opens the first running thread as the cloud one)');
  list(b.done, 'done', { min: 3, max: 3 }, (d, at) => {
    if (!obj(d, at)) return;
    inProject(d.project, `${at}.project`);
    str(d.title, `${at}.title`, { max: 60 });
    str(d.result, `${at}.result`, { max: 140, end: /(Merged|Live)\.$/ });
  });

  if (obj(b.team, 'team')) {
    for (const who of ['maya', 'jordan', 'sam']) {
      const t = b.team[who];
      if (!obj(t, `team.${who}`)) continue;
      const work = who === 'maya' ? [t.working] : t.working;
      if (who === 'maya') { if (obj(t.working, 'team.maya.working')) { str(t.working.title, 'team.maya.working.title', { max: 60 }); inProject(t.working.project, 'team.maya.working.project'); } }
      else list(work, `team.${who}.working`, { min: 2, max: 2 }, (w, at) => { if (obj(w, at)) { str(w.title, `${at}.title`, { max: 60 }); inProject(w.project, `${at}.project`); } });
      inProject(t.doneProject, `team.${who}.doneProject`);
      list(t.done, `team.${who}.done`, { min: 8, max: 14 }, (x, at) => str(x, at, { max: 60 }));
    }
  }
  if (bad.length) return bad; // the rest reads fields the shape guarantees

  // ---- the film finds each thread by the first words of its title ----
  const head = (s, n = 5) => norm(s).split(' ').slice(0, n).join(' ');
  const titled = [['bug', b.bug.title], ['migration', b.migration.title], ['fourth', b.fourth.title], ['jordan', b.jordan.title], ['sixth', b.sixth.title], ['maya', b.maya.title],
    ...b.running.map((r, i) => [`running[${i}]`, r.title]), ...b.done.map((d, i) => [`done[${i}]`, d.title])];
  const seenTitle = new Map(), seenHead = new Map();
  for (const [at, t] of titled) {
    if (seenTitle.has(norm(t))) say(`${at}.title`, `repeats ${seenTitle.get(norm(t))}.title; every thread title must differ`);
    else if (seenHead.has(head(t))) say(`${at}.title`, `starts with the same five words as ${seenHead.get(head(t))}.title ("${head(t)}"); change the start of one`);
    seenTitle.set(norm(t), at); if (!seenHead.has(head(t))) seenHead.set(head(t), at);
  }
  if (norm(b.bug.summary).split(' ').slice(0, 4).join(' ') === norm(b.bug.title).split(' ').slice(0, 4).join(' ')) say('bug.summary', 'must not start with the same four words as bug.title');

  // ---- the company is the one on the site, and every name used is on it ----
  const text = siteText(site);
  if (site) {
    if (!text.includes(norm(b.company.name))) say('company.name', `"${b.company.name}" is not on their site; use the name their site uses`);
    if (site.domain && norm(site.domain) !== norm(b.company.domain)) say('company.domain', `must be ${site.domain}, the site that was read`);
    for (const p of site.problems ?? []) say('site', `${p} (fix the lead or skip it; a film from a site that did not read well can be wrong)`);
  }
  const grounded = new Set();
  b.grounding.forEach((g, i) => {
    if (site && !text.includes(norm(g.quote))) say(`grounding[${i}].quote`, `is not on their site word for word; copy it exactly from site.json: "${g.quote.slice(0, 80)}"`);
    else if (!norm(g.quote).includes(norm(g.term))) say(`grounding[${i}].quote`, `does not contain "${g.term}"`);
    else grounded.add(norm(g.term));
  });
  const proper = (s, at) => {
    const words = String(s).replace(/[^A-Za-z0-9.'\- ]/g, ' ').split(/\s+/).filter(Boolean);
    words.forEach((w, i) => {
      if (i === 0 || /[.?!]$/.test(words[i - 1])) return; // starts a sentence
      const clean = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/'s$/, '');
      if (!clean || (!/[A-Z]/.test(clean[0]) && !/[a-z][A-Z]/.test(clean))) return;
      if (COMMON.has(clean) || norm(clean) === norm(b.company.name) || /^[A-Z0-9]{1,3}$/.test(clean)) return;
      if ([...grounded].some((g) => g === norm(clean) || g.split(' ').includes(norm(clean)))) return;
      if (site && text.includes(norm(clean))) return;
      say(at, `"${clean}" is not on their site; use their own name for it and add it to grounding with a quote, or write it in lower case if it is not a name`);
    });
  };
  for (const k of [...THREADS, 'maya']) for (const f of ['title', 'summary', 'ask']) proper(b[k][f], `${k}.${f}`);
  b.running.forEach((r, i) => proper(r.title, `running[${i}].title`));
  b.done.forEach((d, i) => proper(d.title, `done[${i}].title`));

  // ---- how it reads ----
  const words = JSON.stringify({ ...b, grounding: undefined, migration: { ...b.migration, change: undefined } });
  for (const w of BANNED) if (norm(words).includes(w)) say('wording', `uses "${w}"; say plainly what it does`);
  if (/[—–]/.test(words)) say('wording', 'uses a long dash; write two sentences or use a comma');
  if (/!/.test(words)) say('wording', 'uses an exclamation mark');
  for (const k of [...THREADS, 'maya']) for (const f of ['title', 'summary']) if (/\w: \w/.test(b[k][f])) say(`${k}.${f}`, 'has a colon inside a sentence; write it as a sentence');

  // ---- nothing lifted from the example, which is another company ----
  if (EXAMPLE && norm(b.company.name) !== norm(EXAMPLE.company.name)) {
    const theirsToo = new Set(lines(EXAMPLE).map(([, s]) => norm(s)).filter((s) => s.split(' ').length >= 3));
    for (const [at, s] of lines(b)) if (theirsToo.has(norm(s))) say(at, `"${s}" is copied from brief.example.json, which is another company; write this company's own`);
  }

  // ---- the heroes ----
  const theirs = norm(site?.hero?.text).replace(/[.]$/, '');
  b.headlines.lines.forEach((h, i) => { if (theirs && norm(h).replace(/[.]$/, '') === theirs) say(`headlines.lines[${i}]`, 'is their current headline; write a new one'); });
  if (new Set(b.headlines.lines.map(norm)).size !== 3) say('headlines.lines', 'two headlines are the same');
  const theirs2 = headlinesReport?.theirs ? ` ("${headlinesReport.theirs.replace(/\s+/g, ' ').trim()}", ${headlinesReport.theirs.replace(/\s+/g, ' ').trim().length} characters)` : '';
  if (headlinesReport) headlinesReport.headlines.forEach((h, i) => {
    if (h.fits) return;
    if (h.why === 'wide') say(`headlines.lines[${i}]`, `is wider than the space their own headline${theirs2} has on their page; use fewer or shorter words`);
    else if (h.why === 'tall') say(`headlines.lines[${i}]`, `pushes past the bottom of their hero on their page; use fewer words`);
    else say(`headlines.lines[${i}]`, `runs to ${h.lines} lines on their page where theirs${theirs2} takes ${h.theirLines}; use fewer words`);
  });
  return bad;
}
