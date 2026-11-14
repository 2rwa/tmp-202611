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

## Milestone 0.2: locked-device wake and ringing

Enable standby from the UI (or the shell-only diagnostic receiver). A foreground
service owns a media session. Try a headset media-play button; real delivery
depends on OEM routing and competing players. Normal Enter is not intercepted.
A boot receiver restarts standby only after explicit opt-in.

```sh
adb shell am broadcast -n io.github.calllab.lockscreen/.TestReceiver -a io.github.calllab.ARM
adb shell am broadcast -n io.github.calllab.lockscreen/.TestReceiver -a io.github.calllab.RING
# Diagnostic comparison: direct background Activity start.
adb shell am broadcast -n io.github.calllab.lockscreen/.TestReceiver -a io.github.calllab.DIRECT
```

Test with a secure lock configured and screen asleep. Verify the on-screen
device-locked state and that closing the Activity still requires the PIN.
The notification route is preferred; direct start is only a diagnostic for
legacy Android. No network listener, camera, or microphone is enabled yet.
Do not use this old OS for public Internet exposure. Future signaling must
authenticate peers, rate-limit ringing, and require local consent for media.

## Milestone 0.3: local TCP control

The foreground standby service listens on **127.0.0.1:18765** only.
The protocol is one ASCII line per TCP connection:
`PING` returns `PONG locked=... interactive=...` without waking the screen.
`RING <64-hex-token>` queues a wake and the restricted Activity.
Unknown commands and invalid tokens do not trigger a call. Ring requests are rate limited.
Provision a random test token through the existing shell/system-only receiver:

```sh
TOKEN=$(openssl rand -hex 32)
adb shell am broadcast -n io.github.calllab.lockscreen/.TestReceiver -a io.github.calllab.SET_TOKEN --es token "$TOKEN"
adb shell am broadcast -n io.github.calllab.lockscreen/.TestReceiver -a io.github.calllab.ARM
adb forward tcp:18765 tcp:18765
printf 'PING\n' | nc -w 3 127.0.0.1 18765
printf 'RING %s\n' "$TOKEN" | nc -w 3 127.0.0.1 18765
```

Keep the token private. This is a USB/loopback diagnostic protocol, not a LAN
or Internet protocol. Do not forward it to public interfaces; an authenticated
LAN transport with replay protection is a separate milestone.
The legacy wake lock is bounded to five seconds; it never dismisses keyguard.
`OK queued` acknowledges a request, not proof that the screen woke.
