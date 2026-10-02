// 2026-10-01: a card offered an app "on your Mac at http://localhost:3300". The
// pane beside it opened onto a dark, empty card and stayed that way. The only
// loading mark was the design-file skeleton, drawn at 7% of the text colour, so
// on a dark theme it read as nothing at all. And nothing was listening on 3300:
// the iframe's load event fires for Chromium's own error page too, so the pane
// could not tell "still loading" from "nothing there", and said neither. The
// reader sat waiting for a server that was never going to answer.
//
// So a local address is checked before it is trusted. After a second it says
// it is connecting and for how long (a fast app shows nothing at all). When
// nothing answers it says that at once, offers Try again, and keeps checking so
// the app opens by itself the moment it starts.
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {probeLocalPreview,previewStatus,previewShows,WORDS_AFTER_MS,SLOW_AFTER_MS} from '../renderer/src/local-preview';

it('calls an address up when anything answers it, even a page it cannot read',async()=>{
 const fetchFn=vi.fn(async()=>({type:'opaque',status:0}));
 expect(await probeLocalPreview('http://localhost:3300/',fetchFn)).toBe('up');
 // no-cors, because the app's own origin is not the preview's, and an opaque
 // answer is still an answer.
 expect(fetchFn.mock.calls[0][1]).toMatchObject({mode:'no-cors'});
});

it('calls an address down when the connection is refused',async()=>{
 const fetchFn=async()=>{throw new TypeError('Failed to fetch');};
 expect(await probeLocalPreview('http://localhost:3300/',fetchFn)).toBe('down');
});

it('calls an address slow, not down, when it takes the connection and never answers',async()=>{
 const fetchFn=(_u,init)=>new Promise((_r,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
 expect(await probeLocalPreview('http://localhost:3300/',fetchFn,20)).toBe('slow');
});

it('stays quiet for the first second so a fast app shows nothing in between',()=>{
 expect(previewStatus('checking','http://localhost:3300/',0)).toBeNull();
 expect(previewStatus('up','http://localhost:3300/',WORDS_AFTER_MS-1)).toBeNull();
});

it('says it is connecting, to which address, and for how long, once the wait is noticeable',()=>{
 const s=previewStatus('checking','http://localhost:3300/app?x=1',4200);
 expect(s.state).toBe('connecting');
 expect(s.label).toBe('Connecting');
 expect(s.host).toBe('localhost:3300');
 expect(s.clock).toBe('0:04');
 expect(s.retry).toBe(false);
});

it('says it is still trying, and offers Try again, once the wait is long',()=>{
 for(const phase of ['checking','up','slow']) {
  const s=previewStatus(phase,'http://127.0.0.1:48765/',SLOW_AFTER_MS);
  expect(s.state).toBe('slow');
  expect(s.host).toBe('127.0.0.1:48765');
  expect(s.detail).toMatch(/keeps trying/i);
  expect(s.retry).toBe(true);
 }
 expect(previewStatus('checking','http://localhost:3300/',75_000).clock).toBe('1:15');
});

it('says plainly when nothing is running there, at once, with a way to try again',()=>{
 const s=previewStatus('down','http://localhost:3300/',0);
 expect(s.state).toBe('down');
 expect(s.label).toBe('Not running');
 expect(s.detail).toMatch(/opens by itself/i);
 expect(s.retry).toBe(true);
});

it('never uses an em dash in anything the pane says',()=>{
 for(const phase of ['checking','up','slow','down']) for(const t of [0,WORDS_AFTER_MS,SLOW_AFTER_MS]) {
  const s=previewStatus(phase,'http://localhost:3300/',t);
  if(s) expect(`${s.label} ${s.detail}`).not.toContain('—');
 }
 const view=fs.readFileSync(new URL('../renderer/src/components/LocalPreviewStatus.tsx',import.meta.url),'utf8');
 expect(view.replace(/\/\/.*$/gm,'')).not.toContain('—');
});

it('only shows the frame once the address has answered, never an error page behind a refusal',()=>{
 expect(previewShows(true,'up')).toBe(true);
 expect(previewShows(true,'slow')).toBe(true);
 expect(previewShows(true,'checking')).toBe(false);
 expect(previewShows(true,'down')).toBe(false);
 expect(previewShows(false,'up')).toBe(false);
});

it('wires the check into the pane, drops the frame while nothing answers, and offers Try again',()=>{
 const pane=fs.readFileSync(new URL('../renderer/src/components/DocPane.tsx',import.meta.url),'utf8');
 expect(pane).toContain('useLocalPreview(');
 expect(pane).toMatch(/app\.phase !== 'down'\) && <iframe/);
 expect(pane).toContain('<LocalPreviewStatus status={liveStatus} onRetry={app.retry} />');
 const view=fs.readFileSync(new URL('../renderer/src/components/LocalPreviewStatus.tsx',import.meta.url),'utf8');
 expect(view).toContain('Try again');
});

it('leaves design files on the quiet skeleton, with no words added to it',()=>{
 const loading=fs.readFileSync(new URL('../renderer/src/components/PreviewLoading.tsx',import.meta.url),'utf8');
 expect(loading).not.toContain('Try again');
 expect(loading).not.toContain('words');
});
