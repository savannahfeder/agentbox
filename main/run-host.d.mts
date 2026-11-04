import type { Server } from 'node:net';

export declare const PROTOCOL: 1;
export declare const HOST_ALREADY_THERE: 3;

export declare function runHostStamp(): string;
export declare function runHostSocket(options?: { stamp?: string; dir?: string; uid?: number }): string;

export interface SpoolFiles {
  out: string;
  err: string;
  exit: string;
}

export declare function spoolFiles(spoolDir: string, runId: string): SpoolFiles;

export interface ServeRunsOptions {
  sockPath: string;
  spoolDir: string;
  idleMs?: number;
  keepEndedMs?: number;
  onIdle?: () => void;
  log?: (message: string) => void;
  stamp?: string;
}

export interface RunHost {
  server: Server;
  started: Promise<'taken' | 'serving'>;
  runs(): number;
  close(): Promise<void>;
}

export declare function serveRuns(options: ServeRunsOptions): RunHost;
