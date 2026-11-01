import { EventEmitter } from 'node:events';
import type { PassThrough, Writable } from 'node:stream';

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
  kill(signal?: NodeJS.Signals | number): boolean;
  keep(): void;
  detach(): HostedRunRead | null;
}
