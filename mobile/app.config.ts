// The phone app's configuration (docs/mobile/PLAN.md).
//
// The cloud's public address and key come from the same file the phone site
// reads (scripts/phone-site-config.mjs), or from the environment on Expo's
// build machines, which see only what git tracks. Neither is committed. The
// bundle id is permanent once a build uses it; the environment can name another
// for a copy of the app built elsewhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ExpoConfig } from 'expo/config';
import { NAME, nameSlug } from '../shared/product-name.mjs';

// `phoneSite` is where a new account's email link lands (the phone website).
function cloudConfig(): { url: string; anonKey: string; phoneSite: string | null } | null {
  const url = process.env.EXPO_PUBLIC_CLOUD_URL;
  const anonKey = process.env.EXPO_PUBLIC_CLOUD_KEY;
  if (url && anonKey) return { url, anonKey, phoneSite: process.env.EXPO_PUBLIC_PHONE_SITE || null };
  for (const file of [path.join(__dirname, '..', 'cloud', 'team.config.json'), path.join(os.homedir(), `.${nameSlug}`, 'team.config.json')]) {
    if (!fs.existsSync(file)) continue;
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof c?.url === 'string' && typeof c?.anonKey === 'string') return { url: c.url, anonKey: c.anonKey, phoneSite: typeof c.phoneSite === 'string' ? c.phoneSite : null };
  }
  return null;
}

// The image picker gets the same words: its `false` would delete the
// microphone line from Info.plist and block the microphone on Android.
const MICROPHONE_USE = `${NAME} listens only while you dictate a message, and writes what you say into it.`;
const SPEECH_USE = `${NAME} writes what you say into your message. Your iPhone does this itself when it can, and Apple's speech recognition does it when it cannot.`;

const bundleId = process.env.MOBILE_BUNDLE_ID || 'now.astral.agentbox';
const projectId = process.env.EAS_PROJECT_ID || '2b129901-faac-4b8d-8709-9a08cf6778f5';

const config: ExpoConfig = {
  name: NAME,
  slug: nameSlug,
  owner: process.env.EAS_OWNER || 'agentbox-app',
  scheme: nameSlug,
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Automatic so Match system can read the phone's own light or dark (state/look.tsx).
  userInterfaceStyle: 'automatic',
  backgroundColor: '#1a1817',
  ios: {
    // iPhone only; it still runs in an iPad's iPhone mode, where reviewers sometimes test.
    supportsTablet: false,
    bundleIdentifier: bundleId,
    usesAppleSignIn: true,
    // HTTPS through the system is exempt from export rules.
    config: { usesNonExemptEncryption: false },
  },
  // Android's own icon shapes wait for its phase (docs/mobile/PLAN.md).
  android: { package: bundleId },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    ['expo-notifications', { color: '#ee6018' }],
    'expo-video',
    // Apple shows these words when the app first asks; the camera is never asked for.
    ['expo-image-picker', { photosPermission: 'Pick a photo or video to attach to a message for your agent.', cameraPermission: false, microphonePermission: MICROPHONE_USE }],
    ['expo-speech-recognition', { microphonePermission: MICROPHONE_USE, speechRecognitionPermission: SPEECH_USE }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    cloud: cloudConfig(),
    eas: { projectId },
  },
};

export default config;
