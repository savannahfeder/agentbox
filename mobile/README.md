# The phone app

An Expo app (React Native) for iPhone and Android. It reads and replies to your
threads through your Agentbox account, so it needs the cloud's address and key
to sign in (see [The cloud's address and key](#the-clouds-address-and-key)), or
the preview, which needs neither.

The app imports code from `../renderer` and `../shared`, so install both
folders' packages:

```sh
npm ci            # in the repository root
cd mobile && npm ci
```

## See it in a browser, with no account

```sh
cd mobile
EXPO_PUBLIC_PREVIEW=1 npx expo start --web
```

The preview has made-up threads and a stand-in cloud. Add `?scene=signed-out`
to the address for the sign-in screen, or `?scene=clear` for an empty inbox.

## Run it on an Android emulator

You need:

- Node 22.18 or newer.
- JDK 17. On Debian or Ubuntu: `sudo apt-get install openjdk-17-jdk`. On a Mac:
  `brew install --cask zulu@17`. Point `JAVA_HOME` at it.
- The Android SDK, from Android Studio or the command-line tools. Set
  `ANDROID_HOME` (usually `~/Android/Sdk` on Linux, `~/Library/Android/sdk` on
  a Mac) and put `$ANDROID_HOME/platform-tools` and `$ANDROID_HOME/emulator` on
  your `PATH`.

Make an emulator once:

```sh
sdkmanager "platform-tools" "emulator" "platforms;android-34" "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n agentbox -k "system-images;android-34;google_apis;x86_64" -d pixel_6
```

On an ARM machine (Apple silicon), use the `arm64-v8a` image instead of
`x86_64`. Then start it:

```sh
emulator -avd agentbox
```

Without hardware acceleration (no KVM on Linux) add `-accel off`; it works,
slowly.

With the emulator running, build the app, install it and start it:

```sh
cd mobile
npx expo run:android
```

That builds a development build, which loads the code from your machine and
reloads when you save. The `android/` folder it makes is generated: change
`app.config.ts`, never the folder.

For a release build you can install anywhere:

```sh
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

## The cloud's address and key

`app.config.ts` reads the public address and anon key of the account database,
in this order:

1. `EXPO_PUBLIC_CLOUD_URL` and `EXPO_PUBLIC_CLOUD_KEY` in the environment
   (and `EXPO_PUBLIC_PHONE_SITE` for where account emails link).
2. `cloud/team.config.json` in this repository, which git ignores.
   `cloud/team.config.example.json` shows its shape.
3. `~/.agentbox/team.config.json`.

They are read when the app is built, so build again after changing them.
Without them the sign-in screen says the build cannot sign in.

## Builds for the stores

An iPhone build reaches TestFlight through one EAS workflow, from the
repository's own folder brought up to `main`:

```sh
cd mobile
npx eas-cli@latest workflow:run .eas/workflows/release-ios.yml
```

It builds the store build and a Release build for the iPhone simulator side
by side, opens the simulator build with `.maestro/opens.yml`, and sends the
store build to TestFlight only if the app opened. `launch-test-ios.yml` runs
the open-the-app half alone and sends nothing. Do not send a build with
`eas build --auto-submit`: builds 11 to 15 went out that way and none of them
opened.
