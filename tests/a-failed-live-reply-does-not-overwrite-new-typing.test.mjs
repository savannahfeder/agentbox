// MP-04: delayed rejection can arrive after the user typed another message.
// Keep both paragraphs and both attachment sets; another task stays untouched.
import {it,expect} from 'vitest';
import {restoreFailedDraft,saveDraft,readDraft,readDraftAttachments} from '../renderer/src/drafts';
function store(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
const item={product:'p',id:'w-test'};
it('restores a failed send into an empty draft',()=>{const s=store();restoreFailedDraft(item,'failed',[],s);expect(readDraft(item,s)).toBe('failed');});
it('keeps new typing and an earlier failed reply',()=>{const s=store();saveDraft(item,'new typing',s);restoreFailedDraft(item,'failed',[],s);expect(readDraft(item,s)).toBe('new typing\n\nfailed');restoreFailedDraft(item,'second failed',[],s);expect(readDraft(item,s)).toContain('failed\n\nsecond failed');});
it('keeps attachments and leaves another task alone',()=>{const s=store();const other={...item,id:'other'};saveDraft(other,'untouched',s);restoreFailedDraft(item,'failed',[{name:'a.png',srcPath:'/tmp/a.png'}],s);expect(readDraftAttachments(item,s)).toHaveLength(1);expect(readDraft(other,s)).toBe('untouched');});
