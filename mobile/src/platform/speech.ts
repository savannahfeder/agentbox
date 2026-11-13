// The phone's speech models, as renderer/src/dictation.ts asks for them: Apple's newer
// one where the phone has it, else the keyboard's (lib/speech-engines.ts).
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';
import AppleDictation from '../../modules/apple-dictation';
import { phoneSpeechOf, type KeyboardModel } from '../lib/speech-engines';

export const phoneSpeech = phoneSpeechOf({
  keyboard: ExpoSpeechRecognitionModule as unknown as KeyboardModel,
  newer: AppleDictation,
  android: Platform.OS === 'android',
  phoneLanguage: () => { try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return undefined; } },
});
