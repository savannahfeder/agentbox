// The promise on the landing page is that we receive none of it, and a crash
// report is the one payload that can break it by accident: a path rides inside
// an error, in three places at once, without anyone putting it there. She
// approved crash reports on 2026-08-19 on exactly that condition — scrubbed
// before it leaves, with tests against the scrub.
//
// So these are the tests that fail the build on a leak. The cases are the ones
// measured on 2026-08-19, not invented: a real Node ENOENT, and the app's own
// throw sites that interpolate a user's project name into a message.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPrivate, scrubError, scrubStack, scrubText, withoutOurOwnPaths } from '../shared/crash-scrub.mjs';
import { installCrashReports, report } from '../main/crash-report.mjs';

const HOME = '/Users/you';
const APP = '/Users/you/Desktop/dev/zero';
const ctx = { home: HOME, username: 'you', appDir: APP };

describe('the four rules', () => {
  it('replaces the home directory and keeps only the depth', () => {
    const out = scrubText(`could not read ${HOME}/Desktop/dev/acme-teardown/notes.md`, ctx);
    expect(out).not.toContain('you');
    expect(out).not.toContain('acme-teardown');
    expect(out).toContain('<~+4>');
  });

  it('keeps our own code path, because that is what the report is for', () => {
    expect(scrubText(`at ${APP}/main/store.mjs:142:11`, ctx)).toContain('app:main/store.mjs:142');
  });

  it('names no folder outside the bundle, only how deep it was', () => {
    expect(scrubText('/opt/homebrew/lib/secret-client/x.mjs', ctx)).toBe('<abs+5>');
  });

  it('drops the syscall arguments and keeps the syscall', () => {
    const err = Object.assign(new Error(`ENOENT: no such file or directory, open '${HOME}/Desktop/dev/acme-teardown/notes.md'`), {
      code: 'ENOENT', syscall: 'open', path: `${HOME}/Desktop/dev/acme-teardown/notes.md`, dest: `${HOME}/other`,
    });
    const out = scrubError(err, ctx);
    expect(out.code).toBe('ENOENT');
    expect(out.syscall).toBe('open');
    expect(out).not.toHaveProperty('path');
    expect(out).not.toHaveProperty('dest');
    expect(JSON.stringify(out)).not.toContain('acme-teardown');
  });

  it('keeps stack frames inside the bundle and counts the rest', () => {
    const stack = [
      'Error: boom',
      `    at readItem (${APP}/main/store.mjs:142:11)`,
      `    at async run (${HOME}/Desktop/dev/acme-teardown/build.mjs:9:3)`,
      '    at node:internal/process/task_queues:95:5',
    ].join('\n');
    const { frames, dropped } = scrubStack(stack, ctx);
    expect(frames).toHaveLength(1);
    expect(frames[0].at).toBe('app:main/store.mjs');
    expect(frames[0].line).toBe(142);
    expect(dropped).toBe(2);
  });
});

describe('the user\'s own words never leave', () => {
  // main/store.mjs:142 — `no such product: ${slug}` — where the slug IS the
  // name of the project someone is working on.
  it('redacts a value interpolated after a colon', () => {
    expect(scrubText('no such product: acme-teardown', ctx)).toBe('no such product: <value>');
  });

  it('redacts a quoted string, which is where a task title would ride', () => {
    expect(scrubText(`failed to open task 'Ship the Q3 pricing page for Acme'`, ctx)).toBe("failed to open task '<str>'");
  });

  it('never carries a task title through the renderer path either', () => {
    const err = new Error(`render failed for "Rewrite the onboarding email for Northwind"`);
    expect(JSON.stringify(scrubError(err, ctx))).not.toContain('Northwind');
  });
});

