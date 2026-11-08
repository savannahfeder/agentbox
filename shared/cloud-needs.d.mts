export type Service = { id: string; name: string; keys: { name: string; label: string }[]; tokenUrl: string };
export type Need =
  | { kind: 'sign-in'; service: Service; why: string }
  | { kind: 'key'; name: string; what: string }
  | { kind: 'file'; path: string; why: string }
  | { kind: 'code'; about: string; why: string };
export declare const NEED: string;
export declare const SERVICES: readonly Service[];
export declare function serviceById(id: string | null | undefined): Service | null;
export declare function needsIn(text: string | null | undefined): Need[];
export declare function isNeedLine(line: string | null | undefined): boolean;
export declare function needId(need: Need): string;
export declare function keysOf(need: Need): string[];
export declare function needsLeft(item: unknown, saved?: Iterable<string>): Need[];
export declare function needsWord(needs: Need[]): string | null;
export declare function connectedReply(needs: Need[]): string;
export declare function lateReply(needs: Need[]): string;
export declare function threadsKeysFree(items: unknown[], saved: Iterable<string>): { product: string; id: string; answer: string }[];
