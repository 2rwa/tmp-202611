#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
: "${SDK:?Android SDK required}"
BT="$SDK/build-tools/35.0.0"
PLATFORM="$SDK/platforms/android-35/android.jar"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/classes" "$WORK/dex" dist
"$BT/aapt2" compile --dir res -o "$WORK/resources.zip"
"$BT/aapt2" link -I "$PLATFORM" --manifest AndroidManifest.xml -o "$WORK/resources.apk" "$WORK/resources.zip"
javac --release 8 -classpath "$PLATFORM" -d "$WORK/classes" $(find src -name '*.java')
jar cf "$WORK/classes.jar" -C "$WORK/classes" .
"$BT/d8" --lib "$PLATFORM" --min-api 22 --output "$WORK/dex" "$WORK/classes.jar"
cp "$WORK/resources.apk" "$WORK/unaligned.apk"
zip -q -j "$WORK/unaligned.apk" "$WORK/dex/classes.dex"
"$BT/zipalign" -f 4 "$WORK/unaligned.apk" "$WORK/aligned.apk"
keytool -genkeypair -keystore "$WORK/test.jks" -storepass android -keypass android -alias kiosk -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Call Lab Kiosk CI Test' -noprompt
"$BT/apksigner" sign --ks "$WORK/test.jks" --ks-key-alias kiosk --ks-pass pass:android --key-pass pass:android --v1-signing-enabled true --v2-signing-enabled true --out dist/kiosk-probe.apk "$WORK/aligned.apk"
"$BT/apksigner" verify --min-sdk-version 22 --verbose dist/kiosk-probe.apk
"$BT/aapt" dump badging dist/kiosk-probe.apk | tee dist/apk-info.txt
grep -q "sdkVersion:'22'" dist/apk-info.txt
grep -q "name='io.github.calllab.kiosk'" dist/apk-info.txt
(cd dist && sha256sum kiosk-probe.apk > SHA256SUMS)
