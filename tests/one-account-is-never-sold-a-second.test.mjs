// The app does not sell a second subscription to somebody who has one. Cleaning
// the page's copy was not enough on its own:
//
// THE DOOR WAS THE SUGGESTION. A row in the sidebar headed "Accounts", with a
// count beside it, says a machine is a place where accounts get collected,
// however carefully the page behind it is worded. So there is no such row and
// no such page: the account list is a group on Agents, next to the number of
// agents whose ceiling that subscription sets.
//
// The line this file holds is between DESCRIBING a machine and SELLING one:
//
//   ONE ACCOUNT SEES NOTHING ABOUT A SECOND. No instructions for getting one,
//   no sentence about what one would add, and no plural.
//
//   TWO ALREADY-CONNECTED ACCOUNTS STILL READ NORMALLY. Somebody who set a
//   second one up before we ever said a word is not being encouraged by copy
//   that describes what they have. That is why every check below is about the
//   one-account case and none of them forbids the two-account sentences.
//
//   THE REPAIR PATH SURVIVES. An account that is signed out still says so and
//   still carries its own command, because that is somebody's existing account
//   broken, not a new one being suggested.

// AND ON 2026-09-21 THE ROWS MOVED ONE LAST TIME, INTO THE AGENT'S OWN CARD.
// The page had grown to describe Claude Code in three separate places -- a
// Usage block, a connection card, this accounts group -- so each coding agent
// became one card holding its status, its limits and its logins together. The
// group heading "Signed in to Claude" is gone with the group.
//
// NOTHING THIS FILE PROTECTS MOVED WITH IT. The line is still between
// describing a machine and selling one: it lists the logins the user already
// has, with no recipe, no plural and no count.
//
// AND THEN THE BAN ITSELF WAS WITHDRAWN (w-3498e0cad2). The app is no longer
// offered as a commercial product, so adding a second account is allowed. So
// the Claude card has the same Add account row the Codex card has had since
// 2026-09-21, and the one check in this file that forbade it is now the check
// that requires it. tests/a-second-claude-login-is-one-press.test.mjs is where
// the new door is pinned.
//
// EVERY OTHER RULE HERE SURVIVES THAT, because one sentence was withdrawn and
// not the page. There is still no Accounts pane and no count in the sidebar, a row
// is still headed by the email rather than our folder name, and nothing still
// tells anybody what a second subscription would add. A door is not a pitch.
//
// AND ON 2026-08-31 THE ROWS MOVED AGAIN, from Agents to General. Every rule in
// this file is about the COPY and not about the page, so the checks simply
// follow the rows to whichever pane holds them; the two that were about the
// pane itself are at the bottom, and they now pin General.
//
// The pictures come from a harness that drives the
// real window on a one-account payload and fails if any of these words reach
// the screen.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { duplicateAccountNote } from '../main/account-tooling.mjs';
import { NAME } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settings = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');

/**
 * One pane on its own, so a claim about it cannot be satisfied by a sentence
 *  on another screen four hundred lines away. `accountsPane` is General, which
 *  has held the account rows since 2026-08-31; `agentsPane` is where the
 *  number of agents and its explanation still live.
 *
 *  BOTH OF THEM ARE GENERAL SINCE 2026-09-22 (w-3d634cbc44). The Agents pane
 *  moved into it, as two blocks of one page, so `pane === 'agents'` is no
 *  longer the boundary between them and the comment at the seam is. Slicing on
 *  a comment is ugly and it is honest: every claim below is about WHERE a
 *  sentence sits on a page that is now one page, and the seam is the only thing
 *  in the file that says where. */
/* AND SINCE THE REDRAW (w-ccadd13c46, 2026-10-05) THEY ARE TWO PAGES AGAIN:
   each coding agent has a page of its own holding its usage, its logins and
   its permissions (`enginePage`), and the number of agents is on Running. */
const accountsPane = settings.slice(
  settings.indexOf('const enginePage = (engine'),
  settings.indexOf('<div className="set-nav">'),
);

const spoken = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/*
 * THE CARD ITSELF, which is a component above the pane rather than markup
   inside it since 2026-09-21. The rows this file is about are drawn there now,
   so the checks about a row's wording read this and the checks about where the
   cards SIT still read the pane. */
const cardSource = spoken(settings.slice(
  settings.indexOf('type CardAccount = {'),
  settings.indexOf('const Group = ({'),
));

const agentsPane = settings.slice(
  settings.indexOf("pane === 'running' && ("),
  settings.indexOf("pane === 'appearance'"),
);

/**
 * Every string the pane could draw, with the JSX and the comments taken out.
 *  Comments describe the rule and quote the copy that was deleted, so a check
 *  that read them would fail on the very file that obeys the rule. */
