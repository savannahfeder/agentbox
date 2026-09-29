// WHAT THE NPM PAGE SAYS, AND WHO DECIDED IT.
//
// Every value pinned here is the founder's, given on w-5a90aa1ea4 on
// 2026-09-25, and each was a choice between real alternatives rather than a
// default somebody typed. That is the reason this file exists: these are the
// lines a stranger reads before deciding whether to run the thing, nothing in
// the app breaks if one of them drifts, and so nothing would ever say so.
//
// THE DESCRIPTION IS THE ONE WORTH GUARDING. It said "A beautiful interface for
// your Claude Code agents" until she read it back and said the premise was
// wrong: the app runs Codex as well, and that sentence does not say what the
// thing IS. A description that names one of two engines is not a small
// inaccuracy on a package page, it is the reason half the people it is for
// decide it is not for them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINES } from '../shared/engines.mjs';
import { nameSlug } from '../shared/product-name.mjs';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));

describe('the npm listing', () => {
  it('is published under the name she picked', () => {
    // `agentbox` itself is an npm security holding package from 2022, so it is
    // not available. Checked against the registry on 2026-09-25.
    expect(pkg.name).toBe('agentbox-app');
  });

  it('still carries the product name inside it, so a rename is noticed', () => {
    // scripts/product-name.mjs used to own this field and cannot any more,
    // because what it may be called is decided by what npm has free. This is
    // what is left of that guard: rename the product and this fails, which is
    // the reminder to go and find out whether the new name is available.
    expect(pkg.name).toContain(nameSlug);
  });

  it('keeps the desktop app called what it has always been called', () => {
    // The npm name is not the app's name. `productName` and `build.appId` are
    // what macOS hangs a window title and a permission grant on, and moving
    // either of those revokes what she has already granted.
    expect(pkg.productName).toBe('agentbox');
    expect(pkg.build.appId).toBe('ac.astral.app');
  });

  it('describes the app in one sentence that names both engines', () => {
    const said = pkg.description;
    // The exact wording settled in w-5a90aa1ea4. Not a paraphrase of it.
    expect(said).toBe('An inbox for managing dozens of Claude Code and Codex agents.');
    // One sentence: the description is one line, not several sentences.
    expect(said.match(/\./g)).toHaveLength(1);
    // And it has to still be true when a third engine lands, which is what
    // this last part is really for: it fails the day one is added and the
    // sentence is not revisited.
    const named = ENGINES.filter((e) => new RegExp(e.label, 'i').test(said));
    expect(named.length).toBe(ENGINES.length);
  });

  it('points at the public repo, so Issues has somewhere to go', () => {
    // The repo went public on 2026-09-28 as savannahfeder/agentbox, one commit
    // and no history, which is what she asked for. Without these three fields
    // the npm page shows no Repository link and no Issues link at all.
    const REPO = 'https://github.com/savannahfeder/agentbox';
    expect(pkg.repository.url).toBe(`git+${REPO}.git`);
    expect(pkg.homepage).toBe(`${REPO}#readme`);
    expect(pkg.bugs.url).toBe(`${REPO}/issues`);
    // The old private repo must never be where a stranger is SENT. It does
    // still appear in `build.publish`, and that is correct and must stay:
    // that block is how the installed desktop app finds its own updates, and
    // Astral-Agent/astral-releases is a real repo that shipped .dmg files
    // already point at. It is a release channel, not a link on a page.
    for (const sent of [pkg.repository.url, pkg.homepage, pkg.bugs.url]) {
      expect(sent).not.toMatch(/Astral-Agent/);
    }
    expect(pkg.build.publish[0].owner).toBe('Astral-Agent');
  });

  it('credits her by name and does not publish her email', () => {
    expect(pkg.author).toBe('Savannah Feder'); // public-check: allow
    expect(pkg.author).not.toMatch(/@/);
    expect(JSON.stringify(pkg)).not.toMatch(/[\w.]+@[\w.]+\.\w+/);
  });

  it('tells the command the same name the package has', () => {
    // `npx <package>` is the only way in for somebody who has never installed
    // it, so help that names a different command sends them nowhere.
    const help = fs.readFileSync(path.join(here, 'bin', 'agentbox.mjs'), 'utf8');
    const shown = [...help.matchAll(/npx ([a-z0-9@/-]+)/g)].map((m) => m[1]);
    expect(shown.length).toBeGreaterThan(0);
    for (const name of shown) expect(name).toBe(pkg.name);
  });
});
