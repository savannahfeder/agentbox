import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { providerCommand, providerCommands, reviewTarget } from '../shared/provider-commands.mts';
import { harnessFor } from './harnesses.mts';
import type { HarnessSupervisor } from './harnesses/common.mts';
import { NAME } from '../shared/product-name.mjs';
const exec = promisify(execFile);

export interface CommandResult {
  state: string;
  text?: string;
  name?: string;
  at: number;
}

type ParsedCommand = NonNullable<ReturnType<typeof providerCommand>>;
type Publish = (state: string, message?: string, name?: string) => CommandResult;

export interface CommandItem {
  id: string;
  agent?: unknown;
  title?: string;
  priority?: number;
  engine?: string;
  model?: string;
  effort?: string | null;
}

export interface CommandProduct {
  slug: string;
  repoPath?: string | null;
  dir: string;
}

export interface CommandSession {
  remoteIdle?: boolean;
}

export interface CompactionJob {
  threadId?: string | null;
  profile?: string | null;
}

export interface CodexUsageReport {
  at: number;
  limits: { name: string; percent: number; resetsAt?: number | string | null }[];
}

/** The part of the supervisor that slash commands read and call. */
export interface TaskCommandSupervisor extends HarnessSupervisor {
  onChange?: (() => void) | null;
  sessions: Map<string, CommandSession>;
  _compactions?: Record<string, { state: string; text?: string; name?: string; at?: number }>;
  _compactionJobs?: Map<string, CompactionJob>;
  _nativeCommands?: Record<string, string[] | undefined>;
  _saveState(): void;
  _engineFor(item: CommandItem | null | undefined): string;
  _codexUsageHome(): string;
  codexUsage(): CodexUsageReport | null;
  rowSessionFor(item: CommandItem, product: CommandProduct | null | undefined): { sessionId?: string; profile?: string | null } | null | undefined;
  remoteControl(product: string, id: string, action: string): Promise<unknown>;
  compactItem(product: string, id: string): { state: string; at?: number } | null;
  store: {
    readItem(product: string, id: string): CommandItem | null | undefined;
    listProducts(): CommandProduct[];
    composeItem(product: string, fields: Record<string, unknown>): { id?: string; title?: string } | null | undefined;
    productDir(product: string): string;
    modules: { workItemsDisk: { updateWorkItem(dir: string, id: string, patch: Record<string, unknown>, options: { source: string }): unknown } };
  };
}

/** What a failed provider call carries. */
interface CommandError {
  code?: number | string;
  message?: string;
}

/**
 * A FORK IS A NEW TASK THAT STARTS WHERE THIS ONE GOT TO (MP-08, w-5ebf7bf7bb).
 *
 * Claude Code resumes a conversation under a new id with `--fork-session`, so
 * the original thread is untouched and the new one knows everything it knew.
 * The new ROW is what carries it here, rather than a second thread on this row,
 * because a row is the unit of everything else: the inbox, the folder its code
 * lives in, the change card, the session her next reply resumes. Two threads on
 * one row would have to answer which of them a reply belongs to.
 *
 * The words after the command are the new task's own instruction, so a fork is
 * never an empty room. The label `fork:<source row>` is the whole of the
 * mechanism: `Supervisor#spawnPlan` reads it on the new row's first run, finds
 * the source row's chat, and resumes it with `--fork-session`. Once the fork has
 * a chat of its own, that takes over and nothing forks twice.
 */
/**
 * A row name out of the sentence typed after `/fork`: its first sentence,
 * or the first sixty characters of it, so the inbox line says which fork this
 * is rather than which row it came from. Whitespace flattened because a title
 * is one line and a paragraph can be pasted.
 */
