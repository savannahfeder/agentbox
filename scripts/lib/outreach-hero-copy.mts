type HeroCopy={text:string;width:number;highlight?:{selector:string;textSelector:string};textSelectors?:string[];textSelector?:string;lines?:string[]};
export function setHeroHeadline({text,width,highlight,textSelectors,textSelector,lines}:HeroCopy){
  const host=document.querySelector<HTMLElement>('[data-outreach-hero]');
  if(!host)throw new Error('Hero text target is missing');
  if(textSelectors||textSelector){
    const slots=textSelectors?textSelectors.map(selector=>host.querySelector(selector)):[...host.querySelectorAll(textSelector!)];
    if(!lines||slots.length!==lines.length||slots.some(slot=>!slot)||lines.join(' ')!==text)throw new Error('Explicit hero lines must match the complete headline');
    slots.forEach((slot,i)=>{slot!.textContent=lines[i];});
  }else if(highlight){
    const slot=host.querySelector<HTMLElement>(highlight.selector),word=slot?.querySelector(highlight.textSelector);
    if(!slot||!word)throw new Error('Animated word target is missing');
    const [first,...rest]=text.split(' ');word.textContent=first;
    const range=document.createRange();range.selectNodeContents(word);slot.style.width=`${range.getBoundingClientRect().width}px`;
    let wrapper:Element=slot;while(wrapper.parentElement!==host)wrapper=wrapper.parentElement!;
    host.replaceChildren(wrapper,document.createTextNode(' '+rest.join(' ')));
    host.style.setProperty('max-width',`${width}px`,'important');
    host.style.setProperty('white-space','normal','important');
  }else{
    const walk=document.createTreeWalker(host,NodeFilter.SHOW_TEXT),nodes:Node[]=[];
    for(let n=walk.nextNode();n;n=walk.nextNode())if(n.textContent?.trim())nodes.push(n);
    if(nodes.length){nodes[0].textContent=text;nodes.slice(1).forEach(n=>n.textContent='');}else host.textContent=text;
    host.querySelectorAll('br').forEach(br=>br.remove());
  }
  const walk=document.createTreeWalker(host,NodeFilter.SHOW_TEXT),rects:DOMRect[]=[];
  for(let n=walk.nextNode();n;n=walk.nextNode())if(n.textContent?.trim()){
    const range=document.createRange();range.selectNodeContents(n);rects.push(...range.getClientRects());
  }
  const bounds=host.getBoundingClientRect();
  const overflow=[host,...host.querySelectorAll('*')].some(el=>el.scrollWidth>el.clientWidth+2&&getComputedStyle(el).overflow!=='visible');
  return {height:bounds.height,overflow,left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),bottom:Math.max(...rects.map(r=>r.bottom))};
}
