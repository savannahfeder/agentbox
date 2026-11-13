// A FLASH OR A STUCK SCREEN FAILS THE FINISHED FILM.
//
// One lead's outreach film held the ⌘-Tab switcher from 0:04 to 0:10 (the
// recorder got no frame of the app after it closed) and showed the inbox list
// for one frame at 0:51.93. Every check then read the brief or the recorder's
// log; none watched the finished film. check-film.py does. Measured on the
// eleven real films: it fails that film for both faults, and every film made
// before the recorder's cuts (the approved one included) for a one-frame
// flicker after the reply to Maya at about 1:17. Here it runs on
// small films drawn with ffmpeg: a clean one, one with a single odd frame, and
// one whose promised cut never happens.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.join(import.meta.dirname, '..', 'scripts/outreach-film/check-film.py');
const ready = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('python3', ['-c', 'import numpy']).status === 0;
const dir = ready ? fs.mkdtempSync(path.join(os.tmpdir(), 'check-film-')) : '';

// Two seconds of one screen, then another; `flash` puts one frame of a third screen between.
function film(name, { flash = false } = {}) {
  const f = path.join(dir, `${name}.mp4`);
  const a = 'color=c=0x202020:s=1920x1080:r=30:d=1', b = 'color=c=0x808080:s=1920x1080:r=30:d=1', x = 'color=c=0xf0f0f0:s=1920x1080:r=30:d=1,trim=end_frame=1';
  const inputs = flash ? [a, x, b] : [a, b];
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const i of inputs) args.push('-f', 'lavfi', '-i', i);
  args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex', `${inputs.map((_, i) => `[${i}:v]`).join('')}concat=n=${inputs.length}:v=1[v]`,
    '-map', '[v]', '-map', `${inputs.length}:a`, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', f);
  expect(spawnSync('ffmpeg', args).status).toBe(0);
  return f;
}
const cuts = (t) => { const f = path.join(dir, `cuts-${t}.json`); fs.writeFileSync(f, JSON.stringify({ end: 2, cuts: [{ t, what: 'switch to Agentbox' }] })); return f; };
const check = (...a) => spawnSync('python3', [script, ...a], { encoding: 'utf8' });

describe.skipIf(!ready)('check-film.py', () => {
  it('passes a film whose screens change only where a cut says', () => {
    const r = check(film('clean'), cuts(1.0));
    expect(r.stdout.trim(), r.stdout + r.stderr).toBe('ok');
    expect(r.status).toBe(0);
  });
  it('fails a film with one frame unlike both sides, and says when', () => {
    const r = check(film('flash', { flash: true }));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/at 1\.0\ds a screen shows for 1 frame/);
  });
  it('fails a cut that never changes the screen', () => {
    const r = check(film('stuck'), cuts(0.5));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/"switch to Agentbox" at 0\.50s never changes the screen/);
  });
});
