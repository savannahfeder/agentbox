export interface SignInAsk { id: string; service: string; url: string; code?: string; why?: string; at: number; done?: true }
export interface SignInAnswer { id: string; said: 'signed-in' | 'landed' | 'skipped'; url?: string; at: number }
export declare function cleanSignIn(value: unknown): SignInAsk | undefined;
export declare function cleanSignInAnswer(value: unknown): SignInAnswer | undefined;
export declare function openSignIn(item: { signIn?: unknown; signInAnswer?: unknown; status?: string } | null | undefined): SignInAsk | null;
export declare function answerTo(item: { signInAnswer?: unknown } | null | undefined, id: string): SignInAnswer | null;
export declare function newSignInId(): string;
export declare function comesBackTo(url: string): { port: number; path: string } | null;
