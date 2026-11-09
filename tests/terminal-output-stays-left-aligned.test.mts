// the founder's September 16 screenshots showed terminal output jumping on
// focus. xterm toggles .focus; the app's conversation rule then imposed a 980px
// centered column and 28px 32px 40px padding. The terminal must have zero inner
// inset in both focus states; the surrounding screen supplies the intentional
// 16px gutter.
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import postcss from 'postcss';
const css=postcss.parse(readFileSync('renderer/src/components/task-terminal.css','utf8'));
describe('terminal output stays left aligned',()=>{
  for(const property of ['padding','margin','max-width'])it(`isolates ${property} from conversation focus styles in every panel`,()=>{
    let reset;
    css.walkRules('.task-terminal-screen .xterm',rule=>rule.walkDecls(property,d=>{reset=d;}));
    expect(reset?.value).toBe(property==='max-width'?'none':'0');
    expect(reset?.important).toBe(true);
  });
  it('keeps the intentional outer gutter and does not reset the conversation',()=>{
    let gutter;css.walkRules('.task-terminal-screen',r=>r.walkDecls('margin',d=>gutter=d.value));
    expect(gutter).toBe('12px 16px');
    css.walkRules(r=>{if(r.nodes.some(d=>d.important&&['margin','padding','max-width'].includes(d.prop)))expect(r.selector).toBe('.task-terminal-screen .xterm');});
  });
});