describe('the check that runs before anything is written', () => {
  it('finds a home directory that survived', () => {
    expect(findPrivate({ a: `${HOME}/x/y` }, ctx)).not.toHaveLength(0);
  });

  it('finds a bare username', () => {
    expect(findPrivate({ a: 'user you hit this' }, ctx)).not.toHaveLength(0);
  });

  it('passes a scrubbed report', () => {
    const err = Object.assign(new Error(`ENOENT: no such file or directory, open '${HOME}/Desktop/dev/acme/notes.md'`), {
      code: 'ENOENT', syscall: 'open', stack: `Error: x\n    at r (${APP}/main/store.mjs:1:1)`,
    });
    expect(findPrivate(scrubError(err, ctx), ctx)).toEqual([]);
  });

  // WHOSE MAC THIS IS MUST NOT DECIDE WHETHER WE HEAR ABOUT THE CRASH.
  // Caught on a GitHub macOS runner on 2026-08-25, the first machine other than
  // hers this suite has ever run on. That account is called `runner`, we ship
  // `node_modules/@vitest/runner`, and the kept frame `app:node_modules/
  // @vitest/runner/dist/index.js` therefore contained the username. The check
  // called it a leak, the writer threw the whole report away, and every crash
  // on that Mac came back as `kind: 'redacted'` with nothing in it. `dev`,
  // `test`, `app` and `node` are ordinary names for a Mac account and would all
  // have done the same, so this was never really about a runner.
  const inOurBundle = ['runner', 'dev', 'test', 'app', 'node', 'main', 'src'];
  for (const name of inOurBundle) {
    it(`still reports the crash when the account is called ${name}`, () => {
      const theirs = { home: `/Users/${name}`, username: name, appDir: `/Users/${name}/Astral.app` };
      const err = Object.assign(new Error('boom'), {
        stack: [
          'Error: boom',
          `    at q (/Users/${name}/Astral.app/main/${name}-thing.mjs:4:2)`,
          `    at r (file:///Users/${name}/Astral.app/node_modules/@vitest/${name}/dist/index.js:9:1)`,
        ].join('\n'),
      });
      const scrubbed = scrubError(err, theirs);
      expect(findPrivate(scrubbed, theirs)).toEqual([]);
      // And it is not passing by being empty: our own frames are still in it.
      expect(scrubbed.frames).toHaveLength(2);
      expect(scrubbed.frames[0].at).toContain('app:');
    });
  }

  // The other side of the same coin. Stripping our bundle paths out before the
  // scan must not blind the scan to a leak sitting next to one.
  it('still catches a real leak in a payload that also has our own paths in it', () => {
    const payload = { site: `app:main/store.mjs:1`, note: `failed under ${HOME}/Desktop` };
    expect(findPrivate(payload, ctx)).not.toHaveLength(0);
  });

  it('still catches the username when it is a word of its own, not our path', () => {
    const theirs = { home: '/Users/runner', username: 'runner', appDir: '/Users/runner/Astral.app' };
    expect(findPrivate({ a: 'app:main/store.mjs', b: 'thrown by runner' }, theirs)).not.toHaveLength(0);
  });
});

describe('what actually lands on disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-crash-test-'));
  installCrashReports({ appDir: process.cwd(), dir, version: '0.1.0' });

  it('writes a report a stranger could hand us with nothing of theirs in it', () => {
    const err = Object.assign(new Error(`ENOENT: no such file or directory, open '${os.homedir()}/Desktop/dev/acme-teardown/notes.md'`), {
      code: 'ENOENT', syscall: 'open', path: `${os.homedir()}/Desktop/dev/acme-teardown/notes.md`,
    });
    const file = report('main-uncaught', err);
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(payload.kind).toBe('main-uncaught');
    expect(payload.error.code).toBe('ENOENT');
    expect(payload.app.version).toBe('0.1.0');
    expect(payload.os.platform).toBe(process.platform);
    expect(typeof payload.installId).toBe('string');
    // `withoutOurOwnPaths` and not the raw JSON, for the reason the check
    // itself uses it. A kept frame like `app:node_modules/@vitest/runner/...`
    // is the same string in every report from every Mac, so when the account
    // running this happens to be called `runner` the word in that payload came
    // from our bundle and not from them. Measured on a GitHub macOS runner,
    // 2026-08-25: that path was the only place the name appeared. Everything
    // that is NOT our own path is still held to the letter.
    const text = withoutOurOwnPaths(JSON.stringify(payload));
    expect(text).not.toContain(os.homedir());
    expect(text).not.toContain('acme-teardown');
    expect(text).not.toContain(os.userInfo().username);
    // And the bundle paths really are ours: nothing outside the app survived.
    expect(payload.error.frames.every((f) => f.at.startsWith('app:'))).toBe(true);
  });

  it('scrubs an extra field on the way in, not only the error', () => {
    // Callers can attach context (an exit code, a process type). It gets the
    // same treatment as the error, so a caller cannot widen the payload later.
    const file = report('child-gone', new Error('boom'), { note: `${os.homedir()}/Desktop/dev/acme/x.md`, exitCode: 9 });
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(payload.exitCode).toBe(9);
    expect(JSON.stringify(payload)).not.toContain('acme');
    expect(findPrivate(payload, { home: os.homedir(), username: os.userInfo().username })).toEqual([]);
  });

  it('sends nothing anywhere until a destination is chosen', async () => {
    // No network client exists in this file. The seam is the only way out and
    // it is empty, which is what "nothing leaves the machine yet" means.
    const src = fs.readFileSync(new URL('../main/crash-report.mjs', import.meta.url), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');   // the comments name the candidates; the code must not
    expect(src).not.toMatch(/https?:\/\//);
    expect(src).not.toMatch(/\bfetch\(|node:https?|posthog|aptabase|sentry/i);
  });
});
