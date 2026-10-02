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
import {probeLocalPreview,previewStatus,previewShows,clockKeepsRunning,WORDS_AFTER_MS,SLOW_AFTER_MS} from '../renderer/src/local-preview';

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

// The first build stopped its clock at eight seconds, so a long wait sat on
// 0:08 forever. The long wait is the case this whole change is for.
it('keeps the wait clock counting for as long as it is still trying',()=>{
 for(const t of [SLOW_AFTER_MS,30_000,10*60_000]) {
  expect(clockKeepsRunning('checking',t)).toBe(true);
  expect(clockKeepsRunning('slow',t)).toBe(true);
 }
 expect(clockKeepsRunning('up',SLOW_AFTER_MS)).toBe(true);
 // Stops where there is nothing left to time.
 expect(clockKeepsRunning('down',0)).toBe(false);
 expect(clockKeepsRunning('up',60_000)).toBe(false);
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

// Three looks were drawn and one was picked, the log. The other two and the
// switch between them come out, because anything still switchable is a choice
// someone has to make again.
it('draws only the picked look, a short log, with no switch left between looks',()=>{
 const view=fs.readFileSync(new URL('../renderer/src/components/LocalPreviewStatus.tsx',import.meta.url),'utf8');
 expect(view).toContain('local-status-log');
 expect(view).not.toContain('data-look');
 expect(view).not.toContain('localStorage');
 const css=fs.readFileSync(new URL('../renderer/src/workspace-navigation.css',import.meta.url),'utf8');
 expect(css).not.toMatch(/local-status\[data-look/);
});

// Beside a card the hairline that holds a page is drawn on the page itself
// (.doc-view), not on the pane. The status covers the page while it connects
// and replaces it when nothing runs, so it took the edge with it and sat on the
// card as a flat block. It wears the same edge, in the page's own colour,
// wherever the page does.
it('keeps the hairline round the panel while it connects and when nothing runs',()=>{
 const css=fs.readFileSync(new URL('../renderer/src/workspace-navigation.css',import.meta.url),'utf8');
 for(const where of ['.workspace-layout .inline-artifact .doc-html','.workspace-layout[data-artifact-layout="beside"] .doc-html']) {
  expect(css).toContain(`${where} .doc-view { border:1px solid var(--line)`);
  expect(css).toContain(`${where} .local-status`);
 }
 expect(css).toMatch(/\.local-status\s*\{[^}]*\}[\s\S]*border:1px solid var\(--frame-line\)/);
 expect(css).toMatch(/\.preview-frame\s*\{[^}]*--frame-line:\s*var\(--line\)/);
});

it('leaves design files on the quiet skeleton, with no words added to it',()=>{
 const loading=fs.readFileSync(new URL('../renderer/src/components/PreviewLoading.tsx',import.meta.url),'utf8');
 expect(loading).not.toContain('Try again');
 expect(loading).not.toContain('words');
});
