import { EventEmitter } from 'node:events';
import type { PassThrough, Writable } from 'node:stream';
import type { ClaudeInput, HostInputState } from './claude-input.mts';
import type { BridgeStateEvent } from './task-remote-control.mts';
import type { RemoteUserEvent, RunExitHow } from './supervisor.mts';

export declare const HOST_LOST: 75;

export interface HostedRunStart {
  bin: string | null | undefined;
  argv: string[];
  env: Record<string, string | undefined>;
  cwd: string;
  spool?: string;
}

export interface HostedRunOptions {
  sockPath: string;
  runId: string;
  start?: HostedRunStart | null;
  out?: number | null;
  err?: number | null;
  pid?: number | null;
}

export interface HostedRunRead {
  out: number | null;
  err: number | null;
}

export type HostedRunState = HostInputState & { t: 'state'; pid?: number | null; from?: HostedRunRead };

export interface HostedRun extends Partial<ClaudeInput> {}

export declare class HostedRun extends EventEmitter {
  constructor(options: HostedRunOptions);
  runId: string;
  sockPath: string;
  pid: number | undefined;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  read: HostedRunRead;
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: Writable;
  endedInHost?: boolean;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null, how?: RunExitHow) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'input-turn', listener: () => void): this;
  on(event: 'remote-user', listener: (event: RemoteUserEvent) => void): this;
  on(event: 'bridge-state', listener: (event: BridgeStateEvent) => void): this;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'spawn', listener: () => void): this;
  on(event: 'input-state', listener: (state: HostedRunState) => void): this;
  once(event: 'spawn', listener: () => void): this;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
  keep(): void;
  detach(): HostedRunRead | null;
}
