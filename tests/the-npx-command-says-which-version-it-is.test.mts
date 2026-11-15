// `npx agentbox-app` SAYS IT IS THE BROWSER VERSION, AND WHERE THE OTHER ONE IS.
//
// QA ran `npx agentbox-app` on a clean Linux box on 2026-10-25 expecting the
// desktop app, and got a tab at 127.0.0.1 (F-73). That is what this command is
// and the README says so, but nothing the command itself prints does: it says
// "agentbox is running." over an address, and the npm page that sent them
// there says nothing either. So the two problems above, which only the browser
// version has, arrived as "the app is broken" rather than "this is the browser
// version".
//
// Nothing about what it starts changes here. What changes is that it says
// which of the two it is, in both places this command speaks: the line over
// the address and --help. The npm description is the founder's own sentence
// (tests/the-listing-says-what-this-is) and is hers to change, not ours.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const launcher = read('bin/agentbox.mjs');

describe('what the command prints when it comes up', () => {
  it('names the browser in the line over the address', () => {
    expect(launcher).toMatch(/agentbox is running in your browser/);
  });

  it('and says where the desktop app comes from, in one line of the four', () => {
    const printed = launcher.slice(launcher.indexOf('console.log(`\\n  agentbox is running'));
    const said = printed.slice(0, printed.indexOf('`)'));
    expect(said).toMatch(/desktop app/i);
    expect(said).toMatch(/github\.com\/savannahfeder\/agentbox#install/);
    expect(said.match(/desktop app/gi)).toHaveLength(1);
  });

  it('and --help says the same thing, since that is read before anything starts', () => {
    const help = launcher.slice(launcher.indexOf("args.includes('--help')"), launcher.indexOf('// WHERE THE STORE LIVES'));
    expect(help).toMatch(/in a browser tab/);
    expect(help).toMatch(/desktop app/i);
  });
});
