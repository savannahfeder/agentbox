// (a tester, 2026-08-28)
//
// The first thing she did once the walk let her go was look for whether Agentbox
// was connected to anything:
//
// The app knew the answer the whole time. `claudeFound`, `claudeCertain`,
// `claudeBin` and `claudeInstallUrl` ride the workspace snapshot; the walk's
// last card already gates the inbox on them. Settings drew them as a row
// called "Claude Code" filed under "Where the app keeps things on this Mac",
// whose sentence was a filesystem path and whose verdict was the word "found".
//
// What this file holds, in the order it matters:
//
//   AN UNSURE ANSWER IS NEVER DRAWN AS A CONFIDENT YES. `claudeCertain` is
//   false when the search could not reach the machine, or when the Mac shows
//   signs of Claude Code in a place the search cannot follow. That is not a
//   no, and it is very much not a yes. The green dot is spent on `claudeFound`
//   alone, and the install link — which tells somebody to go and reinstall
//   software they may already have — needs certainty as well.
//
//   THERE IS A WAY TO ASK AGAIN, without leaving the screen.
//
//   IT IS SAID IN ENGLISH. The person reading it does not know what a binary
//   or a PATH is, so neither word may appear in any of the three sentences.
//
//   IT IS WHERE SHE WILL SEE IT. First group on General, which is the pane
//   Settings opens on — not in the sidebar, which carries the last few things
//   and never a status, and never alarm colour.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME, Name } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const settings = read('renderer/src/components/Settings.tsx');
const api = read('renderer/src/api.ts');
const onboarding = read('renderer/src/onboarding.ts');

/**
 * The status component, on its own, so a claim about it cannot be satisfied
 *  by something four hundred lines away on another pane. */
// THE END MARKER MOVED ON 2026-08-28, and the reason is the point of this slice
// rather than an exception to it. The Updates group was added to this pane
// directly under the Claude one, BETWEEN the two banners this slice used, so
// the slice quietly grew to cover a second component and the "no alarm colour"
// check below began reading the word "error" out of an update PHASE NAME. That
// is a false positive: the Updates row is the same dot, the same ghost button
// and the same absence of colour. So the boundary is pulled back to where the
// Claude component really ends, which is what this slice always meant by "on
// its own".
//
// THE CARD IS SHARED WITH CODEX SINCE 2026-09-05, and four claims below name
// `copy.` where they used to name `CLAUDE.`. Nothing they assert has changed:
// the three states, the dot spent on `found` alone, the install link behind
// `certain`, and the different sentence after a press are all still exactly
// these strings, and they are now the ONLY copy of that logic on the screen,
// which is stronger than what was here before. The words themselves are still
// read out of the `CLAUDE` table, which is still in this block and still first
// in it. tests/settings-says-whether-codex-is-connected.test.mjs holds the same
// four claims for the second engine, and holds the rule about when its card is
// drawn at all — which is never, on any Mac that has not opened the gate.
const block = settings.slice(
  settings.indexOf('/* --------------------- IS CLAUDE CODE CONNECTED OR NOT'),
  // The Updates block that used to close this slice is gone (w-5737fe67cf),
  // so it ends where the next section starts. The project instructions box
  // that followed it moved to the Instructions page (w-4cbcd888ae).
  settings.indexOf('/* ---------------------------- the mark, changed'),
);

/**
 * The sentences, pulled out of the copy table by name.
 *
 *  BOTH QUOTE STYLES, because a sentence that names the app is a template
 *  literal now rather than a quoted string, and the two holes in it are filled
 *  the way the running app fills them. Reading only `'...'` came back empty and
 *  the assertion then compared '' with '', which passes while testing nothing.
 */
const unquote = (s) => String(s).replaceAll('${NAME}', NAME).replaceAll('${Name}', Name);
const copy = (key) => unquote(block.match(new RegExp(key + ": (?:'([^']*)'|`([^`]*)`)"))?.slice(1).find(Boolean) ?? '');

describe('the three states, and only three', () => {
  it('says connected only when Claude Code was actually found', () => {
    expect(block).toContain('const label = found ? copy.connected : certain ? copy.missing : copy.unsure;');
    // One expression, for every engine drawn through this card.
    expect(block.match(/const label = found \?/g)).toHaveLength(1);
    expect(copy('connected')).toBe('Claude Code is connected');
  });

  it('never says not found off a search that came back unsure', () => {
    expect(copy('missing')).toBe('Claude Code is not on this Mac');
    expect(copy('unsure')).toBe(`${Name} could not check`);
    // The unsure sentence has to say, in as many words, that this is not a no.
    expect(copy('unsureSay')).toContain('not the same as it being missing');
  });

  it('spends the live dot on found alone, so unsure is never drawn as a yes', () => {
    expect(block).toContain("<span className={`set-dot ${found ? 'live' : ''}`} />");
    // The word beside the dot is the same three-way answer, so neither has to
    // be learned from the other.
    expect(block).toContain("{found ? 'connected' : certain ? 'not found' : 'not sure'}");
  });

  it('offers the install link only when it is sure there is nothing here', () => {
    expect(block).toContain('{!found && certain && (');
    expect(block).toContain('href={url}');
  });
});