export function forkTitle(words: unknown, cap = 60): string {
  const flat = String(words ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return 'A fork of this conversation';
  const stop = flat.search(/[.!?](\s|$)/);
  const first = stop > 0 ? flat.slice(0, stop) : flat;
  return first.length <= cap ? first : `${first.slice(0, cap - 1).trimEnd()}…`;
}

function forkTask(sup: TaskCommandSupervisor, productSlug: string, id: string, item: CommandItem, engine: string, op: ParsedCommand, publish: Publish) {
  if (!harnessFor(engine).capabilities.fork) {
    return publish('failed', 'Forking a Codex conversation is not connected yet. Its protocol has thread/fork and that call has never been made here, so this refuses rather than pretending. Your draft has been kept.', op.name);
  }
  // NAMING THE KEY, because the menu closes at the space and plain return then
  // writes a newline, the way it does on every other reply here. Without that
  // sentence the user types the words, presses return, and is back to a key
  // that does nothing, so a bare /fork looks as if it did nothing.
  if (!op.args) return publish('failed', 'Say what the fork should try, as in /fork try it without the modal, then press command and return.', op.name);
  const chat = sup.rowSessionFor(item, sup.store.listProducts().find((p) => p.slug === productSlug));
  if (!chat?.sessionId) return publish('failed', 'This task has no saved conversation to fork yet. Send a message first.', op.name);
  const made = sup.store.composeItem(productSlug, {
    // THE FORK IS NAMED AFTER WHAT IT WAS ASKED TO TRY, not after the row it
    // came from. Naming it `<parent title> · fork` put two rows in the inbox
    // whose names differ by one word at the end, so there was no telling which
    // agent was which. The instruction is the only thing that distinguishes them,
    // so it is what the row is called; the parent is still on the row as the
    // `fork:` label, which is where the machinery reads it anyway.
    title: forkTitle(op.args),
    body: op.args,
    kind: 'directive',
    priority: item.priority ?? 0,
    labels: [`fork:${id}`],
    // What the thread was picked to run on goes with it, or the fork falls to
    // the default (tests/a-fork-runs-on-the-model-its-thread-was-on).
    ...(item.engine ? { engine: item.engine } : {}),
    ...(item.model ? { model: item.model } : {}),
    ...(item.effort ? { effort: item.effort } : {}),
  });
  if (!made?.id) return publish('failed', 'The fork could not be created. Your draft has been kept.', op.name);
  sup.onChange?.();
  return publish('done', `Forked into a new task, starting from everything this conversation knows: ${made.title}`, op.name);
}

export async function taskCommand(sup: TaskCommandSupervisor, productSlug: string, id: string, text: string): Promise<CommandResult | { state: string; at?: number } | null> {
 const key=JSON.stringify([productSlug,id]);
 const publish=(state: string,message?: string,name?: string)=>{
  const value={state,text:message,name,at:Date.now()};
  sup._compactions??={};sup._compactions[key]=value;sup._saveState();sup.onChange?.();return value;
 };
 const item=sup.store.readItem(productSlug,id);
 if(!item||item.agent)return publish('failed','This task is not available.');
 const engine=sup._engineFor(item), harness=harnessFor(engine), op=providerCommand(text,engine);
 if(!op)return publish('failed','Enter a slash command.');
 if(harness.capabilities.nativeCommands && op.route === 'unavailable' && (sup._nativeCommands?.[id]?.includes(op.name) || (op.name === 'review' && sup._nativeCommands?.[id]?.includes('code-review')))) return publish('forward');
 if(op.route==='unavailable')return publish('failed',`/${op.name} is not supported in ${NAME} yet. Your draft has been kept. Use the native ${harness.label} client for this command.`,op.name);
 if(op.route==='remote'){if(op.args)return publish('failed','Run /remote-control on its own.',op.name);sup.remoteControl(productSlug,id,'toggle').catch(()=>{});return publish('done','',op.name);}
 if(op.route==='fork')return forkTask(sup,productSlug,id,item,engine,op,publish);
 if(op.route==='claude')return publish('forward');
 if(op.name==='compact')return op.args ? publish('failed','Run /compact on its own. Your draft has been kept.',op.name) : sup.compactItem(productSlug,id);
 if(op.name==='review') {
  try { reviewTarget(op.args); return publish('forward'); }
  catch(error) { return publish('failed',(error as CommandError).message,op.name); }
 }
 if(sup._compactionJobs?.has(key))return {state:'busy',text:'A command is already running on this task. Your draft has been kept.',at:Date.now()};
 const readOnly = ['status','usage','skills','diff','copy','help'].includes(op.name) || (['model','effort'].includes(op.name) && !op.args);
 if(sup.sessions.has(id) && !readOnly)return publish('busy',sup.sessions.get(id)!.remoteIdle?'Turn off Remote Control before changing this task’s local settings. Your draft has been kept.':'Wait for the current response to finish. Your draft has been kept.',op.name);
 const product=sup.store.listProducts().find(p=>p.slug===productSlug);
 if(!product)return publish('failed','This project is no longer available.',op.name);
 const cwd=product.repoPath&&fs.existsSync(product.repoPath)?product.repoPath:product.dir;
 const rec=sup.rowSessionFor(item,product);
 sup._compactionJobs??=new Map();
 if(rec?.sessionId&&[...sup._compactionJobs.values()].some(job=>job.threadId===rec.sessionId&&job.profile===rec.profile))return publish('busy','This conversation is busy. Your draft has been kept.',op.name);
 sup._compactionJobs.set(key,{threadId:rec?.sessionId,profile:rec?.profile});
 try {
  let result: string;
  const write=(patch: Record<string, unknown>)=>sup.store.modules.workItemsDisk.updateWorkItem(sup.store.productDir(productSlug),id,patch,{source:'founder'});
  const home=harness.profileHome(sup,rec?.profile??'default');
  const model=item.model||harness.workspaceModel(sup)||harness.defaultModel({home});
  if(op.name==='model') {
   // Both halves read off this Mac, so /model lists what its CLIs can actually
   // be asked for today rather than what was true when Agentbox was built.
   const models=harness.models({home,bin:harness.binary(sup.config)}) as { id: string; label: string }[];
   if(!op.args)result=`Task model: ${model||'provider default'}\n${models.map((m: { id: string; label: string })=>`/model ${m.id} · ${m.label}`).join('\n')}`;
   else {if(!models.some((m: { id: string })=>m.id===op.args))throw new Error('Choose one of the models listed by /model. Your draft has been kept.');
    // Model changes cannot carry an incompatible effort into the next run.
    const levels=harness.effortLevels(op.args,{home}) as string[] | null;
    write({model:op.args,...(item.effort&&levels&&!levels.includes(item.effort)?{effort:null}:{})});
    result=`This task will use ${op.args} on its next response.`;}
  } else if(op.name==='effort') {
   const levels=harness.effortLevels(model,{home}) as string[] | null;
   if(!op.args)result=`Task effort: ${item.effort||'provider default'}\n${levels?.map((l: string)=>`/effort ${l}`).join('\n')||'The provider has not reported available levels.'}`;
   else {if(!levels?.includes(op.args))throw new Error('Choose one of the levels listed by /effort. Your draft has been kept.');write({effort:op.args});result=`This task will use ${op.args} effort on its next response.`;}
  } else if(op.name==='rename') {
   if(!op.args||op.args.includes('\n')||op.args.length>200)throw new Error('Use /rename followed by a title of up to 200 characters.');
   write({title:op.args});result=`Task renamed to ${op.args}.`;
  } else if(op.name==='help') {
   if(op.args)throw new Error('Run /help on its own.');
   const names = (sup._nativeCommands?.[id] ?? []).filter((n: string)=>!providerCommands(engine).some(c=>c.name===n));
   // WHAT IS STILL MISSING, KEPT TRUE. Forking is connected now, on Claude Code
   // (MP-08), so the old sentence naming it was out of date the day it shipped.
   // A list of gaps nobody maintains is worse than no list: it teaches her that
   // what this app says about itself is stale.
   const missing = !harness.capabilities.fork
    ? 'Native terminal settings, forking a conversation, rewind and integration setup are not connected here yet.'
    : 'Native terminal settings, rewind and integration setup are not connected here yet.';
   result=[...providerCommands(engine).map(c=>`/${c.name}${c.argumentHint?' '+c.argumentHint:''} · ${c.description}`), ...(harness.capabilities.nativeCommands?names.map((n: string)=>`/${n} · Native ${harness.label} command`):[])].join('\n')+`\n\n${missing} Unavailable commands keep your draft and never run as a prompt.`;
  } else if(op.name==='diff') {
   if(op.args)throw new Error('Run /diff on its own.');
   const opts={cwd,timeout:15000,maxBuffer:2*1024*1024};
   const unstaged=await exec('git',['--no-pager','diff','--no-ext-diff','--no-textconv'],opts);
   const staged=await exec('git',['--no-pager','diff','--cached','--no-ext-diff','--no-textconv'],opts);
   const untracked=await exec('git',['ls-files','--others','--exclude-standard'],opts);
   result=[unstaged.stdout&&'Unstaged\n'+unstaged.stdout,staged.stdout&&'Staged\n'+staged.stdout,untracked.stdout&&'Untracked files (contents not included)\n'+untracked.stdout].filter(Boolean).join('\n')||'No local changes.';
  } else if(op.name==='usage') {
   if(op.args)throw new Error('Run /usage on its own.');
   const usage = home === sup._codexUsageHome() ? sup.codexUsage() : null;
   result=usage ? `Last reported ${new Date(usage.at).toLocaleString()} (may be stale)\n${usage.limits.map(l=>`${l.name}: ${l.percent}% used${l.resetsAt ? '; resets '+new Date(l.resetsAt).toLocaleString() : ''}`).join('\n')}` : 'No usage has been reported for this conversation’s account yet.';
  } else {
   if(op.name==='goal' && op.args && !['pause','clear'].includes(op.args)) throw new Error(`Setting or resuming a Codex goal is not connected to ${NAME}’s worker lifecycle yet. Your draft has been kept.`);
   if(!rec?.sessionId&&op.name!=='skills')throw new Error('This task has no saved conversation yet. Send a message first.');
   result=await harness.runCommand(sup,{home,threadId:rec?.sessionId,cwd,...op}) as string;
   if(op.name==='status')result=`Task model: ${model||'provider default'}\nTask effort: ${item.effort||'provider default'}\n${result}`;
  }
  if(op.name==='copy')return {state:'copy',text:result,at:Date.now()};
  return publish('done',result,op.name);
 } catch(error) {
  const message=(error as CommandError)?.code===-32601||/unknown (method|variant)|method not found/i.test((error as CommandError)?.message??'')?'This command is not available in the installed provider version. Your draft has been kept.':(error as CommandError).message||'The command failed. Your draft has been kept.';
  return publish('failed',message,op.name);
 } finally {sup._compactionJobs.delete(key);}
}
