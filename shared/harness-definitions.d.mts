export interface HarnessRunFlags {
  readonly print: string;
  readonly outputFormat: { readonly flag: string; readonly value: string };
  readonly stream: readonly string[];
  readonly effort: string;
  readonly system: string;
  readonly resume: string;
  readonly fork: string;
  readonly input: readonly string[];
}

export interface HarnessCapabilities {
  readonly nativeCommands: boolean;
  readonly fork: boolean;
  readonly nativeReview: boolean;
  readonly remoteControl: boolean;
  readonly inlineImages: boolean;
  readonly claudeEffort: boolean;
  readonly planLimits?: boolean;
}

export interface HarnessDefinition {
  readonly id: string;
  readonly label: string;
  readonly word: string;
  readonly binKey: string;
  readonly homeEnv: string;
  readonly accountPrefix: string;
  readonly package: string;
  readonly commandMenu: string;
  readonly commandRoute: string;
  readonly casks: readonly string[];
  readonly installer: { readonly shell: string; readonly url: string; readonly pipe: string };
  readonly loginArgs: readonly string[];
  readonly statusArgs: readonly string[];
  readonly credentialFiles: readonly string[];
  readonly minVersion?: string;
  readonly run?: HarnessRunFlags;
  readonly scrubPatterns: readonly string[];
  readonly capabilities: HarnessCapabilities;
  readonly imageInstruction: string;
  readonly admitted?: boolean;
}

export const HARNESS_DEFINITIONS: readonly HarnessDefinition[];
export function harnessDefinition(id?: string): HarnessDefinition | null;
