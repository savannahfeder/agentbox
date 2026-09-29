// Packaging, pinned. Everything here was measured on a real signed build on
// 2026-08-20, and every one of these lines is something that, when it
// silently stopped being true, produced a .dmg that installed an app which
// did nothing visible wrong until somebody tried to use it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpacked } from '../main/supervisor.mjs';
import { NAME, Name, WAS } from '../shared/product-name.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));

describe('the app a stranger downloads is called Powerup', () => {
  it(`names itself ${NAME} everywhere a person can see the name`, () => {
    // package.json cannot import the name, so scripts/product-name.mjs carries
    // it across and this is the guard that the crossing happened. A rename that
    // edits shared/product-name.mjs and stops there fails here.
    expect(pkg.productName).toBe(NAME);
    expect(pkg.build.productName).toBe(NAME);
    // The window's own title bar. It said the app until the first rename landed,
    // so the app shipped under the internal name for as long as there was a
    // build. It reads the name now rather than holding one.
    const main = fs.readFileSync(path.join(repo, 'main', 'main.mjs'), 'utf8');
    expect(main).toMatch(/title: NAME,/);
    expect(main).not.toMatch(/title: 'Zero'/);
    for (const was of WAS) expect(main).not.toContain(`title: '${was}'`);
  });

  // THE NAME MOVED AND THE BUNDLE ID DID NOT, ON PURPOSE.The Dock reads
  // productName, so that is what moved. This string is what macOS keys the
  // login item, the notarisation ticket and EVERY permission the user has
  // already granted off, and it is invisible to them. Moving it too would
  // have made the rename cost every user their accessibility and
  // notification grants for nothing anyone can see. It stays.
  it('keeps a bundle id that is ours and never changes by accident', () => {
    expect(pkg.build.appId).toBe('ac.astral.app');
  });
});

// The trade-off was measured before it was picked, on an M4: a universal build
// reports Code Type ARM64 with proc_translated 0, so carrying both costs no
// speed, only bytes. Before
// this, /download served a dmg with one arm64 slice in it and an Intel Mac got
// "Bad CPU type in executable" after pulling 152 MB.
describe('the download opens on both kinds of Mac', () => {
  it('asks electron-builder for one file that carries both chips', () => {
    const targets = pkg.build.mac.target;
    // ONE DMG, and the decision is about that dmg. This used to require the
    // whole target list to be exactly one entry long, which was the same
    // sentence for as long as the dmg was the only thing a release contained.
    // It stopped being the same sentence on 2026-08-28: a release now also
    // carries a zip, because that is what an installed Agentbox updates itself
    // with, and Squirrel. Mac swaps an .app bundle and cannot read a disk
    // image. The zip is not a download and is not on the website. What was
    // picked, and what is still pinned here, is that there is ONE dmg and it
    // carries both chips.
    const dmgs = targets.filter((t) => t.target === 'dmg');
    expect(dmgs).toHaveLength(1);
    // NOT ['arm64'], and not ['arm64', 'x64'] either: two entries would write
    // two dmgs and two files is the shape that was not picked.
    expect(dmgs[0].arch).toEqual(['universal']);
    // And every other target has to carry both chips too, or an Intel Mac
    // updates itself onto an arm-only build and stops opening.
    for (const t of targets) expect(t.arch).toEqual(['universal']);
  });

  it('lets the scripts that open a packed build find the universal folder', () => {
    // electron-builder names the output folder after the arch it packed, so
    // release/mac-arm64 became release/mac-universal on the line above. Two
    // scripts had that folder written into them and would have gone on opening
    // a stale app, or none, without saying so.
    for (const f of ['scripts/fresh-user.mjs', 'scripts/prove-the-new-user-opens.mjs']) {
      expect(fs.readFileSync(path.join(repo, f), 'utf8')).toContain('mac-universal');
    }
  });
});

