// An agent's message about a picture dropped the file's name: "I ran the page
// against the stand-in API and screenshotted it at [blank].", three times, and
// once it gave "/tmp/shots/filled.png", a path nobody can open from the app
// (Dev). Measured: a picture path in a sentence or a code
// span is drawn as the picture alone, so the sentence loses the name (the
// page's text read "at\n."), and a full path outside the project stays dead
// text. Now the picture carries its name under it, and a picture an agent
// saved in a temporary folder is copied into the thread's own folder and its
// message names that copy.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactImg } from '../renderer/src/components/Focus.tsx';
import { bringPicturesHome } from '../mcp/core/pictures-home.mjs';
import { appHome } from '../main/store/home.mjs';

const draw = (props) => renderToStaticMarkup(React.createElement(ArtifactImg, { roots: ['/p'], onOpen: () => {}, ...props }));

describe('a picture named in a message', () => {
  it('says its name under it', () => {
    const html = draw({ src: 'designs/w-1/page.png', alt: 'designs/w-1/page.png' });
    expect(html).toContain('<span class="inline-image-name">page.png</span>');
  });

  it('says the name a person gave an attached picture, not the stored one', () => {
    const html = draw({ src: 'attachments/mh2xk3a1-ab12cd-onboarding-b.png', alt: 'onboarding-b.png' });
    expect(html).toContain('<span class="inline-image-name">onboarding-b.png</span>');
  });

  it('a pasted picture, which has no file, says nothing', () => {
    expect(draw({ src: 'data:image/png;base64,iVBORw0KGgo=', alt: '' })).not.toContain('inline-image-name');
  });
});

describe('a picture an agent saved in a temporary folder', () => {
  let dir; let tmp;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pictures-home-project-'));
    tmp = fs.mkdtempSync(path.join('/tmp', 'shots-'));
    fs.writeFileSync(path.join(tmp, 'filled.png'), 'png bytes');
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('is copied into the thread folder and the message names the copy', () => {
    const patch = bringPicturesHome(dir, 'w-1', { result: `The screenshot of the filled-in page is ${tmp}/filled.png.` });
    expect(patch.result).toBe('The screenshot of the filled-in page is designs/w-1/filled.png.');
    expect(fs.readFileSync(path.join(dir, 'designs/w-1/filled.png'), 'utf8')).toBe('png bytes');
  });

  it('keeps a code span a code span', () => {
    const patch = bringPicturesHome(dir, 'w-1', { note: `Saved \`${tmp}/filled.png\`` });
    expect(patch.note).toBe('Saved `designs/w-1/filled.png`');
  });

  it('does not overwrite a different picture of the same name', () => {
    fs.mkdirSync(path.join(dir, 'designs/w-1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'designs/w-1/filled.png'), 'older');
    const patch = bringPicturesHome(dir, 'w-1', { result: `${tmp}/filled.png` });
    expect(patch.result).toBe('designs/w-1/filled-2.png');
    expect(fs.readFileSync(path.join(dir, 'designs/w-1/filled.png'), 'utf8')).toBe('older');
  });

  it('leaves alone a picture that is not there, one in the project, and a file that is not a picture', () => {
    fs.writeFileSync(path.join(tmp, 'run.log'), 'log');
    const words = `Gone: ${tmp}/nothing.png, here: designs/w-1/a.png, log: ${tmp}/run.log`;
    expect(bringPicturesHome(dir, 'w-1', { result: words }).result).toBe(words);
  });
});

describe('an agent writing to its thread', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join('/tmp', 'shots-')); fs.writeFileSync(path.join(tmp, 'filled.png'), 'png'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); delete process.env.STORE_ACCOUNT_ID; });

  it('lands the copy, not the temporary path', async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    const product = createProduct(`Pictures ${Math.random().toString(36).slice(2, 8)}`);
    const work = await import('../mcp/core/work.mjs');
    const claims = work.createClaimRegistry({ holder: 'thread', heartbeatMs: 60_000 });
    try {
      const row = work.createItem(product.id, { title: 'Check the page' }, { source: 'founder' });
      const after = await claims.update(row.id, { result: `Screenshot: ${tmp}/filled.png` });
      expect(after.result).toBe(`Screenshot: designs/${row.id}/filled.png`);
      expect(fs.existsSync(path.join(home, 'accounts', 'acct', product.id, 'designs', row.id, 'filled.png'))).toBe(true);
    } finally { claims._stop(); }
  });
});
