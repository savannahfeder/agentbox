// (the founder-side tester, 2026-09-05).
//
// He ran the real app with Codex chosen as the coding agent, reported that the
// Model row under it still offered Claude's models, and then asked for the rest:
// everything Settings says about Claude Code, said about Codex too.
//
// WHAT SETTINGS SAID ABOUT CODEX WAS NOTHING AT ALL, and the gap is sharper
// than it looks. The only Codex control anywhere is the "Coding agent" picker,
// and it is drawn only when `engineChoices.length > 1` -- which needs Codex
// already FOUND. So on the one Mac where a person actually has a question about
// Codex -- the opt-in written, and Agentbox unable to see the binary -- the
// screen is silent: no status, no install link, and no way to tell "not
// installed" from "installed somewhere the search cannot reach". That second
// case is exactly what Claude Code's third state exists for next door, and a
// tester's session is the whole argument for having it.
//
// The facts were already computed and read by nobody: `main/codex-bin.mjs`
// exports `findCodexBin`, `installEvidence`, `evidencePaths` and an install URL,
// and answers found/certain/path exactly as `claude-bin.mjs` does.
//
// ---------------------------------------------------------------------------
// THE VISIBILITY RULE, WHICH IS THE JUDGEMENT IN THIS SLICE.
//
// STRAIGHT SYMMETRY IS WRONG. Claude Code's card is load-bearing -- the inbox
// does not open without Claude Code (hers, 2026-08-23) -- so it is drawn on
// every Mac and always will be. Codex is OPTIONAL, and an always-present Codex
// card is furniture for everybody who never uses it, which is the flow law.
//
// SO IT IS DRAWN WHEN, AND ONLY WHEN, THIS MAC HAS ASKED FOR CODEX, AND THE
// ASKING IS THE GATE. `engineChoice` in zero.config.json is a moment somebody
// writes by hand on purpose; before it, Agentbox has never said the word Codex on
// any screen -- no picker, no byline, no row -- and a status card for software
// the app is deliberately silent about is the app volunteering a topic. It
// would also be a card saying "connected" over an engine that is going to run
// nothing, because `engineFor` refuses every row until the gate is open.
//
// IT IS NOT `engineChoices.length > 1`, AND THAT IS THE POINT. That answers "is
// there a CHOICE", which is false on precisely the Mac this card exists for. The
// question here is "has this person asked to hear about Codex", and
// `Supervisor#engineChoiceOpened` is the one place that answers it -- in the one
// file allowed to read the opt-in, so the screen and the routing cannot come
// apart.
//
// EVIDENCE KEEPS ITS OWN JOB AND IS NOT THE VISIBILITY RULE. `installEvidence`
// is what makes `certain` false, which is what picks "the app could not check"
// over "Codex is not on this Mac". Using it to decide whether to draw at all
// would put a "Codex is connected" card on a gate-shut Mac that merely has a
// stale ~/.codex lying around, and would MISS a freshly installed Codex that
// has never been run, which leaves no trace at all.
//
// AND THERE IS NO ACCOUNTS LIST UNDER IT. `~/.codex/auth.json` carries
// `auth_mode` and an opaque `account_id`; it has no email and no plan, so the
// honest answer to "who is it signed in as" is unavailable, and a uuid is not a
// person. A second Codex login is not supported today either -- one app-server
// serves the fleet with `CODEX_HOME` scrubbed -- so a list would suggest
// something the app cannot do. Claude Code's Accounts group is directly under
// its card because "is Claude Code here, and who is it signed in as" are one
// question asked twice; for Codex the second half has no answer, so it is not
// asked.

import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexState, readSettings, recheckCodex } from '../main/settings.mjs';
import { forgetCodexBin, INSTALL_URL } from '../main/codex-bin.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const settings = read('renderer/src/components/Settings.tsx');
const api = read('renderer/src/api.ts');
const preload = read('preload.cjs');

/**
 * The connection machinery on its own -- the shared card and both engines'
 *  words -- so a claim about it cannot be satisfied by something four hundred
 *  lines away on another pane. Same boundary
 *  tests/settings-says-whether-claude-code-is-connected.test.mjs uses. */
