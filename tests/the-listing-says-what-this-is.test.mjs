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
    // Hers, word for word, w-5a90aa1ea4 on 2026-09-25. Not a paraphrase of it.
    expect(said).toBe('An inbox for managing dozens of Claude Code and Codex agents.');
    // One sentence. Hers: "The description should be one line, not multiple
    // sentences."
    expect(said.match(/\./g)).toHaveLength(1);
    // And it has to still be true when a third engine lands, which is what
    // this last part is really for: it fails the day one is added and the
    // sentence is not revisited.
    const named = ENGINES.filter((e) => new RegExp(e.label, 'i').test(said));
    expect(named.length).toBe(ENGINES.length);
  });

  it('credits her by name and does not publish her email', () => {
    expect(pkg.author).toBe('Savannah Feder');
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
