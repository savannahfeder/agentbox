// September 16: remounting live thumbnail frames replayed their loading reveal
// every time a task opened. Reuse a bounded set, invalidating changed tasks.
import {it,expect,vi} from 'vitest';
import {ThumbnailCache} from '../renderer/src/thumbnail-cache';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('reuses a preview on return but gives edited content a fresh entry',()=>{
 const cache=new ThumbnailCache(2); const make=vi.fn(()=>({dispose:vi.fn()}));
 const a=cache.acquire('project/file@1',make); cache.release('project/file@1');
 expect(cache.acquire('project/file@1',make)).toBe(a);
 expect(cache.acquire('project/file@2',make)).not.toBe(a);
 expect(make).toHaveBeenCalledTimes(2);
});
it('evicts the oldest unused preview without destroying visible content',()=>{
 const cache=new ThumbnailCache(2); const make=()=>({dispose:vi.fn()});
 const active=cache.acquire('active',make); const old=cache.acquire('old',make);
 cache.release('old'); cache.acquire('new',make);
 expect(old.dispose).toHaveBeenCalledTimes(1);
 expect(active.dispose).not.toHaveBeenCalled();
});
it('keeps chat thumbnails muted with no reveal animation and delays only their skeleton',()=>{
 const css=read('workspace-navigation.css');
 expect(css).toContain('.artifact-thumbnail iframe {transition:none;');
 expect(css).toContain('.artifact-thumbnail .preview-skeleton {animation:none;');
 expect(read('components/ArtifactThumbnail.tsx')).toContain('opacity:frameReady ? 0.55 : 0');
 expect(read('components/PreviewLoading.tsx')).toContain('setTimeout(() => setVisible(true), 500)');
});
