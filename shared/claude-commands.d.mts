export interface ClaudeCommand {
  name: string;
  description: string;
  /** Claude Code's own shorter sentence, where they wrote one for a menu. */
  menuDescription: string | null;
  /** False when a getter composes the description at run time and we cut it at
   *  the interpolation, so nothing may present it as a quotation. */
  whole: boolean;
  argumentHint: string | null;
  aliases: string[];
}

export declare const CLAUDE_COMMANDS: ClaudeCommand[];
export declare const READ_FROM: string | null;
export declare const READ_AT: string | null;
export declare function commandWords(cmd: ClaudeCommand): string[];
export declare function commandHint(cmd: ClaudeCommand): string;
export declare function commandMatches(query: string | null): ClaudeCommand[];
export declare function commandDraft(cmd: ClaudeCommand): string;
export declare function commandPrompt(reply: unknown, nativeNames?: string[]): string | null;
