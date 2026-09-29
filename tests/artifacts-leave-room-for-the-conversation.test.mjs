// 2026-09-15: a sidebar plus a 72% artifact left laptop conversations too narrow.
// Keep at least 400px for conversation and 560px for previews; below 1000px
// of available card space, use one full-width surface instead of two slivers.
import {expect,it} from 'vitest';
import fs from 'node:fs';
import {artifactPlacement,artifactFraction,isLocalPreview} from '../renderer/src/artifact-layout';
it('keeps focus explicit at every size',()=>{
 for(const width of [600,999,1000,1800]) {
 expect(artifactPlacement('focus',width)).toBe('focus');
 }
});
it('only splits when both surfaces have room',()=>{
 expect(artifactPlacement('beside',999)).toBe('focus');
 expect(artifactPlacement('beside',1000)).toBe('beside');
 expect(artifactPlacement('beside',1001)).toBe('beside');
 expect(artifactFraction(.75,1000)).toBe(.6);
 expect(artifactFraction(.2,1000)).toBe(.56);
});
it('recognizes local live previews without capturing ordinary web links',()=>{
 for(const url of ['http://localhost:3000/','http://127.0.0.1:48765/?x=1']) expect(isLocalPreview(url)).toBe(true);
 for(const url of ['https://example.com','http://localhost.evil.com:3000','javascript:alert(1)','designs/page.html']) expect(isLocalPreview(url)).toBe(false);
});
it('moves the back control into the portaled task heading',()=>{
 const focus=fs.readFileSync(new URL('../renderer/src/components/Focus.tsx',import.meta.url),'utf8');
  // THE PORTAL CARRIES A THIRD CHILD WHILE THE ROUND ON DONE IS OPEN
  // (w-581dbc6cc4): one of the seven placements puts the button in the gutter
  // beside the way out. What this test is for is that the band is MOVED into
  // the heading rather than copied, so it checks the two ends of the portal
  // rather than its exact children.
 expect(focus).toMatch(/headerTarget \? createPortal\(<>[\s\S]{0,600}\{bandLine\}[\s\S]{0,40}<\/>, headerTarget\)/);
 expect(focus).toMatch(/createPortal\(<>\s*\n?\s*\{backButton\}/);
 expect(focus).toContain('!headerTarget && backButton');
});
it('gives narrow code previews a file picker without a second sidebar',()=>{
 const css=fs.readFileSync(new URL('../renderer/src/workspace-navigation.css',import.meta.url),'utf8');
 expect(css).toContain('@container artifact (max-width: 800px)');
 expect(css).toContain('.code-tree { display:none; }');
 const code=fs.readFileSync(new URL('../renderer/src/components/CodeArtifact.tsx',import.meta.url),'utf8');
 expect(code).toContain('aria-label="File to review"');
});
