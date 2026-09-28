// A command is an operation, never prose asking a model to imitate a CLI.
import { CLAUDE_COMMANDS, commandWords } from './claude-commands.mjs';
const command = (name, description, argumentHint = null, aliases = []) => ({ name, description, menuDescription: null, whole: true, argumentHint, aliases });
export const CODEX_COMMANDS = [
 command('model','Show models or change this task’s model','[model]'),
 command('effort','Show or change reasoning effort','[level]'),
 command('compact','Free up context in this conversation'),
 command('review','Review uncommitted changes, a branch, or specific instructions','[--base branch | --commit sha | instructions]'),
 command('status','Show this task’s configuration and conversation status'),
 command('usage','Show the account’s last reported usage'),
 command('skills','List skills available in this project'),
 command('mcp','Show this conversation’s connected MCP servers'),
 command('goal','View, pause, or clear this conversation’s goal','[pause | clear]'),
 command('diff','Show staged and unstaged changes'),
 command('rename','Rename this task','<name>'),
 command('copy','Copy the last assistant response'),
 command('help','Show available commands and remaining compatibility gaps'),
];
export const LOCAL_COMMANDS = CODEX_COMMANDS.filter(c=>['model','effort','diff','rename','help'].includes(c.name));
// A FORK IS A NEW TASK THAT STARTS WHERE THIS ONE GOT TO (MP-08). It is offered
// on both engines because both can do it natively: Claude Code resumes under a
// new id with `--fork-session`, and Codex's own protocol has `thread/fork`. It
// is refused on Codex for now, in a sentence that says why, because that call
// has never been made against a real server here.
const FORK = command('fork','Start a new task from this conversation','<what to try instead>');
export function providerCommands(engine) {
 // NOT ON THE CODEX MENU, because this menu's rule is that it offers nothing
 // that engine cannot run, and Codex forking is not connected yet. Typed there
 // it gets the ordinary unavailable refusal, which points at the native Codex
 // client, where `codex fork` genuinely works.
 return engine==='codex' ? CODEX_COMMANDS : [command('remote-control','Continue this conversation in Claude on another device',null,['rc']),FORK,...CLAUDE_COMMANDS.map(c=>LOCAL_COMMANDS.find(l=>l.name===c.name)??c),...LOCAL_COMMANDS.filter(l=>!CLAUDE_COMMANDS.some(c=>c.name===l.name))];
}
export function providerCommand(text, engine) {
 if(typeof text!=='string')return null;
 const m=text.trim().match(/^\/([a-z][a-z0-9:_-]*)(?:\s+([\s\S]*))?$/i);
 if(!m)return null;
 const word=m[1].toLowerCase(), args=(m[2]??'').trim();
 const cmd=providerCommands(engine).find(c=>commandWords(c).includes(word));
 if(!cmd) return {name:word,args,route:'unavailable'};
 if(cmd.name==='fork')return {name:'fork',args,route:'fork'};
 return {name:cmd.name,args,route:cmd.name==='remote-control'?'remote':engine==='codex'?'codex':LOCAL_COMMANDS.some(c=>c.name===cmd.name)?'local':'claude'};
}
export function reviewTarget(args='') {
 args=args.trim();
 if(!args)return {type:'uncommittedChanges'};
 const scope=args.match(/^--(base|commit)\s+([^\s]+)$/);
 if(scope)return scope[1]==='base'?{type:'baseBranch',branch:scope[2]}:{type:'commit',sha:scope[2]};
 if(args.startsWith('--'))throw new Error('Use /review, /review --base branch, /review --commit sha, or /review instructions.');
 return {type:'custom',instructions:args};
}

// Native prompt/skill commands are advertised by the running Claude session,
// including user and plugin commands. Never guess skill names from filenames.
export function nativeCommandNames(frame) {
 if(frame?.type!=='system'||frame?.subtype!=='init'||!Array.isArray(frame.slash_commands))return null;
 const blocked=new Set(['add-dir','auto-mode-setup','clear','color','config','import','design-consent','design-revoke','heapdump','exit','stop','__remote-workflow','workflow-launch-exec','usage-credits','extra-usage']);
 return [...new Set(frame.slash_commands.filter(n=>typeof n==='string'&&/^[a-z][a-z0-9:_-]*$/i.test(n)&&!blocked.has(n)))];
}
