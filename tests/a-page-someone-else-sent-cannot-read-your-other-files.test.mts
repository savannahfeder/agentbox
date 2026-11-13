// A PAGE SOMEONE ELSE SENT CANNOT READ YOUR OTHER FILES.
//
// "Open in Agentbox" on a shared link saves the file into the project's
// attachments folder and opens it in the document pane at once. Every page the
// pane shows is served from one origin, agentbox-doc://file, which may read the
// project folder, the linked code checkout and the store's run folders. So a
// stranger's HTML page, opened with one click, fetched the project's files and
// the checkout's .env and sent them to its own server (security review
// 2026-11-13: reproduced in Electron 43 with the real DocGrants and the pane's
// iframe, dummy files only). Files a teammate sends land in the same folder.
//
// What is served from an attachments folder now carries a CSP sandbox, which
// gives it an opaque origin: it still runs and draws its own pictures, but a
// fetch of any other file on the scheme is cross-origin and refused. Checked in
// the same Electron probe: project.json, notes and .env all came back as
// "Failed to fetch"; the page's own picture still loaded.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servedApart } from '../main/doc-scheme.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = '/Users/you/Zero/accounts/acct/agentbox';

describe('what a file from someone else is served with', () => {
  it('a page brought in from a link has no origin of its own', () => {
    const rules = servedApart(`${PROJECT}/attachments/mhx1-ab12cd-quarterly-plan.html`, 'darwin');
    expect(rules['content-security-policy']).toMatch(/^sandbox\b/);
    expect(rules['content-security-policy']).not.toMatch(/allow-same-origin/);
    expect(rules['content-security-policy']).toMatch(/allow-scripts/);
  });

  it('whatever its name says it is: the scheme guesses the type from the name the sender chose', () => {
    for (const name of ['x.htm', 'x.xhtml', 'x.svg', 'x.xml', 'x.HTML', 'x', 'x.png']) {
      expect(servedApart(`${PROJECT}/attachments/${name}`, 'darwin')['content-security-policy'], name).toMatch(/^sandbox\b/);
    }
  });

  it('in a folder under attachments, and on Windows', () => {
    expect(servedApart(`${PROJECT}/attachments/sub/x.html`, 'darwin')['content-security-policy']).toMatch(/^sandbox\b/);
    expect(servedApart('C:\\Users\\you\\Zero\\agentbox\\Attachments\\x.html', 'win32')['content-security-policy']).toMatch(/^sandbox\b/);
  });

  it("leaves the project's own pages as they are, so their pictures still load", () => {
    for (const file of [
      `${PROJECT}/designs/w-1/both-are-built.html`,
      `${PROJECT}/reports/launch.html`,
      '/Users/you/code/app/landing/index.html',
      `${PROJECT}/designs/attachments-mockup.html`,
      `${PROJECT}/not-attachments/x.html`,
    ]) {
      expect(servedApart(file, 'darwin'), file).toEqual({});
    }
  });
});

describe('the document scheme sends it', () => {
  it('on every file it serves, beside no-store', () => {
    const main = fs.readFileSync(path.join(here, '..', 'main', 'main.mts'), 'utf8');
    const doc = main.slice(main.indexOf('for (const scheme of DOC_SCHEMES) protocol.handle'), main.indexOf('for (const scheme of IMG_SCHEMES) protocol.handle'));
    expect(doc).toContain('noStore(await net.fetch(pathToFileURL(file).toString()), servedApart(file))');
  });
});