const block = settings.slice(
  settings.indexOf('/* --------------------- IS CLAUDE CODE CONNECTED OR NOT'),
  settings.indexOf('/* --------------------------- project instructions'),
);

/**
 * Codex's half of the copy table, by name. Sliced off CODEX first, so a key
 *  Claude Code also has cannot be read out of the wrong table. */
const codexCopy = block.slice(block.indexOf('const CODEX = {'));
/**
 * The sentences, pulled out of the copy table by name.
 *
 *  BOTH QUOTE STYLES, because a sentence that names the app is a template
 *  literal now rather than a quoted string, and the two holes in it are filled
 *  the way the running app fills them. Reading only `'...'` came back empty and
 *  the assertion then compared '' with '', which passes while testing nothing.
 */
const unquote = (s) => String(s).replaceAll('${NAME}', NAME).replaceAll('${Name}', Name);
const copy = (key) => unquote(codexCopy.match(new RegExp(key + ": (?:'([^']*)'|`([^`]*)`)"))?.slice(1).find(Boolean) ?? '');

const OPENED = '2026-09-04T00:00:00Z';

const emptyStore = { listItems: () => [], listProducts: () => [], isDue: () => true };
const payload = (overrides) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-card-'));
  const config = {
    home: '/nonexistent-home', storeRoot: dir, accountRoot: dir, appDir: dir,
    claudeBin: '/nonexistent/claude', maxConcurrentSessions: 3, authProfiles: ['default'],
    sessionArgs: [], ...overrides,
  };
  return readSettings({
    config, supervisor: new Supervisor(config, emptyStore, dir), store: emptyStore,
  }).workspace;
};

/** A file that really is on disk, so `exists` is answering about something. */
const realFile = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bin-'));
  const file = path.join(dir, 'codex');
  fs.writeFileSync(file, '#!/bin/sh\n');
  return file;
};

beforeEach(() => { forgetCodexBin(); });

/* ================= ONE CARD, NOT A SECOND VOCABULARY ==================== */

describe('the card is the one Claude Code already uses', () => {
  it('draws both engines through a single component', () => {
    expect(block).toContain('function Connection(');
    // And exactly one of them: a second three-state card is a second set of
    // words for one fact, which is what this file exists to prevent.
    expect(block.match(/const label = found \?/g)).toHaveLength(1);
    expect(block).toContain('const label = found ? copy.connected : certain ? copy.missing : copy.unsure;');
  });

  it('binds each engine to its own words and its own search', () => {
    expect(block).toMatch(/ClaudeCode[\s\S]{0,200}copy=\{CLAUDE\}/);
    expect(block).toMatch(/ClaudeCode[\s\S]{0,200}check=\{api\.recheckClaude\}/);
    expect(block).toMatch(/CodexCli[\s\S]{0,200}copy=\{CODEX\}/);
    expect(block).toMatch(/CodexCli[\s\S]{0,200}check=\{api\.recheckCodex\}/);
  });

  // The three states are the SAME three, drawn the same way, so nobody has to
  // learn a second reading of a dot.
  it('spends the live dot on found alone for both of them', () => {
    expect(block).toContain("<span className={`set-dot ${found ? 'live' : ''}`} />");
    expect(block).toContain("{found ? 'connected' : certain ? 'not found' : 'not sure'}");
  });
});

/* ========================= what it says, per state ====================== */

