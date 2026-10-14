import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {placeHint,HINT_GAP,HINT_MARGIN} from '../hint-plate';

export function RowHoverPreview({id,onClose,children}:{id:string;onClose:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDivElement>(null),[at,setAt]=useState<{top:number;left:number}|null>(null);
 useLayoutEffect(()=>{
  const panel=ref.current,row=document.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
  if(!panel||!row)return;
  const box=panel.getBoundingClientRect();
  const placed=placeHint(row.getBoundingClientRect(),box,{width:innerWidth,height:innerHeight},'left');
  // Touch the row so reaching the buttons cannot hover a different task in the gap.
  setAt(placed?{...placed,left:Math.max(HINT_MARGIN,innerWidth-box.width-HINT_MARGIN),top:Math.max(HINT_MARGIN,Math.min(placed.top+(placed.rose?HINT_GAP:-HINT_GAP),innerHeight-box.height-HINT_MARGIN))}:null);
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose()}};
  const outside=(e:Event)=>{if(!panel.contains(e.target as Node)&&!row.contains(e.target as Node))onClose()};
  const scroll=(e:Event)=>{if(!panel.contains(e.target as Node))onClose()};
  window.addEventListener('keydown',key,true);window.addEventListener('pointerdown',outside,true);window.addEventListener('scroll',scroll,true);window.addEventListener('resize',onClose);
  return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('pointerdown',outside,true);window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',onClose)};
 },[id,onClose]);
 const panel=<div ref={ref} className="hint-plate row-hover-preview" role="group" aria-label="Chat-Vorschau"
  style={at?{top:at.top,left:at.left}:{visibility:'hidden'}} onClick={e=>e.stopPropagation()}
  onMouseLeave={e=>{if(!(e.relatedTarget instanceof Element)||e.relatedTarget.closest('[data-item-id]')?.getAttribute('data-item-id')!==id)onClose()}}>{children}</div>;
 return typeof document==='undefined'?panel:createPortal(panel,document.body);
}
