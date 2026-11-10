// The phone app's configuration (docs/mobile/PLAN.md).
//
// The cloud's public address and key come from the same file the phone site
// reads (scripts/phone-site-config.mjs), or from the environment on Expo's
// build machines, which see only what git tracks, else from
// shared/cloud-address.mts. The
// bundle id is permanent once a build uses it; the environment can name another
// for a copy of the app built elsewhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ExpoConfig } from 'expo/config';
import { NAME, nameSlug } from '../shared/product-name.mjs';
import { CLOUD_ADDRESS, PHONE_SITE } from '../shared/cloud-address.mts';

// `phoneSite` is where a new account's email link lands (the phone website),
// and where Settings' Privacy policy and Terms open. With nothing given, the
// build uses Agentbox Cloud's public address, so it can never ship unable to
// sign in or without its privacy page.
type Cloud = { url: string; anonKey: string; phoneSite: string | null };
const TEAM_CONFIGS = [path.join(__dirname, '..', 'cloud', 'team.config.json'), path.join(os.homedir(), `.${nameSlug}`, 'team.config.json')];
export function cloudConfig(env: Record<string, string | undefined> = process.env, files = TEAM_CONFIGS): Cloud {
  const site = (url: string, given: unknown) => (typeof given === 'string' && given ? given : url === CLOUD_ADDRESS.supabaseUrl ? PHONE_SITE : null);
  const url = env.EXPO_PUBLIC_CLOUD_URL;
  const anonKey = env.EXPO_PUBLIC_CLOUD_KEY;
  if (url && anonKey) return { url, anonKey, phoneSite: site(url, env.EXPO_PUBLIC_PHONE_SITE) };
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof c?.url === 'string' && typeof c?.anonKey === 'string') return { url: c.url, anonKey: c.anonKey, phoneSite: site(c.url, c.phoneSite) };
  }
  return { url: CLOUD_ADDRESS.supabaseUrl, anonKey: CLOUD_ADDRESS.anonKey, phoneSite: env.EXPO_PUBLIC_PHONE_SITE || PHONE_SITE };
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
  // Not 'portrait': iOS caps the full-screen film player by this too. The
  // screens hold themselves upright (orientation in the Stacks' screenOptions).
  orientation: 'default',
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
    // Save to Photos on a held picture (modules/picture-menu); without it the first save closes the app.
    infoPlist: { NSPhotoLibraryAddUsageDescription: 'Save a picture from a thread to your Photos.' },
    // Repeats what the packages' own manifests declare, which Apple does not
    // always read from a static pod (docs.expo.dev/guides/apple-privacy).
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['0A2A.1', '3B52.1', 'C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['85F4.1', 'E174.1'] },
      ],
    },
  },
  // Android's own icon shapes wait for its phase (docs/mobile/PLAN.md).
  android: { package: bundleId },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    // The keychain holds the sign-in without Face ID, so the build asks for none.
    ['expo-secure-store', { faceIDPermission: false }],
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
