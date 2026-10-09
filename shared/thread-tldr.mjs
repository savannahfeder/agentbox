function brief(text,limit){
 const prose=String(text||'').split(/^#{1,6}\s+(?:Options|Optionen)\b/im)[0]
  .replace(/```[\s\S]*?```/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'')
  .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^\s*#{1,6}\s+.*$/gm,'')
  .replace(/[*_`]/g,'').replace(/\s+/g,' ').trim();
 // ponytail: this is a bounded lead excerpt, not an additional paid model call.
 const sentences=[...new Intl.Segmenter('de',{granularity:'sentence'}).segment(prose)].slice(0,2).map(s=>s.segment).join('').trim();
 return sentences.length<=limit?sentences:sentences.slice(0,limit-1).trimEnd()+'…';
}
export function threadTldr(events=[],outcome=null,{running=false}={}){
 const spoken=events.filter(e=>e.kind!=='work'&&e.text?.trim());
 const mirrored=e=>/Read from Codex\. Replies happen there\./.test(e.text||'');
 const hasLocalReply=spoken.some(e=>e.who==='it'&&!mirrored(e));
 const candidates=(outcome?[...spoken,{...outcome,who:'it'}]:spoken).filter(e=>!hasLocalReply||!mirrored(e));
 const latest=[...candidates].sort((a,b)=>(a.at||0)-(b.at||0)).at(-1);
 if(!latest)return null;
 const request=[...spoken].filter(e=>e.who==='you').sort((a,b)=>(a.at||0)-(b.at||0)).at(-1);
 return {at:latest.at||0,context:request?brief(request.text,110):'',text:latest.who==='you'
  ?running?'Agent arbeitet an deiner neuesten Nachricht.':'Deine neueste Nachricht wartet auf eine Antwort.'
  :brief(latest.text,240)};
}
