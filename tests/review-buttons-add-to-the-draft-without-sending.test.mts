// 2026-09-18: Looks good must stage context, never approve or send.
// Preserve existing words, avoid duplicate context, and identify each file.
import {it,expect} from 'vitest';
import {reviewContextDraft} from '../renderer/src/review-lab';
it('adds a file-specific note to an empty draft',()=>{
 expect(reviewContextDraft('','designs/page.html')).toBe('Looks good: designs/page.html');
});
it('preserves an existing reply',()=>{
 expect(reviewContextDraft('Keep the title.','notes.md')).toBe('Keep the title.\n\nLooks good: notes.md');
});
it('does not repeat the same note but keeps distinct files',()=>{
 const draft=reviewContextDraft('','one.change');
 expect(reviewContextDraft(draft,'one.change')).toBe(draft);
 expect(reviewContextDraft(draft,'two.change')).toBe(draft+'\n\nLooks good: two.change');
});
it('stages changes separately from approval and preserves both',()=>{
 expect(reviewContextDraft('Keep this.','notes.md','feedback')).toBe('Keep this.\n\nFeedback on notes.md:');
 const approval=reviewContextDraft('','notes.md');
 const both=reviewContextDraft(approval,'notes.md','feedback');
 expect(both).toBe(approval+'\n\nFeedback on notes.md:');
 expect(reviewContextDraft(both,'notes.md','feedback')).toBe(both);
});