describe(`there is no page in ${NAME} for collecting Claude accounts`, () => {
  const said = spoken(settings);

  it('has no Accounts row in the settings sidebar', () => {
    expect(said).not.toMatch(/\['accounts', 'Accounts'\]/);
    expect(said).not.toMatch(/<h1 className="set-title">Accounts<\/h1>/);
  });

  it('has no Accounts pane left to render', () => {
    expect(settings).not.toMatch(/pane === 'accounts' &&/);
  });

  it('counts nothing beside a nav row, so there is no score to raise', () => {
    expect(said).not.toMatch(/w\.accounts\.length}<\/span>/);
  });

  it('still opens the rows for anybody arriving on the old ?settings=accounts', () => {
    // The `agents` name joined it on 2026-09-22 (w-3d634cbc44), so the line is
    // one condition with two old names on it rather than two lines.
    // Since the redraw the rows are on Claude Code's own page, and the old
    // Agents name opens Running, where the number of agents went.
    expect(settings).toMatch(/if \(want === 'accounts'\) return 'claude';/);
    expect(settings).toMatch(/if \(want === 'agents'\) return 'running';/);
  });
});

describe('the account rows never tell anybody to get a second subscription', () => {
  const said = spoken(accountsPane);

  it('has no Add an account row, and no recipe for making one', () => {
    expect(said).not.toMatch(/Add an account/);
    expect(said).not.toMatch(/CLAUDE_CONFIG_DIR set to a new folder/);
    expect(said).not.toMatch(/authProfiles/);
  });

  it('never says what another subscription would add', () => {
    expect(said).not.toMatch(/adds capacity/);
    expect(said).not.toMatch(/Each one adds/);
  });

  /* * THE HEADING NEVER CHANGES SHAPE WITH THE COUNT.
  */
  it('heads the list with one phrase that works at any number', () => {
    // The page is titled with the agent's name, and the rows are headed
    // "Signed in", neither of which can grow a plural whatever the count is.
    expect(said).toMatch(/title=\{agent\.name\}/);
    expect(said).toMatch(/label="Signed in"/);
    expect(said).not.toMatch(/label="Accounts"/);
    expect(said).not.toMatch(/Claude accounts/);
  });

  /* * THE ROW NAMES THE ACCOUNT, NOT OUR FOLDER. That string is `a.label`, the name of the
     config directory, and it was the row's heading.
  */
  it('heads each row with the email rather than the config folder', () => {
    expect(cardSource).toMatch(/const label = a\.email \?\? 'Not signed in'/);
    expect(said).not.toMatch(/label=\{a\.label\}/);
  });

  it('drops the plumbing that made one account hard to read', () => {
    expect(said).not.toMatch(/set-dot/);
    expect(said).not.toMatch(/'live' : 'resting'/);
    expect(said).not.toMatch(/Running \$\{a\.running\}/);
  });

  it('still lets a signed-out account say so and be signed back in', () => {
    expect(cardSource).toMatch(/trouble: a\.trouble\?\.note \?\? null/);
    expect(cardSource).toMatch(/CopyCmd cmd=\{`CLAUDE_CONFIG_DIR=\$\{a\.dir\} claude`\}/);
    // And it is the ONLY thing that speaks under a row, so a healthy account
    // carries no sentence at all. A troubled one is also not a thing to pick:
    // it leaves the clickable row and becomes something to fix.
    expect(cardSource).toMatch(/if \(a\.trouble\) \{/);
    expect(cardSource).toMatch(/<Row key=\{a\.profile\} label=\{label\} desc=\{a\.trouble\}>/);
  });

  it('still raises the two-folders-one-subscription line above the list', () => {
    // Above the rows rather than inside one of them, because it is a fact
    // about the pair, and only on Claude Code's page, whose pair it is.
    expect(said).toMatch(/warn=\{engine === 'claude' \? w\.accountsNote : null\}/);
  });

  /*
   * THE DOOR IS OPEN ON BOTH CARDS NOW (w-3498e0cad2), and it is still a door
     rather than a pitch: one row reading "Add account", with no sentence under
     it about what another subscription would give. This check used to assert
     the opposite, and the difference is the changed rule above. */
  it('offers the same Add account row on either agent', () => {
    expect(cardSource).not.toMatch(/\{agent\.engine === 'codex' && \(/);
    expect(cardSource).toMatch(/<Row label="Add account">\s*<button type="button" className="set-ghost" onClick=\{\(\) => onAdd\(agent\)\}>Add<\/button>/);
    // And it still says nothing about what a second one would add, which is the
    // line that did not move.
    expect(cardSource).not.toMatch(/adds capacity/);
    expect(cardSource).not.toMatch(/CLAUDE_CONFIG_DIR=~\//);
  });
});

describe('the Agents page explains parallelism without teaching the multiplier', () => {
  const said = spoken(agentsPane);

  it('says "Per account" only when a second account is already connected', () => {
    expect(said).toMatch(/w\.accounts\.length > 1[\s\S]{0,160}?Per account/);
  });

  it('gives one account a plain number instead', () => {
    expect(said).toMatch(/Up to \$\{w\.sessionsAtOnce\} run together/);
    expect(said).toMatch(/One runs at a time/);
  });

  it('keeps the sentence that says a smaller plan chose the number', () => {
    expect(said).toMatch(/sessionsAtOnceFromPlan/);
  });

  // THIS USED TO ASSERT THE OPPOSITE, before the rows moved to General. The
  // check here was that the account rows sat on this page, directly under the
  // sentence naming the plan, so one screen read top to bottom answered why
  // the number was what it was.
  it('no longer carries the account rows at all', () => {
    expect(said).not.toMatch(/label="Signed in to Claude"/);
    expect(said).not.toMatch(/w\.accounts\.map/);
  });

  it('still explains its own number without them', () => {
    expect(said).toMatch(/sessionsAtOnceFromPlan/);
  });
});

describe('where the account rows live', () => {
  // SINCE THE REDRAW (w-ccadd13c46): each agent's own page, which the menu
  // names by the agent, so the place to look is the word she is looking for.
  it('is the coding agent\'s own page', () => {
    expect(spoken(accountsPane)).toMatch(/<AccountRows/);
    expect(cardSource).toMatch(/w\.accounts \?\? \[\]\)\.map/);
    const general = settings.slice(settings.indexOf("pane === 'general' && ("), settings.indexOf("pane === 'claude' && enginePage"));
    expect(general).not.toContain('<AccountRows');
  });

  // The reading order of General: is Claude Code here, who is it signed in as,
  // am I on the current version. The account belongs in the middle of that,
  // because the first two are one question asked twice.
  /*
   * The reading order of General: the coding agents and everything about them,
     then whether the app itself is current. The account no longer sits BETWEEN
     "is Claude Code here" and the version row, because those two stopped being
     separate things: they are one card now, which is the point of w-dc88147919.
     What still has to hold is that the agents come before the version. */
  // AND IT IS THE WHOLE PAGE THAT IS READ FOR IT, not the first of its two
  // blocks (w-3d634cbc44). The version row sits under the agent ROWS now, which
  // are "everything about them" in the sentence above, so the claim is
  // unchanged and only the slice it is measured on had to widen.
  // THE VERSION ROW IS GONE (w-5737fe67cf, the update section was removed).
  // The claim that survives is the first half of it: the agents lead the page.
  // The agent's page reads in the order a person asks: how much is left, who
  // it is signed in as, then what it may do.
  it('reads usage, then who is signed in, then permissions', () => {
    const said = spoken(accountsPane);
    const usage = said.indexOf('label="Usage"');
    const who = said.indexOf('label="Signed in"');
    const perms = said.indexOf('label="Permissions"');
    expect(usage).toBeGreaterThan(-1);
    expect(who).toBeGreaterThan(usage);
    expect(perms).toBeGreaterThan(who);
    expect(said).not.toContain('<Updates');
  });
});

describe('two folders that are one account still say so', () => {
  // This is the one place the app talks about capacity across accounts, and it
  // is not encouragement: it only ever speaks on a machine that already has two
  // profiles, and it tells nobody to do anything.
  const dupe = () => duplicateAccountNote([
    { email: 'you@example.com', accountUuid: 'one' },
    { email: 'you@example.com', accountUuid: 'one' },
  ]);

  it('speaks for a machine that already has two, and says what is true', () => {
    expect(dupe()).toMatch(/same Claude account/);
    expect(dupe()).toMatch(/one subscription rather than two/);
  });

  /* * IT INSTRUCTS NOBODY. Everybody else reads it as Agentbox telling them to go and get
     one.
  */
  it('tells nobody to sign in as another account', () => {
    expect(dupe()).not.toMatch(/Sign one of them/i);
    expect(dupe()).not.toMatch(/your other account/i);
  });

  /*
   * AND IT DOES NOT CLAIM THE SECOND FOLDER ADDS NOTHING, because
     `_capacity()` in main/supervisor.mjs multiplies by live PROFILES, so the
     app really does start double against the one subscription. Saying "not
     adding any capacity" described the intention rather than the behaviour. */
  it('says the number is too high rather than that nothing was added', () => {
    expect(dupe()).not.toMatch(/not adding any capacity/);
    expect(dupe()).toMatch(/higher than it should be/);
  });

  it('says nothing at all to a machine with one account', () => {
    expect(duplicateAccountNote([{ email: 'you@example.com', accountUuid: 'one' }])).toBe(null);
  });

  /* * TWO SUBSCRIPTIONS ON ONE EMAIL ARE TWO ACCOUNTS, NOT A DUPLICATE.
  */
  it('is keyed on the subscription, not on the email address', () => {
    expect(duplicateAccountNote([
      { email: 'you@example.com', accountUuid: 'one' },
      { email: 'you@example.com', accountUuid: 'two' },
    ])).toBe(null);
  });
});
