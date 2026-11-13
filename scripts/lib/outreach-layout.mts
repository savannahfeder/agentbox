export function repairReplayDOM({company}: {company: string}) {
  const transform=document.body.style.transform;
  document.body.style.transform='none';
  let style=document.getElementById('outreach-layout');
  if(!style){style=document.createElement('style');style.id='outreach-layout';document.head.append(style);}
  style.textContent=`#film-switcher{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif!important;letter-spacing:normal!important}#film-switcher .name{font:600 15px/1.2 -apple-system,BlinkMacSystemFont,sans-serif!important;letter-spacing:normal!important;width:max-content!important;text-align:center!important;transform:translateX(-50%)!important}.tc-bar{flex-wrap:nowrap!important;min-width:0}.tc-bar [data-tour="project"]{flex:0 1 auto!important;min-width:0;max-width:220px}.tc-bar [data-tour="project"] .tc-chip{max-width:100%;min-width:0}.tc-bar .tc-chip-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.tc-bar .tc-send-pair{flex-shrink:0}`;
  const switcher=document.getElementById('film-switcher');
  const label=switcher?.querySelector<HTMLElement>('.name');
  const icon=switcher?.querySelector('.app.on img');
  if(switcher&&label&&icon){
    const selected=icon.getBoundingClientRect(),parent=switcher.getBoundingClientRect();
    label.style.left=`${selected.left+selected.width/2-parent.left-switcher.clientLeft}px`;
  }
  style.textContent+='.one-title{max-width:min(100%,600px)!important;min-width:0!important;white-space:normal!important;overflow-wrap:break-word}';
  const title=document.querySelector('.one-title');
  if(title && !title.textContent?.startsWith(`${company} · `))title.textContent=`${company} · ${title.textContent}`;
  if(document.querySelector('.one-sum')){
    for(const thread of document.querySelectorAll('.one-sum ~ .thread'))thread.remove();
    // Older demo captures wrapped the answer in a file appendix instead of QueueAnswer.
    for(const answer of document.querySelectorAll('.appendix-foot')){
      answer.classList.remove('appendix','appendix-foot');answer.classList.add('outcome','one-answer');
      answer.querySelector('.appendix-label')?.remove();
      const paragraph=answer.querySelector('p');
      if(paragraph?.firstElementChild?.tagName==='STRONG'){
        const heading=document.createElement('h1');heading.className='one-q';heading.textContent=paragraph.textContent;paragraph.replaceWith(heading);
      }
    }
  }
  let caret:number[]|null=null;
  const input=document.querySelector<HTMLTextAreaElement>('textarea[data-film-caret]');
  const marker=document.getElementById('film-caret');
  if(input&&marker&&getComputedStyle(marker).display!=='none'){
    const mirror=document.createElement('div'),css=getComputedStyle(input),rect=input.getBoundingClientRect();
    for(const key of ['font','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','textIndent','textTransform','padding','border','boxSizing','tabSize'] as const)mirror.style[key]=css[key];
    Object.assign(mirror.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,whiteSpace:'pre-wrap',overflowWrap:'break-word',visibility:'hidden'});
    const text=document.createTextNode(input.value);mirror.append(text);document.body.append(mirror);
    const range=document.createRange();range.setStart(text,text.length);range.collapse(true);
    let r=range.getBoundingClientRect();
    if(!r.height){const end=document.createElement('span');end.textContent='\u200b';mirror.append(end);r=end.getBoundingClientRect();}
    caret=[r.left-input.scrollLeft,r.top-input.scrollTop,r.height];
    Object.assign(marker.style,{left:`${caret[0]}px`,top:`${caret[1]}px`,height:`${caret[2]}px`});mirror.remove();
  }
  const violations:string[]=[];
  for(const bar of document.querySelectorAll('.tc-bar')){
    const parent=bar.getBoundingClientRect();
    for(const child of [...bar.children].filter(el=>getComputedStyle(el).display!=='none')){
      const r=child.getBoundingClientRect();
      if(r.right>parent.right+1||r.left<parent.left-1||r.bottom>parent.bottom+1)violations.push('Composer control exceeds its toolbar');
    }
  }
  const heading=title?.getBoundingClientRect();
  const titleBounds=heading?[heading.left,heading.top,heading.right,heading.bottom]:null;
  document.body.style.transform=transform;
  return {caret,violations,titleBounds};
}
