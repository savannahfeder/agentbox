import type { IpcConnections, IpcCopies } from '../ipc.mts';
import type { Supervisor } from '../supervisor.mts';

export interface ConnectionsCipher {
  encrypt(text: string): Buffer | null;
  decrypt(buf: Buffer): string | null;
}

export interface StartConnectionsOptions {
  config: { storeRoot: string };
  supervisor: Supervisor;
  appDir: string;
  userDir: string;
  cipher?: ConnectionsCipher | null;
  openExternal: (url: string) => unknown;
  packaged?: boolean;
  env?: NodeJS.ProcessEnv;
  onChange?: () => void;
  onWhoChanged?: () => void;
}

export interface Connected {
  connections: IpcConnections;
  copies: IpcCopies;
  stop(): Promise<unknown>;
}

export declare function startConnections(options: StartConnectionsOptions): Connected;
