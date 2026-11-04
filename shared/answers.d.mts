// Types for shared/answers.mjs, which stays .mjs while plain Node on the Mac loads it.
export interface AnsweredItem {
    answer?: string;
    answeredThrough?: number;
    status?: string;
    labels?: string[];
    wrote?: Record<string, {
        ts?: number;
        source?: string;
        from?: string;
        teammate?: string | null;
    } | undefined>;
}
export declare function agentSpokeSince(item: AnsweredItem | null | undefined, since: number): boolean;
export declare function answerSettled(item: AnsweredItem | null | undefined): boolean;
export declare function answerTs(item: AnsweredItem | null | undefined): number;
export declare function stoppedByHer(item: AnsweredItem | null | undefined): boolean;
export declare function filedByThePerson(item: AnsweredItem | null | undefined): boolean;
export declare function toldBy(item: AnsweredItem | null | undefined): {
    name: string;
    teammate: string | null;
} | null;
export declare function heldForHer(item: AnsweredItem | null | undefined): boolean;
export declare function wordWaits(item: AnsweredItem | null | undefined): boolean;
