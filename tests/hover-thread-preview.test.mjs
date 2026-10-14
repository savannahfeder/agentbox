// The table hid results and options until opening a thread. Hover must show only the newest short reply.
import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {List} from '../renderer/src/components/List.tsx';
const item={id:'hover-qa',product:'qa',productName:'QA',title:'Preview QA',status:'blocked',updatedAt:3,body:'Old request.',result:'Current result. Second sentence. Third sentence.\n## Options\n1. Continue\n2. Change\n3. Close this task',wrote:{body:{ts:1},result:{ts:3}}};
const draw=(extra={})=>renderToStaticMarkup(createElement(List,{items:[item],view:'inbox',table:true,selected:0,seen:new Set(),running:[],multiSel:new Set(),onSelect(){},onOpen(){},onToggle(){},onRange(){},onReply(){},onPick(){},...extra}));
it('shows the current short result and live options only on the hovered row',()=>{
 expect(draw()).not.toContain('row-hover-preview');
 const html=draw({hoveredId:item.id});
 expect(html).toContain('Current result. Second sentence.');
 expect(html).not.toContain('Third sentence.');
 for(const n of [1,2,3])expect(html).toContain(`Option ${n}:`);
 expect(html).toContain('Antworten (R)');
});
it('hides spent options and describes a newer pending reply',()=>{
 const html=draw({hoveredId:item.id,items:[{...item,answer:'New request',wrote:{...item.wrote,answer:{ts:4}}}]});
 expect(html).toContain('Noch keine Antwort des Agents auf deine neueste Nachricht.');
 expect(html).not.toContain('Option 1:');
});
