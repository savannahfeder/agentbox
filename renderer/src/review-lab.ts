import {tokenize} from './code-artifact';
export function reviewLabEnabled(fixtures:boolean, search:string) {
  return fixtures && new URLSearchParams(search).has('reviewLab');
}
export function reviewContextDraft(draft:string,path:string, action:'approve'|'feedback' = 'approve') {
 const note=action === 'feedback' ? `Feedback on ${path}:` : `Looks good: ${path}`;
 return draft.split('\n').includes(note) ? draft : draft ? `${draft}\n\n${note}` : note;
}
export function reviewExcerpt(rows:readonly (readonly string[])[]) {
 return rows.slice(0,6).map(([mark,text],index)=>({mark,text,line:index+1}));
}
export function reviewFileSummary<T>(files:T[]) {return {visible:files.slice(0,3),remaining:Math.max(0,files.length-3),total:files.length};}

export const reviewSyntax = tokenize;
export function reviewOpenLabel(count:number) {return count > 1 ? 'Review all files' : count === 1 ? 'Review full file' : 'Open preview';}

/** Filename stays recognizable; a change artifact represents its whole bundle. */
export function reviewTitle(path:string,count?:number) {
 return count === undefined ? path.split(/[?#]/)[0].split('/').pop() || path
  : `Code changes · ${count} file${count === 1 ? '' : 's'}`;
}
