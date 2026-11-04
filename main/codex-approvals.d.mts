export declare const POLL_MS: number;
export declare const CARD_CAP: number;
export declare const MCP_TOOL_CALL_KIND: 'mcp_tool_call';
export declare const REMEMBERED_CHANGES: number;

export interface CodexCard {
  tool: string;
  input: Record<string, string>;
}

export declare function isMcpToolCall(params: unknown): boolean;
export declare function elicitationServer(params: unknown): string;
export declare function isStoreElicitation(params: unknown, storeServer: unknown): boolean;
export declare function mcpToolCard(params: unknown): CodexCard | null;
export declare function fileChangeCard(item: unknown): CodexCard | null;
export declare function codexApprovalCard(
  method: string,
  params: unknown,
  seen?: { get?(itemId: string): CodexCard | undefined } | null,
): CodexCard | null;

export interface CodexApprovalContext {
  product?: string | null;
  item?: string | null;
  storeServer?: string | null;
  say?: (line: string) => unknown;
  [key: string]: unknown;
}

export interface CodexApprovalScope {
  remember(method: string, params: unknown): void;
  handle(method: string, params: unknown): Promise<'accept' | 'decline'>;
  close(why?: string): number;
}

export interface CodexApprovals {
  scope(context?: CodexApprovalContext): CodexApprovalScope;
  settle(id: unknown, allow: unknown, note?: string | null): boolean;
  changed(id: unknown, shown: unknown): boolean;
  close(why?: string): void;
  pending(): string[];
}

export declare function createCodexApprovals(options: {
  storeRoot: string;
  pollMs?: number;
  uuid?: () => unknown;
  now?: () => number;
  onChange?: (() => unknown) | null;
}): CodexApprovals;
