import {useEffect,useState} from 'react';
import {api} from '../api';
import {reviewExcerpt,reviewFileSummary,reviewOpenLabel,reviewSyntax,reviewTitle} from '../review-lab';
import {docKind} from '../doc-pane';
import {PreviewLoading} from './PreviewLoading';
import type {Change} from '../code-artifact';
import {ArtifactThumbnail} from './ArtifactThumbnail';
import './direct-review.css';

/** One bounded preview per artifact. A change artifact contains all its files. */
export function DirectReview({product,path,revision,open=false,onOpen,onAddContext}:{product:string;path:string;revision:number;open?:boolean;onOpen:()=>void;onAddContext?:(action:'approve'|'feedback')=>void}) {
 const [change,setChange]=useState<Change|null>(null);
 const [failed,setFailed]=useState(false);
 const isCode=docKind(path)==='code';
 useEffect(()=>{let active=true;setChange(null);setFailed(false);if(isCode)api.codeChange({product,src:path}).then(r=>{if(active){if(r.ok&&r.change)setChange(r.change as Change);else setFailed(true);}}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[product,path,revision,isCode]);
 const kind=isCode?'Code changes':docKind(path)==='markdown'?'Document':'Design';
 const summary=reviewFileSummary(change?.files ?? []);
 const openLabel=reviewOpenLabel(change ? summary.total : 0);
 return <section className="direct-review" aria-label={`${kind} review`}>
  <button type="button" className="review-card-hit" aria-expanded={open} aria-label={change ? `Open all ${summary.total} changed files` : `Open ${kind.toLowerCase()} preview`} onClick={onOpen}/><header><span className="review-title">{reviewTitle(path,change ? summary.total : undefined)}</span><span className="review-status"><i/>Ready for review</span></header>
  <div className="review-inset">{change ? <div className="review-bundle"><div className="review-files">{summary.visible.map(file=><div key={file.path}><span>{file.path.split('/').pop()}</span><small>+{file.plus} −{file.minus}</small></div>)}{summary.remaining>0 && <p>+{summary.remaining} more file{summary.remaining===1?'':'s'}</p>}</div><div className="review-code" aria-label="Code excerpt">{reviewExcerpt(change.files[0]?.hunks.flatMap(h=>h.rows) ?? []).map(row=><div className="review-code-line" data-mark={row.mark} key={row.line}><span className="review-line-number" aria-hidden="true">{row.line}</span><code><span className="review-mark">{row.mark==='='?' ':row.mark}</span>{reviewSyntax(row.text).map((token,i)=><span key={i} className={token.c ? `t-${token.c}` : undefined}>{token.s}</span>)}</code></div>)}</div></div> : isCode ? <div className="review-code-placeholder">{failed ? <span>Preview unavailable</span> : <PreviewLoading delayed />}</div> : <ArtifactThumbnail product={product} path={path} revision={revision}/>}</div>
  <footer className="review-controls"><button type="button" className="review-open" aria-expanded={open} aria-label={openLabel} title={`${openLabel} beside the conversation`} onClick={onOpen}><ReviewIcon kind="expand"/><span>{openLabel}</span></button>{onAddContext && <div className="review-responses"><button type="button" className="review-feedback" aria-label="Feedback / changes" title="Add feedback context to your reply draft" onClick={()=>onAddContext('feedback')}><ReviewIcon kind="feedback"/><span>Feedback</span></button><button type="button" className="review-accept" title="Add Looks good to your reply draft" aria-label="Looks good" onClick={()=>onAddContext('approve')}><ReviewIcon kind="approve"/><span>Looks good</span></button></div>}</footer>
 </section>;
}

function ReviewIcon({kind}:{kind:'expand'|'feedback'|'approve'}) {
 return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='expand'?<path d="M12 3.5h4.5V8M16.5 3.5l-5 5M8 16.5H3.5V12M3.5 16.5l5-5"/>:kind==='approve'?<path d="m4.5 10 3.5 3.5 7.5-7.5"/>:<path d="M5 4h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4.5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>}</svg>;
}