describe('the three states, in Claude Code\'s own vocabulary', () => {
  it('says connected only when Codex was actually found', () => {
    expect(copy('connected')).toBe('Codex is connected');
  });

  // The same rule, unchanged, for Codex.
  it('never says not on this Mac off a search that came back unsure', () => {
    expect(copy('missing')).toBe('Codex is not on this Mac');
    expect(copy('unsure')).toBe(`${Name} could not check`);
    expect(copy('unsureSay')).toContain('not the same as it being missing');
  });

  // The connected sentence may NOT borrow Claude Code's: Claude Code is what
  // her agents run on, and Codex is a second thing she may put a task on. Two
  // engines, two true sentences.
  it('says what being connected actually buys her, and not Claude Code\'s promise', () => {
    expect(copy('connectedSay')).toContain('Codex');
    expect(copy('connectedSay')).not.toContain('your agents have something to run on');
  });

  it('offers somewhere to get it, and only when it is sure there is nothing here', () => {
    expect(block).toContain('{!found && certain && (');
    expect(copy('missingLink')).toBe('Get Codex');
    // Codex's own docs, not Claude Code's, and one copy of the link.
    expect(INSTALL_URL).toBe('https://learn.chatgpt.com/docs/codex/cli');
    expect(block).not.toContain('learn.chatgpt.com');
  });

  it('is said in English, with no word she would have to look up', () => {
    for (const key of ['connectedSay', 'missingSay', 'unsureSay', 'still', 'stillUnsure']) {
      const sentence = copy(key);
      expect(sentence, `${key} is missing`).not.toBe('');
      for (const jargon of ['binary', 'PATH', 'shell', 'CLI', 'executable', 'symlink', 'install path']) {
        expect(sentence, `${key} says "${jargon}"`).not.toContain(jargon);
      }
    }
  });

  // Her standing law: Agentbox does not shout in colour, and a coding agent that
  // is not installed is not an emergency. The comments in here say the word
  // "red" on purpose to explain its absence, so the prose comes off first.
  it('has no alarm colour anywhere in it', () => {
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/red|danger|alert|warn|error|set-dot out/i);
  });
});

/* ===================== and the facts behind the states ================== */

describe('the three states are the finder\'s answer, not a guess', () => {
  it('says found, with the path, when Codex is really there', () => {
    const bin = realFile();
    const state = codexState({ codexBinConfigured: bin });
    expect(state).toEqual({ bin, found: true, certain: true, url: INSTALL_URL });
  });

  // AND THE PATH IS EMPTY WHEN THERE IS NONE, never the installer's guess.
  // Claude Code falls back to a path because it is required and anything
  // spawning it should fail with a real path in the message; printing one here
  // would put a path to a missing file under a row that has just said it is
  // missing.
  it('names no path at all when there is nothing to name', () => {
    const state = codexState({ codexBinConfigured: '/nonexistent/codex/codex' });
    expect(state.found).toBe(false);
    expect(state.bin).toBe('');
  });

  // THE THIRD STATE, which is the whole reason this card exists. A Mac showing
  // signs of Codex somewhere the search cannot follow is not a no.
  it('is unsure, not missing, when this Mac shows signs of a Codex it cannot find', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-evidence-'));
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(home, '.codex', 'auth.json'), '{}');
    const state = codexState({}, {
      home,
      env: {},
      // Nothing outside this laid-out home exists, so the machine running the
      // suite -- which does have a Codex at /opt/homebrew/bin -- cannot answer
      // for it. That is the whole reason `findCodexBin` takes this seam.
      exists: (p) => p.startsWith(home) && fs.existsSync(p),
      shellLookup: () => ({ path: null, answered: true }),
    });
    expect(state.found).toBe(false);
    expect(state.certain).toBe(false);
  });

  // The boundary the other side: nothing on the Mac at all, and a shell that
  // answered, so the absence really is established and the screen may say so.
  it('is certain when nothing here has ever been Codex', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-nothing-'));
    const state = codexState({}, {
      home,
      env: {},
      // Nothing outside this laid-out home exists, so the machine running the
      // suite -- which does have a Codex at /opt/homebrew/bin -- cannot answer
      // for it. That is the whole reason `findCodexBin` takes this seam.
      exists: (p) => p.startsWith(home) && fs.existsSync(p),
      shellLookup: () => ({ path: null, answered: true }),
    });
    expect(state.found).toBe(false);
    expect(state.certain).toBe(true);
  });
});

/* =========================== a way to ask again ========================= */