describe('a way to ask again', () => {
  it('has a Check again button that runs a fresh search', () => {
    // The card runs the search it was handed, and Claude Code's card is handed
    // Claude Code's. Looking for one engine says nothing about the other.
    expect(block).toContain('const r = await check();');
    expect(block).toMatch(/ClaudeCode[\s\S]{0,200}check=\{api\.recheckClaude\}/);
    expect(copy('check')).toBe('Check again');
    expect(copy('checking')).toBe('Looking');
    expect(block).toContain('{checking ? copy.checking : copy.check}');
  });

  // Nothing on this screen is cached: every write answers with the settings the
  // main process now believes and the page redraws from that. A press that
  // looked again and did not redraw would be the one failure a settings screen
  // can have.
  it('redraws the page off the main process rather than off what the press assumed', () => {
    expect(block).toContain('await onChecked();');
    expect(settings).toContain('onChecked={load}');
  });

  // The walk's rule: repeating the first sentence at somebody who has just
  // pressed a button reads as a screen that did not notice the press.
  it('says something different after a check that turned nothing up', () => {
    expect(copy('still')).toBe('Still nothing here. A fresh install can take a moment to appear.');
    expect(block).toContain(': again ? (certain ? copy.still : copy.stillUnsure)');
  });

  it('the recheck really does throw the remembered answer away', () => {
    // renderer side: it goes to the main process rather than re-reading settings
    expect(api).toContain("if (!zero?.claudeRecheck) return { found: false, certain: false, url };");
    // main side: forgetClaudeBin before the search (main/settings.mjs)
    expect(read('main/settings.mjs')).toContain('export function recheckClaude(config) {\n  forgetClaudeBin();');
  });
});

describe('it is said in English', () => {
  const sentences = ['connectedSay', 'missingSay', 'unsureSay', 'still', 'stillUnsure'].map(copy);

  it('uses no word a tester would have to look up', () => {
    for (const s of sentences) {
      expect(s).not.toBe('');
      for (const jargon of ['binary', 'PATH', 'shell', 'CLI', 'executable', 'symlink', 'install path']) {
        expect(s).not.toContain(jargon);
      }
    }
  });

  it('matches the voice of the only other screen that talks about this', () => {
    // The walk's own words, so the two screens do not describe one fact in two
    // vocabularies. Since 2026-10-01 the walk names Codex beside Claude Code,
    // because either one runs the app, and this card says only what it knows:
    // with Codex on the Mac, "your agents run on it" would be false here.
    expect(onboarding).toContain('missing: `${Name} could not find Claude Code or Codex on this Mac, and your agents run on one of them.`');
    expect(copy('missingSay')).toContain(`${Name} could not find Claude Code on this Mac.`);
    expect(copy('missingSay')).not.toContain('your agents run on it');
    expect(copy('missingSay')).toContain('Install it, then check again.');
  });

  it('tells somebody with nothing installed what to do about it', () => {
    expect(block).toContain("label=\"Where to get it\"");
    expect(copy('missingLink')).toBe('Get Claude Code');
  });

  // The path is the one fact here for somebody who already knows what it
  // means, so it is the quiet grey note under the plate and not the sentence.
  it('keeps the filesystem path out of the sentence', () => {
    expect(block).toContain('note={found && bin ? copy.where(bin) : undefined}');
    expect(block).toContain('desc={say}');
  });
});

describe('where it lives', () => {
  // General is the pane Settings opens on, so opening the screen IS the answer.
  /*
   * THE CLAIM IS THE SAME AND THE COMPONENT IS NOT. Settings stopped having a
     `<ClaudeCode>` card on 2026-09-21 (w-dc88147919): each coding agent is one
     card now, holding its status, its limits and its logins together, because
     the page had come to describe Claude Code in three places that never
     touched. What still has to hold is that the answer to "is this connected to
     anything" is the FIRST thing on the page Settings opens on, which is what
     a tester went looking for and gave up on (2026-08-28). */
  it('is the first thing on the pane Settings opens on', () => {
    const general = settings.slice(settings.indexOf("pane === 'general' && ("), settings.indexOf('What every agent reads before your task'));
    expect(general).toContain('<AgentCard');
    expect(general.indexOf('<AgentCard')).toBeLessThan(general.indexOf('label="Agents"'));
    // And the card still reads main's answer rather than deriving a second one.
    expect(settings).toContain('found: !!w.claudeFound');
    expect(settings).toContain('certain: w.claudeCertain !== false');
  });

  it('is not left behind in the group about folders', () => {
    const folders = settings.slice(settings.indexOf('<Group label={`Where ${NAME} keeps things on this Mac`}>'));
    const group = folders.slice(0, folders.indexOf('</Group>'));
    expect(group).not.toContain('claudeFound');
    expect(group).toContain('Your projects, tasks and documents');
  });

  // THE SIDEBAR CARRIES THE LAST FEW THINGS, NOT A LEDGER, and no red, and
  // nothing red-like. A connection status is bookkeeping, so the rail was
  // never available for this however convenient it would have been.
  it('puts nothing about it in the rail, and no alarm colour anywhere', () => {
    expect(read('renderer/src/components/Rail.tsx')).not.toContain('claudeFound');
    // The code with its comments taken out. The comments in here say the word
    // "red" on purpose, to explain its absence, so a grep over the raw file
    // would fail on the very note that documents the rule.
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/red|danger|alert|warn|error|set-dot out/i);
  });
});
