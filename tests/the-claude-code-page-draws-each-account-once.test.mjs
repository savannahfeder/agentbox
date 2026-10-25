// THE CLAUDE CODE PAGE DRAWS EACH ACCOUNT ONCE, WITH REFRESH OVER ALL OF THEM.
//
// What was said (2026-10-21, with a screenshot of Settings › Claude Code):
// "Quite often the accounts are out of sync. The refresh button refreshes all
// of them so I don't know why it's in that position." The page drew a Cloud
// card and a This computer card, each with a tile per account, so two
// subscriptions were four tiles with two sets of numbers, and Refresh sat on
// the second card though it read both. Five layouts later: "most of these
// still confuse me/look ugly ... just making one very good design".
//
// The page now has one "Signed in" group, a tile per account with Refresh at
// its head, then the cloud as one row with a switch and a sentence saying
// when threads go there and on which accounts.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cloudRunsLine } from '../renderer/src/components/Settings';

const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
const page = settings.slice(settings.indexOf('const enginePage = (engine'), settings.indexOf('<div className="set-nav">'));
// Codex's page is drawn by the same markup since 2026-10-25.
const claude = page.slice(page.indexOf('<Place'), page.indexOf('{/* SIGNING A SECOND ACCOUNT IN'));

describe('the Claude Code page', () => {
  it('the reported case:one group of tiles, every account in it, with Refresh at its head', () => {
    expect(claude.match(/<Place\b/g)).toHaveLength(1);
    expect(claude).toMatch(/name="Signed in"[\s\S]*onClick=\{refresh\}[\s\S]*accounts=\{tiles\}/);
    expect(page).toContain("engine === 'codex' ? refreshCodex() : readAccounts(true)");
  });

  it('IN USE sits beside the address, and must NOT be pushed to the right margin, where it was missed', () => {
    const css = fs.readFileSync(new URL('../renderer/src/components/settings.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.acct-tile-head .set-badge {'), css.indexOf('}', css.indexOf('.acct-tile-head .set-badge {')));
    expect(rule).toContain('.acct-tile-head .set-badge {');
    expect(rule).not.toMatch(/margin-left:\s*auto/);
    // Switch takes the right margin instead, without making the address's row taller.
    expect(css).toMatch(/\.acct-switch \{[^}]*margin: -2px 0 -2px auto/);
  });

  it('the cloud is one row with a switch, not a second set of tiles', () => {
    expect(claude).toMatch(/<Group id="cloud-accounts" label="Cloud">\s*<Row label="Use the cloud"/);
    expect(claude).toContain('cloudToggleTarget(cloudHere)');
    expect(page).not.toContain('cloudCard');
  });
});

describe('the cloud row’s sentence', () => {
  // ONE ACCOUNT, HOWEVER MANY ARE SIGNED IN THERE (w-dac993a554). This listed
  // every cloud login and ended "in turn", which is what `pickCloudLogin` did
  // until the cloud stopped rotating. It takes one account now and waits for
  // it, so the sentence names that one.
  it('the reported case: on first, on the account it runs on', () => {
    expect(cloudRunsLine('all', 'a@example.test')).toBe('Threads start there first, on a@example.test.');
  });

  it('when this computer is full, and off', () => {
    expect(cloudRunsLine('full', 'a@example.test')).toBe('Threads start there when this computer is full, on a@example.test.');
    expect(cloudRunsLine('mac', 'a@example.test')).toBe('Every thread runs on this computer.');
  });

  it('says it without a name when the cloud has not said which account it is', () => {
    expect(cloudRunsLine('all', null)).toBe('Threads start there first, on your cloud account.');
  });

  it('must NOT name a second account, however many are signed in there', () => {
    const said = cloudRunsLine('all', 'a@example.test');
    expect(said).not.toContain('in turn');
    expect(said).not.toContain('b@example.test');
  });
});
