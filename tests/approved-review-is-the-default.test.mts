// September 18: approved cards and bare corners must work outside reviewLab.
// Real filenames replace fixture titles; zero/one/many file counts stay honest.
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {reviewTitle} from '../renderer/src/review-lab';
const read=p=>readFileSync(new URL('../renderer/src/'+p,import.meta.url),'utf8');
it('names real documents and change sets without fixture copy',()=>{
 expect(reviewTitle('docs/Release.markdown')).toBe('Release.markdown');
 expect(reviewTitle('designs/new.html')).toBe('new.html');
 expect(reviewTitle('run.change',0)).toBe('Code changes · 0 files');
 expect(reviewTitle('run.change',1)).toBe('Code changes · 1 file');
 expect(reviewTitle('run.change',4)).toBe('Code changes · 4 files');
});
it('ships the approved appearance outside the fixture lab',()=>{
 const app=read('App.tsx');
 expect(app).toContain("reviewLab ? focusControlStyle : 'corners-bare'");
 // The code viewer's four treatments went on 2026-09-18, so this is no longer
 // a choice the lab makes. The attribute stays, because the review card and
 // the text artifact are still drawn off it.
 expect(app).toContain("dataset.codeReview='glass'");
 expect(read('components/Focus.tsx')).not.toContain("previewPaths.map(path => reviewLabEnabled");
 expect(read('components/DirectReview.tsx')).toContain('onAddContext &&');
});
