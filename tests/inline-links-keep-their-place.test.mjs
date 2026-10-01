// A quoted two-word filename was reduced to its final word. The resulting
// missing media preview also restarted whenever the parent supplied a new
// callback. Keep whole names and test preview identity in a real DOM.
import { describe, it, expect } from 'vitest';
import { artifactUrlTransform, linkArtifactPaths } from '../renderer/src/remark-artifact-paths.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import electron from 'electron';

const dir = '/Users/example/Projects/demo';
function links(value) {
  const tree = { type: 'paragraph', children: [{ type: 'text', value }] };
  linkArtifactPaths(tree, { dir });
  return tree.children.filter(n => n.type === 'link').map(n => [n.url, n.children[0].value]);
}

describe('quoted filenames keep every word', () => {
  it('keeps a whole filename and its surrounding prose separate', () => {
    expect(links('The film is "Sample Film.mp4".')).toEqual([['Sample Film.mp4', 'Sample Film.mp4']]);
  });
  it('keeps spaces in quoted relative paths and single quotes', () => {
    expect(links("Try 'renders/Final Film.mp4' next.")).toEqual([['renders/Final Film.mp4', 'renders/Final Film.mp4']]);
  });
  it('keeps a quoted product path whole', () => {
    expect(links(`Open "${dir}/renders/Final Film.mp4".`)).toEqual([['renders/Final Film.mp4', `${dir}/renders/Final Film.mp4`]]);
  });
  it('does not turn the suffix of an outside path into a relative link', () => {
    expect(links('It is at "/tmp/Final Film.mp4".')).toEqual([]);
  });
  it('uses Downloads only when that location is explicitly named', () => {
    expect(links('Saved in your Downloads as "Sample Film.mp4".')).toEqual([['file:///Users/example/Downloads/Sample%20Film.mp4', 'Sample Film.mp4']]);
    expect(links('Downloads are ready. The file is "Sample Film.mp4".')).toEqual([['Sample Film.mp4', 'Sample Film.mp4']]);
  });
  it('leaves ordinary prose alone and still links several separate files', () => {
    expect(links('"This is a sentence."')).toEqual([]);
    expect(links('Try a.mp4 then b.mp3.')).toEqual([['a.mp4', 'a.mp4'], ['b.mp3', 'b.mp3']]);
  });
  it('preserves local file links without allowing executable protocols', () => {
    expect(artifactUrlTransform('file:///tmp/Sample%20Film.mp4')).toBe('file:///tmp/Sample%20Film.mp4');
    expect(artifactUrlTransform('https://example.com')).toBe('https://example.com');
    expect(artifactUrlTransform('javascript:alert(1)')).toBe('');
    expect(artifactUrlTransform('data:text/html,test')).toBe('');
  });
});

// Electron is the shipped macOS runtime. The parser tests above run on every
// platform; this DOM check needs a macOS graphical session, not a CI X server.
it.skipIf(process.platform !== 'darwin')('keeps mounted links and exhausted previews through five parent updates', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-links-'));
  try {
    fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><div id="root"></div>');
    await build({ entryPoints: ['tests/fixtures/inline-links-browser.tsx'], bundle: true, format: 'iife', outfile: path.join(temp, 'probe.js'), logLevel: 'silent' });
    const { stdout } = await promisify(execFile)(electron, ['tests/fixtures/inline-links-electron.mjs', temp], { timeout: 15000 });
    const result = JSON.parse(stdout.split('\n').find(line => line.startsWith('LINK_RESULT=')).slice('LINK_RESULT='.length));
    expect(result.error).toBeUndefined();
    expect(result.sameNode).toBe(true);
    expect(result.attemptsBefore).toBeGreaterThan(0);
    expect(result.exhausted).toBe(true);
    expect(result.retriesAfterUpdates).toBe(0);
    expect(result.mediaLabel).toBe('Sample Film.mp4');
    expect(result.calls).toEqual([{ round: 5, src: 'designs/demo.html' }, { round: 5, src: 'http://localhost:3002' }]);
    expect(result.notices).toEqual([{ round: 5, text: 'File could not be opened.' }]);
    expect(result.productChanged).toBe(true);
    expect(result.otherProductResolved).toBe(true);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}, 20000);
