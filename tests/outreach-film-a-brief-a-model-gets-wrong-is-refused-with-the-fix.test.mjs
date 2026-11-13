// A BRIEF A MODEL GETS WRONG IS REFUSED, AND THE REFUSAL SAYS WHAT TO CHANGE.
//
// Outreach films are made from one brief.json a model fills in. Before this
// check, a film was made from whatever Codex wrote: Maya's comment vanished
// from her row in four of the first ten films because her title and comment
// were too long together, and one film opened the wrong thread because two
// titles started alike. Measured by running checkBrief on the ten real briefs
// (two fail the Maya rule, one has a 293-character line of code) and on the
// example below with one thing broken at a time.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkBrief, tidyBrief } from '../scripts/outreach-film/lib/brief.mjs';

const root = path.join(import.meta.dirname, '..');
const example = () => JSON.parse(fs.readFileSync(path.join(root, 'scripts/outreach-film/brief.example.json'), 'utf8'));
const site = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/outreach-film-site.json'), 'utf8'));
const problemsWith = (change) => { const b = example(); change(b); return checkBrief(tidyBrief(b), site); };
const one = (change, at) => {
  const p = problemsWith(change);
  expect(p.length, p.join('\n')).toBeGreaterThan(0);
  expect(p.some((x) => x.startsWith(at)), p.join('\n')).toBe(true);
  return p;
};

describe('the example brief', () => {
  it('passes, so a model copying its shape starts from something that films', () => {
    expect(checkBrief(tidyBrief(example()), site)).toEqual([]);
  });
});

describe('the shape', () => {
  it('names a missing field by where it goes', () => {
    one((b) => { delete b.bug.ask; }, 'bug.ask: missing');
    one((b) => { delete b.team; }, 'team: missing');
  });
  it('wants exactly 19 running threads, the first in the cloud', () => {
    one((b) => { b.running.pop(); }, 'running: has 18; needs exactly 19');
    one((b) => { b.running[0].cloud = false; }, 'running[0].cloud');
  });
  it('refuses a key it does not know, which a model leaves behind', () => {
    one((b) => { b.running_placeholder = null; }, 'running_placeholder: is not part of a brief; remove it');
  });
  it('refuses something that is not a brief at all', () => {
    expect(checkBrief([], site)[0]).toMatch(/one JSON object/);
    expect(checkBrief(null, site)[0]).toMatch(/one JSON object/);
  });
  it('stops on unsure, because a wrong film is worse than none', () => {
    expect(problemsWith((b) => { b.unsure = 'the site is one line'; })[0]).toMatch(/^unsure/);
  });
});

describe('what the screen can hold', () => {
  it('takes a 60-character title and refuses a 61-character one', () => {
    expect(problemsWith((b) => { b.bug.title = 'Fix ' + 'r'.repeat(56); })).toEqual([]);
    one((b) => { b.bug.title = 'Fix ' + 'r'.repeat(57); }, 'bug.title: is 61 characters; cut it to at most 60');
  });
  it("keeps Maya's title and comment to 70 together, or her row hides the comment", () => {
    const fit = (b, n) => { b.maya.title = 'Debug ' + 'x'.repeat(30 - 6); b.maya.comment = 'Can you ' + 'y'.repeat(n - 30 - 9) + '?'; };
    expect(problemsWith((b) => fit(b, 70))).toEqual([]);
    one((b) => fit(b, 71), 'maya.comment: her title and comment are 71');
  });
  it('wants a reply of 12 to 28 keyboard characters, since the film types it', () => {
    expect(problemsWith((b) => { b.maya.reply = 'Done, try it'; })).toEqual([]);
    one((b) => { b.maya.reply = 'Done, try i'; }, 'maya.reply: is 11 characters');
    expect(problemsWith((b) => { b.maya.reply = 'r'.repeat(28); })).toEqual([]);
    one((b) => { b.maya.reply = 'r'.repeat(29); }, 'maya.reply: is 29 characters');
    one((b) => { b.maya.reply = 'Rotated it ✓ try now'; }, 'maya.reply: must be plain keyboard text');
  });
  it('keeps the code change between 12 and 30 rows and each row to 100 characters', () => {
    const rows = (b, n) => { b.migration.change.files = [{ path: 'migrations/x.sql', said: 'Adds it.', rows: Array.from({ length: n }, (_, i) => ['+', `SELECT ${i};`]) }]; };
    expect(problemsWith((b) => rows(b, 12))).toEqual([]);
    one((b) => rows(b, 11), 'migration.change: has 11 rows');
    one((b) => rows(b, 31), 'migration.change.files[0].rows: has 31');
    one((b) => { b.migration.change.files[0].rows[0] = ['+', 'x'.repeat(101)]; }, 'migration.change.files[0].rows[0]: is 101 characters');
    one((b) => { b.migration.change.files[0].rows[0] = ['*', 'x']; }, 'migration.change.files[0].rows[0]: must be');
  });
  it('says which way a headline does not fit their page: too wide, too tall or too many lines', () => {
    const report = (why) => ({ theirs: 'Email for\ndevelopers', headlines: [{ fits: false, why, lines: why === 'lines' ? 3 : 1, theirLines: 2 }, { fits: true }, { fits: true }] });
    const p = (why) => checkBrief(tidyBrief(example()), site, report(why)).join('\n');
    expect(p('wide')).toMatch(/headlines\.lines\[0\]: is wider than the space their own headline \("Email for developers", 20 characters\) has/);
    expect(p('tall')).toMatch(/headlines\.lines\[0\]: pushes past the bottom of their hero/);
    expect(p('lines')).toMatch(/headlines\.lines\[0\]: runs to 3 lines on their page where theirs \("Email for developers", 20 characters\) takes 2/);
    expect(checkBrief(tidyBrief(example()), site, { theirs: 'x', headlines: [{ fits: true }, { fits: true }, { fits: true }] })).toEqual([]);
  });
  it('holds a headline to 8 words', () => {
    one((b) => { b.headlines.lines[0] = 'One two three four five six seven eight nine'; }, 'headlines.lines[0]: has 9 words');
  });
});