describe('signing and notarisation', () => {
  it('turns the hardened runtime on and hands it entitlements that exist', () => {
    expect(pkg.build.mac.hardenedRuntime).toBe(true);
    const ent = path.join(repo, pkg.build.mac.entitlements);
    expect(fs.existsSync(ent)).toBe(true);
    const plist = fs.readFileSync(ent, 'utf8');
    // Electron compiles JavaScript at run time. Without these the app is
    // signed, notarised, and killed by the kernel the moment it opens.
    for (const key of [
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.allow-unsigned-executable-memory',
      'com.apple.security.cs.disable-library-validation',
    ]) expect(plist).toContain(key);
  });

  it('does not notarise unless the release script asks it to', () => {
    // `npm run pack` has to work on a machine with no Apple credentials at all.
    // Notarisation is turned on per run, by scripts/release.mjs, once it has
    // checked that the three environment variables are actually there.
    expect(pkg.build.mac.notarize).toBe(false);
    const release = fs.readFileSync(path.join(repo, 'scripts', 'release.mjs'), 'utf8');
    expect(release).toContain('-c.mac.notarize=true');
    for (const key of ['APPLE_ID', 'APPLE_TEAM_ID', 'APPLE_APP_SPECIFIC_PASSWORD']) {
      expect(release).toContain(key);
    }
  });

  // The logo is the app's own ProductMark, so the icon script computes the rays
  // rather than owning a second copy of them. This is the test that stops the
  // two drifting: change the mark and the icon must move with it, or this fails
  // and says so.
  it('draws the icon from the same rays as the mark in the sidebar', () => {
    const mark = fs.readFileSync(path.join(repo, 'renderer/src/components/ProductMark.tsx'), 'utf8');
    const icon = fs.readFileSync(path.join(repo, 'scripts/make-icon.mjs'), 'utf8');

    // The four numbers that ARE the drawing: the two inner radii and the two
    // outer ones, alternating ray by ray.
    const geometry = (src) => {
      const inner = src.match(/inner\s*=\s*i % 2 === 0 \? ([\d.]+) : ([\d.]+)/);
      const outer = src.match(/outer\s*=\s*i % 2 === 0 \? ([\d.]+) : ([\d.]+)/);
      const rays = src.match(/RAYS\s*=\s*(\d+)/);
      return { inner: inner?.slice(1, 3), outer: outer?.slice(1, 3), rays: rays?.[1] };
    };

    const a = geometry(mark);
    expect(a.rays).toBe('24');
    expect(a.inner).toEqual(['5.6', '6.4']);
    expect(geometry(icon)).toEqual(a);

    // And the same stroke, in the same proportion to the same 24 unit grid.
    expect(mark).toContain('strokeWidth="1.4"');
    expect(icon).toContain('1.4 * k');
    expect(icon).toContain('GRID = 24');
  });

  // Rule 6: an approval closes the option set. The mark was picked, so the four
  // drawings this script used to offer are gone rather than switchable. Their
  // code is in decisions.md under 08-20 if anyone ever needs it back.
  it('offers no icon to switch to, because she picked one', () => {
    const icon = fs.readFileSync(path.join(repo, 'scripts/make-icon.mjs'), 'utf8');
    for (const dead of ['lake:', 'horizon:', 'letter:', 'rows:']) {
      expect(icon).not.toContain(dead);
    }
    expect(icon).not.toContain('npm run icon -- ');
  });

  it('has an icon to sign, and it is a real .icns', () => {
    const icns = path.join(repo, 'build', 'icon.icns');
    expect(fs.existsSync(icns)).toBe(true);
    // 'icns' magic. A PNG renamed .icns builds fine and shows a blank tile.
    expect(fs.readFileSync(icns).subarray(0, 4).toString('ascii')).toBe('icns');
  });
});

