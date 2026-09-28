// Sept 16: unframed Margin left actions stretched in a grid and did not explain
// how several artifacts would group. Preview all three kinds with bounded buttons.
import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('shows multiple sample artifacts without changing real document discovery',()=>{
 const s=read('components/Focus.tsx');
 expect(s).toContain("previewSample === 'multiple'");
 expect(s).toContain('className="artifact-entry-list"');
 expect(s).toContain('aria-label="Attachments"');
 expect(s).toContain('referencedFiles(item.result');
 expect(read('App.tsx')).toContain('<option value="multiple">Multiple artifacts</option>');
});
it('bounds action height and reduces only task header inset',()=>{
 const css=read('workspace-navigation.css');
 expect(css).toContain('height:28px; flex:0 0 auto;');
 expect(css).toContain('.workspace-layout.workspace-task > .topbar {padding-left:20px;}');
});
