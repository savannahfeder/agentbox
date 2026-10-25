// Apple's newer on-device speech model (ios/AppleDictationModule.swift). Null
// where the module is not built in: Android, the browser preview, and a build
// made before this module existed.
import { requireOptionalNativeModule, type NativeModule } from 'expo';

type Events = {
  onStart(): void;
  onResult(e: { text: string; isFinal: boolean }): void;
  onError(e: { code: string; message: string }): void;
  onEnd(): void;
  onLevel(e: { value: number }): void;
};

declare class AppleDictationModule extends NativeModule<Events> {
  /** BCP 47 tags; both empty on a phone that cannot run the model. */
  languages(): Promise<{ supported: string[]; installed: string[] }>;
  download(language: string): Promise<void>;
  start(language: string): Promise<void>;
  stop(): void;
  abort(): void;
}

export default requireOptionalNativeModule<AppleDictationModule>('AppleDictation');