describe('what the film presses and finds', () => {
  it('needs the bug fix\'s first option to be "Merge it", because she presses 1', () => {
    one((b) => { b.bug.options[0] = 'Ship it'; }, 'bug.options[0]');
  });
  it('refuses two titles that start with the same five words, so the film opens the right one', () => {
    one((b) => { b.running[3].title = 'Fix rounding on multi-parcel rate tables'; }, 'running[3].title: starts with the same five words as bug.title');
    expect(problemsWith((b) => { b.running[3].title = 'Fix rounding on single-parcel rate tables'; })).toEqual([]);
  });
  it('puts every thread in one of the five projects', () => {
    one((b) => { b.sixth.project = 'Billing'; }, 'sixth.project: "Billing" is not one of projects');
  });
});

describe('the truth about the company', () => {
  it('refuses a grounding quote that is not on their site word for word', () => {
    one((b) => { b.grounding[1].quote = 'The Rates API returns prices from every carrier.'; }, 'grounding[1].quote: is not on their site');
  });
  it('refuses a name the site never uses', () => {
    one((b) => { b.sixth.title = 'Retry label purchases when FedEx times out'; }, 'sixth.title: "FedEx" is not on their site');
  });
  it('takes a name everyone knows without a quote', () => {
    expect(problemsWith((b) => { b.sixth.title = 'Retry label purchases when Stripe times out'; })).toEqual([]);
  });
  it('refuses a line lifted from the example, which is another company', () => {
    const other = (b) => { b.company.name = 'Shipfast'; b.grounding[0] = { term: 'Shipfast', quote: 'Shipfast' }; };
    const s = structuredClone(site); s.pages[0].text += '\nShipfast';
    const b = example(); other(b);
    const p = checkBrief(tidyBrief(b), s);
    expect(p.some((x) => x.startsWith('bug.title: "Fix rounding on multi-parcel rate quotes" is copied from brief.example.json')), p.join('\n')).toBe(true);
    expect(p.some((x) => x.startsWith('running[4].title: "Speed up the pricing page" is copied')), p.join('\n')).toBe(true);
  });
  it('refuses their current headline', () => {
    one((b) => { b.headlines.lines[2] = 'Shipping that just works'; }, 'headlines.lines[2]: is their current headline');
  });
});

describe('how it reads', () => {
  it('refuses long dashes, exclamation marks and hype words', () => {
    one((b) => { b.bug.summary = 'Totals ran high — now they round once after the sum of parcels.'; }, 'wording: uses a long dash');
    one((b) => { b.fourth.summary = 'Added a guide for webhooks on a laptop with a test parcel. It works!'; }, 'wording: uses an exclamation mark');
    one((b) => { b.sixth.summary = 'Retries now make label purchases seamless when a carrier times out on us.'; }, 'wording: uses "seamless"');
  });
  it('wants a title to start with a verb', () => {
    one((b) => { b.fourth.title = 'Webhook testing guide'; }, 'fourth.title: "Webhook testing guide" must start with a verb');
  });
});

describe('tidying what a script can put right', () => {
  it('straightens curly quotes and stray spaces, so they never fail a check', () => {
    expect(problemsWith((b) => { b.maya.ask = '  I’m stuck on the  sandbox carrier key. '; })).toEqual([]);
    const t = tidyBrief({ maya: { ask: ' I’m  stuck ' } });
    expect(t.maya.ask).toBe("I'm stuck");
  });
  it('leaves the indentation of code alone', () => {
    const t = tidyBrief({ change: { files: [{ rows: [['+', '    return x;']] }] } });
    expect(t.change.files[0].rows[0][1]).toBe('    return x;');
  });
});