describe('what actually goes in the bundle', () => {
  // A GUARD, NOT A LEFTOVER. @emulatorjs was 296 MB and tripled the download.
  // An older branch merged into main can bring it back, so nothing in the
  // shipped source may reach for it again.
  it('has no emulator left to ship', () => {
    expect(JSON.stringify(pkg.dependencies)).not.toContain('@emulatorjs');
    for (const dir of ['main', 'shared', 'renderer/src']) {
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(d, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });
      for (const file of walk(path.join(repo, dir))) {
        if (!/\.(mjs|js|ts|tsx|cjs)$/.test(file)) continue;
        expect(fs.readFileSync(file, 'utf8')).not.toContain('@emulatorjs');
      }
    }
  });

  it('unpacks the two files a stranger process has to open by path', () => {
    // The Claude CLI reads --settings itself and macOS execs the approval
    // server itself. Neither is Node, so neither can see inside app.asar.
    expect(pkg.build.asarUnpack).toContain('worker-permissions.json');
    expect(pkg.build.asarUnpack).toContain('scripts/approval-server.sh');
    const sup = fs.readFileSync(path.join(repo, 'main', 'supervisor.mjs'), 'utf8');
    expect(sup).toMatch(/unpacked\(path\.join\(this\.appDir, 'worker-permissions\.json'\)\)/);
    expect(sup).toMatch(/unpacked\(path\.join\(this\.appDir, 'scripts', 'approval-server\.sh'\)\)/);
  });

  // THE ONE THAT COST A MORNING. Unpacking the launcher is not enough: the
  // launcher then has to find the SERVER, and the server is not unpacked with
  // it. The old line asked for
  // app.asar.unpacked/main/approval-prompt-server.mjs, node threw
  // MODULE_NOT_FOUND, the MCP server never started, and the Claude CLI would
  // not run a session at all because the tool named by --permission-prompt-tool
  // was missing. Every agent in every packaged build stopped after four
  // seconds. So this builds the bundle layout for real and runs the launcher
  // inside it.
  it('starts the approvals server from inside a packaged bundle', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-bundle-'));
    const contents = path.join(root, `${NAME}.app`, 'Contents');
    const scripts = path.join(contents, 'Resources', 'app.asar.unpacked', 'scripts');
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
    // THE LAUNCHER ASKS THE BUNDLE WHAT ITS BINARY IS CALLED rather than
    // spelling it, because the name moves. So the bundle has to answer.
    fs.writeFileSync(path.join(contents, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>${NAME}</string></dict></plist>\n`);
    fs.copyFileSync(path.join(repo, 'scripts', 'approval-server.sh'), path.join(scripts, 'approval-server.sh'));
    // Agentbox itself, stubbed: it prints what it was asked to run, which is the
    // whole claim under test.
    const agentbox = path.join(contents, 'MacOS', Name);
    fs.writeFileSync(agentbox, '#!/bin/bash\necho "$ELECTRON_RUN_AS_NODE $1"\n');
    fs.chmodSync(agentbox, 0o755);
    const out = execFileSync('bash', [path.join(scripts, 'approval-server.sh')], { encoding: 'utf8' }).trim();
    // Electron, run as node, against the server inside the archive: nothing is
    // asked of app.asar.unpacked/main and no node on the machine is needed.
    expect(out).toBe(`1 ${path.join(contents, 'Resources', 'app.asar', 'main', 'approval-prompt-server.mjs')}`);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('rewrites an asar path to the unpacked copy, and leaves every other path alone', () => {
    expect(unpacked('/Applications/Astral.app/Contents/Resources/app.asar/worker-permissions.json'))
      .toBe('/Applications/Astral.app/Contents/Resources/app.asar.unpacked/worker-permissions.json');
    expect(unpacked('/Users/me/Desktop/dev/zero/worker-permissions.json'))
      .toBe('/Users/me/Desktop/dev/zero/worker-permissions.json');
    // A folder that merely ends in app.asar is not the archive.
    expect(unpacked('/tmp/app.asar')).toBe('/tmp/app.asar');
  });
});

describe('the founder’s own writing does not go inside a signed bundle', () => {
  it('reads her standing instructions from her own folder, not the app and not the checkout', () => {
    // She edits this from ⌘K while the fleet is running. Inside app.asar the
    // write fails, and a typed rule is silently not applied.
    //
    // userDir rather than dataDir since w-3dc46f3a67: dataDir IS the checkout
    // when the app runs from source, which is the developer's own machine.
    const sup = fs.readFileSync(path.join(repo, 'main', 'supervisor.mjs'), 'utf8');
    expect(sup).toMatch(/standingFile\(\)\s*\{\s*return path\.join\(this\.userDir, 'briefs', 'founder\.md'\)/);
  });

  it('reads the config from the writable folder and the shipped brief from the bundle', () => {
    const main = fs.readFileSync(path.join(repo, 'main', 'main.mjs'), 'utf8');
    // THE RULE MOVED INTO `configDir` ON 2026-09-27, because a third case had
    // to go into it: a throwaway copy reads the user data folder whatever it
    // was started from, or a fresh user on a source-run app reads the
    // developer's config and opens on the developer's inbox. What is pinned here is unchanged, that
    // main.mjs asks for the writable folder and hands it to loadConfig; the
    // three answers are pinned in tests/a-brand-new-user-opens-beside-her-own.
    expect(main).toContain('configDir({ appDir, userData: app.getPath(\'userData\'), packaged: app.isPackaged })');
    expect(main).toContain('loadConfig(dataDir)');
    // And her own folder, which is the data folder whether or not the app is
    // packaged, because the checkout is not a place to keep what the user typed.
    expect(main).toContain('const userDir = app.getPath(\'userData\');');
    // briefs/worker.md ships with the app and is never written to, so it stays
    // on appDir. All three are handed to the supervisor, in that order.
    expect(main).toContain('new Supervisor(config, store, appDir, dataDir, userDir)');
    const sup = fs.readFileSync(path.join(repo, 'main', 'supervisor.mjs'), 'utf8');
    expect(sup).toContain('readSystemTemplate(this.appDir, this.userDir)');
  });

  it('does not put her standing instructions or her writing rules in the download', () => {
    // Both files sat inside the signed bundle under briefs/**. The app never
    // read either copy, which is exactly why
    // nothing noticed: they were shipped, readable, and dead.
    expect(pkg.build.files).toContain('!briefs/founder.md');
    expect(pkg.build.files).toContain('!briefs/writing-rules.md');
  });

  it('keeps her copy of the message rules in the writable folder, so a stranger can change them', () => {
    // The Settings box calls them "yours to change or empty". On appDir, inside
    // a packaged app, that save had nowhere to land.
    //
    // ONE DOCUMENT SINCE w-3dc46f3a67, where this was writing-rules.md and the
    // finishing rules were a second box. Her copy is on userDir and the shipped
    // default stays in the bundle on appDir, which is what lets a later release
    // change the default for anyone who has not written their own.
    const sup = fs.readFileSync(path.join(repo, 'main', 'supervisor.mjs'), 'utf8');
    expect(sup).toMatch(/path\.join\(this\.userDir, 'briefs', 'message-rules\.md'\)/);
    expect(sup).toMatch(/path\.join\(this\.appDir, 'briefs', 'message-rules\.md'\)/);
    expect(sup).not.toMatch(/path\.join\(this\.dataDir, 'briefs', 'message-rules\.md'\)/);
    // And the file it replaced is not read by the supervisor at all any more.
    expect(sup).not.toMatch(/'writing-rules\.md'/);
  });

  it('keeps this machine pointed at the folder it has always used', () => {
    // Chromium names its data folder after the app, so renaming the app to Agentbox
    // would have walked away from every setting on a machine that already had
    // one: her look, her zoom, her project order. Nothing is moved; a copy that
    // has an older folder and no current one keeps reading the older one.
    //
    // THIS USED TO PIN ONE LINE OF CODE AND THAT WAS THE WRONG THING TO PIN
    // (w-7dc28c9401, 2026-09-04). It required the exact expression
    // `fs.existsSync(legacy) && !fs.existsSync(named)`, which was the shape of
    // a fallback that could only ever look at ONE old name. Renaming Agentbox to
    // the app made that shape unable to do its job, because the folder to fall
    // back to was Agentbox rather than the app, and the app has been renamed again
    // since. So this pins the BEHAVIOUR: there is a list of former names, it is
    // tried only when the current folder does not exist, and every name this
    // app has shipped under is on it.
    const main = fs.readFileSync(path.join(repo, 'main', 'main.mjs'), 'utf8');
    expect(main).toContain("app.setPath('userData', legacy)");
    expect(main).toMatch(/!fs\.existsSync\(named\)/);
    expect(main).toMatch(/fs\.existsSync\(legacy\)/);
    // The names this app has actually shipped under. Losing one of these loses
    // real people their settings, silently, on the release that drops it.
    expect(main).toMatch(/for \(const was of WAS\)/);
    expect(WAS).toContain('Astral');
    expect(WAS).toContain('Zero');
    // And the current name is never on the list of former ones, which would
    // make the fallback point an existing install at itself.
    expect(WAS).not.toContain(NAME);
  });
});