describe('Check again really looks again', () => {
  it('throws the remembered shell answer away before searching', () => {
    expect(read('main/settings.mjs')).toContain('export function recheckCodex(config) {\n  forgetCodexBin();');
  });

  // AND IT IS WORTH PRESSING, which is the half a Claude Code copy would miss:
  // finding Codex is what puts `codexBin` on the config, and `codexBin` is what
  // `engineChoices` reads, so a successful press is what makes the Coding agent
  // row appear without a restart.
  it('puts what it found on the config the picker is drawn from', () => {
    const config = { codexBinConfigured: realFile() };
    expect(recheckCodex(config).found).toBe(true);
    expect(config.codexBin).toBe(config.codexBinConfigured);

    const gone = { codexBinConfigured: '/nonexistent/codex/codex' };
    recheckCodex(gone);
    expect(gone.codexBin).toBeNull();
  });

  it('is wired end to end, so the button is not a button over nothing', () => {
    expect(preload).toContain("codexRecheck: () => ipcRenderer.invoke('zero:codex-recheck')");
    expect(read('main/ipc.mjs')).toContain("ipcMain.handle('zero:codex-recheck'");
    expect(api).toContain('async recheckCodex(');
    expect(block).toContain('const r = await check();');
    expect(block).toContain('await onChecked();');
  });
});

/* ================== when it is drawn, and when it is not ================ */

