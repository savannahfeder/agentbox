export declare const SHARED_DIRS: string[];

export declare function defaultClaudeHome(home?: string): string;

export declare function makeClaudeHome(options?: {
  home?: string;
  mkdir?: (dir: string, options: { recursive: true }) => unknown;
  exists?: (dir: string) => boolean;
}): { home: string; profile: string };

export declare function claudeLoginCommand(home: string): string;

export interface ToolingResult {
  dir: string | null | undefined;
  linked: string[];
  already: string[];
  theirs: string[];
  missing: string[];
  skipped: 'default' | 'no-dir' | 'same' | null;
}

export declare function linkAccountTooling(
  dir: string | null | undefined,
  options?: { home?: string; source?: string | null },
): ToolingResult;

export declare function toolingLine(result: ToolingResult | null | undefined): string | null;

export interface AccountIdentity {
  email: string;
  accountUuid: string | null;
  organizationUuid?: string;
}

export declare function accountIdentity(dir: string | null | undefined, options?: { home?: string }): AccountIdentity | null;

export interface IdentityLike {
  email?: string | null;
  organizationUuid?: string | null;
  accountUuid?: string | null;
}

export declare function nameForOrganization(org: string | null | undefined, identities: (IdentityLike | null | undefined)[]): string | null;

export interface CloudLoginLike {
  org?: string | null;
  email?: string | null;
}

export declare function profileForCloudLogin(
  login: CloudLoginLike,
  identities: (IdentityLike & { profile?: string | null })[],
): string | null;

export declare function isCloudLoginOf(
  login: CloudLoginLike,
  identity: IdentityLike | null | undefined,
  identities: (IdentityLike | null | undefined)[],
): boolean;

export declare function duplicateAccountNote(identities: (IdentityLike | null | undefined)[]): string | null;
