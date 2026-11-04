export declare const SENT_FILE_MAX: number;
export declare function fileToSend(asked: unknown, opts?: { home?: string }): { path: string; size: number; error?: undefined } | { error: string; path?: undefined; size?: undefined };
export declare function filesSentFor(env: NodeJS.ProcessEnv | null | undefined, opts?: { home?: string }): string[];
