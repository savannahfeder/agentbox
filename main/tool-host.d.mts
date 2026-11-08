import type { Readable, Writable } from 'node:stream';

export declare const TOOL_HOST_ALREADY_THERE: 3;

export declare function toolHostDir(options?: { appPid?: number; dir?: string; uid?: number }): string;
export declare function readToolHost(dir: string): { port: number; pid: number } | null;
export declare function shareToolServers(configFile: string, options: { dir: string; item?: string | null; product?: string | null; storeServer?: string | null }): string | null;

export interface ToolSession {
  input: Readable;
  output: Writable;
  env: NodeJS.ProcessEnv;
  holder: string;
  ownItem: string | null;
  ownProduct: string | null;
}

export declare function serveTools(options: {
  dir: string;
  appPid: number;
  servers: Record<'store', (session: ToolSession) => { close?: () => unknown } | void | Promise<{ close?: () => unknown } | void>>;
  idleMs?: number;
  orphanMs?: number;
  keepaliveMs?: number;
  checkMs?: number;
  log?: (message: string) => void;
  onIdle?: () => void;
}): { started: Promise<number>; sessions(): number; close(): Promise<void> };
