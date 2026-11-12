export function safeHeroBottom({left,right,top,bottom}:{left:number;right:number;top:number;bottom:number}){
  let safe=bottom;
  const consider=(rect:DOMRect)=>{
    if(rect.width&&rect.height&&rect.left<right&&rect.right>left&&rect.top>=top&&rect.top<bottom&&rect.bottom>bottom)safe=Math.min(safe,rect.top-8);
  };
  for(const element of document.querySelectorAll('p,a,button,input,label'))consider(element.getBoundingClientRect());
  const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let node=walk.nextNode();node;node=walk.nextNode())if(node.textContent?.trim()){
    const range=document.createRange();range.selectNodeContents(node);
    for(const rect of range.getClientRects())if(rect.top>=top&&rect.top<bottom&&rect.bottom>bottom){
      const block=node.parentElement?.closest('p,a,button,label');consider(block?block.getBoundingClientRect():rect);
    }
  }
  return safe;
}
