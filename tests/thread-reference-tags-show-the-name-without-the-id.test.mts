// 2026-10-11: the four tag proposals were too large. References should show
// one thread name and an icon, with zero IDs or extra metadata in the label.
import {describe, it, expect} from 'vitest';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TicketLink, TicketNavigation, TicketText} from '../renderer/src/components/TicketReference.tsx';

const id='w-a123456789';
const name='Shared engine interface';
const context={open:()=>{},name:value=>value===id?name:null};
const render=child=>renderToStaticMarkup(h(TicketNavigation.Provider,{value:context},child));
const visible=html=>html.replace(/<[^>]+>/g,'');

describe('a thread tag is its name and icon',()=>{
  it('replaces both a bare ID and a copied branch with the thread name',()=>{
    const html=render(h(TicketText,{text:`Review ${id}, then agentbox/${id}-engine.`}));
    expect(visible(html)).toBe(`Review ${name}, then ${name}.`);
    expect(html).toContain('<svg');
    expect(html).toContain(`href="#ticket/${id}"`);
  });
  it('replaces inline-code or authored link labels without nesting code in the tag',()=>{
    const html=render(h(TicketLink,{id},h('code',null,'agentbox/'+id)));
    expect(visible(html)).toBe(name);
    expect(html).not.toContain('<code');
    expect(html).toContain('Open thread: '+name);
  });
  it('keeps the full long name accessible without revealing the ID',()=>{
    const longName='Shared engine interface for additional harnesses and account recovery';
    const html=renderToStaticMarkup(h(TicketNavigation.Provider,{value:{...context,name:()=>longName}},h(TicketLink,{id},id)));
    expect(visible(html)).toBe(longName);
    expect(html).toContain(`title="${longName}"`);
    expect(html).toContain(`aria-label="Open thread: ${longName}"`);
  });
  it('does not promise navigation to a thread absent from the visible snapshot',()=>{
    const html=render(h(TicketLink,{id:'w-b123456789'},'w-b123456789'));
    expect(visible(html)).toBe('Unavailable thread');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('w-b123456789');
  });
  it('leaves ordinary prose untouched',()=>{
    expect(visible(render(h(TicketText,{text:'Review the shared engine before adding harnesses.'})))).toBe('Review the shared engine before adding harnesses.');
  });
});
