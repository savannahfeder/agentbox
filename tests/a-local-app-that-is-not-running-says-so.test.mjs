// 2026-10-01: a card offered an app "on your Mac at http://localhost:3300". The
// pane beside it opened onto a dark, empty card and stayed that way. The only
// loading mark was the design-file skeleton, drawn at 7% of the text colour, so
// on a dark theme it read as nothing at all. And nothing was listening on 3300:
// the iframe's load event fires for Chromium's own error page too, so the pane
// could not tell "still loading" from "nothing there", and said neither. The
// reader sat waiting for a server that was never going to answer.
//
// So a local address is checked before it is trusted. While it loads it says
// so in words, after a second (a fast app still shows only the quiet skeleton).
// When nothing answers it says that, offers Try again, and keeps checking so the
// app opens by itself the moment it starts.
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {probeLocalPreview,previewWords,previewShows,WORDS_AFTER_MS,SLOW_AFTER_MS} from '../renderer/src/local-preview';

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

it('stays wordless for the first second so a fast app only shows the skeleton',()=>{
 expect(previewWords('checking','http://localhost:3300/',0)).toBeNull();
 expect(previewWords('up','http://localhost:3300/',WORDS_AFTER_MS-1)).toBeNull();
});

it('says which address it is opening once the wait is long enough to notice',()=>{
 const w=previewWords('checking','http://localhost:3300/app?x=1',WORDS_AFTER_MS);
 expect(w.title).toBe('Opening localhost:3300');
 expect(w.retry).toBe(false);
});

it('says it is slow, and still trying, once the wait is long',()=>{
 for(const phase of ['checking','up','slow']) {
  const w=previewWords(phase,'http://127.0.0.1:48765/',SLOW_AFTER_MS);
  expect(w.title).toBe('127.0.0.1:48765 is slow to answer');
  expect(w.detail).toMatch(/still trying/i);
 }
});

it('says plainly when nothing is running there, at once, with a way to try again',()=>{
 const w=previewWords('down','http://localhost:3300/',0);
 expect(w.title).toBe('Nothing is running at localhost:3300');
 expect(w.detail).toMatch(/opens here by itself/i);
 expect(w.retry).toBe(true);
});

it('never uses an em dash in anything the pane says',()=>{
 for(const phase of ['checking','up','slow','down']) for(const t of [0,WORDS_AFTER_MS,SLOW_AFTER_MS]) {
  const w=previewWords(phase,'http://localhost:3300/',t);
  if(w) expect(`${w.title} ${w.detail ?? ''}`).not.toContain('—');
 }
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
 expect(pane).toContain('onRetry={app.retry}');
 const loading=fs.readFileSync(new URL('../renderer/src/components/PreviewLoading.tsx',import.meta.url),'utf8');
 expect(loading).toContain('preview-words');
 expect(loading).toContain('Try again');
});