describe('the card is drawn only where somebody asked for Codex', () => {
  it('is on the payload once the opt-in is written', () => {
    const w = payload({ engineChoice: OPENED, codexBinConfigured: realFile() });
    expect(w.codex).toMatchObject({ found: true, certain: true });
    expect(w.codex.url).toBe(INSTALL_URL);
  });

  // THE MAC THIS CARD EXISTS FOR: the gate open, Codex not found. There is no
  // CHOICE here, so every picker draws nothing -- and this is where the screen
  // used to say nothing at all about why.
  it('is on the payload when the gate is open and Codex was not found', () => {
    const w = payload({ engineChoice: OPENED, codexBinConfigured: '/nonexistent/codex/codex' });
    expect(w.engineChoices).toHaveLength(1);
    expect(w.codex).toMatchObject({ found: false, certain: true, bin: '' });
  });

  // THE CASE THAT MUST NOT MATCH, and it is every Mac today. No opt-in, so no
  // card, whatever is on the disk -- including a Codex sitting right there.
  it('says nothing at all on a Mac that has not opened the gate', () => {
    const w = payload({ codexBinConfigured: realFile() });
    expect(w.codex).toBeNull();
    expect(w.engineChoices).toHaveLength(1);
  });

  // AND IT IS THE GATE THAT DECIDES, not the number of engines. Stated against
  // the supervisor's own method so a later edit cannot quietly swap the rule
  // for `engineChoices.length > 1` and leave this file green.
  it('is decided by whether she opened the gate, and by nothing else', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-gate-'));
    const shut = new Supervisor({ storeRoot: dir, codexBin: '/nonexistent/codex' }, emptyStore, dir);
    const open = new Supervisor({ storeRoot: dir, engineChoice: OPENED }, emptyStore, dir);
    expect(shut.engineChoiceOpened()).toBe(false);
    expect(open.engineChoiceOpened()).toBe(true);
    // The one with the gate open has no second engine, and still says yes.
    expect(open.engineChoices()).toHaveLength(1);
    // ONE QUESTION, ASKED IN ONE PLACE. What the card is BUILT from grew a
    // second half on 2026-09-05 -- `trouble`, why nothing runs on an engine that
    // IS here -- so this no longer matches one expression end to end. Whether
    // there is a card at all is still this gate and nothing else, which is the
    // claim, and the shape either side of it is pinned so a rewrite that
    // reached for a different fact still has to come through here.
    const src = read('main/settings.mjs');
    expect(src).toContain('supervisor.engineChoiceOpened()');
    expect(src).toContain('...codexState(config)');
    // The gap grew again on 2026-09-21, when the payload learned to carry every
    // Codex login rather than only the first. The gap after `codexState` grew
    // again on 2026-09-18, when the card learned to say which Codex account
    // this Mac is signed into. Whether there is a card AT ALL is still this
    // gate and nothing else, which is the claim; what gets built behind it now
    // has three parts instead of two.
    expect(src).toMatch(/supervisor\.engineChoiceOpened\(\)[\s\S]{0,200}codexState\(config\)[\s\S]{0,800}: null;/);
  });

  // The renderer obeys the same absence: no `w.codex`, no card, and no second
  // way of deciding invented on this side of the bridge.
  /*
   * SAME CLAIM, NEW COMPONENT. `<CodexCli>` went with the connection cards on
     2026-09-21 (w-dc88147919); each agent is one card now. Whether Codex is on
     the page at all is still `w.codex` and nothing else, and the card still
     reads main's fields rather than deriving its own. */
  it('draws the card off that one field and derives nothing itself', () => {
    const general = settings.slice(
      settings.indexOf("pane === 'general' && ("),
      settings.indexOf('What every agent reads before your task'),
    );
    expect(general).toContain('...(w.codex ? [agentStory(w, usageReadings, \'codex\')] : [])');
    expect(settings).toContain('found: !!w.codex?.found');
    expect(settings).toContain('certain: !!w.codex?.certain');
    expect(general).not.toContain('engineChoices.length > 1 && <CodexCli');
  });

  // WHERE IT SITS. Under Claude Code and the account it is signed in as --
  // those two are one question asked twice and must not be split by a card
  // about a different engine -- and above Updates, because whether a coding
  // agent is here outranks whether the app is a version behind.
  /*
   * THE READING ORDER, which survived the cards even though the pieces did not.
     Claude Code comes before Codex because it is the one every task falls back
     to, and both come before the app's own version row. The accounts are no
     longer BETWEEN them: they are inside each card, which is the point. */
  // Updates is gone from General (w-5737fe67cf); the Agents group is what the
  // cards now have to come before.
  it('puts Claude Code before Codex, and both above the Agents group', () => {
    const order = settings.slice(settings.indexOf("{([agentStory(w, usageReadings, 'claude'),"), settings.indexOf('label="Agents"'));
    expect(order.indexOf("agentStory(w, usageReadings, 'claude')"))
      .toBeLessThan(order.indexOf("agentStory(w, usageReadings, 'codex')"));
    const general = settings.slice(settings.indexOf("pane === 'general' && ("), settings.indexOf('What every agent reads before your task'));
    expect(general.indexOf('<AgentCard')).toBeLessThan(general.indexOf('label="Agents"'));
  });

  // AND IT SAYS WHICH ACCOUNT.
  //
  // THIS TEST USED TO ASSERT THE OPPOSITE, and its reason was good when it was
  // written: "`~/.codex/auth.json` has no email and no plan, so who is it
  // signed in as has no honest answer." The file changed under it. Measured on
  // her Mac against codex-cli 0.153.4, the `id_token` in that same file carries
  // `email`, `name` and a ChatGPT plan, and `codex login status` still names
  // nobody, so the file is the only source there is.
  //
  // STILL ONE LINE AND NOT A LIST. A second Codex login is not supported today,
  // so there is no accounts group here the way Claude Code has one.
  /* The card names every login under this home and marks the one her work runs on.
  */
  it('says which Codex account this Mac is signed into', () => {
    expect(settings).toContain('(w.codex?.accounts ?? []).map');
    expect(settings).toContain("const label = a.email ?? 'Not signed in'");
    // It is still not a second Accounts PAGE, which is the thing she turned down.
    expect(settings).not.toMatch(/\['accounts', 'Accounts'\]/);
  });

  // AND IT NEVER DRAWS OVER AN ENGINE THAT IS NOT HERE. An account line above
  // "Codex is not on this Mac" is two rows disagreeing about whether there is
  // anything here at all.
  it('draws the account line only when Codex was found', () => {
    expect(settings).toContain('{found && account && (accountLine(account) !== null) && (');
  });

  // A UUID IS NOT A PERSON, which was the true half of the old reason and is
  // kept: it is the last resort, never the answer when there is an email.
  it('leads with the email and falls back to the uuid only', () => {
    const line = settings.slice(settings.indexOf('function accountLine('));
    const body = line.slice(0, line.indexOf('\n}'));
    expect(body.indexOf('account.email')).toBeLessThan(body.indexOf('account.name'));
    expect(body.indexOf('account.name')).toBeLessThan(body.indexOf('account.accountId'));
  });
});
