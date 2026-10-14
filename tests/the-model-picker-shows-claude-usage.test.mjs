// Choosing a model hid the subscription limits that decide whether it can run.
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {ModelPicker,ModelUsageContext} from '../renderer/src/components/Model';
const draw=(engine='claude',limits=[])=>renderToStaticMarkup(createElement(ModelUsageContext.Provider,{value:[{engine:'claude',at:Date.now(),limits}]},createElement(ModelPicker,{value:null,onChange(){},engine,openAtStart:true})));
it('shows general and model-specific limits and reset times',()=>{
 const html=draw('claude',[{span:'session',name:'Current session',percent:100,resetsText:'22:30'}, {span:'week',qualifier:'Sonnet',name:'This week, Sonnet',percent:42}]);
 expect(html).toContain('100% used');expect(html).toContain('Limit reached');expect(html).toContain('22:30');expect(html).toContain('This week, Sonnet');expect(html).toContain('42% used');
});
it('does not treat missing readings as available capacity',()=>{expect(draw()).toContain('Usage unknown');expect(draw()).not.toContain('0% used');});
it('never shows Claude limits in the Codex picker',()=>{expect(draw('codex')).not.toContain('Claude usage');});
