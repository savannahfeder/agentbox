import type { ChildProcess } from 'node:child_process';

export declare const CLIENT_INFO: Readonly<{ name: string; title: string; version: string }>;
export declare const APPROVAL_DECISIONS: readonly string[];
export declare const ELICITATION_ACTIONS: readonly string[];
export declare const REFUSAL_DECISION: 'decline';
export declare const MAX_FRAME_LENGTH: number;
export declare const REQUEST_TIMEOUT_MS: number;
export declare const LEGACY_DECISIONS: Readonly<{
  accept: string;
  acceptForSession: string;
  cancel: string;
  decline: { denied: { rejection: string } };
}>;
export declare const SERVER_REQUESTS: readonly string[];

export interface CodexRpcError {
  code: number;
  message: string;
}

export type CodexAnswer = { result: unknown } | { error: CodexRpcError };

export declare function yesTo(method: string): { result: { decision: 'accept' } | { action: 'accept' } } | null;
export declare function refusalTo(method: string): CodexAnswer;

export interface CodexGone {
  reason: 'write' | 'protocol' | 'error' | 'closed' | 'exit';
  code: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
  note: string | null;
  stderr: string;
  why?: string;
}

export interface CodexThreadHandlers {
  onNotification?: (method: string, params: unknown) => unknown;
  onApproval?: (method: string, params: unknown) => unknown;
  onClosed?: (gone: CodexGone) => unknown;
}

export interface CodexAppServerOptions {
  transport?: ChildProcess | null;
  spawn?: (() => ChildProcess) | null;
  clientInfo?: { name: string; title?: string; version: string };
  onNotification?: ((method: string, params: unknown) => unknown) | null;
  onUnknownRequest?: ((method: string, params: unknown) => unknown) | null;
  requestTimeoutMs?: number;
  maxFrameLength?: number;
  stderrLimit?: number;
}

export interface CodexAppServer {
  request(method: string, params?: unknown): Promise<unknown>;
  initialize(): Promise<unknown>;
  startThread(params?: object, handlers?: CodexThreadHandlers): Promise<{ threadId: unknown; thread: unknown; result: unknown }>;
  resumeThread(params?: { threadId?: unknown; [key: string]: unknown }, handlers?: CodexThreadHandlers): Promise<unknown>;
  startTurn(threadId: string, params?: object): Promise<unknown>;
  interruptTurn(threadId: string, turnId: string): Promise<unknown>;
  steerTurn(threadId: string, expectedTurnId: string, text: string, pictures?: unknown[]): Promise<unknown>;
  watch(threadId: string, handlers?: CodexThreadHandlers): string;
  unwatch(threadId: string): boolean;
  close(note?: string): void;
  isClosed(): boolean;
  stderr(): string;
  stats(): { pending: number; threads: number; approvals: number };
}

export declare function createCodexAppServer(options?: CodexAppServerOptions): CodexAppServer;
