# Android Call Lab

A device-independent Android 5.1+ prototype for a dedicated calling interface.
The first milestone tests a limited Activity that can be displayed over the
keyguard, without removing or modifying authentication. It does not access
camera, microphone, account data, contacts, storage, or the network.

## Build

The APK is built in the public GitHub-hosted workflow and attached as the
`android-call-lab-apk` artifact. Download the artifact and verify its SHA256.
Locally, install JDK 17 and Android SDK platform 35 / build-tools 35.0.0,
then run `bash android-call-lab/build.sh`.

CI uses an ephemeral test signing key unless a persistent signing key is
configured locally. APK updates must use the same signing key; otherwise
uninstall the previous test build before installing a new one (app data is lost).
This is a test build, not a production release.

## Test

Install the APK on an authorized test device. Configure a PIN or password,
lock the screen, and start the Activity using an authorized ADB connection:

```sh
adb install call-lab.apk
adb shell am start -n io.github.calllab.lockscreen/.CallActivity
```

The activity reports whether the keyguard is showing and whether the device
remains locked. Close the activity: the lock screen must remain intact.
Also test the lock-screen camera gesture. The app declares
`STILL_IMAGE_CAMERA_SECURE`, but OEM lock-screen launchers may select a fixed
component or reject multiple handlers. Do not disable or replace system apps
until that behavior is understood. The app does not dismiss the keyguard.

## Roadmap

1. Lock-screen UI and secure-camera intent compatibility.
2. Explicit user-controlled camera preview.
3. Local WebSocket signaling and JPEG video; then bidirectional audio.
4. Authenticated peer pairing, explicit accept/end, and media only during calls.
5. Evaluate native WebRTC for adaptive media and echo cancellation.

No physical device identifiers, local hostnames, network addresses, or device
logs belong in the public repository.
