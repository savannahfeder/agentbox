// 2026-09-19: existing traces said a tool started but not whether it was still
// running. One stale command would mislabel every subsequent thinking pause.
// Match starts/ends by id, including overlapping tools and both engines.
import { describe, it, expect } from 'vitest';
import { claudeActivity, codexActivity, currentActivity } from '../main/agent-activity.mjs';
const start = (id, command='npm test') => JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id,name:'Bash',input:{command}}]}});
const end = id => JSON.stringify({type:'user',message:{content:[{type:'tool_result',tool_use_id:id,content:''}]}});
describe('current command is a fact, not the latest trace line', () => {
 it('starts, ignores unrelated results, and clears even an empty output',()=>{const s={};claudeActivity(s,start('a'));expect(currentActivity(s)[0].label).toBe('Running npm test');claudeActivity(s,end('other'));expect(currentActivity(s)).toHaveLength(1);claudeActivity(s,end('a'));expect(currentActivity(s)).toEqual([]);});
 it('keeps concurrent calls and deduplicates repeated starts',()=>{const s={};claudeActivity(s,start('a'));claudeActivity(s,start('a'));claudeActivity(s,start('b','npm run build'));claudeActivity(s,end('b'));expect(currentActivity(s)).toHaveLength(1);expect(currentActivity(s)[0].id).toBe('a');});
 it('clears a failed or finished turn and tolerates malformed frames',()=>{const s={};claudeActivity(s,start('a'));claudeActivity(s,'invalid');claudeActivity(s,JSON.stringify({type:'result',is_error:true}));expect(currentActivity(s)).toEqual([]);});
 it('does not count a subagent tool as the lead command',()=>{const s={};claudeActivity(s,JSON.stringify({...JSON.parse(start('a')),parent_tool_use_id:'helper'}));expect(currentActivity(s)).toEqual([]);});
 it('preserves full commands while shortening the visible prelude',()=>{const s={};claudeActivity(s,start('a','cd /tmp && npm test'));expect(currentActivity(s)[0].label).toBe('Running npm test');expect(currentActivity(s)[0].detail).toBe('cd /tmp && npm test');});
 it.each(['completed','failed','declined'])('ends Codex calls when %s', status=>{const s={};codexActivity(s,'item/started',{item:{id:'a',type:'commandExecution',command:'npm test',status:'inProgress'}});expect(currentActivity(s)[0].label).toBe('Running npm test');codexActivity(s,'item/completed',{item:{id:'a',type:'commandExecution',status}});expect(currentActivity(s)).toEqual([]);});
 it('reasoning has no invented command and turn completion clears all tools',()=>{const s={};codexActivity(s,'item/started',{item:{id:'r',type:'reasoning'}});expect(currentActivity(s)).toEqual([]);codexActivity(s,'item/started',{item:{id:'x',type:'mcpToolCall',tool:'search',server:'docs'}});expect(currentActivity(s)[0].label).toBe('Using search');codexActivity(s,'turn/completed',{});expect(currentActivity(s)).toEqual([]);});
});
it('does not revive terminal Codex items or throw on malformed notifications',()=>{const s={};codexActivity(s,'item/started',{item:{id:'old',type:'commandExecution',status:'completed',command:'old command'}});expect(currentActivity(s)).toEqual([]);expect(()=>codexActivity(s,'item/started',{item:{id:'bad',type:'fileChange',changes:{}}})).not.toThrow();});
it('marks a shortened label and never silently loses command detail',()=>{const s={};const command='echo '+ 'x'.repeat(8100);claudeActivity(s,start('long',command));const action=currentActivity(s)[0];expect(action.label).toMatch(/…$/);expect(action.detail).toBe(command);});
