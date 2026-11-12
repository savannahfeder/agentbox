// September 16: iframe load revealed an unpainted dark surface in one abrupt
// step. Keep the skeleton until two paint opportunities, then crossfade.
import {it,expect,vi} from 'vitest';
import {waitForPreviewPaint} from '../renderer/src/preview-reveal';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('waits through two animation frames, rather than exposing on load',()=>{
 const queue=[];
 vi.stubGlobal('requestAnimationFrame',fn=>{queue.push(fn);return queue.length;});
 vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const ready=vi.fn();
 waitForPreviewPaint(ready);
 expect(ready).not.toHaveBeenCalled();
 queue.shift()(); expect(ready).not.toHaveBeenCalled();
 queue.shift()(); expect(ready).toHaveBeenCalledTimes(1);
 vi.unstubAllGlobals();
});
it('does not reveal a frame after navigation or unmount',()=>{
 const queue=[];
 vi.stubGlobal('requestAnimationFrame',fn=>{queue.push(fn);return queue.length;});
 vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const ready=vi.fn(); const cancel=waitForPreviewPaint(ready);
 queue.shift()(); cancel(); queue.shift()();
 expect(ready).not.toHaveBeenCalled();
 vi.unstubAllGlobals();
});
it('keeps skeleton and frame mounted for a crossfade at both sizes',()=>{
 for(const file of ['DocPane','ArtifactThumbnail']) {
  const s=read(`components/${file}.tsx`);
  expect(s).toContain('usePreviewReveal(');
  expect(s).toContain('onLoad={revealFrame}');
  expect(s).toContain('<PreviewLoading ready={frameReady}');
  expect(s).not.toContain("visibility:frameReady");
 }
 expect(read('workspace-navigation.css')).toContain('transition:opacity 220ms ease');
});
