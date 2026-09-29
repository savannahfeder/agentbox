// THE APP'S NAME IS READ, NEVER TYPED, AND THIS IS WHAT KEEPS IT THAT WAY.
//
// This app has been Zero, then Astral, then Powerup, and is agentbox now. Each
// of the first three renames was a hand-run search and replace over about two
// hundred string literals, and each one left some behind: the screenshot on her
// row shows "Import into the app?" two names later. A sweep is a thing you have to
// remember to run. A test is a thing that runs itself.
//
// So there are three claims here, and each one is a way the last rename went
// wrong:
//
//   1. package.json agrees with shared/product-name.mjs. It cannot import the
//      name, so a script carries it across, and a rename that edits the module
//      and stops there would ship an app whose Dock, window and macOS
//      permission sentences still said the old thing.
//   2. Nothing in the code spells any name this app has ever had. That is the
//      whole point: a literal is a thing the next rename has to find.
//   3. The briefs name the app through {{name}} and {{Name}}, because a
//      markdown file cannot import anything, and an agent told the wrong name
//      for the app it is working inside is the fault she opened the row about.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { NAME, Name, WAS, nameSlug, fillName } from '../shared/product-name.mjs';
import { drift } from '../scripts/product-name.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

describe('the two spellings', () => {
  it('is the plain word mid-sentence and the same word raised at a sentence start', () => {
    expect(NAME).toBe('agentbox');
    expect(Name).toBe('Agentbox');
    expect(Name).toBe(NAME.charAt(0).toUpperCase() + NAME.slice(1));
  });

  // A name that is an ordinary proper noun comes out identical from both, so
  // the rule costs nothing when it does not apply.
  it('leaves a name that is already capitalised alone', () => {
    const raise = (w) => w.charAt(0).toUpperCase() + w.slice(1);
    for (const was of WAS) expect(raise(was)).toBe(was);
  });

  it('gives a slug safe for a folder or a package name', () => {
    expect(nameSlug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('the names this app has had', () => {
  // main/main.mjs walks WAS to find the data folder an existing install already
  // writes to. Losing an entry loses real people their theme, their zoom and
  // their project order, silently, on the release that drops it.
  it('is newest first and never has the current name on it', () => {
    expect(WAS).toEqual(['Powerup', 'Astral', 'Zero']);
    expect(WAS).not.toContain(NAME);
    expect(WAS).not.toContain(Name);
  });

  it('is what the data folder fallback actually reads', () => {
    expect(read('main/main.mjs')).toMatch(/for \(const was of WAS\)/);
  });
});

describe('package.json, which cannot import the name', () => {
  // `node scripts/product-name.mjs --write` is what carries it across. This
  // fails when that step of a rename is skipped, and it names the fields.
  it('has been carried across by the script that does it', () => {
    const pkg = JSON.parse(read('package.json'));
    const behind = drift(pkg);
    expect(behind.map(([where]) => where)).toEqual([]);
  });
});

describe('nothing spells a name this app has had', () => {
  // The directories the sweep walked. A literal here is a thing the NEXT
  // rename has to find by hand, which is the cost this whole change removes.
  const DIRS = ['main', 'shared', 'renderer/src'];

  // Each of these is allowed to hold an old name, and the reason is the thing
  // that breaks if it stops. They are the same list scripts/name-from-one-place
  // protects, and they are checked by hand when one of them changes.
  const ALLOWED = [
    // Release identity. The GitHub organisation and repository exist under
    // these names, and downloaded .dmg files already carry them.
    'Astral-Agent', 'astral-releases', 'Astral-arm64', 'Astral.app',
    // THE ONE ENVIRONMENT VARIABLE AND THE TWO URL SCHEMES THAT MUST KEEP
    // ANSWERING TO AN OLD NAME. Both are derived rather than typed now
    // (shared/product-name.mjs and shared/schemes.mjs), and both are still
    // SPOKEN here, because what is on the other end of them is not in this
    // repo: a launchd job exporting the old variable, and a product logo
    // stored months ago as a url on the old scheme.
    'ASTRAL_HOME', 'astral-doc', 'astral-img',
    // A KEY ALREADY WRITTEN INTO HER BROWSER STORAGE, and a domain that really
    // resolves. Renaming the first forgets whether her sidebar is collapsed;
    // renaming the second points the terms and privacy links at nothing.
    'powerup.sidebar.collapsed', 'astral.ac',
    // Identifiers, which are not words on a screen. The list is SHORTER than it
    // was on purpose: an identifier that carried the app's name has been made
    // name-free rather than renamed, so the next rename never has to find it.
    'startedByZero',
    'zeroPid', 'ZeroAudio', 'inboxZero',
    // Her own account folder, a real path on her disk.
    '/Users/you/Zero/accounts',
    // A REAL CONVERSATION OF HERS, QUOTED IN A FIXTURE. It is a transcript of
    // something that was said when the app had that name, and rewriting it
    // makes the fixture a record of a conversation nobody had.
    'called Powerup', 'Powerup application, also known as Zero',
    'Found it. the inbox and Harbour read different stores',
  ];

  // COMMENTS ARE NOT COPY AND ARE NOT CHECKED. They quote her, verbatim, with
  // dates, and they are the record of why the app is the way it is. Rewriting a
  // quote of hers to say a word she did not say makes the record wrong.
  //
  // WHOLE BLOCKS, NOT LINES THAT OPEN WITH A MARKER. The first cut of this
  // dropped only lines starting with // or *, and a JSX comment wraps its prose
  // over lines that start with an ordinary word, so it reported eleven comments
  // as leftovers and buried the two real ones in them.
  const codeOnly = (src) => src
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ')
    // A trailing comment on a line of code counts too. `(?<!:)` keeps the //
    // in https:// out of it, which is the only other place two slashes run
    // together in these files.
    .replace(/(?<!:)\/\/.*$/gm, '');

  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel, out);
      else if (/\.(ts|tsx|mjs|cjs)$/.test(e.name)) out.push(rel);
    }
    return out;
  };

  // NOT A MODULE and not shipped: osascript runs it, so it cannot import, and
  // main/window-helper.swift replaced it. Its one named string never reaches
  // her, because the permission page drives off the code and not the reason.
  const SKIP = new Set(['main/rest-windows.jxa.js', 'shared/product-name.mjs']);

  for (const dir of DIRS) {
    it(`does not type one in ${dir}`, () => {
      const guilty = [];
      for (const file of walk(dir)) {
        if (SKIP.has(file)) continue;
        let src = codeOnly(read(file));
        for (const ok of ALLOWED) src = src.replaceAll(ok, '');
        for (const was of [...WAS, Name]) {
          const at = src.indexOf(was);
          if (at > -1) guilty.push(`${file}: ${src.slice(Math.max(0, at - 40), at + 40).trim()}`);
        }
      }
      expect(guilty).toEqual([]);
    });
  }

  // AND NOT IN LOWERCASE EITHER, WHICH IS THE HOLE THIS TEST HAD.
  //
  // The loop above looks for `Astral` and `Powerup` as they are spelled in WAS,
  // so it never saw `console.warn('astral: …')`, `astral-crash-reports`,
  // `.astral`, `astral-demo` or `name: 'astral'` on the Codex handshake. All of
  // those sat in the code for two renames and were found by hand on 2026-09-22,
  // after the founder read a message from an agent that called this app by a
  // name it has not had for months and asked "what is the app?".
  //
  // `Zero` IS NOT CHECKED IN LOWERCASE and cannot be: "zero" is an ordinary
  // English word and a number, and this would fail on every `slice(0)` comment
  // in the repo. That is a real gap, stated rather than papered over; it is
  // narrow, because the names that follow a proper noun are the ones that leak.
  const LOWER = WAS.filter((was) => was.toLowerCase() !== 'zero').map((was) => was.toLowerCase());

  for (const dir of DIRS) {
    it(`does not type a lowercase one in ${dir} either`, () => {
      const guilty = [];
      for (const file of walk(dir)) {
        if (SKIP.has(file)) continue;
        let src = codeOnly(read(file)).toLowerCase();
        for (const ok of ALLOWED) src = src.replaceAll(ok.toLowerCase(), '');
        for (const was of LOWER) {
          const at = src.indexOf(was);
          if (at > -1) guilty.push(`${file}: ${src.slice(Math.max(0, at - 40), at + 40).trim()}`);
        }
      }
      expect(guilty).toEqual([]);
    });
  }
});

describe('nothing on disk is named after a name this app has had', () => {
  // A FILE NAME IS READ BY EVERY AGENT THAT LISTS THE FOLDER, and ten of them
  // still said the app: `tests/astral-home.setup.mjs`,
  // `scripts/what-throws-her-out-of-astral.mjs` and eight more. A name in a
  // file name is worse than one in a comment, because it is what a session sees
  // before it opens anything.
  // TRACKED FILES, NOT WHATEVER IS LYING IN THE WORKING TREE. The first cut of
  // this walked the folder and failed in her own checkout on 573 files it does
  // not own: `main/window-helper` is a build artifact, and a scratch folder
  // somebody left beside it is not the repository's naming. Only what is
  // committed is a name the next agent reads.
  const tracked = () => execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' })
    .split('\n').map((l) => l.trim()).filter(Boolean);

  // The one exception is the script that PERFORMED a rename, kept as history.
  // Renaming it would be renaming the record of the thing it did.
  const KEPT = new Set(['scripts/rename-to-powerup.mjs']);

  it('has no file whose own name carries one', () => {
    const named = tracked().filter((f) => {
      if (KEPT.has(f)) return false;
      const base = f.toLowerCase();
      return WAS.map((w) => w.toLowerCase()).some((was) => was !== 'zero' && base.includes(was));
    });
    expect(named).toEqual([]);
  });
});

describe('the briefs, which are markdown and cannot import it either', () => {
  // The ones a worker session reads. founder.md is hers and may say anything.
  // briefs/message-rules.md is the two old message files joined (w-3dc46f3a67);
  // briefs/writing-rules.md is hers and is read only by the migration.
  const BRIEFS = ['briefs/worker.md', 'briefs/writing-rules.md', 'briefs/message-rules.md'];

  it('names the app through a token, so a rename reaches a running agent', () => {
    const worker = read('briefs/worker.md');
    expect(worker).toContain('You are a worker session in {{name}}');
    expect(fillName(worker)).toContain(`You are a worker session in ${NAME}`);
  });

  // HER QUOTED WORDS ARE NOT TOKENISED, on the same rule the comments follow.
  // So this checks the prose, by filling the tokens and asking whether any old
  // name survives OUTSIDE a quotation.
  it('leaves no old name in prose that is not a quote of hers', () => {
    for (const file of BRIEFS) {
      const prose = fillName(read(file)).replace(/"[^"]*"/g, '');
      for (const was of WAS) expect(prose, `${file} still says ${was}`).not.toContain(was);
    }
  });

  // The shipped defaults are copies of the same files, used to reset the boxes
  // in Settings. A copy that drifts hands her back a brief from two renames ago.
  it('ships defaults that are the same files', () => {
    const defaults = JSON.parse(read('shared/instruction-defaults.json'));
    expect(defaults.system).toBe(read('briefs/worker.md'));
    // One document since w-3dc46f3a67, where this line said briefs/finishing.md.
    expect(defaults.messages).toBe(read('briefs/message-rules.md'));
  });

  // FILLED WHERE THE BRIEF IS USED, NOT WHERE IT IS READ FOR EDITING. Filling
  // on the way into Settings would show her the filled text and save it back
  // with the name baked into her own copy, which is the thing this prevents.
  it('is filled in by the supervisor and not by the settings editor', () => {
    expect(read('main/supervisor.mjs')).toContain('fillName(');
    expect(read('main/instruction-settings.mjs')).not.toContain('fillName');
  });
});

describe('fillName', () => {
  it('fills both tokens with the spelling each position asks for', () => {
    expect(fillName('{{Name}} is an inbox. Reply and {{name}} runs it.'))
      .toBe(`${Name} is an inbox. Reply and ${NAME} runs it.`);
  });

  it('leaves text with no tokens exactly as it was', () => {
    expect(fillName('nothing to fill')).toBe('nothing to fill');
    expect(fillName(null)).toBe('');
  });
});
